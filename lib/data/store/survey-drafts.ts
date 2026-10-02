/**
 * 실사보고서 임시 저장본 (한백 지시 2026-10-01 「브라우저 데이터 말고 클라우드에」).
 *
 * ★누가 보나★ 저장한 계정뿐이다 — 한백도 남의 저장본은 안 본다(쓰다 만 것이다). 대행 중이면 그 계정의
 * 것이다(세션이 그 계정으로 바뀌어 온다).
 * ★사진은 여기서 다루지 않는다★ — Blob 은 라우트가 올리고 지운다(app/api/survey-drafts). 여기는 줄만 본다:
 * 저장하면 빠진 사진 자리를 돌려주어 라우트가 지우게 한다.
 * 감사 로그는 만들기·지우기만 남긴다 — 쓰다 만 것을 저장할 때마다 남기면 로그가 그것으로 덮인다.
 */
import { and, desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { writeAudit } from '@/lib/db/audit';
import { surveyDrafts } from '@/lib/db/schema';
import {
  DRAFT_CONFLICT, DRAFT_NOT_FOUND, MAX_DRAFTS, SURVEY_CPOS, photoRefsOf, type DraftCpo, type DraftFull, type DraftSummary, type PhotoRef,
} from '@/lib/survey/draft-shape';
import type { Actor, ProjectRepository } from '../repository';

const cpoOf = (raw: string): DraftCpo => {
  if (!(SURVEY_CPOS as readonly string[]).includes(raw)) throw new Error('서식을 알 수 없습니다.');
  return raw as DraftCpo;
};

const clip = (t: string) => t.trim().slice(0, 200);

type Row = typeof surveyDrafts.$inferSelect;
const summary = (r: Row): DraftSummary => ({
  id: r.id, cpo: r.cpo as DraftCpo, title: r.title, photoCount: r.photoCount, updatedAt: r.updatedAt.toISOString(),
});

const NOT_FOUND = DRAFT_NOT_FOUND;

async function own(id: string, actor: Actor): Promise<Row> {
  const [row] = await getDb().select().from(surveyDrafts).where(eq(surveyDrafts.id, id)).limit(1);
  // 남의 것도 「없다」로 — 있는지조차 알려주지 않는다
  if (!row || row.ownerId !== actor.id) throw new Error(NOT_FOUND);
  return row;
}

export const surveyDraftStore: Pick<
  ProjectRepository,
  'listSurveyDrafts' | 'getSurveyDraft' | 'createSurveyDraft' | 'saveSurveyDraft' | 'deleteSurveyDraft'
> = {
  async listSurveyDrafts(rawCpo, actor): Promise<DraftSummary[]> {
    const cpo = cpoOf(rawCpo);
    const rows = await getDb().select().from(surveyDrafts)
      .where(and(eq(surveyDrafts.ownerId, actor.id), eq(surveyDrafts.cpo, cpo)))
      .orderBy(desc(surveyDrafts.updatedAt));
    return rows.map(summary);
  },

  async getSurveyDraft(id, actor): Promise<DraftFull> {
    const row = await own(id, actor);
    return { ...summary(row), data: row.data };
  },

  async createSurveyDraft(input, actor): Promise<string> {
    const cpo = cpoOf(input.cpo);
    const db = getDb();
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(surveyDrafts)
      .where(eq(surveyDrafts.ownerId, actor.id));
    if (n >= MAX_DRAFTS) throw new Error(`임시 저장본이 ${MAX_DRAFTS}건입니다 — 지난 것을 지우고 저장해 주세요.`);
    const id = crypto.randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(surveyDrafts).values({ id, ownerId: actor.id, ownerOrg: actor.org, cpo, title: clip(input.title) });
      await writeAudit(tx, {
        projectId: null, actor, action: '실사보고서 임시저장 만들기',
        field: 'surveyDrafts', oldValue: null, newValue: `${cpo} · ${clip(input.title) || '(현장명 없음)'}`,
      });
    });
    return id;
  },

  /**
   * ★판본을 본다★ — 화면은 마지막으로 불러오거나 저장한 판(base = updatedAt)을 같이 보낸다. 그 뒤에 다른 창·기기가
   * 저장했으면 거절한다: 낡은 값으로 덮으면 새 값이 사라지고, 「빠진 사진」으로 셈해 다른 쪽이 쓰는 사진까지
   * 지운다. 줄을 잠그고 보니 같은 때 들어온 저장 둘도 하나씩 지나간다. base 가 없는 것은 막 만든 저장본이다.
   */
  async saveSurveyDraft(id, input, actor): Promise<{ removed: PhotoRef[]; updatedAt: string }> {
    return getDb().transaction(async (tx) => {
      const [row] = await tx.select().from(surveyDrafts).where(eq(surveyDrafts.id, id)).for('update');
      if (!row || row.ownerId !== actor.id) throw new Error(NOT_FOUND);
      if (input.base && row.updatedAt.toISOString() !== input.base) throw new Error(DRAFT_CONFLICT);
      const keep = new Set(photoRefsOf(input.data).map((r) => r.path));
      const removed = photoRefsOf(row.data).filter((r) => !keep.has(r.path));
      const updatedAt = new Date();
      await tx.update(surveyDrafts)
        .set({ title: clip(input.title), data: input.data as object, photoCount: keep.size, updatedAt })
        .where(eq(surveyDrafts.id, id));
      return { removed, updatedAt: updatedAt.toISOString() };
    });
  },

  async deleteSurveyDraft(id, actor): Promise<void> {
    const row = await own(id, actor);
    await getDb().transaction(async (tx) => {
      await tx.delete(surveyDrafts).where(eq(surveyDrafts.id, id));
      await writeAudit(tx, {
        projectId: null, actor, action: '실사보고서 임시저장 지우기',
        field: 'surveyDrafts', oldValue: `${row.cpo} · ${row.title || '(현장명 없음)'}`, newValue: null,
      });
    });
  },
};

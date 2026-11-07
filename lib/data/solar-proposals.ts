/**
 * 태양광 제안서의 틀과 조건 저장소 (migrations/0124, 2026-11-06).
 *
 * ★누가 무엇을★ 보기는 한백의 눈(관리자 · 열람 전용) — 제안서를 짓는 사람이다. 틀 올리기 · 조건 고치기는 한백 관리자만(라우트가
 * 먼저 막는다). 협력사는 안 본다 — 사업자 자료를 남에게 내지 못한다(타이런트 업무협약서 3조).
 * 쓰기마다 audit_log 「태양광 제안서 틀」 · 「태양광 제안서 조건」을 남긴다 — 조건은 앞뒤 값을, 틀은 파일 이름을.
 */
import { eq } from 'drizzle-orm';
import { getDb, hasDatabase } from '@/lib/db/client';
import { writeAudit } from '@/lib/db/audit';
import { solarProposalTemplates } from '@/lib/db/schema';
import type { Actor } from '@/lib/auth/types';
import { TEMPLATE_KEYS, TEMPLATES, cleanTerms, type TemplateKey, type Terms } from '@/lib/solar/proposal/products';

export type ProposalTemplateFile = { url: string; name: string; size: number; at: string; by: string };
export type ProposalTemplate = {
  key: TemplateKey;
  file: ProposalTemplateFile | null;
  terms: Partial<Terms>;
  termsAt: string | null;
  termsBy: string | null;
};

const NO_DB = '제안서 저장소(DB)가 연결되지 않았습니다.';
type Row = typeof solarProposalTemplates.$inferSelect;

const of = (key: TemplateKey, r: Row | undefined): ProposalTemplate => ({
  key,
  file:
    r?.fileUrl && r.fileName && r.fileAt
      ? { url: r.fileUrl, name: r.fileName, size: r.fileSize ?? 0, at: r.fileAt.toISOString(), by: r.fileBy ?? '' }
      : null,
  terms: r?.terms ?? {},
  termsAt: r?.termsAt ? r.termsAt.toISOString() : null,
  termsBy: r?.termsBy ?? null,
});

/** 틀 셋 — 아직 한 번도 안 넣은 틀도 빈 줄로 돌려준다(화면이 「틀 없음」 · 「조건 미지정」을 그린다) */
export async function listProposalTemplates(): Promise<ProposalTemplate[]> {
  if (!hasDatabase()) throw new Error(NO_DB);
  const rows = await getDb().select().from(solarProposalTemplates);
  const byKey = new Map(rows.map((r) => [r.key, r]));
  return TEMPLATE_KEYS.map((k) => of(k, byKey.get(k)));
}

const who = (a: Actor) => `${a.name}(${a.id})`;
const termsText = (key: TemplateKey, t: Partial<Terms>) =>
  TEMPLATES[key].terms.map((f) => `${f.label} ${typeof t[f.key] === 'number' ? t[f.key]!.toLocaleString('ko-KR', { maximumFractionDigits: 4 }) : '—'}${f.unit}`).join(' · ');

/** 틀 파일을 그 자리로 바꾼다 — url 은 라우트가 우리 Blob 에서 다시 찾은 것만 넘긴다 */
export async function setProposalTemplateFile(key: TemplateKey, file: { url: string; name: string; size: number }, actor: Actor): Promise<ProposalTemplate> {
  if (!hasDatabase()) throw new Error(NO_DB);
  const now = new Date();
  return getDb().transaction(async (tx) => {
    const [before] = await tx.select().from(solarProposalTemplates).where(eq(solarProposalTemplates.key, key)).limit(1).for('update');
    const values = { fileUrl: file.url, fileName: file.name.slice(0, 200), fileSize: file.size, fileAt: now, fileBy: who(actor) };
    const [row] = await tx
      .insert(solarProposalTemplates)
      .values({ key, ...values })
      .onConflictDoUpdate({ target: solarProposalTemplates.key, set: values })
      .returning();
    await writeAudit(tx, {
      projectId: null,
      actor,
      action: '태양광 제안서 템플릿',
      field: `${TEMPLATES[key].company} ${TEMPLATES[key].title}`,
      oldValue: before?.fileName ?? null,
      newValue: file.name.slice(0, 200),
    });
    return of(key, row);
  });
}

/** 조건을 고친다 — 그 틀의 칸 전부를 한 번에(빠진 칸이 있으면 cleanTerms 가 던진다) */
export async function setProposalTerms(key: TemplateKey, raw: unknown, actor: Actor): Promise<ProposalTemplate> {
  if (!hasDatabase()) throw new Error(NO_DB);
  const terms = cleanTerms(key, raw);
  const now = new Date();
  return getDb().transaction(async (tx) => {
    const [before] = await tx.select().from(solarProposalTemplates).where(eq(solarProposalTemplates.key, key)).limit(1).for('update');
    const values = { terms, termsAt: now, termsBy: who(actor) };
    const [row] = await tx
      .insert(solarProposalTemplates)
      .values({ key, ...values })
      .onConflictDoUpdate({ target: solarProposalTemplates.key, set: values })
      .returning();
    await writeAudit(tx, {
      projectId: null,
      actor,
      action: '태양광 제안서 조건',
      field: `${TEMPLATES[key].company} ${TEMPLATES[key].title}`,
      oldValue: before ? termsText(key, before.terms) : null,
      newValue: termsText(key, terms),
    });
    return of(key, row);
  });
}

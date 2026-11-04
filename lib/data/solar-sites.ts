/**
 * 태양광 현장 저장소 — 상담 접수 · 목록 · 고치기 · 지우기 (migrations/0105, 2026-11-03).
 *
 * ★전기차 저장소(ProjectRepository)에 넣지 않는다★ — 운영사 · 단가 · 기성이 없는 다른 사업이다(CLAUDE.md 「사업이 둘이다」).
 * 같이 쓰는 것은 바탕까지: 계정 · 감사 기록(audit_log, 현장 칸은 비우고 action 에 「태양광 SL-…」).
 *
 * ★누가 무엇을★
 *   보기   한백의 눈(관리자 · 열람 전용)은 전부, 협력사는 제 소속의 현장만 — 남의 현장은 「없다」로 답한다(있는지도 안 알린다)
 *   접수   태양광 참여를 켠 협력사 — 제 계정의 소속이 담당이 된다(보낸 org 는 안 본다).
 *          한백 관리자 — 담당 협력사를 ★태양광 참여 협력사 중에서 골라야★ 한다(한백 지시 2026-11-03 「한백 직접은 없어」 ·
 *          11-04 「한백도 접수하게해줘」 — 그 사이 하루는 한백이 아예 접수하지 못했다)
 *   고치기 · 지우기   한백 관리자, 또는 그 현장의 담당 협력사 — 담당 협력사를 바꾸는 것은 한백 관리자만(고른 것을 되돌릴 길)
 * 열람 전용의 쓰기는 쓰기 껍데기(lib/api/write-route)가 먼저 막는다. 참여 여부는 여기서 한 번 더 DB 에서 읽는다 —
 * 껍데기가 넘긴 actor 에는 그 값이 없고, 계정설정에서 방금 끈 계정이 쓰면 안 된다.
 */
import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { getDb, hasDatabase } from '@/lib/db/client';
import { writeAudit } from '@/lib/db/audit';
import { solarSites, users } from '@/lib/db/schema';
import { isHanbaek } from '@/lib/roles';
import { today } from '@/lib/date';
import type { Actor, Viewer } from '@/lib/auth/types';
import { cleanSiteInput, siteFilePrefix, siteIdOf, type SiteFile, type SiteInput, type SiteKind, type SolarSite } from '@/lib/solar/sites';

/** 남의 현장 · 없는 현장 — 같은 말로 답한다 */
export const SITE_NOT_FOUND = '그 현장을 찾지 못했습니다.';
const NO_DB = '태양광 현장 저장소(DB)가 연결되지 않았습니다.';

type Row = typeof solarSites.$inferSelect;
const siteOf = (r: Row): SolarSite => ({
  id: r.id,
  name: r.name,
  address: r.address,
  kind: r.kind as SiteKind,
  customer: r.customer,
  phone: r.phone,
  memo: r.memo,
  org: r.org,
  createdBy: r.createdBy,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
  files: r.files ?? [],
});

/** 그 사람이 이 현장을 보는가 — 한백은 전부, 협력사는 제 소속 */
const sees = (viewer: Viewer, site: { org: string | null }): boolean =>
  isHanbaek(viewer.role) || (!!viewer.org && site.org === viewer.org);

/** 쓰는 사람이 태양광에 참여하는가 — 한백 관리자는 늘, 협력사는 users.solar 를 지금 값으로 */
async function participates(actor: Actor): Promise<boolean> {
  if (actor.role === 'admin') return true;
  if (isHanbaek(actor.role)) return false; // 열람 전용 — 껍데기가 먼저 막지만 여기도 쓰기는 없다
  const [row] = await getDb().select({ solar: users.solar, active: users.active }).from(users).where(eq(users.id, actor.id)).limit(1);
  return !!row && row.active && row.solar;
}

/** 고치기 · 지우기 — 한백 관리자, 또는 그 현장의 담당 협력사(참여 중일 때) */
async function editable(id: string, actor: Actor): Promise<Row> {
  const [row] = await getDb().select().from(solarSites).where(eq(solarSites.id, id)).limit(1);
  if (!row || !sees(actor, row)) throw new Error(SITE_NOT_FOUND);
  if (actor.role !== 'admin' && !(await participates(actor))) throw new Error('태양광에 참여하는 계정만 고칠 수 있습니다.');
  return row;
}

const FIELD_NAME: Record<keyof SiteInput, string> = {
  name: '현장명', address: '주소', kind: '설치 형태', customer: '고객 담당자', phone: '연락처', memo: '상담 메모',
};

/** 협력사 구분 — 한백(관리자 · 열람 전용)은 담당이 될 수 없다 */
const PARTNER_ROLES = ['salesCons', 'cons', 'sales'] as const;

/** 태양광 참여 협력사의 소속 — 지금 값(계정설정에서 켜고 끈다), 쓰는 중인 계정만 */
async function partnerOrgsNow(): Promise<string[]> {
  const rows = await getDb()
    .selectDistinct({ org: users.org })
    .from(users)
    .where(and(eq(users.solar, true), eq(users.active, true), isNotNull(users.org), inArray(users.role, [...PARTNER_ROLES])));
  return rows.map((r) => r.org!).filter((o) => o.trim()).sort((a, b) => a.localeCompare(b, 'ko'));
}

/** 한백이 고른 담당 — 태양광 참여 협력사의 소속 그대로여야 한다(비우면 「한백 직접」이 되는데 그것은 없다) */
async function assignableOrg(raw: unknown): Promise<string> {
  const org = typeof raw === 'string' ? raw.normalize('NFC').trim() : '';
  if (!org) throw new Error('담당 협력사를 골라 주세요 — 태양광 참여 협력사 중에서 고릅니다.');
  if (!(await partnerOrgsNow()).includes(org)) throw new Error(`${org} 은(는) 태양광 참여 협력사가 아닙니다 — 계정설정에서 「태양광」을 켜야 담당이 됩니다.`);
  return org;
}

export const solarSiteStore = {
  async list(viewer: Viewer): Promise<SolarSite[]> {
    if (!hasDatabase()) return [];
    if (isHanbaek(viewer.role)) {
      return (await getDb().select().from(solarSites).orderBy(desc(solarSites.createdAt))).map(siteOf);
    }
    if (!viewer.org) return [];
    const rows = await getDb().select().from(solarSites).where(eq(solarSites.org, viewer.org)).orderBy(desc(solarSites.createdAt));
    return rows.map(siteOf);
  },

  async get(id: string, viewer: Viewer): Promise<SolarSite | null> {
    if (!hasDatabase()) return null;
    const [row] = await getDb().select().from(solarSites).where(eq(solarSites.id, id)).limit(1);
    return row && sees(viewer, row) ? siteOf(row) : null;
  },

  /** 담당 협력사로 고를 수 있는 소속 — 한백의 접수 · 고치기 폼이 칩으로 그린다 */
  async partnerOrgs(): Promise<string[]> {
    if (!hasDatabase()) return [];
    return partnerOrgsNow();
  },

  /**
   * 상담 접수 — 태양광 참여 협력사는 제 소속이 담당(보낸 org 는 안 본다), 한백 관리자는 보낸 org 가 태양광 참여 협력사여야 한다.
   * 번호는 시퀀스에서 받는다(지운 번호를 다시 쓰지 않는다).
   */
  async create(raw: unknown, actor: Actor): Promise<SolarSite> {
    if (!hasDatabase()) throw new Error(NO_DB);
    if (!(await participates(actor))) throw new Error('태양광에 참여하는 계정만 접수할 수 있습니다.');
    const input = cleanSiteInput(raw);
    const org = actor.role === 'admin' ? await assignableOrg((raw as { org?: unknown } | null)?.org) : actor.org;
    if (!org) throw new Error('소속이 없는 계정은 접수할 수 없습니다.');

    const db = getDb();
    return db.transaction(async (tx) => {
      const [{ n }] = await tx.execute<{ n: string }>(sql`select nextval('solar_sites_seq') as n`);
      const id = siteIdOf(Number(today().slice(0, 4)), Number(n));
      const [row] = await tx
        .insert(solarSites)
        .values({ id, ...input, org, createdBy: actor.id })
        .returning();
      await writeAudit(tx, {
        projectId: null,
        actor,
        action: `태양광 ${id}`,
        field: '상담 접수',
        newValue: `${input.name} · ${input.address}${actor.role === 'admin' ? ` · 담당 ${org}` : ''}`,
      });
      return siteOf(row);
    });
  },

  /**
   * 고치기 — 보낸 칸만. 담당 협력사는 한백 관리자만 바꾼다(한백이 고른 담당을 되돌릴 길 · 「한백 직접」으로 남은 옛 현장을 채울 길).
   * 협력사가 보낸 org 는 막는다 — 제 현장을 남에게 넘기거나 비우는 길이 된다.
   */
  async update(id: string, raw: unknown, actor: Actor): Promise<void> {
    if (!hasDatabase()) throw new Error(NO_DB);
    const row = await editable(id, actor);
    const before = siteOf(row);
    const patch = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    // 빠진 칸은 지금 값으로 채워 같은 규칙(cleanSiteInput)으로 본다 — 고치기가 접수보다 느슨하면 빈 현장명이 생긴다
    const next = cleanSiteInput({ ...before, ...patch });
    let org = before.org;
    if ('org' in patch) {
      if (actor.role !== 'admin') throw new Error('담당 협력사는 한백만 바꿉니다.');
      org = await assignableOrg(patch.org);
    }
    const changed = (Object.keys(FIELD_NAME) as (keyof typeof FIELD_NAME)[]).filter((k) => next[k] !== before[k]);
    const orgChanged = org !== before.org;
    if (changed.length === 0 && !orgChanged) return;
    const db = getDb();
    await db.transaction(async (tx) => {
      await tx.update(solarSites).set({ ...next, org, updatedAt: new Date() }).where(eq(solarSites.id, id));
      for (const k of changed) {
        await writeAudit(tx, { projectId: null, actor, action: `태양광 ${id}`, field: FIELD_NAME[k], oldValue: before[k], newValue: next[k] });
      }
      if (orgChanged) {
        await writeAudit(tx, { projectId: null, actor, action: `태양광 ${id}`, field: '담당 협력사', oldValue: before.org, newValue: org });
      }
    });
  },

  /** 지우기 — 붙은 파일의 주소를 돌려준다(라우트가 기록을 지운 뒤에 Blob 을 걷는다 — 순서를 바꾸면 열 수 없는 파일이 목록에 남는다) */
  async remove(id: string, actor: Actor): Promise<string[]> {
    if (!hasDatabase()) throw new Error(NO_DB);
    const row = await editable(id, actor);
    const db = getDb();
    await db.transaction(async (tx) => {
      await tx.delete(solarSites).where(eq(solarSites.id, id));
      await writeAudit(tx, { projectId: null, actor, action: `태양광 ${id}`, field: '삭제', oldValue: `${row.name} · ${row.address}` });
    });
    return (row.files ?? []).map((f) => f.url);
  },

  /** 고칠 수 있는가만 본다 — 올리기 토큰을 내주기 전에(토큰 발급은 기록을 안 남긴다) */
  async assertEditable(id: string, actor: Actor): Promise<void> {
    if (!hasDatabase()) throw new Error(NO_DB);
    await editable(id, actor);
  },

  /**
   * 파일 붙이기 — 주소는 라우트가 우리 저장소에서 찾은 것(그 현장의 자리 solar-sites/{id}/ 아래)만 온다. 여기서도 자리를 본다.
   * ★한 줄 update★ — files || [새 장]. 읽고-고치고-쓰기면 같은 현장에 동시에 올린 두 장 중 하나가 사라진다(전기차 감사 M10).
   * 같은 주소가 이미 있으면 다시 안 붙인다(재시도) — already 로 답한다.
   */
  async attachFile(id: string, file: SiteFile, actor: Actor): Promise<{ already: boolean }> {
    if (!hasDatabase()) throw new Error(NO_DB);
    await editable(id, actor);
    if (!new URL(file.url).pathname.replace(/^\//, '').startsWith(siteFilePrefix(id))) throw new Error('파일 자리가 이 현장이 아닙니다.');
    const db = getDb();
    return db.transaction(async (tx) => {
      const one = JSON.stringify([file]);
      const hit = await tx
        .update(solarSites)
        .set({ files: sql`${solarSites.files} || ${one}::jsonb`, updatedAt: new Date() })
        .where(sql`${solarSites.id} = ${id} and not (${solarSites.files} @> ${JSON.stringify([{ url: file.url }])}::jsonb)`)
        .returning({ id: solarSites.id });
      if (hit.length === 0) return { already: true };
      await writeAudit(tx, { projectId: null, actor, action: `태양광 ${id}`, field: '파일 올림', newValue: file.name });
      return { already: false };
    });
  },

  /** 파일 한 장 빼기 — 기록에서 먼저 뺀다(라우트가 그 뒤에 Blob 을 걷는다). 그 현장에 없는 주소면 말로 막는다 */
  async removeFile(id: string, url: string, actor: Actor): Promise<SiteFile> {
    if (!hasDatabase()) throw new Error(NO_DB);
    const row = await editable(id, actor);
    const gone = (row.files ?? []).find((f) => f.url === url);
    if (!gone) throw new Error('그 파일이 이 현장에 없습니다.');
    const db = getDb();
    await db.transaction(async (tx) => {
      await tx
        .update(solarSites)
        .set({
          files: sql`coalesce((select jsonb_agg(f) from jsonb_array_elements(${solarSites.files}) f where f->>'url' <> ${url}), '[]'::jsonb)`,
          updatedAt: new Date(),
        })
        .where(eq(solarSites.id, id));
      await writeAudit(tx, { projectId: null, actor, action: `태양광 ${id}`, field: '파일 뺌', oldValue: gone.name });
    });
    return gone;
  },
};

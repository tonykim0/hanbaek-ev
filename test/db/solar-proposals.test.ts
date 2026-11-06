/**
 * 태양광 제안서 틀 · 조건 · 항공사진의 문 (2026-11-06).
 *
 * 보기(틀 · 조건 읽기 · 항공사진)는 한백의 눈 — 협력사는 사업자 자료를 못 본다(타이런트 업무협약서 3조) · 열람 전용은 본다.
 * 틀 올리기 · 조건 고치기는 한백 관리자만. 조건은 그 틀의 칸 전부를 숫자로 — 틀리면 400, 고치면 감사 기록이 남는다.
 * 조건을 고친 시험은 끝에 원래 값으로 되돌린다(개발 DB 의 조건을 남겨 둔다).
 */
import { afterAll, describe, expect, it } from 'vitest';
import { GET as AERIAL } from '@/app/api/solar/aerial/route';
import { GET, PATCH, POST } from '@/app/api/solar/proposals/route';
import { listProposalTemplates } from '@/lib/data/solar-proposals';
import { TEMPLATES } from '@/lib/solar/proposal/products';
import { getDb } from '@/lib/db/client';
import { solarProposalTemplates } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { signIn, USERS } from './kit';

const json = (method: string, body: unknown, query = '') =>
  new Request(`http://test.local/api/solar/proposals${query}`, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

/** 시험 전의 루모라 조건 — 끝에 되돌린다 */
let before: { terms: Record<string, number>; termsAt: Date | null; termsBy: string | null } | null = null;

describe('태양광 제안서 — 틀 · 조건의 문', () => {
  it('협력사는 읽기부터 403 · 열람 전용은 읽는다', async () => {
    await signIn(USERS.ecoelec);
    expect((await GET()).status).toBe(403);
    await signIn(USERS.viewer);
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { templates: { key: string }[] };
    expect(body.templates.map((t) => t.key).sort()).toEqual(Object.keys(TEMPLATES).sort());
  });

  it('틀 올리기 · 조건 고치기는 한백 관리자만 — 협력사 · 열람 전용 403', async () => {
    for (const who of [USERS.ecoelec, USERS.viewer]) {
      await signIn(who);
      expect((await POST(json('POST', { key: 'lumora-rent', filename: 'a.pdf' }, '?step=token'))).status, who.id).toBe(403);
      expect((await PATCH(json('PATCH', { key: 'lumora-rent', terms: {} }))).status, who.id).toBe(403);
    }
  });

  it('관리자 — 모르는 틀 · 다른 형식 · 틀 자리 밖은 400', async () => {
    await signIn(USERS.admin);
    expect((await POST(json('POST', { key: 'nope', filename: 'a.pdf' }, '?step=token'))).status).toBe(400);
    expect((await POST(json('POST', { key: 'lumora-rent', filename: 'a.pptx' }, '?step=token'))).status).toBe(400);
    expect((await POST(json('POST', { key: 'tyrant-solar15', filename: 'a.pdf' }, '?step=token'))).status).toBe(400);
    expect((await POST(json('POST', { key: 'lumora-rent', filename: 'a.pdf', pathname: 'solar-materials/a.pdf' }))).status).toBe(400);
    expect((await POST(json('POST', { key: 'lumora-rent', filename: 'a.pdf', pathname: 'solar-proposals/lumora-rent/../x.pdf' }))).status).toBe(400);
  });

  it('관리자 — 조건이 빠지거나 울타리 밖이면 400, 맞으면 저장되고 감사 기록이 남는다', async () => {
    await signIn(USERS.admin);
    const [row] = await getDb().select().from(solarProposalTemplates).where(eq(solarProposalTemplates.key, 'lumora-rent'));
    before = row ? { terms: row.terms, termsAt: row.termsAt, termsBy: row.termsBy } : { terms: {}, termsAt: null, termsBy: null };
    expect((await PATCH(json('PATCH', { key: 'lumora-rent', terms: { moduleWatt: 600 } }))).status).toBe(400);
    const terms = { moduleWatt: 600, tiltDeg: 20, shadeAngleDeg: 0, price1: 11_000, price5: 10_000, price10: 9_000 };
    expect((await PATCH(json('PATCH', { key: 'lumora-rent', terms: { ...terms, price1: 1 } }))).status).toBe(400);
    const res = await PATCH(json('PATCH', { key: 'lumora-rent', terms: { ...terms, price1: '11,000' } }));
    expect(res.status).toBe(200);
    const saved = (await listProposalTemplates()).find((t) => t.key === 'lumora-rent')!;
    expect(saved.terms).toEqual(terms);
    expect(saved.termsBy).toContain(USERS.admin.id);
  });

  it('항공사진 — 협력사 403 · 둘레가 이상하거나 너무 크면 400', async () => {
    await signIn(USERS.ecoelec);
    expect((await AERIAL(new Request('http://test.local/api/solar/aerial?bbox=127,36,127.001,36.001'))).status).toBe(403);
    await signIn(USERS.viewer);
    expect((await AERIAL(new Request('http://test.local/api/solar/aerial?bbox=a,b,c,d'))).status).toBe(400);
    expect((await AERIAL(new Request('http://test.local/api/solar/aerial?bbox=127,36,127.5,36.5'))).status).toBe(400);
    expect((await AERIAL(new Request('http://test.local/api/solar/aerial?bbox=127.001,36,127,36.001'))).status).toBe(400);
  });
});

afterAll(async () => {
  if (!before) return;
  await getDb()
    .update(solarProposalTemplates)
    .set({ terms: before.terms, termsAt: before.termsAt, termsBy: before.termsBy })
    .where(eq(solarProposalTemplates.key, 'lumora-rent'));
});

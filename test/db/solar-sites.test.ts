/**
 * 태양광 상담 접수의 문 (2026-11-03 — 「에코일렉은 태양광도 같이할거야 · 현장관리에서 상담 개소 접수」).
 *
 * 누가 접수하나(태양광 참여 협력사 · 한백 관리자) · 누가 보나(협력사는 제 소속만) · 누가 고치고 지우나(담당 협력사 · 한백) ·
 * 담당은 누가 정하나(협력사는 제 소속으로 굳고, 한백은 태양광 참여 협력사 중에서 고른다 — 「한백 직접」은 없다) ·
 * 번호는 다시 쓰지 않는다.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { and, eq, inArray } from 'drizzle-orm';
import { POST } from '@/app/api/solar/sites/route';
import { DELETE, PATCH } from '@/app/api/solar/sites/[id]/route';
import { DELETE as FILES_DELETE, POST as FILES } from '@/app/api/solar/sites/[id]/files/route';
import { SERVER_ERROR_MESSAGE } from '@/lib/api/errors';
import { SITE_NOT_FOUND, solarSiteStore } from '@/lib/data/solar-sites';
import { getDb } from '@/lib/db/client';
import { auditLog, solarSites, users } from '@/lib/db/schema';
import { actorOf, call, RUN, signIn, USERS, viewerOf } from './kit';

const made: string[] = [];
const body = (over: Record<string, unknown> = {}) => ({
  name: `시험 태양광 ${RUN}`,
  address: '충북 충주시 산척면 동충주산단4길 17',
  kind: 'roof',
  customer: '김담당',
  phone: '010-0000-0000',
  memo: '경계 시험',
  ...over,
});

async function create(user: (typeof USERS)[keyof typeof USERS], over: Record<string, unknown> = {}) {
  await signIn(user);
  const r = await call(POST, { body: body(over) });
  if (r.status === 200) made.push(String(r.json?.id));
  return r;
}

const setSolar = (id: string, on: boolean) => getDb().update(users).set({ solar: on }).where(eq(users.id, id));

beforeAll(async () => {
  // 전제 — 에코일렉은 참여(migrations/0105 가 켠다), 대상전력은 안 함
  await setSolar('ecoelec', true);
  await setSolar('daesang', false);
});

afterAll(async () => {
  await setSolar('ecoelec', true);
  if (made.length) await getDb().delete(solarSites).where(inArray(solarSites.id, made));
});

describe('상담 접수 — 누가', () => {
  it('참여 협력사가 접수하면 제 소속이 담당이다 — 보낸 org 는 안 본다', async () => {
    const r = await create(USERS.ecoelec, { org: '대상전력' });
    expect(r.status).toBe(200);
    expect(String(r.json?.id)).toMatch(/^SL-\d{4}-\d{3,}$/);
    const site = await solarSiteStore.get(String(r.json?.id), viewerOf(USERS.admin));
    expect(site?.org).toBe('에코일렉');
    expect(site?.createdBy).toBe('ecoelec');
  });

  it('참여하지 않는 협력사는 접수 못 한다(422) · 열람 전용은 쓰기가 없다(403)', async () => {
    expect((await create(USERS.daesang)).status).toBe(422);
    expect((await create(USERS.viewer)).status).toBe(403);
  });

  it('빈 현장명은 접수가 아니다 — 서버가 한 번 더 본다', async () => {
    const r = await create(USERS.ecoelec, { name: '  ' });
    expect(r.status).toBe(422);
    expect(String(r.json?.error)).toContain('현장명');
  });

  it('한백이 접수하면 담당 협력사를 고른다 — 태양광 참여 협력사만, 비우면 422(「한백 직접」은 없다)', async () => {
    // 2026-11-04 「한백도 접수하게해줘」 — 그 전 하루는 한백의 접수를 아예 막았다
    const r = await create(USERS.admin, { org: '에코일렉' });
    expect(r.status).toBe(200);
    // 고른 협력사가 담당이라 그 협력사도 이 현장을 본다
    const site = await solarSiteStore.get(String(r.json?.id), viewerOf(USERS.ecoelec));
    expect([site?.org, site?.createdBy]).toEqual(['에코일렉', 'admin']);

    const none = await create(USERS.admin);
    expect(none.status).toBe(422);
    expect(String(none.json?.error)).toContain('담당 협력사를 골라');
    // 참여하지 않는 협력사(대상전력)는 담당이 못 된다
    const off = await create(USERS.admin, { org: '대상전력' });
    expect(off.status).toBe(422);
    expect(String(off.json?.error)).toContain('태양광 참여 협력사가 아닙니다');
  });
});

describe('보기 — 협력사는 제 소속만, 한백은 전부', () => {
  it('목록 · 한 곳 모두 소속으로 가른다', async () => {
    const r = await create(USERS.ecoelec);
    const id = String(r.json?.id);
    expect((await solarSiteStore.list(viewerOf(USERS.ecoelec))).map((s) => s.id)).toContain(id);
    expect((await solarSiteStore.list(viewerOf(USERS.admin))).map((s) => s.id)).toContain(id);
    expect((await solarSiteStore.list(viewerOf(USERS.daesang))).map((s) => s.id)).not.toContain(id);
    expect(await solarSiteStore.get(id, viewerOf(USERS.daesang))).toBeNull();
  });
});

describe('고치기 · 지우기 — 담당 협력사와 한백', () => {
  it('남의 현장은 「찾지 못했습니다」 — 있는지도 안 알린다', async () => {
    const id = String((await create(USERS.ecoelec)).json?.id);
    await signIn(USERS.daesang);
    const p = await call(PATCH, { method: 'PATCH', body: { phone: '1' }, params: { id } });
    const d = await call(DELETE, { method: 'DELETE', params: { id } });
    expect([p.status, d.status]).toEqual([422, 422]);
    expect(p.json?.error).toBe(SITE_NOT_FOUND);
  });

  it('담당 협력사가 고치면 그 칸만 바뀌고 감사 기록이 남는다 · 담당은 한백만 바꾼다', async () => {
    const id = String((await create(USERS.ecoelec)).json?.id);
    await signIn(USERS.ecoelec);
    expect((await call(PATCH, { method: 'PATCH', body: { phone: '010-1111-2222' }, params: { id } })).status).toBe(200);
    const site = await solarSiteStore.get(id, viewerOf(USERS.ecoelec));
    expect([site?.phone, site?.name]).toEqual(['010-1111-2222', `시험 태양광 ${RUN}`]);
    const logs = await getDb().select().from(auditLog).where(and(eq(auditLog.action, `태양광 ${id}`), eq(auditLog.field, '연락처')));
    expect(logs.map((l) => [l.oldValue, l.newValue])).toEqual([['010-0000-0000', '010-1111-2222']]);
    // 협력사는 담당을 못 바꾼다 — 비우거나 남에게 넘기는 길이 된다
    expect((await call(PATCH, { method: 'PATCH', body: { org: null }, params: { id } })).status).toBe(422);
    await signIn(USERS.admin);
    // 한백도 참여하지 않는 협력사로는 못 바꾸고, 비우지도 못한다(「한백 직접」은 없다)
    expect((await call(PATCH, { method: 'PATCH', body: { org: '대상전력' }, params: { id } })).status).toBe(422);
    expect((await call(PATCH, { method: 'PATCH', body: { org: null }, params: { id } })).status).toBe(422);
    expect((await call(PATCH, { method: 'PATCH', body: { memo: '한백이 고침' }, params: { id } })).status).toBe(200);
    // 참여 협력사로는 바꾼다(한백이 고른 담당을 되돌릴 길) — 기록이 남고, 현장은 새 담당의 것이 된다.
    // 상대는 navy(네이비인프라) — daesang 은 배포 설정 계정이라 users 에 줄이 없어 참여를 켤 수 없다
    await setSolar('navy', true);
    try {
      expect((await call(PATCH, { method: 'PATCH', body: { org: '네이비인프라' }, params: { id } })).status).toBe(200);
      const moved = await getDb().select().from(auditLog).where(and(eq(auditLog.action, `태양광 ${id}`), eq(auditLog.field, '담당 협력사')));
      expect(moved.map((l) => [l.oldValue, l.newValue])).toEqual([['에코일렉', '네이비인프라']]);
      expect(await solarSiteStore.get(id, viewerOf(USERS.ecoelec))).toBeNull();
      expect((await solarSiteStore.get(id, viewerOf(USERS.navy)))?.org).toBe('네이비인프라');
    } finally {
      await setSolar('navy', false);
    }
  });

  it('참여를 끄면 그 계정은 제 현장도 못 고친다 — 지금 값을 DB 에서 읽는다', async () => {
    const id = String((await create(USERS.ecoelec)).json?.id);
    await setSolar('ecoelec', false);
    try {
      await signIn(USERS.ecoelec);
      expect((await call(PATCH, { method: 'PATCH', body: { memo: '끈 뒤' }, params: { id } })).status).toBe(422);
    } finally {
      await setSolar('ecoelec', true);
    }
  });

  it('지우면 사라지고, 번호는 다시 쓰지 않는다', async () => {
    const first = String((await create(USERS.ecoelec)).json?.id);
    await signIn(USERS.ecoelec);
    expect((await call(DELETE, { method: 'DELETE', params: { id: first } })).status).toBe(200);
    expect(await solarSiteStore.get(first, viewerOf(USERS.admin))).toBeNull();
    const next = String((await create(USERS.ecoelec)).json?.id);
    const seq = (id: string) => Number(id.split('-').pop());
    expect(seq(next)).toBeGreaterThan(seq(first));
  });
});

describe('파일 — 붙이기 · 빼기 (한 줄 update)', () => {
  const fileOf = (id: string, n: number) => ({
    url: `https://x.public.blob.vercel-storage.com/solar-sites/${id}/t${n}.pdf`,
    name: `고지서${n}.pdf`,
    size: 1000 * n,
    at: new Date().toISOString(),
    by: 'ecoelec',
  });

  it('동시에 두 장을 붙여도 둘 다 남고, 같은 주소는 한 번만, 남의 현장 · 다른 자리는 막는다, 빼면 그 장만 빠진다', async () => {
    const id = String((await create(USERS.ecoelec)).json?.id);
    const eco = actorOf(USERS.ecoelec);
    await Promise.all([solarSiteStore.attachFile(id, fileOf(id, 1), eco), solarSiteStore.attachFile(id, fileOf(id, 2), eco)]);
    expect((await solarSiteStore.attachFile(id, fileOf(id, 1), eco)).already).toBe(true);
    expect((await solarSiteStore.get(id, viewerOf(USERS.ecoelec)))?.files.map((f) => f.name).sort()).toEqual(['고지서1.pdf', '고지서2.pdf']);

    await expect(solarSiteStore.attachFile(id, fileOf(id, 3), actorOf(USERS.daesang))).rejects.toThrow(SITE_NOT_FOUND);
    await expect(
      solarSiteStore.attachFile(id, { ...fileOf(id, 4), url: 'https://x.public.blob.vercel-storage.com/solar-sites/SL-1999-001/t.pdf' }, eco),
    ).rejects.toThrow('자리');

    await solarSiteStore.removeFile(id, fileOf(id, 1).url, eco);
    expect((await solarSiteStore.get(id, viewerOf(USERS.ecoelec)))?.files.map((f) => f.name)).toEqual(['고지서2.pdf']);
    await expect(solarSiteStore.removeFile(id, fileOf(id, 1).url, eco)).rejects.toThrow('없습니다');

    const logs = await getDb().select().from(auditLog).where(eq(auditLog.action, `태양광 ${id}`));
    expect(logs.filter((l) => l.field === '파일 올림').length).toBe(2);
    expect(logs.filter((l) => l.field === '파일 뺌').map((l) => l.oldValue)).toEqual(['고지서1.pdf']);

    // 현장을 지우면 남은 파일 주소를 돌려준다 — 라우트가 기록을 지운 뒤 Blob 을 걷는다
    expect(await solarSiteStore.remove(id, eco)).toEqual([fileOf(id, 2).url]);
    made.splice(made.indexOf(id), 1);
  });

  it('파일 라우트 — 열람 전용은 403, 토큰 자리가 그 현장 밖이면 400, 남의 주소는 400', async () => {
    const id = String((await create(USERS.ecoelec)).json?.id);
    const ask = (body: unknown, step = false) =>
      FILES(
        new Request(`http://test.local/api${step ? '?step=token' : ''}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
        { params: { id } },
      );
    await signIn(USERS.viewer);
    expect((await ask({ pathname: `solar-sites/${id}/a.pdf` }, true)).status).toBe(403);
    await signIn(USERS.ecoelec);
    expect((await ask({ pathname: 'solar-sites/SL-1999-001/a.pdf' }, true)).status).toBe(400);
    expect((await ask({ pathname: `solar-sites/${id}/../x.pdf` }, true)).status).toBe(400);
    expect((await ask({ blobUrl: 'https://evil.example.com/solar-sites/x.pdf', filename: 'x.pdf' })).status).toBe(400);
    expect((await ask({ blobUrl: `https://x.public.blob.vercel-storage.com/projects/HB-1/a.pdf`, filename: 'a.pdf' })).status).toBe(400);
  });

  it('파일 라우트의 오류 가르기 — 규칙 위반은 422 그 문구, DB 오류는 한글 값이 실려 와도 500 과 [solar-files] 한 줄', async () => {
    const id = String((await create(USERS.ecoelec)).json?.id);
    const drop = () =>
      FILES_DELETE(
        new Request('http://test.local/api', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://x/a.pdf' }) }),
        { params: { id } },
      );
    const spy = vi.spyOn(solarSiteStore, 'removeFile');
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await signIn(USERS.ecoelec);
      spy.mockRejectedValueOnce(new Error('그 파일이 이 현장에 없습니다.'));
      const rule = await drop();
      expect(rule.status).toBe(422);
      expect(((await rule.json()) as { error: string }).error).toBe('그 파일이 이 현장에 없습니다.');
      expect(logged).not.toHaveBeenCalled();

      // 드라이버 오류는 실패한 쿼리의 값(한글 파일 이름)을 싣고 온다 — 한글이 있다고 사람 잘못(422)으로 보면 안 된다
      spy.mockRejectedValueOnce(Object.assign(new Error('Failed query: update "solar_sites" set "files" = $1 params: 고지서1.pdf'), { code: '40P01' }));
      const broken = await drop();
      expect(broken.status).toBe(500);
      expect(((await broken.json()) as { error: string }).error).toBe(SERVER_ERROR_MESSAGE);
      expect(logged.mock.calls[0]?.[0]).toBe('[solar-files]');
    } finally {
      spy.mockRestore();
      logged.mockRestore();
    }
  });
});

/**
 * 실사보고서 임시 저장본은 저장한 계정만 본다 (2026-10-01 — 클라우드 저장).
 * 남의 저장본은 목록에도 안 나오고, 열기·저장·지우기·사진 토큰이 다 「없다」로 거절된다.
 * 열람 전용은 만들지 못한다(쓰기의 문). 사진 자리는 그 계정·그 저장본의 폴더만 받는다.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { GET as listGET, POST as createPOST } from '@/app/api/survey-drafts/route';
import { DELETE, GET, PUT } from '@/app/api/survey-drafts/[id]/route';
import { POST as photoPOST } from '@/app/api/survey-drafts/[id]/photo/route';
import { RUN, USERS, call, signIn } from './kit';

const title = `[시험 ${RUN}] 임시저장`;
let id = '';

afterAll(async () => {
  if (!id) return;
  await signIn(USERS.ecoelec);
  await call(DELETE, { method: 'DELETE', params: { id } });
});

describe('실사보고서 임시 저장본', () => {
  it('만든 계정은 목록에서 보고 값을 저장·다시 연다', async () => {
    await signIn(USERS.ecoelec);
    const made = await call(createPOST, { body: { cpo: 'pluglink', title } });
    expect(made.status).toBe(200);
    id = String(made.json?.id);
    const saved = await call(PUT, { method: 'PUT', params: { id }, body: { title, data: { siteName: title, spots: [] } } });
    expect(saved.status).toBe(200);
    const res = await listGET(new Request('http://test.local/api/survey-drafts?cpo=pluglink'));
    const body = (await res.json()) as { drafts: Array<{ id: string }> };
    expect(body.drafts.some((d) => d.id === id)).toBe(true);
    const one = await call(GET, { method: 'GET', params: { id } });
    expect((one.json?.draft as { data: { siteName: string } }).data.siteName).toBe(title);
  });

  it('다른 계정은 목록에 안 나오고, 열기·저장·지우기·사진 토큰이 모두 거절된다', async () => {
    await signIn(USERS.daesang);
    const res = await listGET(new Request('http://test.local/api/survey-drafts?cpo=pluglink'));
    const body = (await res.json()) as { drafts: Array<{ id: string }> };
    expect(body.drafts.some((d) => d.id === id)).toBe(false);
    expect((await call(GET, { method: 'GET', params: { id } })).status).toBe(404);
    expect((await call(PUT, { method: 'PUT', params: { id }, body: { title: 'x', data: {} } })).status).toBe(422);
    expect((await call(DELETE, { method: 'DELETE', params: { id } })).status).toBe(422);
    expect((await call(photoPOST, { params: { id } })).status).toBe(422);
  });

  it('사진 자리는 그 계정·그 저장본의 폴더만 받는다', async () => {
    await signIn(USERS.ecoelec);
    const foreign = { __photo: true, url: 'https://x.public.blob.vercel-storage.com/projects/p/a.jpg', path: 'projects/p/a.jpg', name: 'a.jpg', type: 'image/jpeg' };
    const r = await call(PUT, { method: 'PUT', params: { id }, body: { title, data: { photos: { place: foreign } } } });
    expect(r.status).toBe(400);
  });

  it('열람 전용은 만들지 못한다', async () => {
    await signIn(USERS.viewer);
    expect((await call(createPOST, { body: { cpo: 'pluglink', title } })).status).toBe(403);
  });
});

/**
 * 파일 문(/api/files) · 고정 링크(/api/file-link) — 비공개 저장소로 옮기며(2026-11-14) 브라우저 · 바깥이 파일을 받는
 * 유일한 길이 됐다. 판정 표는 test/blob-access.test.ts, 여기는 문이 실제로 그 판정을 쓰는가와 실제 저장소에서 열리는가.
 * 실제 저장소 시험은 개발용 비공개 열쇠(PRIVATE_BLOB_READ_WRITE_TOKEN)가 있을 때만 — 올린 파일은 끝나면 지운다.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { GET as gate } from '@/app/api/files/[...path]/route';
import { GET as link } from '@/app/api/file-link/[sig]/[...path]/route';
import { deleteBlobs, linkSig, putBlob } from '@/lib/blob/server';
import { RUN, USERS, signIn, signOut, withProject } from './kit';

const HAS_STORE = !!process.env.PRIVATE_BLOB_READ_WRITE_TOKEN;
const made: string[] = [];
afterAll(async () => { if (made.length) await deleteBlobs(made).catch(() => {}); });

const open = (path: string) => gate(new Request(`http://test.local/api/files/${path.split('/').map(encodeURIComponent).join('/')}`));

describe('파일 문', () => {
  it('로그인 없으면 401 · .. 로 남의 자리를 노려도 그 자리의 판정을 받는다', async () => {
    signOut();
    expect((await open('projects/HB-1/a.pdf')).status).toBe(401);
    /* 주소의 .. 는 요청이 라우트에 닿기 전에 풀린다 — 풀린 경로(agent-files)의 판정을 받는다: 관리자만 */
    await signIn(USERS.ecoelec);
    expect((await gate(new Request('http://test.local/api/files/projects/HB-1/%2E%2E/%2E%2E/agent-files/x.pdf'))).status).toBe(404);
    await signIn(USERS.admin);
    expect((await gate(new Request('http://test.local/api/files/projects/HB-1/%2E%2E/%2E%2E/agent-files/x.pdf'))).status).toBe(302);
  });

  it('현장 서류 — 그 현장의 영업사 · 시공사 · 한백은 서명 주소로, 남의 회사는 404', async () => {
    await withProject(async (id) => {
      const path = `projects/${id}/gate-${RUN}.txt`;
      for (const [u, want] of [[USERS.navy, 302], [USERS.daesang, 302], [USERS.viewer, 302], [USERS.ecoelec, 404]] as const) {
        await signIn(u);
        const r = await open(path);
        expect(r.status, u.id).toBe(want);
        if (want === 302) expect(new URL(r.headers.get('location')!).hostname).toMatch(/\.private\.blob\.vercel-storage\.com$/);
      }
    });
  });

  it.skipIf(!HAS_STORE)('★실제 저장소★ — 서명 주소로 열리고 맨 주소는 403 · ?download=1 은 첨부로', async () => {
    await withProject(async (id) => {
      const path = `projects/${id}/gate-${RUN}.txt`;
      const put = await putBlob(path, `파일 문 ${RUN}`, { contentType: 'text/plain; charset=utf-8', addRandomSuffix: false });
      made.push(path);
      expect((await fetch(put.url)).status).toBe(403);
      await signIn(USERS.navy);
      const to = (await open(path)).headers.get('location')!;
      const got = await fetch(to);
      expect(got.status).toBe(200);
      expect(await got.text()).toBe(`파일 문 ${RUN}`);
      const dl = await gate(new Request(`http://test.local/api/files/${path}?download=1`));
      expect((await fetch(dl.headers.get('location')!)).headers.get('content-disposition')).toMatch(/^attachment/);
      // 옛 공개 저장소의 주소로 적힌 것도 같은 경로로 연다(DB 의 주소를 안 고친다)
      const old = `https://ivbvhnhxxxhywujn.public.blob.vercel-storage.com/${path}`;
      const viaOld = await gate(new Request(`http://test.local${new URL(old).pathname.replace(/^/, '/api/files')}`));
      expect(viaOld.status).toBe(302);
    });
  });

  it.skipIf(!HAS_STORE)('★실제 저장소★ 고정 링크 — 서명이 맞아야 열리고 로그인은 안 본다', async () => {
    const path = `agent-files/settlement/test-${RUN}/a.txt`;
    await putBlob(path, '고정 링크', { contentType: 'text/plain; charset=utf-8', addRandomSuffix: false });
    made.push(path);
    signOut();
    const ok = await link(new Request(`http://test.local/api/file-link/${linkSig(path)}/${path}`), { params: { sig: linkSig(path) } });
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe('고정 링크');
    const bad = await link(new Request(`http://test.local/api/file-link/x/${path}`), { params: { sig: 'x' } });
    expect(bad.status).toBe(404);
    const other = await link(new Request(`http://test.local/api/file-link/${linkSig(path)}/agent-files/settlement/other.txt`), { params: { sig: linkSig(path) } });
    expect(other.status).toBe(404);
  });
});

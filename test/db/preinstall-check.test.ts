/**
 * 기설치 엑셀 ↔ 증빙 대조 라우트의 문 (한백 지시 2026-10-06).
 *
 * 판독(돈이 드는 길)은 부르지 않는다 — 엑셀이 없거나 엑셀이 아닌 현장은 판독 전에 멈추므로,
 * 그 길로 문(누가 돌리나)·저장·상세에서 다시 읽힘·협력사에게도 보임을 본다.
 * 판정 자체는 test/preinstall-check.test.ts, 엑셀 읽기는 test/legacy-sheet.test.ts 가 본다.
 */
import { describe, expect, it } from 'vitest';
import { POST } from '@/app/api/projects/[id]/preinstall/check/route';
import { getRepository } from '@/lib/data';
import { RUN, USERS, actorOf, call, signIn, signOut, viewerOf, withProject } from './kit';

const repo = getRepository();
const env = { bizType: '환경부' as const };

describe('기설치 대조 — 누가 돌리나', () => {
  it('협력사·열람 전용은 못 돌린다 (403)', async () => {
    await withProject(async (id) => {
      for (const u of [USERS.daesang, USERS.viewer]) {
        await signIn(u);
        expect((await call(POST, { params: { id } })).status, u.id).toBe(403);
      }
      signOut();
      expect(await repo.getProject(id, viewerOf(USERS.admin)).then((d) => d?.preinstallCheck)).toBeNull();
    }, env);
  });
});

describe('기설치 대조 — 판독 전에 멈추는 자리', () => {
  it('설치이력이 없으면 그 이유를 남기고, 상세가 다시 읽는다 — 협력사도 본다', async () => {
    await withProject(async (id) => {
      await signIn(USERS.admin);
      const r = await call(POST, { params: { id } });
      signOut();
      expect(r.status).toBe(200);
      expect((r.json?.check as { problem: string }).problem).toBe('설치이력 엑셀이 없습니다.');

      const mine = await repo.getProject(id, viewerOf(USERS.daesang));
      expect(mine?.preinstallCheck?.problem).toBe('설치이력 엑셀이 없습니다.');
    }, env);
  });

  it('설치이력이 엑셀이 아니면(스캔 PDF) 읽지 못했다고 남긴다 — 칸의 파일 주소를 같이 남겨 바뀌면 안다', async () => {
    await withProject(async (id) => {
      const url = `https://test.local/${RUN}/${id}/legacylog.pdf`;
      await repo.uploadDocument({ projectId: id, kind: 'legacylog', filename: '설치이력.pdf', blobUrl: url }, actorOf(USERS.admin));
      await signIn(USERS.admin);
      const r = await call(POST, { params: { id } });
      signOut();
      const check = r.json?.check as { problem: string; files: string[] };
      expect(check.problem).toMatch(/엑셀\(\.xlsx\)이 아니라/);
      expect(check.files).toEqual([url]);
    }, env);
  });

  it('다시 대조하면 덮는다 — 현장마다 마지막 하나', async () => {
    await withProject(async (id) => {
      await signIn(USERS.admin);
      const first = await call(POST, { params: { id } });
      const second = await call(POST, { params: { id } });
      signOut();
      const saved = await repo.getProject(id, viewerOf(USERS.admin));
      expect(saved?.preinstallCheck?.checkedAt).toBe((second.json?.check as { checkedAt: string }).checkedAt);
      expect(saved?.preinstallCheck?.checkedAt).not.toBe((first.json?.check as { checkedAt: string }).checkedAt);
    }, env);
  });
});

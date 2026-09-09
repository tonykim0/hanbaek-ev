/**
 * 정산 메모(비고)는 내가 본 값 위에만 쓴다 — 감사 2026-09-04 M32.
 * 전체 문자열 덮어쓰기라 두 사람이 겹치면 나중 저장이 앞사람의 메모를 소리 없이 지웠다.
 */
import { describe, expect, it } from 'vitest';
import { getRepository } from '@/lib/data';
import { USERS, actorOf, viewerOf, withProject } from './kit';

const repo = getRepository();
const admin = actorOf(USERS.admin);
const noteOf = async (id: string) => (await repo.getProject(id, viewerOf(USERS.admin)))!.settlement.payNote ?? null;

describe('정산 메모 저장', () => {
  it('M32 — 내가 본 값과 지금 값이 다르면 거절한다', async () => {
    await withProject(async (id) => {
      await repo.setPayment(id, { payNote: '2026-09-09 첫 메모' }, admin);
      await expect(repo.setPayment(id, { payNote: '2026-09-09 둘째\n2026-09-09 첫 메모' }, admin, { payNote: '2026-09-09 첫 메모' })).resolves.toBeUndefined();
      await expect(repo.setPayment(id, { payNote: '낡은 화면의 저장' }, admin, { payNote: '2026-09-09 첫 메모' })).rejects.toThrow(/먼저 메모를 고쳤/);
      expect(await noteOf(id)).toBe('2026-09-09 둘째\n2026-09-09 첫 메모');
    });
  });

  it('M32 — 같은 값을 본 두 저장이 동시에 오면 하나만 남고 다른 하나는 거절된다', async () => {
    await withProject(async (id) => {
      await repo.setPayment(id, { payNote: '기준' }, admin);
      const results = await Promise.allSettled([
        repo.setPayment(id, { payNote: 'A\n기준' }, admin, { payNote: '기준' }),
        repo.setPayment(id, { payNote: 'B\n기준' }, admin, { payNote: '기준' }),
      ]);
      expect(results.filter((r) => r.status === 'fulfilled').length).toBe(1);
      expect(['A\n기준', 'B\n기준']).toContain(await noteOf(id));
    });
  });

  it('expect 없이 부르면 옛 방식(덮어쓰기)이다 — 다른 호출처를 깨지 않는다', async () => {
    await withProject(async (id) => {
      await repo.setPayment(id, { payNote: '하나' }, admin);
      await expect(repo.setPayment(id, { payNote: '둘' }, admin)).resolves.toBeUndefined();
      expect(await noteOf(id)).toBe('둘');
    });
  });
});

/**
 * 돈이 오간 현장은 못 지운다 — ★실사고 2026-09-16★.
 *
 * 마곡럭스나인오피스텔(HB-2026-124)을 지웠더니 엘앤에스 영업비 2026-08-26 배치가
 * 51,660,000 → 47,740,000 원으로 줄었다. 그 배치는 8/28 에 최종 확정됐고 8/30 에
 * 세금계산서까지 붙어 있었다 — 계산서는 옛 합계 그대로인데 원장만 줄었고, 화면에는
 * 아무 말도 안 떴다.
 *
 * 지급 원장 줄은 현장에 FK 로 매달려 cascade 로 딸려 나간다. 확정된 배치는 원장에 줄을
 * 더하지도 빼지도 못하게 잠겨 있는데(assertBatchOpen), 현장을 통째로 지우면 그 문을
 * 안 지나고 빠져나갔다.
 */
import { describe, expect, it } from 'vitest';
import { getRepository } from '@/lib/data';
import { actorOf, USERS, withProject } from './kit';
import { admin, entriesOf, withPayableProject } from './money-kit';

const repo = getRepository();
const partner = actorOf(USERS.ecoelec);

describe('현장 삭제의 문', () => {
  it('지급 줄이 없으면 지운다 — 중복 접수·시험 입력은 지울 수 있어야 한다', async () => {
    let id = '';
    await withProject(async (pid) => { id = pid; });
    // withProject 가 끝나며 지웠다 — 다시 읽으면 없다
    expect(await repo.getProject(id, { role: 'admin', org: null })).toBeNull();
  });

  it('★지급 줄이 하나라도 있으면 거절한다★ — 거래명세서에 이미 나간 줄이다', async () => {
    await withPayableProject(async ({ id }) => {
      await repo.runPayoutBatch([{ projectId: id, kind: '영업비' }], '2026-10-10', admin);
      expect((await entriesOf(id)).length).toBeGreaterThan(0);

      await expect(repo.deleteProject(id, admin)).rejects.toThrow(/지급 원장/);
      // 막혔으면 현장도 원장도 그대로다
      expect(await repo.getProject(id, { role: 'admin', org: null })).not.toBeNull();
      expect((await entriesOf(id)).length).toBeGreaterThan(0);
    });
  });

  it('막는 말에 건수·금액·배치를 적는다 — 무엇을 먼저 정리할지 알아야 한다', async () => {
    await withPayableProject(async ({ id }) => {
      await repo.runPayoutBatch([{ projectId: id, kind: '영업비' }], '2026-10-10', admin);
      await expect(repo.deleteProject(id, admin))
        .rejects.toThrow(/1건[\s\S]*원[\s\S]*2026-10-10 영업비/);
    });
  });

  it('협력사는 애초에 못 지운다 — 지급 여부 이전의 문이다', async () => {
    await withProject(async (id) => {
      await expect(repo.deleteProject(id, partner)).rejects.toThrow();
    });
  });
});

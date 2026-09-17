/**
 * 계약대수를 뒤늦게 넣는 자리 — ★한백 지적 2026-09-17★.
 *
 * 접수는 대수 없이도 통과한다(checkDraft 는 「대수를 아직 안 적었습니다 — 현장 상세에서
 * 채웁니다」로 넘긴다 — 계약접수 칸은 처음 모으는 자리다). 그런데 채울 자리가 없어서
 * 라인 0개인 현장(HB-2026-174 금천효성1차)이 대수를 영영 못 넣었다 — 대수가 없으면 단가도
 * 못 붙고 기성·지급 계획도 서지 않는다.
 */
import { describe, expect, it } from 'vitest';
import { getRepository } from '@/lib/data';
import { actorOf, draft, USERS, withProject } from './kit';
import { admin, withPayableProject } from './money-kit';

const repo = getRepository();
const partner = actorOf(USERS.ecoelec);
const view = { role: 'admin' as const, org: null };
const linesOf = async (id: string) => (await repo.getProject(id, view))!.lines;

describe('계약 라인 달기', () => {
  it('★라인 0개인 현장에 넣는다★ — 접수가 대수 없이 통과한 그 현장이다', async () => {
    await withProject(async (id) => {
      expect(await linesOf(id)).toHaveLength(0);
      const lineId = await repo.addContractLine(id, {
        qty: 5, termYears: 10, powerType: null, replType: null,
      }, admin);
      const [l] = await linesOf(id);
      expect(l.id).toBe(lineId);
      expect(l.qty).toBe(5);
      expect(l.termYears).toBe(10);
    }, { lines: [] });
  });

  it('안 적은 축은 현장 값을 따른다 — 같은 값을 두 번 묻지 않는다', async () => {
    await withProject(async (id) => {
      await repo.addContractLine(id, { qty: 3, termYears: 7, powerType: null, replType: null }, admin);
      const [l] = await linesOf(id);
      expect(l.powerType).toBe('모자분리');
    }, { lines: [], powerType: '모자분리' });
  });

  it('적으면 그 값이 이긴다 — 조건이 갈리는 현장은 묶음마다 축이 다르다', async () => {
    await withProject(async (id) => {
      await repo.addContractLine(id, { qty: 2, termYears: 7, powerType: '한전불입', replType: null }, admin);
      const [l] = await linesOf(id);
      expect(l.powerType).toBe('한전불입');
    }, { lines: [], powerType: '모자분리' });
  });

  it('★번호가 겹치지 않는다★ — 가운데를 뗐다가 다시 달아도 기본키가 안 부딪힌다', async () => {
    await withProject(async (id) => {
      const a = await repo.addContractLine(id, { qty: 1, termYears: 7, powerType: null, replType: null }, admin);
      const b = await repo.addContractLine(id, { qty: 2, termYears: 7, powerType: null, replType: null }, admin);
      await repo.deleteContractLine(a, admin);
      const c = await repo.addContractLine(id, { qty: 3, termYears: 7, powerType: null, replType: null }, admin);
      expect(new Set([a, b, c]).size).toBe(3);
      expect((await linesOf(id)).map((l) => l.id).sort()).toEqual([b, c].sort());
    }, { lines: [] });
  });

  it('아무 값이나 받지 않는다 · 협력사는 못 단다', async () => {
    await withProject(async (id) => {
      await expect(repo.addContractLine(id, { qty: 0, termYears: 7, powerType: null, replType: null }, admin))
        .rejects.toThrow(/계약대수/);
      await expect(repo.addContractLine(id, { qty: 1, termYears: 8, powerType: null, replType: null }, admin))
        .rejects.toThrow(/계약연수/);
      await expect(repo.addContractLine(id, { qty: 1, termYears: 7, powerType: null, replType: null }, partner))
        .rejects.toThrow();
    }, { lines: [] });
  });

  it('★단가가 붙은 묶음은 못 뗀다★ — 그 라인으로 계획이 이미 섰다', async () => {
    await withPayableProject(async ({ id, lineId }) => {
      await expect(repo.deleteContractLine(lineId, admin)).rejects.toThrow(/단가/);
      expect(await linesOf(id)).toHaveLength(1);
    });
  });

  it('★지급조건이 확정되면 달지도 떼지도 못한다★ — 대수는 계획의 곱하는 수다', async () => {
    await withPayableProject(async ({ id, lineId }) => {
      await repo.setPayoutTermsConfirmed(id, true, admin);
      await expect(repo.addContractLine(id, { qty: 1, termYears: 7, powerType: null, replType: null }, admin))
        .rejects.toThrow(/지급조건/);
      await expect(repo.deleteContractLine(lineId, admin)).rejects.toThrow(/지급조건/);
    });
  });
});

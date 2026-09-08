/**
 * 눈과 손 — 협력사가 보는 현장 상세에 한백 전용 값이 없고, 협력사의 손은 한백 일에 닿지 않는다.
 *
 * scripts/check-partner-leak.ts 가 전 현장을 훑어 같은 것을 보는데, 그것은 「지금 DB 의 현장」에
 * 달려 있어 협력사가 붙은 현장이 없으면 검사할 것이 없다. 여기서는 시험 현장을 만들어 결정적으로 본다.
 * 금지 키 목록은 그 스크립트와 같다 — 한쪽을 고치면 다른 쪽도 고친다.
 */
import { describe, expect, it } from 'vitest';
import { getRepository } from '@/lib/data';
import { USERS, actorOf, viewerOf, withProject } from './kit';

/** 협력사 응답에 있어서는 안 되는 키 — 값이 null 이어도 키가 있으면 실패 (check-partner-leak 과 같다) */
const FORBIDDEN = ['admin', 'settlementRule', 'steps', 'planAmount', 'basisLabel', 'safetyFee', 'cpoCloseDate'];
/** 협력사가 자기 일을 하려면 반드시 있어야 하는 것 */
const REQUIRED = ['payNote', 'documents', 'lines', 'process', 'contract'];

describe('협력사가 보는 현장 상세', () => {
  it('영업사·시공사 시점의 응답에 금지 키가 없고 필요한 키는 있다', async () => {
    await withProject(async (id) => {
      const repo = getRepository();
      for (const u of [USERS.navy, USERS.daesang]) {
        const detail = await repo.getProject(id, viewerOf(u));
        expect(detail, `${u.role} ${u.org} 가 자기 현장을 못 본다`).not.toBeNull();
        const json = JSON.stringify(detail);
        for (const key of FORBIDDEN) expect(json, `${u.role}: 금지 키 "${key}"`).not.toContain(`"${key}"`);
        for (const key of REQUIRED) expect(json, `${u.role}: 필요한 키 "${key}"`).toContain(`"${key}"`);
      }
    });
  });

  it('현장에 붙지 않은 회사는 상세를 못 본다 — null', async () => {
    await withProject(async (id) => {
      const detail = await getRepository().getProject(id, viewerOf(USERS.ecoelec));
      expect(detail).toBeNull();
    });
  });

  it('한백의 눈(관리자·열람 전용)은 원가 묶음(admin)을 본다', async () => {
    await withProject(async (id) => {
      const repo = getRepository();
      for (const u of [USERS.admin, USERS.viewer]) {
        const detail = await repo.getProject(id, viewerOf(u));
        expect(detail?.admin, `${u.role} 에게 admin 묶음이 없다`).toBeDefined();
      }
    });
  });

  it('협력사의 손은 현장 삭제에 닿지 않는다 — 저장소가 막는다', async () => {
    await withProject(async (id) => {
      const repo = getRepository();
      await expect(repo.deleteProject(id, actorOf(USERS.daesang))).rejects.toThrow('한백 관리자만');
      await expect(repo.deleteProject(id, actorOf(USERS.viewer))).rejects.toThrow('한백 관리자만');
      expect(await repo.getProject(id, viewerOf(USERS.admin))).not.toBeNull();
    });
  });
});

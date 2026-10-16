/**
 * 건축물대장 대조(주차면·주소)가 계약 확인을 막는다 (한백 결정 2026-10-16 「막는다」).
 *
 * 판독은 돌리지 않는다 — 결과를 저장소에 바로 넣고, 계약 확인(confirmContract)과 「확인함」 라우트가 그것을 어떻게
 * 보는지만 본다. 판정 자체는 test/parking-check.test.ts 가 본다. 현장은 money-kit 의 「계약 확인 직전」 현장이다
 * (자체투자라 기설치 대조가 끼지 않는다).
 */
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { POST as ACCEPT } from '@/app/api/projects/[id]/parking/check/accept/route';
import { getRepository } from '@/lib/data';
import { getDb } from '@/lib/db/client';
import { parkingChecks } from '@/lib/db/schema';
import { PARKING_CHECK_VERSION, parkingFilesOf, type ParkingCheck } from '@/lib/parking-check';
import { RUN, USERS, call, signIn, signOut, viewerOf } from './kit';
import { admin, withPayableProject } from './money-kit';

const repo = getRepository();

const filesNow = async (id: string) => parkingFilesOf((await repo.getProject(id, viewerOf(USERS.admin)))!.documents);

const checkOf = (files: string[], over: Partial<ParkingCheck> = {}): ParkingCheck => ({
  checkedAt: new Date().toISOString(), files, reads: [], basis: { value: 249, from: '건축물대장' },
  consult: 249, apply: null, applyChecked: false, issues: [], unread: [], version: PARKING_CHECK_VERSION, ...over,
});

describe('건축물대장 대조 — 계약 확인의 조건', () => {
  it('대조 전 → 짚을 것 남음 → 한백이 넘김 → 서류 바뀜 → 다시 대조해 맞음, 그때마다 확인이 막히고 열린다', async () => {
    await withPayableProject(async ({ id, org }) => {
      // 픽스처가 남긴 「맞음」을 걷는다 — 대조 전부터 본다
      await getDb().delete(parkingChecks).where(eq(parkingChecks.projectId, id));
      await expect(repo.confirmContract(id, true, admin)).rejects.toThrow(/건축물대장 대조 전/);

      const left = checkOf(await filesNow(id), {
        basis: null, issues: [{ key: 'view-only', text: '열람용 건축물대장 — 접수 불가(발급용으로 다시)' }],
      });
      await repo.saveParkingCheck(id, left, admin);
      await expect(repo.confirmContract(id, true, admin)).rejects.toThrow(/건축물대장 대조 1건 미확인/);
      // 협력사도 결과를 본다 — 어긋난 서류를 고쳐 내는 것이 협력사의 일이다
      const seen = await repo.getProject(id, { role: 'sales', org });
      expect(seen?.parkingCheck?.issues[0].key).toBe('view-only');

      // 넘기기 — 한백만, 본 결과에만
      await signIn(USERS.ecoelec);
      expect((await call(ACCEPT, { params: { id }, body: { checkedAt: left.checkedAt, accept: true } })).status).toBe(403);
      await signIn(USERS.admin);
      expect((await call(ACCEPT, { params: { id }, body: { checkedAt: '2000-01-01T00:00:00.000Z', accept: true } })).status).toBe(422);
      expect((await call(ACCEPT, { params: { id }, body: { checkedAt: left.checkedAt, accept: true } })).status).toBe(200);
      signOut();
      expect((await repo.getProject(id, viewerOf(USERS.admin)))?.parkingCheck?.accepted?.by).toBe(admin.name);

      // 넘긴 뒤 건축물대장이 바뀌면 넘긴 것도 무효 — 확인한 것은 그때의 서류다
      await repo.uploadDocument({
        projectId: id, kind: 'bldgreg', filename: 'bldgreg-2.pdf', blobUrl: `https://test.local/${RUN}/${id}/bldgreg-2.pdf`,
      }, admin);
      await expect(repo.confirmContract(id, true, admin)).rejects.toThrow(/건축물대장 대조 서류 바뀜/);
      await expect(repo.acceptParkingCheck(id, left.checkedAt, true, admin)).rejects.toThrow(/서류가 바뀌었습니다/);

      // 주소를 견주기 전(버전 1)의 결과는 맞음이어도 다시 대조해야 한다 — 그 항목을 안 봤다
      await repo.saveParkingCheck(id, checkOf(await filesNow(id), { version: undefined }), admin);
      await expect(repo.confirmContract(id, true, admin)).rejects.toThrow(/건축물대장 다시 대조 — 주소 확인 추가/);

      await repo.saveParkingCheck(id, checkOf(await filesNow(id)), admin);
      await expect(repo.confirmContract(id, true, admin)).resolves.toBeUndefined();
      expect((await repo.getProject(id, viewerOf(USERS.admin)))?.project.contractConfirmedAt).not.toBeNull();
    }, { confirm: false });
  });
});

/**
 * 서류 검수의 담당(court)과 반려 — 감사 2026-09-04 L6 · M11.
 *
 * 담당은 「지금 누구 차례인가」라 화면의 할 일과 보드가 전부 이것을 본다. 반려와 보완요청이 담당을 넘기는데,
 * 되돌릴 때(해제·취소) 담당이 따라오지 않거나, 되돌릴 것이 아닌 반려까지 지우는 자리가 있었다.
 */
import { describe, expect, it } from 'vitest';
import { getRepository } from '@/lib/data';
import { RUN, USERS, actorOf, viewerOf, withProject } from './kit';

const repo = getRepository();
const admin = actorOf(USERS.admin);
const view = viewerOf(USERS.admin);
const upload = (id: string, kind: string) =>
  repo.uploadDocument({ projectId: id, kind, filename: `${kind}.pdf`, blobUrl: `https://test.local/${RUN}/${id}/${kind}.pdf` }, admin);
const courtOf = async (id: string) => (await repo.getProject(id, view))!.court;
const docOf = async (id: string, kind: string) => (await repo.getProject(id, view))!.documents.find((d) => d.kind === kind)!;

describe('서류 검수의 담당', () => {
  it('L6 — 반려를 풀어 남은 반려가 없으면 담당이 한백으로 돌아온다', async () => {
    await withProject(async (id) => {
      await upload(id, 'contract');
      await repo.setDocumentStatus({ projectId: id, kind: 'contract', status: 'rejected', reason: '글자 흐림' }, admin);
      expect(await courtOf(id), '반려 뒤').toBe('영업사');
      await repo.setDocumentStatus({ projectId: id, kind: 'contract', status: 'uploaded' }, admin);
      expect((await docOf(id, 'contract')).status).toBe('uploaded');
      expect(await courtOf(id), '반려 해제 뒤 — 반려 0건').toBe('한백');
    });
  });

  it('L6 — 반려가 둘일 때 하나만 풀면 담당은 그대로 영업사다', async () => {
    await withProject(async (id) => {
      await upload(id, 'contract'); await upload(id, 'sealuse');
      await repo.setDocumentStatus({ projectId: id, kind: 'contract', status: 'rejected', reason: '글자 흐림' }, admin);
      await repo.setDocumentStatus({ projectId: id, kind: 'sealuse', status: 'rejected', reason: '직인 누락' }, admin);
      await repo.setDocumentStatus({ projectId: id, kind: 'contract', status: 'uploaded' }, admin);
      expect(await courtOf(id)).toBe('영업사');
    });
  });

  it('M11 — 「보완요청 취소」는 요청이 세운 반려만 되돌린다 — 파일을 뺀 진짜 반려는 사유째 남는다', async () => {
    await withProject(async (id) => {
      await upload(id, 'contract');
      await repo.setDocumentStatus({ projectId: id, kind: 'contract', status: 'rejected', reason: '글자 흐림' }, admin);
      // 협력사가 반려된 파일을 빼면 rejected + 파일 없음 — 요청이 세운 칸과 값이 같아 보인다
      const doc = await docOf(id, 'contract');
      await repo.deleteDocumentFile({ projectId: id, kind: 'contract', url: doc.files[0].url }, admin);
      expect((await docOf(id, 'contract')).status).toBe('rejected');
      // 빈 필수 칸들에 보완요청
      const { kinds } = await repo.askMissingDocs(id, true, null, admin);
      expect(kinds.length).toBeGreaterThan(0);
      expect(kinds, '요청은 빈 칸에만 — 반려된 계약서는 대상이 아니다').not.toContain('contract');
      // 취소
      const undone = await repo.askMissingDocs(id, false, null, admin);
      expect(undone.kinds.sort()).toEqual([...kinds].sort());
      const contract = await docOf(id, 'contract');
      expect(contract.status, '진짜 반려는 남는다').toBe('rejected');
      expect(contract.rejectReason, '사유도 남는다').toBe('글자 흐림');
      for (const k of kinds) expect((await docOf(id, k)).status, `${k} 는 미제출로 돌아간다`).toBe('none');
      expect(await courtOf(id), '반려가 남았으니 담당은 여전히 영업사').toBe('영업사');
    });
  });

  it('M11 — 남은 반려가 없을 때의 취소는 담당을 한백으로 돌린다', async () => {
    await withProject(async (id) => {
      await upload(id, 'contract');
      await repo.setDocumentStatus({ projectId: id, kind: 'contract', status: 'rejected', reason: '검토용' }, admin);
      await repo.setDocumentStatus({ projectId: id, kind: 'contract', status: 'uploaded' }, admin);   // 반려 해제 → 한백
      await repo.askMissingDocs(id, true, null, admin);                                               // 요청 → 영업사
      expect(await courtOf(id)).toBe('영업사');
      await repo.askMissingDocs(id, false, null, admin);
      expect(await courtOf(id)).toBe('한백');
    });
  });
});

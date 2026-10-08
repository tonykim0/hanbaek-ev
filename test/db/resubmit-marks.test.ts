/**
 * 보완하며 새로 올린 장의 표시 — 「이번 판」에 온 것만 칠한다 (한백 지시 2026-10-08, DocFile.resubmit).
 *
 * 한 판은 한백의 판정에서 다음 판정까지다: 반려·보완요청이 판을 열고, 협력사가 그 뒤에 올린 장에 표시가 붙고,
 * 한백의 다음 판정(반려·해제·확인)이 걷는다. 한백이 올린 장은 달지 않는다 — 보여줄 상대가 한백이다.
 */
import { describe, expect, it } from 'vitest';
import { getRepository } from '@/lib/data';
import { RUN, USERS, actorOf, viewerOf, withProject } from './kit';

const repo = getRepository();
const admin = actorOf(USERS.admin);
const partner = actorOf(USERS.navy);   // 시험 현장의 영업사
const urlOf = (id: string, name: string) => `https://test.local/${RUN}/${id}/${name}.pdf`;
const put = (id: string, kind: string, name: string, actor = partner) =>
  repo.uploadDocument({ projectId: id, kind, filename: `${name}.pdf`, blobUrl: urlOf(id, name) }, actor);
const marks = async (id: string, kind: string) =>
  ((await repo.getProject(id, viewerOf(USERS.admin)))?.documents.find((d) => d.kind === kind)?.files ?? [])
    .map((f) => [f.name.replace(/\.pdf$/, ''), f.resubmit ?? null]);

describe('보완하며 새로 올린 장', () => {
  it('반려 뒤 올린 장에 사유와 함께 붙고, 한백의 다음 반려가 앞 판의 표시를 걷는다', async () => {
    await withProject(async (id) => {
      await put(id, 'contract', 'c1');
      expect(await marks(id, 'contract'), '처음 낸 것은 보완이 아니다').toEqual([['c1', null]]);

      await repo.setDocumentStatus({ projectId: id, kind: 'contract', status: 'rejected', reason: '서명 누락' }, admin);
      await put(id, 'contract', 'c2');
      await put(id, 'contract', 'c3');   // 두 장째 — 칸은 이미 풀렸지만 같은 판이다
      await put(id, 'agreement', 'a1');  // 반려 없는 칸도 그 판에 고쳐 올리면 칠한다
      await put(id, 'minutes', 'm1', admin);
      expect(await marks(id, 'contract')).toEqual([
        ['c1', null], ['c2', { reason: '서명 누락' }], ['c3', { reason: null }],
      ]);
      expect(await marks(id, 'agreement')).toEqual([['a1', { reason: null }]]);
      expect(await marks(id, 'minutes'), '한백이 올린 장은 달지 않는다').toEqual([['m1', null]]);

      // 새 판 — 한백이 다른 칸을 돌려보냈다. 앞 판에 고쳐 온 계약서는 이제 「이번 것」이 아니다
      await repo.setDocumentStatus({ projectId: id, kind: 'agreement', status: 'rejected', reason: '날짜 오기' }, admin);
      expect(await marks(id, 'contract')).toEqual([['c1', null], ['c2', null], ['c3', null]]);
      await put(id, 'agreement', 'a2');
      expect(await marks(id, 'agreement')).toEqual([['a1', null], ['a2', { reason: '날짜 오기' }]]);

      // 반려가 아닌 판정은 그 칸만 걷는다
      await put(id, 'contract', 'c4');
      await repo.setDocumentStatus({ projectId: id, kind: 'agreement', status: 'approved' }, admin);
      expect(await marks(id, 'agreement')).toEqual([['a1', null], ['a2', null]]);
      expect((await marks(id, 'contract')).at(-1)).toEqual(['c4', { reason: null }]);
    });
  });
});

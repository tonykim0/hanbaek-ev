/**
 * 서류에서 읽어 넣은 현장 정보 — 그 장이 빠지면 걷는다 · 지운 현장의 번호는 다시 쓰지 않는다 (2026-10-29, HB-2026-282).
 *
 * 그 현장은 협력사가 남의 현장(혜성타운) 계약서를 올렸다 17분 뒤 뺐는데, 그 계약서에서 읽은 계약일이 그대로 남았다 —
 * 판독은 빈 칸만 채우니 맞는 계약서를 다시 올려도 안 고쳐졌다. 그리고 한백이 그 현장을 지운 3분 뒤의 새 접수가 같은
 * 번호를 받아 두 현장의 이력이 섞였다. 판독(Claude)은 부르지 않는다 — 읽은 결과를 저장소에 남기는 자리부터 본다.
 */
import { describe, expect, it } from 'vitest';
import { getRepository } from '@/lib/data';
import { undoFactsNow } from '@/lib/fact-read-run';
import { withRegionPrefix } from '@/lib/region';
import { RUN, USERS, actorOf, draft, dropFixture, viewerOf, withProject } from './kit';

const urlOf = (id: string, n: number) => `https://test.local/${RUN}/${id}/contract-${n}.pdf`;
const ADDR = '경상북도 구미시 형곡로 14길 11';

/** 판독이 그 장에서 계약일·주소를 읽어 넣은 모양 그대로 — fillFactNow 가 하는 쓰기 셋 */
async function readInto(id: string, url: string) {
  const repo = getRepository();
  const auto = { id: 'system', name: '자동 판독', role: 'admin' as const, org: null };
  await repo.setProjectFacts(id, { contractDate: '2026-10-21', addr: ADDR }, auto);
  const p = (await repo.getProject(id, viewerOf(USERS.admin)))!.project;
  const to = withRegionPrefix(p.name, ADDR);
  await repo.setProjectName(id, to, auto);
  await repo.setDocFileFacts({
    projectId: id, kind: 'contract', url,
    facts: { filled: { facts: { contractDate: '2026-10-21', addr: ADDR }, name: { from: p.name, to } } },
  }, auto);
  return { from: p.name, to };
}

describe('서류에서 읽은 현장 정보 — 그 장이 빠지면', () => {
  it('그 장이 넣은 값을 걷고 현장명도 되돌린다', async () => {
    await withProject(async (id) => {
      const repo = getRepository();
      const admin = actorOf(USERS.admin);
      await repo.uploadDocument({ projectId: id, kind: 'contract', filename: 'contract-1.pdf', blobUrl: urlOf(id, 1) }, admin);
      const { from, to } = await readInto(id, urlOf(id, 1));
      expect(to).not.toBe(from);

      const { filled } = await repo.deleteDocumentFile({ projectId: id, kind: 'contract', url: urlOf(id, 1) }, admin);
      expect(filled?.facts).toEqual({ contractDate: '2026-10-21', addr: ADDR });
      expect((await undoFactsNow(id, [filled!])).sort()).toEqual(['addr', 'contractDate']);

      const p = (await repo.getProject(id, viewerOf(USERS.admin)))!.project;
      expect([p.contractDate, p.addr, p.name]).toEqual([null, null, from]);
    });
  });

  it('그 뒤 사람이 고친 칸은 그대로 둔다', async () => {
    await withProject(async (id) => {
      const repo = getRepository();
      const admin = actorOf(USERS.admin);
      await repo.uploadDocument({ projectId: id, kind: 'contract', filename: 'contract-1.pdf', blobUrl: urlOf(id, 1) }, admin);
      await readInto(id, urlOf(id, 1));
      await repo.setProjectFacts(id, { contractDate: '2026-10-14' }, admin);

      const { filled } = await repo.deleteDocumentFile({ projectId: id, kind: 'contract', url: urlOf(id, 1) }, admin);
      expect(await undoFactsNow(id, [filled!])).toEqual(['addr']);
      const p = (await repo.getProject(id, viewerOf(USERS.admin)))!.project;
      expect([p.contractDate, p.addr]).toEqual(['2026-10-14', null]);
    });
  });

  it('칸을 통째로 비워도 그 장들이 넣은 값이 돌아온다', async () => {
    await withProject(async (id) => {
      const repo = getRepository();
      const admin = actorOf(USERS.admin);
      for (const n of [1, 2]) {
        await repo.uploadDocument({ projectId: id, kind: 'contract', filename: `contract-${n}.pdf`, blobUrl: urlOf(id, n) }, admin);
      }
      await readInto(id, urlOf(id, 2));
      const { filled } = await repo.deleteDocument({ projectId: id, kind: 'contract' }, admin);
      expect(filled.map((f) => f.facts.addr)).toEqual([ADDR]);
    });
  });
});

describe('현장 번호', () => {
  it('지운 현장의 번호를 다음 접수가 다시 받지 않는다', async () => {
    const repo = getRepository();
    const admin = actorOf(USERS.admin);
    const first = await repo.createProject(draft(), admin);
    await dropFixture(first);
    const second = await repo.createProject(draft(), admin);
    try {
      const seq = (id: string) => Number(id.split('-')[2]);
      expect(seq(second)).toBeGreaterThan(seq(first));
    } finally {
      await dropFixture(second);
    }
  });
});

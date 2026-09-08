/**
 * 같은 서류 칸에 두 요청이 동시에 붙으면 두 장이 다 남아야 한다 — 감사 2026-09-04 M10.
 *
 * 저장소의 put*Doc 은 「읽고(files) → 더하고 → 덮어쓰기」다. 잠금이 없으면 둘이 같은 before 를
 * 읽고 각자 1장짜리 목록을 써서 나중 것이 앞 것을 지운다 — 먼저 올린 쪽은 성공 응답을 받았는데
 * 목록에서 사라진다(blob 만 고아로 남는다). 경합은 우연이라 여러 칸에서 반복해 본다.
 */
import { describe, expect, it } from 'vitest';
import { getRepository } from '@/lib/data';
import { RUN, USERS, actorOf, viewerOf, withProject } from './kit';

const KINDS = ['contract', 'agreement', 'sealuse', 'privacy', 'apply'];

describe('같은 서류 칸 동시 업로드', () => {
  it('두 요청이 같은 칸에 동시에 붙어도 두 장이 다 남는다 (칸 다섯에서 반복)', async () => {
    await withProject(async (id) => {
      const repo = getRepository();
      const admin = actorOf(USERS.admin);
      for (const kind of KINDS) {
        await Promise.all([1, 2].map((n) => repo.uploadDocument({
          projectId: id,
          kind,
          filename: `${kind}-${n}.pdf`,
          blobUrl: `https://test.local/${RUN}/${id}/${kind}-${n}.pdf`,
        }, admin)));
      }
      const detail = await repo.getProject(id, viewerOf(USERS.admin));
      for (const kind of KINDS) {
        const doc = detail?.documents.find((d) => d.kind === kind);
        expect(doc?.files.map((f) => f.name).sort(), `${kind} 칸`).toEqual([`${kind}-1.pdf`, `${kind}-2.pdf`]);
      }
    });
  });
});

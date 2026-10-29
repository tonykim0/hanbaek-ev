/**
 * 서류 문구 수정의 기록 (한백 지시 2026-10-29) — 받은 PDF 마다 audit_log 한 줄.
 *
 * 현장에 딸리지 않은 변경이라 projectId 는 null 이다. 무엇을 무엇으로 바꿨는지와 요청 글을 같이 남긴다 —
 * 직인사용동의로 한백이 고쳐 낸 서류를 나중에 물으면 「누가 언제 어느 파일의 어디를」이 여기 있다.
 */
import { getDb } from '@/lib/db/client';
import { writeAudit } from '@/lib/db/audit';
import type { RetouchLog } from '@/lib/retouch/types';
import type { Actor, ProjectRepository } from '../repository';
import { assertAdmin } from './shared';

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

export const retouchStore: Pick<ProjectRepository, 'logRetouch'> = {
  async logRetouch(entry: RetouchLog, actor: Actor): Promise<void> {
    assertAdmin(actor, '서류 문구 수정');
    const where = (e: RetouchLog['edits'][number]) => `${e.page}쪽`;
    await writeAudit(getDb(), {
      projectId: null,
      actor,
      action: '서류 문구 수정',
      field: cut(entry.file, 200),
      oldValue: cut(entry.edits.map((e) => `${where(e)} 「${e.from}」`).join(' · '), 2000),
      newValue: cut(`${entry.edits.map((e) => `${where(e)} 「${e.to}」`).join(' · ')} ‖ 요청: ${entry.prompt}`, 4000),
    });
  },
};

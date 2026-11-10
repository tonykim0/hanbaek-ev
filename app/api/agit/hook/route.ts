/**
 * PATCH /api/agit/hook { assignees } — 아지트 요청 글 담당자(아지트 ID, 쉼표 · 띄어쓰기로 여럿 · 빈 글이면 비움) [한백 관리자]
 *
 * 한 번 정해 두고 모든 열린구매 글에 붙인다(store/agit · migrations/0126). ★아지트 계정 연결과 따로다★ — 연결 전에도 넣고 끊어도 남는다
 * (한백 2026-11-08 「담당자는 미리 넣어둘수없나」). 계정 연결은 /api/agit/account(2026-11-10). 11-08 의 웹훅 연결(PUT · DELETE)은 걷었다 —
 * 봇 글은 한백이 고칠 수 없고 파일을 못 붙였다.
 */
import { adminWrite, BadRequest } from '@/lib/api/write-route';
import { getRepository } from '@/lib/data';

export const PATCH = adminWrite<Record<string, never>, { assignees?: unknown }>(
  '아지트 담당자는 한백 관리자만 정할 수 있습니다.',
  async ({ body, actor }) => {
    if (typeof body?.assignees !== 'string') throw new BadRequest('담당자가 글이 아닙니다.');
    return { hook: await getRepository().saveAgitAssignees({ assignees: body.assignees }, actor) };
  }
);

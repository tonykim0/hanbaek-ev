/**
 * /api/projects/[id]/notes — 진행현황
 *
 * 한백과 그 현장의 협력사 둘 다 부른다. 특이사항은 양쪽에서 나온다 —
 * 관리사무소가 공사를 미뤘다는 말은 협력사가 알고, 운영사 승인이 늦다는 말은 한백이 안다.
 *
 * 자기가 쓴 것은 고치고(PATCH) 지운다(DELETE) — 남의 글은 둘 다 못 한다.
 * 남의 글인지는 저장소가 판정한다(글에 적힌 소속과 대조) — 여기서 먼저 걸러도 되지만,
 * 두 곳에서 판정하면 규칙이 어긋날 자리가 하나 더 생긴다. 지운 글은 감사기록에 남는다.
 */
import { getRepository } from '@/lib/data';
import { isNoteScope } from '@/types/project';
import { isHanbaek } from '@/lib/roles';
import { BadRequest, sessionWrite } from '@/lib/api/write-route';

type Params = { id: string };

export const POST = sessionWrite<Params, { body?: string; scope?: string }>(
  async ({ body, params, actor }) => {
    if (!body?.body?.trim()) throw new BadRequest('내용을 입력해주세요.');
    /*
     * 어느 탭에서 남겼나 — 계약·시공 둘뿐이다(한백 지시 2026-09-17). 모르는 값이면 막는다:
     * 아무 데서도 안 보이는 글이 되느니 안 써지는 것이 낫다.
     */
    if (!isNoteScope(body.scope)) throw new BadRequest('어느 쪽 기록인지 알 수 없습니다.');
    /*
     * ★기성 갈래는 한백만 쓴다★ (한백 지시 2026-09-18) — 운영사에게서 받을 돈 이야기고,
     * 협력사에게는 그 탭이 없다. 화면에 자리가 없다는 것만으로는 막은 것이 아니다:
     * 주소를 직접 두드리면 협력사 이름으로 그 갈래에 글이 남는다.
     */
    if (body.scope === '기성' && !isHanbaek(actor.role)) {
      throw new BadRequest('기성 진행현황은 한백만 남길 수 있습니다.');
    }
    await getRepository().addNote(
      { projectId: params.id, body: body.body, scope: body.scope },
      actor
    );
  }
);

export const PATCH = sessionWrite<Params, { noteId?: string; body?: string }>(
  async ({ body, params, actor }) => {
    if (!body?.noteId || !body.body?.trim()) {
      throw new BadRequest('고칠 내용을 입력해주세요.');
    }
    await getRepository().editNote(
      { projectId: params.id, noteId: body.noteId, body: body.body },
      actor
    );
  }
);

export const DELETE = sessionWrite<Params, { noteId?: string }>(
  async ({ body, params, actor }) => {
    if (!body?.noteId) throw new BadRequest('어느 기록인지 알 수 없습니다.');
    await getRepository().deleteNote({ projectId: params.id, noteId: body.noteId }, actor);
  }
);

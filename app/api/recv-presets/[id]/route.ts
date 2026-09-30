/** DELETE /api/recv-presets/[id] — 자주 쓰는 수령지 빼기 [한백 관리자 · 그 협력사] */
import { getRepository } from '@/lib/data';
import { sessionWrite } from '@/lib/api/write-route';

export const DELETE = sessionWrite<{ id: string }, undefined>(async ({ params, actor }) => {
  await getRepository().removeRecvPreset(params.id, actor);
});

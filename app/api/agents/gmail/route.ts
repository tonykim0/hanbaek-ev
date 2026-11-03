/**
 * DELETE /api/agents/gmail — Gmail 연결 끊기 [한백 관리자]. 잠가 둔 토큰을 지우고 구글에도 거두라고 알린다(실패해도 끊긴다).
 * 끊어도 초안은 그대로다 — 다시 연결하면 보낼 수 있다(화면 규칙 7).
 */
import { adminWrite } from '@/lib/api/write-route';
import { getRepository } from '@/lib/data';
import { revokeToken } from '@/lib/agents/gmail';

export const DELETE = adminWrite<Record<string, never>, undefined>(
  'Gmail 연결은 한백 관리자만 바꿀 수 있습니다.',
  async ({ actor }) => {
    const gone = await getRepository().deleteMailAccount(actor);
    if (gone?.refreshToken) await revokeToken(gone.refreshToken);
    return { ok: true };
  }
);

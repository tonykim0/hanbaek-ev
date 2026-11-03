/**
 * POST   /api/agents/mail-account { email, password } — 보내는 메일 연결 [한백 관리자]
 * DELETE /api/agents/mail-account                     — 연결 끊기 [한백 관리자]
 *
 * 한백의 다음(카카오) 메일 주소와 카카오 앱 비밀번호로 연결한다(한백 2026-11-03 「내 다음카카오 이메일로만 보내면 되는거고」).
 * ★저장하기 전에 다음 메일 서버에 실제로 로그인해 본다★(lib/agents/smtp verifySmtp — 메일은 보내지 않는다). 안 되면 그 까닭이
 * 「연결」 단추 옆에 뜨고 아무것도 저장하지 않는다 — 틀린 비밀번호가 저장돼 승인할 때에야 실패하는 일이 없다.
 * 앱 비밀번호는 잠가서 둔다(store/agent-mail). 끊어도 초안은 그대로다 — 다시 연결하면 보낸다(화면 규칙 7).
 */
import { adminWrite, BadRequest } from '@/lib/api/write-route';
import { getRepository } from '@/lib/data';
import { addressesOf } from '@/lib/agents/mime';
import { DAUM_SMTP, verifySmtp } from '@/lib/agents/smtp';

export const maxDuration = 60;

export const POST = adminWrite<Record<string, never>, { email?: unknown; password?: unknown }>(
  '보내는 메일은 한백 관리자만 연결할 수 있습니다.',
  async ({ body, actor }) => {
    if (typeof body?.email !== 'string' || typeof body?.password !== 'string') throw new BadRequest('메일 주소 · 앱 비밀번호가 글이 아닙니다.');
    const [email, ...more] = addressesOf(body.email, '메일');
    if (!email || more.length) throw new Error('메일 주소를 하나 적어주세요.');
    const secret = body.password.replace(/\s+/g, '');
    if (!secret) throw new Error('앱 비밀번호를 적어주세요.');
    await verifySmtp({ user: email, pass: secret });
    return { account: await getRepository().saveMailAccount({ email, secret, server: `${DAUM_SMTP.host}:${DAUM_SMTP.port}` }, actor) };
  }
);

export const DELETE = adminWrite<Record<string, never>, undefined>(
  '보내는 메일은 한백 관리자만 끊을 수 있습니다.',
  async ({ actor }) => {
    await getRepository().deleteMailAccount(actor);
  }
);

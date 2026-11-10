/**
 * PUT    /api/agit/account { login, password } — 한백의 아지트 계정 연결 [한백 관리자]
 * DELETE /api/agit/account                     — 연결 끊기 [한백 관리자]
 * (한백 2026-11-10 「에이전트가 직접 하게끔 하고싶어」 — 정산 담당이 이 계정으로 열린구매 글을 올린다 · lib/agit/publish)
 *
 * 연결: 서버 브라우저가 아지트 로그인 화면에 넣어 로그인해 보고(열린구매 그룹의 쓰는 칸이 열리는지까지 — lib/agit/agit-web agitLogin), 되면
 * 그 로그인 쿠키만 잠가 둔다(store/agit · secret-box — 메일 연결과 같은 열쇠). ★비밀번호는 남기지 않는다★ — 로그인에 한 번 쓰고 버린다
 * (DB · 응답 · 감사기록 · 로그 어디에도). 아지트 로그인은 석 달쯤 간다(로그인 쿠키 _uac_v1 의 만료 — lib/agit/session) — 풀리면 올리다가
 * 알고 「다시 연결」로 선다. 틀리면 아지트가 로그인 화면에 띄운 글을 그대로 전한다.
 * 끊기: 로그인만 비운다(요청 담당은 남는다 — 화면 규칙 7). 아지트 쪽 로그인은 그대로라, 그 계정의 다른 기기 로그아웃은 아지트에서 한다.
 */
import { adminWrite, BadRequest } from '@/lib/api/write-route';
import { getRepository } from '@/lib/data';
import { agitLogin } from '@/lib/agit/agit-web';
import { agitLoginOf, agitPasswordOf } from '@/lib/agit/session';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export const PUT = adminWrite<Record<string, never>, { login?: unknown; password?: unknown }>(
  '아지트 계정은 한백 관리자만 연결할 수 있습니다.',
  async ({ body, actor }) => {
    const login = agitLoginOf(body?.login);
    if (!login) throw new BadRequest('아지트 ID(영문 · 숫자 · 점) 나 이메일을 넣어 주세요.');
    const password = agitPasswordOf(body?.password);
    if (!password) throw new BadRequest('비밀번호를 넣어 주세요.');
    const { cookies } = await agitLogin({ login, password });
    return { hook: await getRepository().saveAgitSession({ login, cookies }, actor) };
  }
);

export const DELETE = adminWrite<Record<string, never>, undefined>(
  '아지트 연결은 한백 관리자만 끊을 수 있습니다.',
  async ({ actor }) => {
    await getRepository().deleteAgitSession(actor);
    return { hook: await getRepository().getAgitHook(actor) };
  }
);

/**
 * POST /api/agit/publish { posts: [{ id, seen }], dry?, mark?, noCc? } — 아지트 열린구매 글을 한백의 아지트 계정으로 올린다 [한백 관리자].
 * (한백 2026-11-10 「에이전트가 직접 하게끔 하고싶어」 — 그전에는 Claude Code 가 한백의 맥에서 올렸다)
 *
 * 부르는 곳 둘: 카드의 「승인하고 올리기」(글 하나)와 정산 담당의 agit_publish(답 라우트가 한백의 로그인으로 부른다 — 그날의 글 전부, 영업비
 * 먼저). seen 은 한백이 본 글이다 — 지금 금액으로 다시 지어 다르면 그 글은 시작하지 않고 초안을 고쳐 둔다(lib/agit/publish). 시작한 글은
 * 「올리는 중」으로 응답하고, 응답 뒤에 서버 브라우저가 하나씩 올린다(첨부 zip 짓기 → 쓰는 칸 → 작성하기 → 「올림」). 그래서 300초를 산다.
 * 글 하나만 왔는데 시작하지 못했으면 422 로 그 까닭을 준다(카드가 단추 옆에 띄운다).
 * dry — 시험: 글 하나의 쓰는 칸까지만 채워 보고 화면(png base64)과 대 본 것을 준다. 올리지 않고 「올리는 중」으로도 안 세운다.
 * mark · noCc — 시험 글 표시 · 긴급 글의 재무팀 멘션 빼기(한백 「Skip the finance mention」). 화면에는 없다.
 */
import { adminWrite, BadRequest } from '@/lib/api/write-route';
import { dryAgitPublish, startAgitPublish } from '@/lib/agit/publish';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_POSTS = 4;

export const POST = adminWrite<Record<string, never>, { posts?: unknown; dry?: unknown; mark?: unknown; noCc?: unknown }>(
  '아지트 글은 한백 관리자만 올릴 수 있습니다.',
  async ({ body, actor, request }) => {
    const posts = Array.isArray(body?.posts) ? body.posts : null;
    if (!posts || posts.length === 0 || posts.length > MAX_POSTS) throw new BadRequest(`올릴 글은 1~${MAX_POSTS}개입니다.`);
    const items = posts.map((p) => {
      const id = typeof (p as { id?: unknown })?.id === 'string' ? (p as { id: string }).id : null;
      const seen = typeof (p as { seen?: unknown })?.seen === 'string' ? (p as { seen: string }).seen : null;
      if (!id) throw new BadRequest('글 id 가 없습니다.');
      return { id, seen };
    });
    const ctx = {
      origin: new URL(request.url).origin,
      cookie: request.headers.get('cookie'),
      mark: typeof body?.mark === 'string' && body.mark.trim() ? body.mark.trim().slice(0, 60) : null,
      /* 빼면 — 올릴 때는 넣고 시험(dry)에서는 뺀다(lib/agit/publish) */
      noCc: typeof body?.noCc === 'boolean' ? body.noCc : undefined,
    };
    if (body?.dry === true) {
      if (items.length !== 1) throw new BadRequest('시험은 글 하나씩입니다.');
      return dryAgitPublish(actor, items[0].id, ctx);
    }
    if (items.some((p) => p.seen === null)) throw new BadRequest('본 글(seen)이 없습니다.');
    const result = await startAgitPublish(actor, items.map((p) => ({ id: p.id, seen: p.seen! })), ctx);
    if (result.started.length === 0 && items.length === 1) throw new Error(result.skipped[0]?.why ?? '올리기를 시작하지 못했습니다.');
    return result;
  }
);

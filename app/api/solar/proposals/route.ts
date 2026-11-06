/**
 * 태양광 제안서의 틀 · 조건 (2026-11-06).
 *
 *   GET                                   틀 셋의 파일 · 조건 — 한백의 눈(관리자 · 열람 전용)만. 제안서는 브라우저가 짓는다
 *   POST ?step=token { key, filename }    틀 올리기 토큰 — 한백 관리자. 자리는 우리가 짓는다(solar-proposals/<틀>/<시각>.<형식>)
 *   POST { key, pathname, filename }      올린 뒤 — 우리 저장소에 그 자리가 정말 있는지 보고 그 틀의 파일로 적는다
 *   PATCH { key, terms }                  조건 고치기 — 한백 관리자. 그 틀의 칸 전부를 한 번에
 *
 * 협력사는 403 이다 — 사업자 자료(틀)를 남에게 내지 못한다(타이런트 업무협약서 3조). 브라우저가 Blob 에 바로 올린다(서버리스 본문
 * 한도 4.5MB · 틀은 20MB 안팎) — 자료실 · 현장 첨부파일과 같은 길이다. 옛 틀 파일은 지우지 않는다(바꿔 끼운 기록).
 */
import { head } from '@vercel/blob';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth/guard';
import { actorOf, getSessionUser } from '@/lib/auth/session';
import { isUnexpectedError } from '@/lib/api/errors';
import { listProposalTemplates, setProposalTemplateFile, setProposalTerms } from '@/lib/data/solar-proposals';
import { isHanbaek } from '@/lib/roles';
import { isTemplateKey, TEMPLATES, type TemplateKey } from '@/lib/solar/proposal/products';

export const dynamic = 'force-dynamic';

const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const MAX_BYTES = 100 * 1024 * 1024;
const CONTENT_TYPE = { pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', pdf: 'application/pdf' } as const;
const prefixOf = (key: TemplateKey) => `solar-proposals/${key}/`;

/** 저장소의 규칙 위반(한글 맨 Error)은 400, 그 밖은 500 과 로그 */
function failed(err: unknown, what: string) {
  if (isUnexpectedError(err)) {
    console.error(`[solar-proposal] ${what}:`, err);
    return fail(`${what}에 실패했습니다.`, 500);
  }
  return fail((err as Error).message, 400);
}

export async function GET() {
  const session = await getSessionUser();
  if (!session) return fail('로그인이 필요합니다.', 401);
  if (!isHanbaek(session.role)) return fail('제안서는 한백만 만듭니다.', 403);
  try {
    return NextResponse.json({ templates: await listProposalTemplates() });
  } catch (err) {
    return failed(err, '제안서 틀 읽기');
  }
}

export async function POST(request: Request) {
  const session = await requireAdmin();
  if (!session) return fail('제안서 틀은 한백 관리자만 올립니다.', 403);
  const body = (await request.json().catch(() => null)) as { key?: unknown; filename?: unknown; pathname?: unknown } | null;
  const key = body?.key;
  if (!isTemplateKey(key)) return fail('어느 틀인지 알 수 없습니다.', 400);
  const kind = TEMPLATES[key].file;
  const filename = typeof body?.filename === 'string' ? body.filename.normalize('NFC').trim() : '';
  if (!filename.toLowerCase().endsWith(`.${kind}`)) return fail(`${TEMPLATES[key].company} ${TEMPLATES[key].title} 틀은 ${kind} 파일입니다 — ${TEMPLATES[key].hint}`, 400);
  if (!process.env.BLOB_READ_WRITE_TOKEN) return fail('파일 저장소(Blob)가 연결되지 않았습니다.', 500);

  // ── 1단계: 토큰 — 자리는 우리가 짓는다 ───────────────────────────────
  if (new URL(request.url).searchParams.get('step') === 'token') {
    const pathname = `${prefixOf(key)}${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${kind}`;
    try {
      const token = await generateClientTokenFromReadWriteToken({
        token: process.env.BLOB_READ_WRITE_TOKEN,
        pathname,
        validUntil: Date.now() + 60 * 60 * 1000,
        addRandomSuffix: false,
        maximumSizeInBytes: MAX_BYTES,
        allowedContentTypes: [CONTENT_TYPE[kind]],
      });
      return NextResponse.json({ token, pathname, contentType: CONTENT_TYPE[kind] });
    } catch (err) {
      console.error('[solar-proposal] 토큰 발급 실패:', err);
      return fail('업로드 준비에 실패했습니다.', 500);
    }
  }

  // ── 2단계: 올린 뒤 — 그 틀의 자리에 정말 있어야 적는다 ─────────────────
  const pathname = typeof body?.pathname === 'string' ? body.pathname : '';
  if (!pathname.startsWith(prefixOf(key)) || pathname.includes('..')) return fail('올린 자리가 올바르지 않습니다.', 400);
  const found = await head(pathname).catch(() => null);
  if (!found) return fail('올린 파일을 찾을 수 없습니다. 다시 올려주세요.', 422);
  try {
    const template = await setProposalTemplateFile(key, { url: found.url, name: filename, size: found.size }, actorOf(session));
    return NextResponse.json({ template });
  } catch (err) {
    return failed(err, '제안서 틀 저장');
  }
}

export async function PATCH(request: Request) {
  const session = await requireAdmin();
  if (!session) return fail('제안서 조건은 한백 관리자만 고칩니다.', 403);
  const body = (await request.json().catch(() => null)) as { key?: unknown; terms?: unknown } | null;
  if (!isTemplateKey(body?.key)) return fail('어느 틀인지 알 수 없습니다.', 400);
  try {
    return NextResponse.json({ template: await setProposalTerms(body.key, body.terms, actorOf(session)) });
  } catch (err) {
    return failed(err, '제안서 조건 저장');
  }
}

/**
 * GET  /api/recv-presets?org=… — 그 협력사의 자주 쓰는 충전기 수령지 [한백 · 그 협력사]
 * POST /api/recv-presets       — 저장 [한백 관리자 · 그 협력사]
 *
 * 누가 볼 수 있는지는 저장소가 본다(store/recv-presets) — 남의 협력사 주소는 안 나간다.
 */
import { NextResponse } from 'next/server';
import { getRepository } from '@/lib/data';
import { actorOf, getSessionUser } from '@/lib/auth/session';
import { BadRequest, sessionWrite } from '@/lib/api/write-route';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  const org = new URL(request.url).searchParams.get('org') ?? '';
  try {
    return NextResponse.json({ presets: await getRepository().listRecvPresets(org, actorOf(session)) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '불러오지 못했습니다.' }, { status: 403 });
  }
}

const str = (v: unknown): string | null => {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'string') throw new BadRequest('수령지는 글자여야 합니다.');
  return v;
};

export const POST = sessionWrite<
  Record<string, never>,
  { org?: unknown; addr?: unknown; name?: unknown; phone?: unknown }
>(async ({ body, actor }) => {
  const org = str(body?.org);
  if (!org) throw new BadRequest('협력사를 알 수 없습니다.');
  const id = await getRepository().addRecvPreset({
    org, addr: str(body?.addr) ?? '', name: str(body?.name), phone: str(body?.phone),
  }, actor);
  return { id };
});

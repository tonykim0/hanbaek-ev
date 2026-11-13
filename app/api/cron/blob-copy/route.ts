/**
 * 옛 공개 저장소 → 새 비공개 저장소 옮기기 — 5분마다 도는 일회용 크론(2026-11-14, lib/blob/sync 머리말).
 *
 * ★운영 Mac 에 운영 파일의 열쇠를 두지 않는다★(백업 · 「운영 백업」) — 그래서 옮기기는 열쇠가 이미 있는 운영 함수가
 * 한다. 열쇠 둘: 옛 저장소 BLOB_READ_WRITE_TOKEN(목록만 읽는다) · 새 저장소 PRIVATE_BLOB_READ_WRITE_TOKEN.
 * 한 번에 4분 안에서 할 만큼(5분마다라 겹치지 않는다) 하고 남은 수를 로그에 남긴다 — `npx vercel logs --environment production --query blob-copy`.
 *
 * MODE 는 배포마다 손으로 바꾼다: 콘솔이 옛 저장소에 쓰는 배포는 'mirror', 새 저장소로 넘어간 배포는 'finish'.
 * ★다 옮기고 옛 저장소를 지운 뒤에 이 파일과 vercel.json 의 크론을 걷는다★.
 */
import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { syncStores } from '@/lib/blob/sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MODE: 'mirror' | 'finish' = 'mirror';

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[cron] CRON_SECRET 없음 — 파일 옮기기가 돌지 않는다');
    return NextResponse.json({ error: '설정이 없습니다.' }, { status: 500 });
  }
  if (!same(request.headers.get('authorization') ?? '', `Bearer ${secret}`)) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 401 });
  }
  const fromToken = process.env.BLOB_READ_WRITE_TOKEN;
  const toToken = process.env.PRIVATE_BLOB_READ_WRITE_TOKEN;
  if (!fromToken || !toToken) {
    console.error('[blob-copy] 열쇠 없음 — 옛 저장소', !!fromToken, '· 새 저장소', !!toToken);
    return NextResponse.json({ error: '저장소 열쇠가 없습니다.' }, { status: 500 });
  }
  try {
    const r = await syncStores({ fromToken, toToken, mode: MODE, deadline: Date.now() + 240_000 });
    if (r.done) return NextResponse.json(r);
    console.log(`[blob-copy] ${r.mode} · 옛 ${r.source}개 · 옮김 ${r.copied} · 지움 ${r.removed} · 남음 ${r.remaining} · 실패 ${r.failed.length}`);
    if (r.failed.length) console.error('[blob-copy] 옮기지 못함', r.failed.slice(0, 10));
    return NextResponse.json({ ...r, failed: r.failed.length });
  } catch (e) {
    console.error('[blob-copy] 실패', e);
    return NextResponse.json({ error: '옮기지 못했습니다.' }, { status: 500 });
  }
}

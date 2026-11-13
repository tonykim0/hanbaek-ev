/**
 * 백업의 문 — 이 Mac 의 매일 백업(~/hanbaek-backups/blob-tool/mirror.mjs)이 운영 파일을 받는 길(2026-11-14).
 *
 * 공개 저장소일 때 백업은 덤프에 적힌 주소를 열쇠 없이 받았다. 비공개 저장소는 맨 주소가 403 이다. ★이 Mac 에 운영
 * 파일을 지울 수 있는 열쇠는 두지 않는다★(CLAUDE.md 「운영 백업」) — 그래서 저장소 열쇠 대신 ★받기만 되는 비밀★
 * (BACKUP_FILES_SECRET — Vercel 운영 환경변수 · 이 Mac 의 ~/hanbaek-backups/.env.backup-files)을 두고, 이 문이
 * 5분짜리 서명 주소로 넘긴다. 그 비밀이 새도 파일을 받을 수 있을 뿐 지우거나 바꾸지 못한다 — 새면 값을 갈면 된다.
 *
 * GET /api/backup/files/<경로> · Authorization: Bearer <BACKUP_FILES_SECRET> → 302 서명 주소.
 */
import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { blobPathOf } from '@/lib/blob/path';
import { signedGetUrl } from '@/lib/blob/server';

export const dynamic = 'force-dynamic';

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export async function GET(request: Request) {
  const secret = process.env.BACKUP_FILES_SECRET;
  if (!secret) {
    console.error('[backup] BACKUP_FILES_SECRET 없음 — 백업이 파일을 받지 못한다');
    return NextResponse.json({ error: '설정이 없습니다.' }, { status: 500 });
  }
  if (!same(request.headers.get('authorization') ?? '', `Bearer ${secret}`)) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 401 });
  }
  const rest = new URL(request.url).pathname.slice('/api/backup/files/'.length);
  const path = blobPathOf(`/api/files/${rest}`);
  if (!path) return NextResponse.json({ error: '경로가 틀렸습니다.' }, { status: 400 });
  return NextResponse.redirect(await signedGetUrl(path), { status: 302, headers: { 'Cache-Control': 'no-store' } });
}

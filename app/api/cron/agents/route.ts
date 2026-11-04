/**
 * GET /api/cron/agents — 에이전트의 정기 일, 매일 아침 한 번 [Vercel 크론 — vercel.json crons · 23:00 UTC = 한국 오전 8시대]
 *
 * 지금은 정산 담당의 열린구매 상신 알림 하나다(lib/agents/remind-run · 한백 지시 2026-11-04). 같은 결제일은 한 번만 남으니
 * 몇 번 불려도 된다 — 기한 전이면 아무것도 안 한다.
 *
 * ★CRON_SECRET 으로만 연다★ — Vercel 이 그 값을 `Authorization: Bearer …` 로 실어 부른다(값은 Vercel 운영 환경변수 —
 * 대화에 남기지 않는다). 값이 없으면 [cron] 으로 남기고 500 — 알림이 조용히 안 도는 것을 감시가 보게 한다(실패가 소리 나게).
 * 미들웨어는 api 를 안 본다 — 여기서 스스로 본다. 옛 주소의 넘기기(next.config.mjs)도 이 경로는 비킨다 — 크론은 넘기기를 안 따라간다.
 * 크론은 운영 배포에서만 돈다(프리뷰 · 로컬은 손으로 부른다).
 */
import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { runAgentReminders } from '@/lib/agents/remind-run';

export const dynamic = 'force-dynamic';

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[cron] CRON_SECRET 없음 — 에이전트 정기 알림이 돌지 않는다');
    return NextResponse.json({ error: '설정이 없습니다.' }, { status: 500 });
  }
  if (!same(request.headers.get('authorization') ?? '', `Bearer ${secret}`)) {
    return NextResponse.json({ error: '권한이 없습니다.' }, { status: 401 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await runAgentReminders()) });
  } catch (err) {
    console.error('[cron] agents', err);
    return NextResponse.json({ error: '정기 알림을 남기지 못했습니다.' }, { status: 500 });
  }
}

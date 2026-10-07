'use client';

/**
 * 알림 목록 — 진행현황 글 · 서류 반려 · 누락 서류 보완요청 · 공지 메모 (app/(console)/notifications).
 *
 * 한 줄 = 알림 하나: 현장 · 탭(계약·시공) · 누가 · 언제, 그 밑에 본문 두 줄. 반려·보완요청은 본문 앞에 붉은
 * 꼬리표(「반려 — 계약서」)가 서고 본문이 한백의 메시지(반려 사유)다. 안 읽은 줄은 굵고 왼쪽에 점이 선다.
 * 줄을 누르면 그 현장의 그 탭으로 간다 — 그 탭을 열면 그 갈래의 알림이 읽힌다(ProgressLog).
 */
import Link from 'next/link';
import { useState } from 'react';
import type { NoteNotification } from '@/types/project';
import { TAB_OF_SCOPE } from '@/lib/notify';
import { Btn, Err, Tag } from '@/components/ui';
import { NOTIFICATIONS_CHANGED } from '@/lib/notify-events';

/**
 * 줄을 누르면 가는 곳 — 현장 알림은 그 현장의 그 탭, 공지 메모는 그 공지
 * (/notices?open=… — 공지 화면이 그 공지를 펼치고 그리로 내려간다, 거기서 읽힌다).
 */
function hrefOf(n: NoteNotification): string {
  if (n.kind === 'notice' && n.noticeId) return `/notices?open=${encodeURIComponent(n.noticeId)}`;
  return `/projects/${encodeURIComponent(n.projectId ?? '')}?tab=${TAB_OF_SCOPE[n.scope ?? '시공']}`;
}

export default function NotificationList({ items, viewingAs }: {
  items: NoteNotification[];
  /** 대행 중이면 그 계정 이름 — 그동안은 읽음을 찍지 않는다(라우트가 거른다) */
  viewingAs: string | null;
}) {
  const [list, setList] = useState(items);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unread = list.filter((n) => !n.read).length;

  async function readAll() {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch('/api/notifications/read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!r.ok) throw new Error();
      setList((l) => l.map((n) => ({ ...n, read: true })));
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
    } catch {
      setError('읽음으로 바꾸지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-small font-bold tabular-nums text-slate-500">
          {list.length}건 · 안 읽음 {unread}
        </span>
        {viewingAs ? (
          <span className="ml-auto text-tiny font-bold text-slate-400">{viewingAs} 계정으로 보는 중 — 읽음은 바뀌지 않습니다</span>
        ) : (
          <span className="ml-auto flex items-center gap-2">
            <Err>{error}</Err>
            <Btn size="sm" kind="quiet" disabled={unread === 0} busy={busy} busyLabel="바꾸는 중…" onClick={() => void readAll()}>
              모두 읽음
            </Btn>
          </span>
        )}
      </div>
      {list.length > 0 && (
        <ol className="divide-y divide-slate-100 rounded-panel border border-slate-200 bg-white">
          {list.map((n) => (
            <li key={n.id}>
              <Link
                href={hrefOf(n)}
                className="flex gap-3 px-4 py-3 transition hover:bg-slate-50"
              >
                <span
                  aria-label={n.read ? undefined : '안 읽음'}
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-amber-500'}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className={`truncate ${n.read ? 'font-semibold text-slate-600' : 'font-black text-slate-900'}`}>
                      {n.kind === 'notice' ? n.noticeTitle : n.projectName}
                    </span>
                    {/* 갈래 꼬리표 — 현장 알림은 탭(계약·시공·기성), 공지 메모는 「공지」 */}
                    <span className="rounded-tag bg-slate-100 px-1.5 py-0.5 text-micro font-bold text-slate-500">
                      {n.kind === 'notice' ? '공지' : n.scope}
                    </span>
                    <span className={`rounded-tag px-1.5 py-0.5 text-micro font-black ${
                      n.author === '한백' ? 'bg-slate-900 text-white' : 'bg-brand-100 text-brand-900'
                    }`}>
                      {n.author}
                    </span>
                    <span className="ml-auto shrink-0 text-tiny tabular-nums text-slate-400">{n.at}</span>
                  </span>
                  <span className={`mt-1 line-clamp-2 whitespace-pre-wrap break-keep text-base leading-relaxed ${n.read ? 'text-slate-500' : 'text-slate-800'}`}>
                    {n.title && <span className="mr-1.5"><Tag tone="stop">{n.title}</Tag></span>}
                    {n.body}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

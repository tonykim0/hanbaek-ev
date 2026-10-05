'use client';

/**
 * 알림 목록 — 진행현황에 상대방이 남긴 글 (app/(console)/notifications).
 *
 * 한 줄 = 글 하나: 현장 · 탭(계약·시공) · 누가 · 언제, 그 밑에 본문 두 줄. 안 읽은 줄은 굵고 왼쪽에 점이 선다.
 * 줄을 누르면 그 현장의 그 탭으로 간다 — 그 탭이 그 글을 「새 글」로 보이고 읽음으로 찍는다(ProgressLog).
 */
import Link from 'next/link';
import { useState } from 'react';
import type { NoteNotification } from '@/types/project';
import { TAB_OF_SCOPE } from '@/lib/notify';
import { Btn, Err } from '@/components/ui';
import { NOTIFICATIONS_CHANGED } from '@/lib/notify-events';

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
                href={`/projects/${encodeURIComponent(n.projectId)}?tab=${TAB_OF_SCOPE[n.scope]}`}
                className="flex gap-3 px-4 py-3 transition hover:bg-slate-50"
              >
                <span
                  aria-label={n.read ? undefined : '안 읽음'}
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-amber-500'}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className={`truncate ${n.read ? 'font-semibold text-slate-600' : 'font-black text-slate-900'}`}>{n.projectName}</span>
                    <span className="rounded-tag bg-slate-100 px-1.5 py-0.5 text-micro font-bold text-slate-500">{n.scope}</span>
                    <span className={`rounded-tag px-1.5 py-0.5 text-micro font-black ${
                      n.author === '한백' ? 'bg-slate-900 text-white' : 'bg-brand-100 text-brand-900'
                    }`}>
                      {n.author}
                    </span>
                    <span className="ml-auto shrink-0 text-tiny tabular-nums text-slate-400">{n.at}</span>
                  </span>
                  <span className={`mt-1 line-clamp-2 whitespace-pre-wrap break-keep text-base leading-relaxed ${n.read ? 'text-slate-500' : 'text-slate-800'}`}>
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

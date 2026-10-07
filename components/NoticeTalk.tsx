'use client';

/**
 * 공지의 메시지 — 협력사 ↔ 한백 (한백 지시 2026-10-07 「공지에도 메모를 남기게 해서 협력사와 한백 간 메시지를
 * 주고받게, 그리고 알림으로 이어지게」). 공지를 펼친 자리, 본문·첨부 밑에 선다.
 *
 * ★대화는 업체마다 한 줄기다★ — 공지는 협력사 모두가 보지만, 한 업체가 남긴 말은 그 업체와 한백만 본다
 * (저장소가 거른다, store/notice-messages). 그래서 화면이 둘이다:
 *   협력사  제 업체의 줄기 하나 — 위에 적는 칸, 밑에 오간 글
 *   한백    업체마다 줄기 — 최근에 말이 오간 업체가 위, 줄기마다 답하는 칸(관리자만, 열람 전용은 읽기만)
 * 한백이 먼저 말을 거는 자리는 두지 않는다 — 업체 하나에 따로 할 말은 그 현장의 진행현황이 자리다.
 *
 * 모양은 현장의 「진행현황 및 메모」와 같다(ProgressLog) — 왼쪽 색 띠로 누가 썼는지(한백 검정 · 협력사 초록),
 * 알림으로 온 안 읽은 글은 「새 글」. 내가 쓴 것만 지운다(한 번 더 묻는다).
 */
import { useEffect, useRef, useState } from 'react';
import type { NoticeMessage } from '@/types/project';
import { useAction } from '@/lib/use-action';
import { Btn, Err, FIELD } from '@/components/ui';

export interface TalkViewer {
  /** 한백의 눈(관리자·열람 전용) — 업체마다 줄기를 본다 */
  hanbaek: boolean;
  /** 남길 수 있는가 — 협력사(소속 있음)와 한백 관리자. 열람 전용은 아니다 */
  canPost: boolean;
}

export function NoticeTalk({ noticeId, messages, viewer, fresh, focusOrg }: {
  noticeId: string;
  /** 이 공지의 메시지 — 저장소가 이미 내 몫만 걸러 왔다 */
  messages: NoticeMessage[];
  viewer: TalkViewer;
  /** 알림으로 온, 아직 안 읽은 메시지 */
  fresh: Set<string>;
  /** 알림에서 왔으면 그 업체의 줄기 — 거기로 내려간다(한백) */
  focusOrg: string | null;
}) {
  if (!viewer.hanbaek) {
    return (
      <Thread noticeId={noticeId} org={null} messages={messages} canPost={viewer.canPost} fresh={fresh} title="한백에 메시지" />
    );
  }

  // 업체마다 — 최근에 말이 오간 업체가 위
  const byOrg = new Map<string, NoticeMessage[]>();
  for (const m of messages) byOrg.set(m.org, [...(byOrg.get(m.org) ?? []), m]);
  const orgs = [...byOrg.keys()].sort((a, b) => {
    const last = (o: string) => byOrg.get(o)!.at(-1)!.at;
    return last(b).localeCompare(last(a));
  });

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <h3 className="text-small font-black text-slate-900">협력사 메시지</h3>
        <span className="text-tiny font-bold tabular-nums text-slate-400">업체 {orgs.length}곳 · {messages.length}건</span>
      </div>
      {orgs.map((org) => (
        <Thread
          key={org}
          noticeId={noticeId}
          org={org}
          messages={byOrg.get(org)!}
          canPost={viewer.canPost}
          fresh={fresh}
          title={org}
          focus={org === focusOrg}
        />
      ))}
    </section>
  );
}

/** 줄기 하나 — 협력사에게는 제 업체 것, 한백에게는 업체마다 */
function Thread({ noticeId, org, messages, canPost, fresh, title, focus = false }: {
  noticeId: string;
  /** 한백이 답할 업체 — 협력사 쪽은 null(저장소가 세션의 업체로 단다) */
  org: string | null;
  messages: NoticeMessage[];
  canPost: boolean;
  fresh: Set<string>;
  title: string;
  focus?: boolean;
}) {
  const { busy, error, run } = useAction();
  const [body, setBody] = useState('');
  const here = useRef<HTMLDivElement>(null);
  // 알림에서 온 줄기로 한 번 내려간다 — 다시 그릴 때마다(글을 칠 때마다) 끌려가면 안 된다
  useEffect(() => {
    if (focus) here.current?.scrollIntoView({ block: 'center' });
  }, [focus]);

  async function send() {
    if (!body.trim()) return;
    const ok = await run({
      url: `/api/notices/${noticeId}/messages`,
      body: { body, org },
      fail: '보내지 못했습니다.',
    });
    if (ok) setBody('');
  }

  return (
    <div
      ref={here}
      // 알림에서 온 줄기는 내려간 자리를 표시한다 — 업체가 여럿이면 어디로 왔는지 보여야 한다
      className={`flex max-w-2xl flex-col gap-1.5 border-t border-slate-900/[0.07] pt-2 ${focus ? 'bg-amber-50/60' : ''}`}
    >
      <div className="flex items-baseline gap-2">
        <span className="text-tiny font-bold tracking-[0.04em] text-slate-500">{title}</span>
        <span className="text-tiny font-bold tabular-nums text-slate-400">{messages.length}건</span>
      </div>

      {/* 오간 글 — 오래된 것이 위, 대화처럼 읽힌다. 길어지면 안에서 스크롤한다(진행현황과 같다) */}
      {messages.length > 0 && (
        <ol className="max-h-[320px] divide-y divide-slate-100 overflow-y-auto">
          {messages.map((m) => (
            <MessageItem key={m.id} noticeId={noticeId} message={m} fresh={fresh.has(m.id)} />
          ))}
        </ol>
      )}

      {/* 적는 칸은 글 밑이다 — 대화는 위에서 아래로 흐르고, 답은 마지막 말 다음에 단다 */}
      {canPost && (
        <>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            placeholder={org ? `${org}에 답하기` : '이 공지에 대해 한백에 남길 말 — 다른 협력사에게는 보이지 않습니다'}
            className={`${FIELD} resize-y leading-relaxed`}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Btn size="sm" disabled={!body.trim()} busy={busy} busyLabel="보내는 중…" onClick={() => void send()}>
              보내기
            </Btn>
            <Err>{error}</Err>
          </div>
        </>
      )}
    </div>
  );
}

function MessageItem({ noticeId, message, fresh }: { noticeId: string; message: NoticeMessage; fresh: boolean }) {
  const { busy, error, setError, run } = useAction();
  const [asking, setAsking] = useState(false);
  const byHanbaek = message.author === '한백';

  async function remove() {
    const ok = await run({
      url: `/api/notices/${noticeId}/messages/${message.id}`,
      method: 'DELETE',
      fail: '지우지 못했습니다.',
    });
    if (ok) setAsking(false);
  }

  return (
    <li className={`border-l-[3px] py-2 pl-3 ${byHanbaek ? 'border-l-slate-800' : 'border-l-brand-500'} ${fresh ? 'bg-amber-50' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-baseline gap-2 overflow-hidden">
          <span className={`shrink-0 rounded-tag px-1.5 py-0.5 text-micro font-black ${
            byHanbaek ? 'bg-slate-900 text-white' : 'bg-brand-100 text-brand-900'
          }`}
          >
            {message.author}
          </span>
          <span className="shrink-0 text-tiny tabular-nums text-slate-400">{message.at}</span>
          {fresh && <span className="shrink-0 rounded-tag bg-amber-500 px-1.5 py-0.5 text-micro font-black text-white">새 글</span>}
        </span>
        {message.mine && (
          <span className="flex shrink-0 items-center gap-1">
            {asking ? (
              <>
                <Btn size="sm" kind="undo" busy={busy} busyLabel="삭제 중…" onClick={() => void remove()}>삭제합니다</Btn>
                <Btn size="sm" kind="quiet" disabled={busy} onClick={() => { setAsking(false); setError(null); }}>취소</Btn>
              </>
            ) : (
              /* 되돌릴 수 없는 쪽은 글자 단추로 끝에(화면 규칙 8·12) */
              <Btn size="sm" kind="undo" onClick={() => setAsking(true)}>삭제</Btn>
            )}
          </span>
        )}
      </div>
      {asking && <Err className="mt-1 block">{error}</Err>}
      <p className="mt-1 whitespace-pre-wrap break-keep text-base leading-relaxed text-slate-700">{message.body}</p>
    </li>
  );
}

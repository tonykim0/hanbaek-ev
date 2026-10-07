'use client';

/**
 * 공지의 메모 — 한백과 협력사가 공지마다 주고받는 글 (한백 지시 2026-10-07 「공지에도 메모를 남기게 해서 협력사와
 * 한백 간 메시지를 주고받게, 그리고 알림으로 이어지게」 · 「메시지라 하지 말고 메모라고 해」 · 「협력사별로 보내는 게
 * 아니라 모든 협력사에게 다 보내는 거야」). 공지를 펼친 자리, 본문·첨부 밑에 선다.
 *
 * ★모두가 보는 한 줄기다★ — 한백이 남겨도 협력사가 남겨도 모두가 보고, 쓴 사람 빼고 모두에게 알림이 간다
 * (store/notice-messages). 그래서 화면은 누구에게나 같다: 오간 메모, 밑에 남기는 칸(열람 전용은 읽기만).
 *
 * 모양은 현장의 「진행현황 및 메모」와 같다(ProgressLog) — 왼쪽 색 띠로 누가 썼는지(한백 검정 · 협력사 초록),
 * 알림으로 온 안 읽은 메모는 「새 글」. 내가 쓴 것만 지운다(한 번 더 묻는다).
 */
import { useState } from 'react';
import type { NoticeMessage } from '@/types/project';
import { useAction } from '@/lib/use-action';
import { Btn, Err, FIELD } from '@/components/ui';

export function NoticeTalk({ noticeId, messages, canPost, fresh }: {
  noticeId: string;
  /** 이 공지의 메모 — 오래된 것이 앞 */
  messages: NoticeMessage[];
  /** 남길 수 있는가 — 협력사와 한백 관리자. 열람 전용은 아니다 */
  canPost: boolean;
  /** 알림으로 온, 아직 안 읽은 메모 */
  fresh: Set<string>;
}) {
  const { busy, error, run } = useAction();
  const [body, setBody] = useState('');

  async function send() {
    if (!body.trim()) return;
    const ok = await run({ url: `/api/notices/${noticeId}/messages`, body: { body }, fail: '남기지 못했습니다.' });
    if (ok) setBody('');
  }

  return (
    <section className="flex max-w-2xl flex-col gap-1.5 border-t border-slate-900/[0.07] pt-2">
      <div className="flex items-baseline gap-2">
        <h3 className="text-small font-black text-slate-900">메모</h3>
        <span className="text-tiny font-bold tabular-nums text-slate-400">{messages.length}건</span>
      </div>

      {/* 오간 메모 — 오래된 것이 위, 대화처럼 읽힌다. 길어지면 안에서 스크롤한다(진행현황과 같다) */}
      {messages.length > 0 && (
        <ol className="max-h-[320px] divide-y divide-slate-100 overflow-y-auto">
          {messages.map((m) => (
            <MessageItem key={m.id} noticeId={noticeId} message={m} fresh={fresh.has(m.id)} />
          ))}
        </ol>
      )}

      {/* 남기는 칸은 메모 밑이다 — 위에서 아래로 흐르고, 다음 말은 마지막 말 다음에 단다 */}
      {canPost && (
        <>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            placeholder="한백과 협력사 모두가 봅니다"
            className={`${FIELD} resize-y leading-relaxed`}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Btn size="sm" disabled={!body.trim()} busy={busy} busyLabel="남기는 중…" onClick={() => void send()}>
              남기기
            </Btn>
            <Err>{error}</Err>
          </div>
        </>
      )}
    </section>
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

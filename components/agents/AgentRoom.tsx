'use client';

/**
 * 담당과의 대화 — 지시 · 기록 · 에이전트의 답이 오래된 것부터 로그처럼 쌓인다. 이것이 그 담당과의 커뮤니케이션 기록이다.
 *
 * 남기는 길이 둘이다.
 *   보내기        지시를 남기고 에이전트를 부른다(/messages → /reply). 답을 쓰는 동안 단추가 「답 쓰는 중…」이다.
 *   기록만 남기기  에이전트를 부르지 않는다 — 운영사 담당자와 통화한 내용 같은 것. 다음 대화에서 에이전트가 근거로 읽는다.
 * 답이 실패해도 지시는 남아 있다 — 마지막 말이 답 없는 지시면 「다시 묻기」가 선다(화면 규칙 9: 무엇이 되었는지 그 자리에).
 * 말은 띠 모양이다(ui.tsx Note 처럼 왼쪽 선 — 판 안이라 사방 테두리를 두르지 않는다). 에이전트의 말만 초록 바탕에 반짝이를 단다.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AgentMessage } from '@/types/agents';
import { Btn, Err, FIELD, PANEL, Tag } from '@/components/ui';
import { AgentHead, LINK, Spark } from './kit';

type Phase = 'idle' | 'sending' | 'thinking';

async function post(url: string, body?: unknown): Promise<{ ok: true; message: AgentMessage } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
    const json = (await res.json().catch(() => ({}))) as { message?: AgentMessage; error?: string };
    if (!res.ok || !json.message) return { ok: false, error: json.error ?? '처리하지 못했습니다.' };
    return { ok: true, message: json.message };
  } catch {
    return { ok: false, error: '네트워크 오류입니다. 다시 시도해주세요.' };
  }
}

export function AgentRoom({ agentId, agentName, messages }: { agentId: string; agentName: string; messages: AgentMessage[] }) {
  const router = useRouter();
  const [list, setList] = useState(messages);
  const [body, setBody] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const scroller = useRef<HTMLOListElement>(null);

  /* 서버가 다시 그리면(할 일이 바뀌어 refresh) 그 목록을 믿는다 — 도는 중에는 내 것을 지킨다 */
  useEffect(() => {
    if (phase === 'idle') setList(messages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  /* 새 말이 붙으면 맨 아래로 */
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [list.length, phase]);

  async function ask() {
    setPhase('thinking');
    setError(null);
    const r = await post(`/api/agents/${agentId}/reply`);
    setPhase('idle');
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setList((l) => [...l, r.message]);
    router.refresh(); // 에이전트가 할 일을 적었을 수 있다 — 오른쪽 할 일과 머리말을 다시 그린다
  }

  async function send(note: boolean) {
    const text = body.trim();
    if (!text) return;
    setPhase('sending');
    setError(null);
    const r = await post(`/api/agents/${agentId}/messages`, { body: text, note });
    if (!r.ok) {
      setPhase('idle');
      setError(r.error);
      return;
    }
    setBody('');
    setList((l) => [...l, r.message]);
    if (note) {
      setPhase('idle');
      router.refresh();
      return;
    }
    await ask();
  }

  const last = list[list.length - 1];
  const unanswered = phase === 'idle' && last?.role === 'user';

  return (
    <section className={`${PANEL} flex min-w-0 flex-col`}>
      <div className="px-5 pb-3 pt-4">
        <AgentHead meta={`${list.length}건`}>대화</AgentHead>
      </div>

      <ol ref={scroller} className="flex max-h-[62vh] min-h-[220px] flex-col gap-2 overflow-y-auto border-t border-slate-100 px-5 py-3">
        {list.map((m) => <Said key={m.id} message={m} />)}
        {phase === 'thinking' && (
          <li className="rounded-box border-l-[3px] border-brand-400 bg-brand-50/70 px-3.5 py-2.5">
            <p className="flex items-center gap-1.5 text-tiny font-bold text-brand-800">
              <Spark className="h-3 w-3 animate-pulse text-brand-500" />{agentName}
            </p>
            <p className="mt-1 flex items-center gap-2 text-small text-slate-600">
              답 쓰는 중
              <span className="inline-flex gap-1" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" style={{ animationDelay: `${i * 0.2}s` }} />
                ))}
              </span>
            </p>
          </li>
        )}
      </ol>

      <div className="flex flex-col gap-2 border-t border-slate-100 px-5 py-3">
        {unanswered && (
          <div className="flex flex-wrap items-center gap-2">
            <Tag tone="warn">답 없음</Tag>
            <Btn size="sm" kind="side" onClick={() => void ask()}>다시 묻기</Btn>
          </div>
        )}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && phase === 'idle') void send(false);
          }}
          rows={3}
          disabled={phase !== 'idle'}
          placeholder={`${agentName}에게`}
          className={`${FIELD} resize-y leading-relaxed`}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Btn
            size="sm"
            disabled={!body.trim() || phase !== 'idle'}
            busy={phase === 'thinking'}
            busyLabel="답 쓰는 중…"
            onClick={() => void send(false)}
          >
            보내기
          </Btn>
          <Btn size="sm" kind="side" disabled={!body.trim() || phase !== 'idle'} busy={phase === 'sending'} busyLabel="남기는 중…" onClick={() => void send(true)}>
            기록만 남기기
          </Btn>
          <span className="hidden text-tiny font-semibold text-slate-500 sm:inline"><span className="font-mono">⌘↵</span> 보내기</span>
          <Err>{error}</Err>
        </div>
      </div>
    </section>
  );
}

/*
 * 글 속의 주소는 눌리게 — 에이전트가 출처를 인용 블록이 아니라 본문에 적어 올 때가 있다(2026-11-02 첫 웹 검색 시험).
 * 주소 글자는 ASCII 만 잡는다 — 「…/a에서」처럼 한글이 붙어 와도 주소가 한글까지 먹지 않게. 끝의 문장부호는 뺀다.
 */
const URL_RE = /(https?:\/\/[A-Za-z0-9\-._~:/?#@!$&*+,;=%]+[A-Za-z0-9\-_~/#=%&])/g;

function Linked({ text }: { text: string }) {
  const parts = text.split(URL_RE);
  return (
    <>
      {parts.map((p, i) => (i % 2 === 1 ? (
        <a key={i} href={p} target="_blank" rel="noreferrer" className={`break-all ${LINK}`}>{p}</a>
      ) : p))}
    </>
  );
}

/* 말의 모양 — 누가 말했는지는 띠의 선과 바탕, 머리의 표시(반짝이 에이전트 · ▸ 지시 · ✎ 기록)로 가른다 */
const ROLE_LOOK = {
  agent: { band: 'border-brand-400 bg-brand-50/70', who: 'text-brand-800', text: 'text-slate-800' },
  user: { band: 'border-slate-300', who: 'text-slate-800', text: 'text-slate-800' },
  note: { band: 'border-dashed border-slate-300 bg-slate-50', who: 'text-slate-500', text: 'text-slate-600' },
} as const;

function Said({ message: m }: { message: AgentMessage }) {
  const look = ROLE_LOOK[m.role];
  const secs = m.meta?.ms ? Math.max(1, Math.round(m.meta.ms / 1000)) : null;
  return (
    <li className={`rounded-box border-l-[3px] px-3.5 py-2.5 ${look.band}`}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-tiny">
        <span className="font-mono tabular-nums text-slate-500">{m.at}</span>
        <span className={`inline-flex items-center gap-1 font-bold ${look.who}`}>
          {m.role === 'agent' && <Spark className="h-3 w-3 self-center text-brand-500" />}
          {m.role === 'user' && <span aria-hidden>▸</span>}
          {m.role === 'note' && <span aria-hidden>✎ 기록 ·</span>}
          {m.author}
        </span>
        {(secs !== null || m.meta?.usd !== undefined) && (
          <span className="font-mono tabular-nums text-slate-500">
            {secs !== null && `${secs}s`}
            {m.meta?.usd !== undefined && ` · $${m.meta.usd.toFixed(2)}`}
          </span>
        )}
        {m.meta?.added?.length ? <Tag tone="ok">할 일 {m.meta.added.length}건 적음</Tag> : null}
        {m.meta?.done?.length ? <Tag tone="ok">할 일 {m.meta.done.length}건 끝냄</Tag> : null}
      </div>
      <p className={`mt-1 whitespace-pre-wrap break-keep text-base leading-relaxed ${look.text}`}><Linked text={m.body} /></p>
      {m.meta?.sources?.length ? (
        <ul className="mt-2 flex flex-col gap-0.5">
          {m.meta.sources.map((s) => (
            <li key={s.url} className="min-w-0 truncate text-small">
              <a href={s.url} target="_blank" rel="noreferrer" className={LINK}>{s.title || s.url}</a>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

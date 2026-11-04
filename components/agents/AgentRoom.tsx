'use client';

/**
 * 담당과의 대화 — 지시 · 기록 · 에이전트의 답이 오래된 것부터 로그처럼 쌓인다. 이것이 그 담당과의 커뮤니케이션 기록이다.
 *
 * 남기는 길이 둘이다.
 *   보내기        지시를 남기고 에이전트를 부른다(/messages → /reply). 답을 쓰는 동안 단추가 「답 쓰는 중…」이다.
 *   기록만 남기기  에이전트를 부르지 않는다 — 운영사 담당자와 통화한 내용 같은 것. 다음 대화에서 에이전트가 근거로 읽는다.
 * 답이 실패해도 지시는 남아 있다 — 마지막 말이 답 없는 지시면 「다시 묻기」가 선다(화면 규칙 9: 무엇이 되었는지 그 자리에).
 *
 * ★파일을 넘긴다★(한백 지시 2026-11-02) — 「파일 첨부」나 끌어다 놓기로 고르면 그 자리에서 Blob 에 바로 올라가고(/files 토큰),
 * 보내기 · 기록만 남기기 때 그 말에 붙는다. 올리는 동안은 보내지 못한다(단추 이름이 말한다). 에이전트가 읽는 법은 lib/agents/files.
 *
 * ★주간 기록★ — 한 주를 고르면(week) 그 주의 말과, 그 사이에 할 일이 적히고 끝나고 업무 정의가 바뀌고 메일이 나간 일이 시각
 * 순으로 선다. 지난 기록을 보는 자리라 쓰는 칸은 없다 — 「지금 대화로」가 돌아가는 길이다.
 *
 * ★메일 초안★(한백 2026-11-03) — 담당이 올린 초안은 그것을 쓴 답 바로 밑에 선다(MailCard). 한백이 「승인하고 보내기」를 눌러야
 * 나간다. 답에 이어지지 못한 초안(답을 남기다 끊긴 것)은 올린 시각의 자리에 따로 선다.
 * ★자동의 말★(2026-11-04 · lib/site-mail) — 계약서가 접수되면 콘솔이 그 담당의 이름으로 할 일 · 양식 메일 초안을 남긴다(말의 종류
 * auto). 에이전트의 말과 같은 띠에 「자동」 꼬리표와 그 현장으로 가는 고리를 단다. 초안 카드는 그 말 밑에 선다.
 * 정산 담당의 열린구매 상신 알림(같은 날 · lib/agents/open-purchase)도 자동의 말이다 — 현장 대신 「거래명세서 보기 →」(meta.link).
 * 말은 띠 모양이다(ui.tsx Note 처럼 왼쪽 선 — 판 안이라 사방 테두리를 두르지 않는다). 에이전트의 말만 연한 사업 색 바탕에 반짝이를 단다
 * (진행현황 및 메모가 상대 쪽 글을 사업 색 선으로 가르는 것과 같은 결). 기록은 「기록」, 자동의 말은 「자동」 꼬리표 — 글자 표시(▸ ✎)는
 * 걷었다(2026-11-05 콘솔 틀에 맞춤 — 꼬리표가 콘솔의 말이다). 답을 기다리는 동안 깜빡이던 점도 걷었다 — 단추가 「답 쓰는 중…」이다.
 */
import Link from 'next/link';
import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useRouter } from 'next/navigation';
import type { AgentEvent, AgentMail, AgentMessage } from '@/types/agents';
import { Btn, Err, FIELD, PANEL, SectionHead, Tag, TEXT } from '@/components/ui';
import { AGENT_FILE_MAX_BYTES, AGENT_FILES_PER_MESSAGE, sizeLabel } from '@/lib/agents/files';
import { weekRange } from '@/lib/agents/weeks';
import { Clip, FileChip, LINK, Spark } from './kit';
import { MailCard } from './MailCard';

type Phase = 'idle' | 'sending' | 'thinking';

/** 고른 파일 한 장 — 올리는 중 · 올림 · 실패 */
type Pending = { key: string; name: string; size: number; state: 'up' | 'done' | 'fail'; pct: number; pathname?: string; error?: string };

async function post(url: string, body?: unknown): Promise<{ ok: true; message: AgentMessage; mails: AgentMail[] } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
    const json = (await res.json().catch(() => ({}))) as { message?: AgentMessage; mails?: AgentMail[]; error?: string };
    if (!res.ok || !json.message) return { ok: false, error: json.error ?? '처리하지 못했습니다.' };
    return { ok: true, message: json.message, mails: json.mails ?? [] };
  } catch {
    return { ok: false, error: '네트워크 오류입니다. 다시 시도해주세요.' };
  }
}

export function AgentRoom({ agentId, agentName, home, messages, mails, connected, week, today }: {
  agentId: string;
  agentName: string;
  /** 이 담당의 화면 주소 — 사업마다의 조직도 밑(lib/biz BIZ_AGENTS). 주간 기록에서 「지금 대화로」가 간다 */
  home: string;
  messages: AgentMessage[];
  /** 실린 말에 딸린 메일 초안 */
  mails: AgentMail[];
  /** 콘솔에 보내는 메일이 연결돼 있는가 — 아니면 초안의 보내기 단추가 그 까닭을 말한다 */
  connected: boolean;
  /** 한 주를 골랐을 때 — 그 주와, 대화 사이에 끼는 일 */
  week: { start: string; end: string; events: AgentEvent[] } | null;
  today: string;
}) {
  const router = useRouter();
  const [list, setList] = useState(messages);
  const [mailList, setMailList] = useState(mails);
  const [body, setBody] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [dragging, setDragging] = useState(false);
  const scroller = useRef<HTMLOListElement>(null);
  const picker = useRef<HTMLInputElement>(null);

  /* 서버가 다시 그리면(할 일이 바뀌어 refresh · 다른 주를 골라 이동) 그 목록을 믿는다 — 도는 중에는 내 것을 지킨다 */
  useEffect(() => {
    if (phase === 'idle') setList(messages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);
  useEffect(() => {
    if (phase === 'idle') setMailList(mails);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mails]);

  /* 새 말이 붙으면 맨 아래로 — 지난 주를 펼쳤을 때는 그 주의 처음부터 읽는다 */
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = week ? 0 : el.scrollHeight;
  }, [list.length, phase, week]);

  const update = (key: string, patch: Partial<Pending>) => setPending((p) => p.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  async function upload(file: File, key: string) {
    try {
      if (file.size > AGENT_FILE_MAX_BYTES) throw new Error(`${sizeLabel(AGENT_FILE_MAX_BYTES)}까지 넘길 수 있습니다`);
      const res = await fetch(`/api/agents/${agentId}/files`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: file.name, size: file.size }),
      });
      const json = (await res.json().catch(() => ({}))) as { token?: string; pathname?: string; error?: string };
      if (!res.ok || !json.token || !json.pathname) throw new Error(json.error ?? '올리지 못했습니다');
      const { put } = await import('@vercel/blob/client');
      await put(json.pathname, file, {
        access: 'public',
        token: json.token,
        ...(file.type ? { contentType: file.type } : {}),
        multipart: file.size > 8 * 1024 * 1024,
        onUploadProgress: ({ percentage }) => update(key, { pct: Math.round(percentage) }),
      });
      update(key, { state: 'done', pct: 100, pathname: json.pathname });
    } catch (e) {
      update(key, { state: 'fail', error: e instanceof Error ? e.message : '올리지 못했습니다' });
    }
  }

  /* FileList 는 들고 다니지 않는다 — input.value = '' 가 그것을 비운다(test/conventions/file-input). 꺼내는 자리에서 복사한다 */
  function attach(files: File[]) {
    const room = AGENT_FILES_PER_MESSAGE - pending.length;
    const picked = files.slice(0, Math.max(0, room));
    if (files.length > picked.length) setError(`파일은 한 번에 ${AGENT_FILES_PER_MESSAGE}개까지입니다.`);
    for (const file of picked) {
      const key = crypto.randomUUID();
      setPending((p) => [...p, { key, name: file.name, size: file.size, state: 'up', pct: 0 }]);
      void upload(file, key);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (phase === 'idle') attach([...e.dataTransfer.files]);
  }

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
    // 이미 있던 초안(같은 양식 초안을 그대로 둔 것)은 이 답 밑으로 옮겨 온다 — 같은 카드가 둘 서지 않게 id 로 갈아 끼운다
    if (r.mails.length) setMailList((l) => [...l.filter((m) => !r.mails.some((x) => x.id === m.id)), ...r.mails]);
    router.refresh(); // 에이전트가 할 일을 적었을 수 있다 — 오른쪽 할 일과 머리말을 다시 그린다
  }

  /* 초안 하나가 바뀌면(보냄 · 고침 · 버림) 그 자리만 갈고, 머리말의 승인 대기 셈을 다시 그린다 */
  function mailChanged(mail: AgentMail) {
    setMailList((l) => l.map((m) => (m.id === mail.id ? mail : m)));
    router.refresh();
  }

  async function send(note: boolean) {
    const text = body.trim();
    const ready = pending.filter((p) => p.state === 'done' && p.pathname);
    if (!text && ready.length === 0) return;
    setPhase('sending');
    setError(null);
    const r = await post(`/api/agents/${agentId}/messages`, {
      body: text, note, files: ready.map((p) => ({ pathname: p.pathname, name: p.name })),
    });
    if (!r.ok) {
      setPhase('idle');
      setError(r.error);
      return;
    }
    setBody('');
    setPending((p) => p.filter((x) => x.state === 'fail')); // 못 올린 것은 남겨 둔다 — 보이게
    setList((l) => [...l, r.message]);
    if (note) {
      setPhase('idle');
      router.refresh();
      return;
    }
    await ask();
  }

  const last = list[list.length - 1];
  const unanswered = !week && phase === 'idle' && last?.role === 'user';
  const uploading = pending.some((p) => p.state === 'up');
  const ready = pending.some((p) => p.state === 'done');
  const canSend = phase === 'idle' && !uploading && (Boolean(body.trim()) || ready);

  /* 메일 초안은 그것을 쓴 답 밑에 — 답이 실리지 않은 초안은 올린 시각의 자리에 따로 */
  const shown = new Set(list.map((m) => m.id));
  const mailsOf = new Map<string, AgentMail[]>();
  for (const m of mailList) {
    if (m.messageId && shown.has(m.messageId)) mailsOf.set(m.messageId, [...(mailsOf.get(m.messageId) ?? []), m]);
  }
  const loose = mailList.filter((m) => !m.messageId || !shown.has(m.messageId));
  const pendingMails = mailList.filter((m) => m.status === 'draft' || m.status === 'failed').length;

  /* 주간 기록 — 말과 일을 시각 순으로 한 줄에 */
  const rows: Array<{ at: string; said?: AgentMessage; event?: AgentEvent; mail?: AgentMail }> = [
    ...list.map((m) => ({ at: m.at, said: m })),
    ...(week ? week.events.map((e) => ({ at: e.at, event: e })) : []),
    ...loose.map((m) => ({ at: m.createdAt, mail: m })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const card = (m: AgentMail) => <MailCard key={m.id} agentId={agentId} mail={m} connected={connected} onChange={mailChanged} />;

  return (
    <section className={`${PANEL} flex min-w-0 flex-col`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-5 pb-3 pt-4">
        <SectionHead
          title={week ? '주간 기록' : '대화'}
          meta={week ? `${weekRange(week.start, today)} · 말 ${list.length}건 · 일 ${week.events.length}건` : `${list.length}건`}
        >
          {pendingMails > 0 && <Tag tone="warn">승인 대기 메일 {pendingMails}</Tag>}
        </SectionHead>
        {week && (
          <Link href={home} className="text-small font-bold text-slate-500 transition hover:text-brand-800">
            지금 대화로 →
          </Link>
        )}
      </div>

      <ol ref={scroller} className="flex max-h-[62vh] min-h-[220px] flex-col gap-2 overflow-y-auto border-t border-slate-100 px-5 py-3">
        {rows.map((r) => {
          if (r.said) {
            return [<Said key={r.said.id} message={r.said} />, ...(mailsOf.get(r.said.id) ?? []).map(card)];
          }
          if (r.mail) return card(r.mail);
          return <Happened key={`${r.event!.at}|${r.event!.kind}|${r.event!.title}`} event={r.event!} />;
        })}
        {week && rows.length === 0 && <li className={`py-6 text-center ${TEXT.meta}`}>그 주의 기록 0건</li>}
        {phase === 'thinking' && (
          <li className="rounded-box border-l-[3px] border-brand-400 bg-brand-50/70 px-3.5 py-2.5">
            <p className="flex items-center gap-1 text-tiny font-bold text-brand-800">
              <Spark className="h-3 w-3 text-brand-500" />{agentName}
            </p>
            <p className="mt-1 text-base text-slate-500">답 쓰는 중…</p>
          </li>
        )}
      </ol>

      {!week && (
        <div
          className={`flex flex-col gap-2 border-t px-5 py-3 transition ${dragging ? 'border-brand-300 bg-brand-50/60' : 'border-slate-100'}`}
          onDragOver={(e) => { e.preventDefault(); if (phase === 'idle') setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
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
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canSend) void send(false);
            }}
            rows={3}
            disabled={phase !== 'idle'}
            placeholder={`${agentName}에게 — 파일은 끌어다 놓아도 됩니다`}
            className={`${FIELD} resize-y leading-relaxed`}
          />
          {pending.length > 0 && (
            <ul className="flex flex-wrap gap-1.5">
              {pending.map((p) => (
                <li
                  key={p.key}
                  className={`inline-flex max-w-full items-center gap-1.5 rounded-ctl border px-2 py-1 text-small font-semibold ${
                    p.state === 'fail' ? 'border-red-200 bg-red-50 text-red-800' : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  <Clip className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                  <span className="min-w-0 truncate">{p.name}</span>
                  <span className="shrink-0 text-tiny font-semibold tabular-nums text-slate-500">
                    {p.state === 'up' ? `올리는 중 ${p.pct}%` : p.state === 'fail' ? p.error : sizeLabel(p.size)}
                  </span>
                  {p.state !== 'up' && (
                    <button
                      type="button"
                      aria-label={`${p.name} 빼기`}
                      onClick={() => setPending((l) => l.filter((x) => x.key !== p.key))}
                      className="shrink-0 rounded-tag px-1 text-slate-400 transition hover:text-red-700"
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Btn
              size="sm"
              disabled={!canSend}
              busy={phase === 'thinking'}
              busyLabel="답 쓰는 중…"
              onClick={() => void send(false)}
            >
              {uploading ? '파일 올리는 중 — 보내기 대기' : '보내기'}
            </Btn>
            <Btn size="sm" kind="side" disabled={!canSend} busy={phase === 'sending'} busyLabel="남기는 중…" onClick={() => void send(true)}>
              기록만 남기기
            </Btn>
            <Btn
              size="sm"
              kind="quiet"
              disabled={phase !== 'idle' || pending.length >= AGENT_FILES_PER_MESSAGE}
              onClick={() => picker.current?.click()}
            >
              파일 첨부
            </Btn>
            <input
              ref={picker}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => { attach([...(e.target.files ?? [])]); e.target.value = ''; }}
            />
            <span className="hidden text-tiny font-semibold text-slate-500 sm:inline">⌘↵ 보내기</span>
            <Err>{error}</Err>
          </div>
        </div>
      )}
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

/* 말의 모양 — 누가 말했는지는 띠의 선과 바탕, 머리의 표시(반짝이 — 에이전트 · 「자동」 · 「기록」 꼬리표)로 가른다 */
const ROLE_LOOK = {
  agent: { band: 'border-brand-400 bg-brand-50/70', who: 'text-brand-800', text: 'text-slate-800' },
  auto: { band: 'border-brand-400 bg-brand-50/70', who: 'text-brand-800', text: 'text-slate-800' },
  user: { band: 'border-slate-300', who: 'text-slate-800', text: 'text-slate-800' },
  note: { band: 'border-slate-300 bg-slate-50', who: 'text-slate-600', text: 'text-slate-700' },
} as const;

function Said({ message: m }: { message: AgentMessage }) {
  const look = ROLE_LOOK[m.role];
  const secs = m.meta?.ms ? Math.max(1, Math.round(m.meta.ms / 1000)) : null;
  return (
    <li className={`rounded-box border-l-[3px] px-3.5 py-2.5 ${look.band}`}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-tiny">
        <span className="font-semibold tabular-nums text-slate-500">{m.at}</span>
        <span className={`inline-flex items-center gap-1 font-bold ${look.who}`}>
          {(m.role === 'agent' || m.role === 'auto') && <Spark className="h-3 w-3 self-center text-brand-500" />}
          {m.author}
        </span>
        {m.role === 'auto' && <Tag>자동</Tag>}
        {m.role === 'note' && <Tag>기록</Tag>}
        {(secs !== null || m.meta?.usd !== undefined) && (
          <span className="font-semibold tabular-nums text-slate-500">
            {secs !== null && `${secs}초`}
            {m.meta?.usd !== undefined && ` · $${m.meta.usd.toFixed(2)}`}
          </span>
        )}
        {m.meta?.added?.length ? <Tag tone="ok">할 일 {m.meta.added.length}건 적음</Tag> : null}
        {m.meta?.done?.length ? <Tag tone="ok">할 일 {m.meta.done.length}건 끝냄</Tag> : null}
        {m.meta?.mails?.length ? <Tag tone="ok">메일 초안 {m.meta.mails.length}통</Tag> : null}
        {m.meta?.directions?.length ? <Tag tone="ok">목표 · 방향 {m.meta.directions.length}건 고침</Tag> : null}
        {m.role === 'agent' && <span className="ml-auto"><CopyBtn text={m.body} /></span>}
        {m.role === 'auto' && m.meta?.site && (
          <Link href={`/projects/${encodeURIComponent(m.meta.site.id)}?tab=intake`} className={`ml-auto text-small font-bold ${LINK}`}>
            현장 보기 →
          </Link>
        )}
        {/* 정기 알림(열린구매 상신)이 짚는 화면 — 「거래명세서 보기 →」 */}
        {m.role === 'auto' && m.meta?.link && (
          <Link href={m.meta.link.href} className={`ml-auto text-small font-bold ${LINK}`}>{m.meta.link.label}</Link>
        )}
      </div>
      {m.body && <p className={`mt-1 whitespace-pre-wrap break-keep text-base leading-relaxed ${look.text}`}><Linked text={m.body} /></p>}
      {m.files.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {m.files.map((f) => <FileChip key={f.id} file={f} />)}
        </div>
      )}
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

/**
 * 답 복사 — 열린구매 지출 글처럼 다른 곳(아지트)에 붙여 넣을 답이 있다. 누르면 「복사됨」으로 바뀌고 그대로 둔다(규칙 9 —
 * 잠깐 뜨고 사라지면 못 본다). 브라우저가 막으면 그 자리에 「복사 안 됨」.
 */
function CopyBtn({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'done' | 'fail'>('idle');
  return (
    <Btn
      size="sm"
      kind="quiet"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => setState('done'), () => setState('fail'));
      }}
    >
      {state === 'done' ? '복사됨' : state === 'fail' ? '복사 안 됨' : '복사'}
    </Btn>
  );
}

const EVENT_LOOK: Record<AgentEvent['kind'], { label: string; tone: 'ok' | 'mute' }> = {
  'task-added': { label: '할 일 적음', tone: 'mute' },
  'task-done': { label: '할 일 끝냄', tone: 'ok' },
  'duty-added': { label: '업무 정의 추가', tone: 'mute' },
  'duty-edited': { label: '업무 정의 고침', tone: 'mute' },
  'duty-deleted': { label: '업무 정의 지움', tone: 'mute' },
  'mail-sent': { label: '메일 보냄', tone: 'ok' },
  // 팀 목표 · 방향 — 팀장(전략·기획)의 주간 기록에만 선다(migrations/0120)
  'direction-added': { label: '목표 · 방향 추가', tone: 'mute' },
  'direction-edited': { label: '목표 · 방향 고침', tone: 'mute' },
  'direction-deleted': { label: '목표 · 방향 지움', tone: 'mute' },
};

/** 주간 기록에서 말 사이에 끼는 일 한 줄 — 업무 정의 · 목표 · 방향이 바뀌었으면 앞뒤를 펼쳐 본다 */
function Happened({ event: e }: { event: AgentEvent }) {
  const look = EVENT_LOOK[e.kind];
  return (
    <li className="px-1 py-1">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-tiny">
        <span className="font-semibold tabular-nums text-slate-500">{e.at}</span>
        <Tag tone={look.tone}>{look.label}</Tag>
        <span className="min-w-0 break-keep text-small font-semibold text-slate-800">{e.title}</span>
        <span className={`inline-flex items-center gap-1 ${TEXT.meta}`}>
          {e.byAgent && <Spark className="h-2.5 w-2.5 text-brand-500" />}{e.by}
        </span>
      </div>
      {(e.before || e.after) && e.kind !== 'duty-added' && e.kind !== 'direction-added' && (
        <details className="mt-1 pl-1">
          <summary className="inline-block cursor-pointer list-none rounded-ctl border border-slate-200 bg-white px-1.5 py-0.5 text-tiny font-bold text-slate-500 transition hover:border-brand-300 hover:text-brand-800 [&::-webkit-details-marker]:hidden">
            앞뒤 보기
          </summary>
          <div className="mt-1 flex flex-col gap-1 text-small leading-relaxed">
            {e.before && <p className="whitespace-pre-wrap break-keep text-slate-500"><span className="font-bold">앞 · </span>{e.before}</p>}
            {e.after && <p className="whitespace-pre-wrap break-keep text-slate-800"><span className="font-bold">뒤 · </span>{e.after}</p>}
          </div>
        </details>
      )}
    </li>
  );
}

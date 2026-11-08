'use client';

/**
 * 담당과의 대화 — 지시 · 기록 · 에이전트의 답이 오래된 것부터 쌓인다. 이것이 그 담당과의 커뮤니케이션 기록이다.
 *
 * ★채팅 화면의 문법을 따른다★(한백 2026-11-05 「에이전트와 대화창 UI를 최신 채팅창 가이드라인 맞춰서 개선해줘」):
 *   - 한백이 한 말(지시 · 기록)은 오른쪽 말풍선, 담당의 말(답 · 자동)은 왼쪽 표지 옆 맨글 — 누가 말했는지를 자리로 가른다.
 *     기록은 점선 말풍선에 「기록」 꼬리표, 자동은 「자동」 꼬리표다. 그전의 띠(왼쪽 선)는 모든 말이 같은 줄에 서서 누구 말인지 읽어야 했다.
 *   - 날이 바뀌면 가름줄(「오늘 · 11월 5일 (수)」) · 말마다는 시각만.
 *   - 쓰는 칸은 아래에 붙는다 — 한 상자 안에 넘긴 파일 · 글 · 단추(파일 · 기록만 남기기 · 보내기). 글이 늘면 칸이 따라 늘고(열 줄까지),
 *     ↵ 가 보내기 · ⇧↵ 가 줄 바꿈이다(한글 조합 중의 ↵ 는 보내지 않는다). 답을 기다리는 동안에도 다음 말을 쓸 수 있다 — 보내기만 막힌다.
 *   - 맨 아래를 보고 있을 때만 새 말을 따라 내려간다. 위로 올려 읽는 중이면 「최근 말로 ↓」가 뜬다(떠 있는 것이라 그림자가 있다).
 *   - 답을 쓰는 동안 그 자리에 담당의 표지와 「답 쓰는 중… 12초」 — 답은 5초에서 1분까지 걸린다. 깜빡임은 쓰지 않는다(콘솔 틀).
 *   - 답의 「- 」 목록은 내어쓰기로 그린다(답은 마크다운 없이 줄바꿈과 「- 」만 쓴다 — lib/agents/brain). 복사는 답 밑이다.
 *
 * 남기는 길이 둘이다.
 *   보내기        지시를 남기고 에이전트를 부른다(/messages → /reply).
 *   기록만 남기기  에이전트를 부르지 않는다 — 운영사 담당자와 통화한 내용 같은 것. 다음 대화에서 에이전트가 근거로 읽는다.
 * 답이 실패해도 지시는 남아 있다 — 마지막 말이 답 없는 지시면 그 밑에 「다시 묻기」가 선다(화면 규칙 9: 무엇이 되었는지 그 자리에).
 *
 * ★파일을 넘긴다★(한백 지시 2026-11-02) — 「파일」이나 끌어다 놓기로 고르면 그 자리에서 Blob 에 바로 올라가고(/files 토큰),
 * 보내기 · 기록만 남기기 때 그 말에 붙는다. 올리는 동안은 보내지 못한다(단추 이름이 말한다). 에이전트가 읽는 법은 lib/agents/files.
 *
 * ★주간 기록★ — 한 주를 고르면(week) 그 주의 말과, 그 사이에 할 일이 적히고 끝나고 업무 정의가 바뀌고 메일이 나간 일이 시각
 * 순으로 선다. 지난 기록을 보는 자리라 쓰는 칸은 없다 — 「지금 대화로」가 돌아가는 길이다.
 *
 * ★메일 초안★(한백 2026-11-03) — 담당이 올린 초안은 그것을 쓴 답 바로 밑에 선다(MailCard — 표지 폭만큼 들여 담당 쪽에). 한백이
 * 「승인하고 보내기」를 눌러야 나간다. 답에 이어지지 못한 초안(답을 남기다 끊긴 것)은 올린 시각의 자리에 따로 선다.
 * ★자동의 말★(2026-11-04 · lib/site-mail) — 계약서가 접수되면 콘솔이 그 담당의 이름으로 할 일 · 양식 메일 초안을 남긴다(말의 종류
 * auto). 「자동」 꼬리표와 그 현장으로 가는 고리를 단다. 정산 담당의 열린구매 상신 알림(lib/agents/open-purchase)도 자동의 말이다 —
 * 현장 대신 「거래명세서 보기 →」(meta.link).
 * ★아지트 열린구매 글 초안★(2026-11-08 · lib/agit) — 정산 담당이 올린 초안(상신 알림 · agit_post)도 그 말 밑에 선다(AgitCard).
 * 한백이 「승인하고 올리기」를 눌러야 올라간다. 카드는 서버가 그린 목록을 그대로 쓴다 — 답 뒤의 router.refresh 가 새 카드를 싣는다.
 */
import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import type { AgentEvent, AgentMail, AgentMessage } from '@/types/agents';
import { Btn, Err, PANEL, SectionHead, Tag, TEXT } from '@/components/ui';
import { AGENT_FILE_MAX_BYTES, AGENT_FILES_PER_MESSAGE, sizeLabel } from '@/lib/agents/files';
import { shiftDay, weekRange } from '@/lib/agents/weeks';
import { AgentMark, Clip, FileChip, LINK, Spark } from './kit';
import { MailCard } from './MailCard';
import { AgitCard } from './AgitCard';
import type { AgitPostRecord } from '@/lib/agit/post';

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

/** 맨 아래에서 이만큼(px) 안이면 「맨 아래를 보는 중」 — 새 말을 따라 내려간다 */
const NEAR_BOTTOM = 96;
/** 쓰는 칸이 늘어나는 끝 — 넘으면 칸 안에서 민다 */
const COMPOSER_MAX_PX = 240;

const WEEKDAY = '일월화수목금토';

/** 날 가름줄의 이름 — 「오늘 · 11월 5일 (수)」 · 「어제 · …」 · 다른 해면 해까지 */
function dayHead(day: string, today: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const label = `${m}월 ${d}일 (${WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
  if (day === today) return `오늘 · ${label}`;
  if (day === shiftDay(today, -1)) return `어제 · ${label}`;
  return day.slice(0, 4) === today.slice(0, 4) ? label : `${y}년 ${label}`;
}

export function AgentRoom({ agentId, agentName, home, messages, mails, connected, week, today, agit }: {
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
  /** 정산 담당(전기차)만 — 실린 말에 딸린 아지트 글 초안 · 아지트 연결 · 요청 담당 */
  agit?: { posts: AgitPostRecord[]; connected: boolean; assignees: string[] };
}) {
  const router = useRouter();
  const [list, setList] = useState(messages);
  const [mailList, setMailList] = useState(mails);
  const [body, setBody] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending[]>([]);
  const [dragging, setDragging] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const [waited, setWaited] = useState(0);
  const scroller = useRef<HTMLOListElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  /* 맨 아래를 보는 중인가 — 그리기와 무관하게 스크롤 때마다 바뀌니 ref 로 들고, 단추를 띄울지만 state 로 */
  const follow = useRef(true);

  /* 서버가 다시 그리면(할 일이 바뀌어 refresh · 다른 주를 골라 이동) 그 목록을 믿는다 — 도는 중에는 내 것을 지킨다 */
  useEffect(() => {
    if (phase === 'idle') setList(messages);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);
  useEffect(() => {
    if (phase === 'idle') setMailList(mails);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mails]);

  /* 팀 화면 주소 — 이 담당의 화면(home = 팀 화면/담당)에서 끝 마디를 뗀 것. 팀원의 말이 보낸 담당으로 간다 */
  const team = home.slice(0, home.lastIndexOf('/'));

  function toBottom(smooth = false) {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    follow.current = true;
    setAtBottom(true);
  }

  /* 처음 열 때 — 지금 대화는 맨 아래(최근 말)부터, 지난 주는 그 주의 처음부터 읽는다 */
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (week) el.scrollTop = 0;
    else toBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week]);

  /* 새 말이 붙으면 — 맨 아래를 보고 있을 때만 따라 내려간다(위로 올려 읽는 중이면 「최근 말로 ↓」) */
  useLayoutEffect(() => {
    if (!week && follow.current) toBottom();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list.length, mailList.length, phase]);

  /* 쓰는 칸은 글을 따라 는다 — 끝(COMPOSER_MAX_PX)을 넘으면 칸 안에서 민다 */
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_PX)}px`;
  }, [body]);

  /* 답을 기다린 초 — 답은 5초에서 1분까지 걸린다. 멈춘 것인지 도는 것인지 보이게 */
  useEffect(() => {
    if (phase !== 'thinking') return;
    const t0 = Date.now();
    setWaited(0);
    const id = window.setInterval(() => setWaited(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM;
    follow.current = near;
    if (near !== atBottom) setAtBottom(near);
  }

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
    follow.current = true; // 내가 부른 답은 따라 내려간다
    const r = await post(`/api/agents/${agentId}/reply`);
    setPhase('idle');
    box.current?.focus();
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
    follow.current = true; // 내가 보낸 말은 보이게 맨 아래로
    const r = await post(`/api/agents/${agentId}/messages`, {
      body: text, note, files: ready.map((p) => ({ pathname: p.pathname, name: p.name })),
    });
    if (!r.ok) {
      setPhase('idle');
      setError(r.error);
      return;
    }
    // 보내는 동안 이어 쓴 글은 지키고, 보낸 글만 덜어 낸다
    setBody((b) => (b.trim() === text ? '' : b));
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
  /* 아지트 글 초안도 그것을 올린 말 밑에 — 실린 말에 딸린 것만 온다(AgentView) */
  const agitOf = new Map<string, AgitPostRecord[]>();
  for (const a of agit?.posts ?? []) {
    if (a.messageId && shown.has(a.messageId)) agitOf.set(a.messageId, [...(agitOf.get(a.messageId) ?? []), a]);
  }
  const agitCard = (a: AgitPostRecord) => (
    <AgitCard key={a.id} post={a} connected={agit?.connected ?? false} assignees={agit?.assignees ?? []} />
  );
  const pendingMails = mailList.filter((m) => m.status === 'draft' || m.status === 'failed').length;

  /* 말 · 일 · 따로 선 초안을 시각 순으로 — 날이 바뀌면 가름줄 */
  const rows: Array<{ at: string; said?: AgentMessage; event?: AgentEvent; mail?: AgentMail }> = [
    ...list.map((m) => ({ at: m.at, said: m })),
    ...(week ? week.events.map((e) => ({ at: e.at, event: e })) : []),
    ...loose.map((m) => ({ at: m.createdAt, mail: m })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const card = (m: AgentMail) => <MailCard key={m.id} agentId={agentId} mail={m} connected={connected} onChange={mailChanged} />;
  const items: ReactNode[] = [];
  let day = '';
  for (const r of rows) {
    const d = r.at.slice(0, 10);
    if (d !== day) {
      day = d;
      items.push(<DayRule key={`day|${d}`} label={dayHead(d, today)} />);
    }
    if (r.said) {
      items.push(
        <Said key={r.said.id} message={r.said} team={team} />,
        ...(mailsOf.get(r.said.id) ?? []).map(card),
        ...(agitOf.get(r.said.id) ?? []).map(agitCard),
      );
    }
    else if (r.mail) items.push(card(r.mail));
    else items.push(<Happened key={`${r.event!.at}|${r.event!.kind}|${r.event!.title}`} event={r.event!} />);
  }

  return (
    <section className={`${PANEL} flex min-w-0 flex-col lg:h-full`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-slate-100 px-5 pb-3 pt-4">
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

      <div className="relative flex min-h-0 flex-1 flex-col">
        <ol
          ref={scroller}
          onScroll={onScroll}
          role="log"
          aria-live="polite"
          aria-label={week ? '주간 기록' : `${agentName}과의 대화`}
          className="flex max-h-[65vh] min-h-[240px] flex-col gap-4 overflow-y-auto px-5 py-4 lg:max-h-none lg:flex-1"
        >
          {/* 처음 — 말이 없으면 그 담당의 표지만(빈 판이 고장처럼 보이지 않게) */}
          {!week && rows.length === 0 && phase === 'idle' && (
            <li className="m-auto flex flex-col items-center gap-2 py-8">
              <AgentMark size="lg" />
              <span className="text-base font-bold text-slate-800">{agentName}</span>
              <span className={TEXT.meta}>대화 0건</span>
            </li>
          )}
          {week && rows.length === 0 && <li className={`m-auto py-8 ${TEXT.meta}`}>그 주의 기록 0건</li>}
          {items}
          {unanswered && (
            <li className="flex items-center justify-end gap-2">
              <Tag tone="warn">답 없음</Tag>
              <Btn size="sm" kind="side" onClick={() => void ask()}>다시 묻기</Btn>
            </li>
          )}
          {phase === 'thinking' && (
            <li className="flex gap-3">
              <AgentMark />
              <div className="min-w-0 pt-0.5">
                <p className="text-small font-bold text-slate-800">{agentName}</p>
                <p className="mt-0.5 text-base text-slate-500">
                  답 쓰는 중… <span className="tabular-nums">{waited}초</span>
                </p>
              </div>
            </li>
          )}
        </ol>
        {/* 위로 올려 읽는 중일 때만 — 떠 있는 것이라 그림자가 있다(/design 「그림자는 떠 있는 것에만」) */}
        {!week && !atBottom && (
          <button
            type="button"
            onClick={() => toBottom(true)}
            className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-ctl border border-slate-200 bg-white px-3 py-1.5 text-small font-bold text-slate-700 shadow-md transition hover:border-brand-300 hover:text-brand-800"
          >
            최근 말로 ↓
          </button>
        )}
      </div>

      {!week && (
        <div
          className="border-t border-slate-100 px-4 pb-4 pt-3"
          onDragOver={(e) => { e.preventDefault(); if (phase === 'idle') setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          {/* 쓰는 상자 하나 — 넘긴 파일 · 글 · 단추가 한 겹 안에(입력칸의 테두리가 그 한 겹이다 — 화면 규칙 1) */}
          <div
            className={`rounded-ctl border transition focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100 ${
              dragging ? 'border-brand-400 bg-brand-50/60' : 'border-slate-200 bg-white'
            }`}
          >
            {pending.length > 0 && (
              <ul className="flex flex-wrap gap-1.5 px-3 pt-2.5">
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
                        className="shrink-0 rounded-tag px-1 text-slate-500 transition hover:text-red-700"
                      >
                        ×
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <textarea
              ref={box}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                // ↵ 보내기 · ⇧↵ 줄 바꿈 — 한글을 조합하는 중의 ↵ 는 글자를 맺는 것이라 보내지 않는다(isComposing · 229)
                if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing || e.keyCode === 229) return;
                e.preventDefault();
                if (canSend) void send(false);
              }}
              rows={1}
              aria-label={`${agentName}에게 보낼 말`}
              placeholder={dragging ? '놓으면 파일이 붙습니다' : `${agentName}에게 — 파일은 끌어다 놓아도 됩니다`}
              className="block max-h-60 w-full resize-none bg-transparent px-3.5 py-2.5 text-base leading-relaxed text-slate-900 placeholder:text-slate-400 focus:outline-none"
            />
            <div className="flex flex-wrap items-center gap-2 px-2 pb-2">
              <Btn
                size="sm"
                kind="quiet"
                disabled={phase !== 'idle' || pending.length >= AGENT_FILES_PER_MESSAGE}
                onClick={() => picker.current?.click()}
                className="inline-flex items-center gap-1"
              >
                <Clip className="h-3.5 w-3.5" />파일
              </Btn>
              <input
                ref={picker}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => { attach([...(e.target.files ?? [])]); e.target.value = ''; }}
              />
              <span className={`hidden sm:inline ${TEXT.meta}`}>↵ 보내기 · ⇧↵ 줄 바꿈</span>
              <Err>{error}</Err>
              <span className="ml-auto flex items-center gap-2">
                <Btn size="sm" kind="side" disabled={!canSend} busy={phase === 'sending'} busyLabel="남기는 중…" onClick={() => void send(true)}>
                  기록만 남기기
                </Btn>
                <Btn size="sm" disabled={!canSend} busy={phase === 'thinking'} busyLabel="답 쓰는 중…" onClick={() => void send(false)}>
                  {uploading ? '파일 올리는 중 — 보내기 대기' : '보내기'}
                </Btn>
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/** 날 가름줄 — 가는 선 사이의 날짜(층을 나누는 가장 약한 수단 — 화면 규칙 1) */
function DayRule({ label }: { label: string }) {
  return (
    <li role="separator" className="flex items-center gap-3 py-1">
      <span aria-hidden className="h-px flex-1 bg-slate-100" />
      <span className={`${TEXT.meta} tabular-nums`}>{label}</span>
      <span aria-hidden className="h-px flex-1 bg-slate-100" />
    </li>
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

/** 「- 」 · 「• 」로 시작하는 줄 — 들여쓴 만큼 한 단계 안쪽 */
const BULLET_RE = /^(\s*)[-•]\s+/;

/**
 * 말의 글 — 줄마다 그린다. 「- 」 목록은 내어쓰기(줄이 접혀도 글머리 뒤에 선다), 빈 줄은 문단 사이 틈. 답은 마크다운 없이 줄바꿈과
 * 「- 」만 쓴다(lib/agents/brain) — 그 밖의 글자는 그대로 보인다.
 */
function Body({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div className={`break-keep text-base leading-relaxed ${className}`}>
      {text.split('\n').map((line, i) => {
        if (!line.trim()) return <div key={i} aria-hidden className="h-2" />;
        const b = BULLET_RE.exec(line);
        if (!b) return <p key={i} className="whitespace-pre-wrap"><Linked text={line} /></p>;
        return (
          <p key={i} className={`flex gap-2 ${b[1].length >= 2 ? 'pl-5' : 'pl-1'}`}>
            <span aria-hidden className="select-none text-slate-500">•</span>
            <span className="min-w-0 flex-1 whitespace-pre-wrap"><Linked text={line.slice(b[0].length)} /></span>
          </p>
        );
      })}
    </div>
  );
}

/**
 * 말 한마디 — 한백의 말(지시 · 기록)은 오른쪽 말풍선, 담당의 말(답 · 자동 · 팀원)은 왼쪽 표지 옆 맨글. 말풍선의 모서리는 rounded-box
 * (누르는 것이 아니다 — 화면 규칙 11). 기록은 점선 말풍선과 「기록」 꼬리표 — 에이전트를 부르지 않은 말이다. 팀원의 말(같은 사업의
 * 다른 담당이 tell_teammate 로 남긴 것)은 보낸 담당의 이름 · 「팀원」 꼬리표 · 그 담당으로 가는 고리. team — 팀 화면 주소.
 */
function Said({ message: m, team }: { message: AgentMessage; team: string }) {
  const time = m.at.slice(11, 16);
  if (m.role === 'user' || m.role === 'note') {
    const note = m.role === 'note';
    return (
      <li className="flex flex-col items-end gap-1 pl-10 sm:pl-16">
        <p className={`flex flex-wrap items-center justify-end gap-x-1.5 ${TEXT.meta} tabular-nums`}>
          {note && <Tag>기록</Tag>}
          <span>{m.author}</span>
          <span>{time}</span>
        </p>
        {m.body && (
          <Body
            text={m.body}
            className={`max-w-full rounded-box px-3.5 py-2.5 text-slate-900 ${note ? 'border border-dashed border-slate-300 bg-white' : 'bg-slate-100'}`}
          />
        )}
        {m.files.length > 0 && (
          <div className="flex flex-wrap justify-end gap-1.5">
            {m.files.map((f) => <FileChip key={f.id} file={f} />)}
          </div>
        )}
      </li>
    );
  }

  const secs = m.meta?.ms ? Math.max(1, Math.round(m.meta.ms / 1000)) : null;
  const did = [
    m.meta?.added?.length ? `할 일 ${m.meta.added.length}건 적음` : null,
    m.meta?.done?.length ? `할 일 ${m.meta.done.length}건 끝냄` : null,
    m.meta?.mails?.length ? `메일 초안 ${m.meta.mails.length}통` : null,
    m.meta?.agit?.length ? `아지트 글 초안 ${m.meta.agit.length}건` : null,
    m.meta?.directions?.length ? `목표 · 방향 ${m.meta.directions.length}건 고침` : null,
    m.meta?.duties?.length ? `업무 정의 ${m.meta.duties.length}건 고침` : null,
    m.meta?.memos?.length ? `메모 ${m.meta.memos.length}건 적음` : null,
    m.meta?.told?.length ? `${m.meta.told.join(' · ')}에게 남김` : null,
  ].filter((x): x is string => x !== null);
  return (
    <li className="flex gap-3 pr-4 sm:pr-10">
      <AgentMark />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          <span className="text-small font-bold text-slate-800">{m.author}</span>
          {m.role === 'auto' && <Tag>자동</Tag>}
          {m.role === 'peer' && <Tag>팀원</Tag>}
          <span className={`${TEXT.meta} tabular-nums`}>{time}</span>
        </p>
        {m.body && <Body text={m.body} className="mt-1 text-slate-800" />}
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
        {/* 답 밑 한 줄 — 한 일(할 일 · 메일 · 목표 · 방향 · 업무 정의 · 메모 · 팀원에게 남김) · 고리 · 복사 · 걸린 시간과 비용 */}
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          {did.map((d) => <Tag key={d} tone="ok">{d}</Tag>)}
          {m.role === 'auto' && m.meta?.site && (
            <Link href={`/projects/${encodeURIComponent(m.meta.site.id)}?tab=intake`} className={`text-small font-bold ${LINK}`}>
              현장 보기 →
            </Link>
          )}
          {/* 정기 알림(열린구매 상신)이 짚는 화면 — 「거래명세서 보기 →」 */}
          {m.role === 'auto' && m.meta?.link && (
            <Link href={m.meta.link.href} className={`text-small font-bold ${LINK}`}>{m.meta.link.label}</Link>
          )}
          {m.role === 'peer' && m.meta?.from && (
            <Link href={`${team}/${encodeURIComponent(m.meta.from.id)}`} className={`text-small font-bold ${LINK}`}>
              {m.meta.from.name} 보기 →
            </Link>
          )}
          {m.role === 'agent' && m.body && <CopyBtn text={m.body} />}
          {(secs !== null || m.meta?.usd !== undefined) && (
            <span className={`${TEXT.meta} tabular-nums`}>
              {[secs !== null ? `${secs}초` : null, m.meta?.usd !== undefined ? `$${m.meta.usd.toFixed(2)}` : null].filter(Boolean).join(' · ')}
            </span>
          )}
        </div>
      </div>
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

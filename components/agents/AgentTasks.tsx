'use client';

/**
 * 할 일 — 한백이 적거나, 대화 중에 에이전트가 적는다(에이전트가 적은 것은 반짝이와 이름 꼬리표가 붙는다).
 *
 * ★콘솔이 이미 세는 할 일(반려 보완 · 확정 누락 · 기성 수금 …)은 여기 베끼지 않는다★ — 그것은 /todos 와 보드가 정본이고,
 * 에이전트는 그 정본을 그때그때 읽는다. 여기는 그 밖의 일이다: 운영사 담당자에게 회신 받기, 다음 주에 다시 확인하기 같은 것.
 * 끝내면 아래 「끝낸 일」로 내려가고, 「되살리기」로 되돌린다(화면 규칙 7).
 */
import Link from 'next/link';
import { useState } from 'react';
import type { AgentTask } from '@/types/agents';
import { useAction } from '@/lib/use-action';
import { Btn, Err, FIELD, FIELD_BASE, PANEL, Tag, TEXT } from '@/components/ui';
import { AgentHead, LINK, Spark } from './kit';

export function AgentTasks({ agentId, agentName, tasks, sites, today }: {
  agentId: string;
  agentName: string;
  tasks: AgentTask[];
  /** 고를 수 있는 현장 — 운영사 담당만, 나머지는 빈 목록 */
  sites: Array<{ id: string; label: string }>;
  today: string;
}) {
  const open = tasks.filter((t) => !t.doneAt);
  const closed = tasks.filter((t) => t.doneAt);
  const [showClosed, setShowClosed] = useState(false);

  return (
    <section className={`${PANEL} flex flex-col gap-3 p-5`}>
      <AgentHead meta={`열린 ${open.length}건`}>할 일</AgentHead>
      <TaskForm agentId={agentId} sites={sites} />
      {open.length > 0 && (
        <ul className="flex flex-col divide-y divide-slate-100">
          {open.map((t) => <TaskItem key={t.id} agentId={agentId} agentName={agentName} task={t} today={today} />)}
        </ul>
      )}
      {closed.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-slate-100 pt-2">
          <Btn size="sm" kind="quiet" className="self-start" onClick={() => setShowClosed((v) => !v)}>
            끝낸 일 {closed.length}건 {showClosed ? '접기' : '보기'}
          </Btn>
          {showClosed && (
            <ul className="flex flex-col divide-y divide-slate-100">
              {closed.map((t) => <TaskItem key={t.id} agentId={agentId} agentName={agentName} task={t} today={today} />)}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function TaskForm({ agentId, sites }: { agentId: string; sites: Array<{ id: string; label: string }> }) {
  const { busy, error, run } = useAction();
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [site, setSite] = useState('');

  async function add() {
    const ok = await run({
      url: `/api/agents/${agentId}/tasks`,
      body: { title, due: due || null, projectId: site || null },
      fail: '적지 못했습니다.',
    });
    if (ok) {
      setTitle('');
      setDue('');
      setSite('');
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && title.trim() && !busy) void add(); }}
        maxLength={120}
        placeholder="할 일"
        className={FIELD}
      />
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="기한" className={`${FIELD_BASE} w-40`} />
        {sites.length > 0 && (
          <select value={site} onChange={(e) => setSite(e.target.value)} aria-label="현장" className={`${FIELD_BASE} min-w-0 max-w-full flex-1`}>
            <option value="">현장 없음</option>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        )}
        <Btn size="sm" disabled={!title.trim()} busy={busy} busyLabel="적는 중…" onClick={() => void add()}>적기</Btn>
        <Err>{error}</Err>
      </div>
    </div>
  );
}

function TaskItem({ agentId, agentName, task: t, today }: { agentId: string; agentName: string; task: AgentTask; today: string }) {
  const { busyKey, error, run } = useAction();
  const [asking, setAsking] = useState(false);
  const late = !t.doneAt && t.due !== null && t.due < today;

  const toggle = () => void run({
    url: `/api/agents/${agentId}/tasks/${t.id}`, method: 'PATCH', body: { done: !t.doneAt }, fail: '바꾸지 못했습니다.', key: 'done',
  });
  const remove = () => void run({ url: `/api/agents/${agentId}/tasks/${t.id}`, method: 'DELETE', fail: '지우지 못했습니다.', key: 'del' });

  return (
    <li className="flex flex-col gap-1 py-2">
      <div className="flex items-start gap-2">
        {!t.doneAt && (
          <input
            type="checkbox"
            checked={false}
            disabled={busyKey !== null}
            onChange={toggle}
            aria-label={`${t.title} 끝냄`}
            className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-brand-600"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className={`break-keep text-base font-semibold ${t.doneAt ? 'text-slate-500 line-through' : 'text-slate-900'}`}>{t.title}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {t.due && (late
              ? <Tag tone="stop">기한 {t.due} 지남</Tag>
              : <span className={`${TEXT.meta} tabular-nums`}>기한 {t.due}</span>)}
            {t.projectId && t.projectName && (
              <Link href={`/projects/${t.projectId}`} className={`text-tiny ${LINK}`}>{t.projectName}</Link>
            )}
            {t.byAgent ? (
              <Tag tone="ok"><Spark className="mr-0.5 inline h-2.5 w-2.5 align-[-1px]" />{agentName}</Tag>
            ) : <span className={TEXT.meta}>{t.author}</span>}
            {t.doneAt && <span className={`${TEXT.meta} tabular-nums`}>끝냄 {t.doneAt}</span>}
          </div>
          {t.note && <p className="mt-1 whitespace-pre-wrap break-keep text-small text-slate-600">{t.note}</p>}
        </div>
        <span className="ml-auto flex shrink-0 items-center gap-1">
          {t.doneAt && <Btn size="sm" kind="quiet" busy={busyKey === 'done'} busyLabel="…" onClick={toggle}>되살리기</Btn>}
          {asking ? (
            <>
              <Btn size="sm" kind="undo" busy={busyKey === 'del'} busyLabel="삭제 중…" onClick={remove}>삭제합니다</Btn>
              <Btn size="sm" kind="quiet" disabled={busyKey !== null} onClick={() => setAsking(false)}>취소</Btn>
            </>
          ) : (
            <Btn size="sm" kind="undo" onClick={() => setAsking(true)}>삭제</Btn>
          )}
        </span>
      </div>
      <Err>{error}</Err>
    </li>
  );
}

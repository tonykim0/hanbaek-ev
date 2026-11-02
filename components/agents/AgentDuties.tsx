'use client';

/**
 * 업무 정의 — 한백이 담당마다 적는다(한백 지시 2026-11-02 「그 업무들에 대한 정의도 내가 담당자별로 지정할거야」).
 * 에이전트는 이것을 지시로 읽는다(lib/agents/brain). 평소엔 글자, 「수정」을 눌러야 칸이 열린다(화면 규칙 4).
 */
import { useState } from 'react';
import type { AgentDuty } from '@/types/agents';
import { useAction } from '@/lib/use-action';
import { Btn, Err, FIELD, PANEL } from '@/components/ui';
import { AgentHead } from './kit';

export function AgentDuties({ agentId, duties }: { agentId: string; duties: AgentDuty[] }) {
  const [adding, setAdding] = useState(false);
  return (
    <section className={`${PANEL} flex flex-col gap-3 p-5`}>
      <AgentHead
        meta={`${duties.length}건`}
        action={!adding && <Btn size="sm" kind="quiet" onClick={() => setAdding(true)}>추가</Btn>}
      >
        업무 정의
      </AgentHead>
      {adding && <DutyForm agentId={agentId} onDone={() => setAdding(false)} />}
      {duties.length > 0 && (
        <ol className="flex flex-col divide-y divide-slate-100">
          {duties.map((d, i) => <DutyItem key={d.id} agentId={agentId} duty={d} n={i + 1} />)}
        </ol>
      )}
    </section>
  );
}

function DutyItem({ agentId, duty, n }: { agentId: string; duty: AgentDuty; n: number }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <li className="py-2.5">
        <DutyForm agentId={agentId} duty={duty} onDone={() => setEditing(false)} />
      </li>
    );
  }
  return (
    <li className="flex flex-col gap-1 py-2.5">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-tiny font-bold tabular-nums text-brand-600">{String(n).padStart(2, '0')}</span>
        <p className="min-w-0 flex-1 break-keep text-base font-bold text-slate-900">{duty.title}</p>
        <Btn size="sm" kind="quiet" onClick={() => setEditing(true)}>수정</Btn>
      </div>
      {duty.body.trim() && <p className="whitespace-pre-wrap break-keep pl-6 text-small leading-relaxed text-slate-600">{duty.body}</p>}
    </li>
  );
}

function DutyForm({ agentId, duty, onDone }: { agentId: string; duty?: AgentDuty; onDone: () => void }) {
  const { busyKey, error, run } = useAction();
  const [title, setTitle] = useState(duty?.title ?? '');
  const [body, setBody] = useState(duty?.body ?? '');
  const [asking, setAsking] = useState(false);

  async function save() {
    const ok = await run({
      url: `/api/agents/${agentId}/duties`,
      body: { ...(duty ? { id: duty.id } : {}), title, body },
      fail: '저장하지 못했습니다.',
      key: 'save',
    });
    if (ok) onDone();
  }

  async function remove() {
    if (!duty) return;
    const ok = await run({ url: `/api/agents/${agentId}/duties/${duty.id}`, method: 'DELETE', fail: '지우지 못했습니다.', key: 'del' });
    if (ok) onDone();
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={60}
        placeholder="업무 이름"
        className={FIELD}
        autoFocus
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={5}
        placeholder="정의 — 무엇을, 언제, 어떤 기준으로, 결과는 어떤 모양으로"
        className={`${FIELD} resize-y leading-relaxed`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Btn size="sm" disabled={!title.trim() || busyKey !== null} busy={busyKey === 'save'} busyLabel="저장 중…" onClick={() => void save()}>
          {duty ? '저장' : '추가'}
        </Btn>
        <Btn size="sm" kind="quiet" disabled={busyKey !== null} onClick={onDone}>취소</Btn>
        <Err>{error}</Err>
        {duty && (
          <span className="ml-auto flex items-center gap-1">
            {asking ? (
              <>
                <Btn size="sm" kind="undo" busy={busyKey === 'del'} busyLabel="삭제 중…" onClick={() => void remove()}>삭제합니다</Btn>
                <Btn size="sm" kind="quiet" disabled={busyKey !== null} onClick={() => setAsking(false)}>취소</Btn>
              </>
            ) : (
              <Btn size="sm" kind="undo" onClick={() => setAsking(true)}>삭제</Btn>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

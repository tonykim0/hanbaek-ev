'use client';

/**
 * 정산 담당이 아지트에 글을 올리는 자리 두 줄 — 「아지트 연결」(열린구매 그룹의 웹훅)과 「요청 담당」(요청 글의 담당자 아지트 ID).
 * 정산 담당 화면 머리말의 「보내는 메일」 밑이다(메일 연결과 같은 모양 — components/agents/MailAccount).
 * (한백 2026-11-08 「이걸 정산담당 에이전트가 처리해야하는거야」 — 거래명세서 화면 맨 아래에 있던 것을 이리로 옮겼다)
 *
 * 연결은 웹훅 주소를 붙여 넣는다. 주소가 곧 열쇠라 가린 칸이고 다시 보여 주지 않는다. 요청 담당은 한 번 정해 두고 모든 글에 붙인다
 * (쉼표로 여럿 · 비우면 지운다 — 화면 규칙 7). ★둘은 따로다★ — 담당은 연결 전에도 넣고 끊어도 남는다(한백 「담당자는 미리
 * 넣어둘수없나」). 둘 중 하나라도 비면 초안 카드의 단추가 그 까닭을 말한다.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { assigneesLabel, type AgitHookInfo } from '@/lib/agit/post';
import { Btn, Err, FIELD_BASE, Tag, TEXT } from '@/components/ui';

async function send(method: 'PUT' | 'PATCH' | 'DELETE', body?: unknown): Promise<string | null> {
  try {
    const res = await fetch('/api/agit/hook', {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.ok) return null;
    const json = (await res.json().catch(() => ({}))) as { error?: unknown };
    return typeof json.error === 'string' ? json.error : '처리하지 못했습니다.';
  } catch {
    return '네트워크 오류입니다. 다시 시도해주세요.';
  }
}

function HookRow({ hook }: { hook: AgitHookInfo }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState<null | 'connect' | 'disconnect'>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(method: 'PUT' | 'DELETE') {
    setBusy(method === 'PUT' ? 'connect' : 'disconnect');
    setError(null);
    const err = await send(method, method === 'PUT' ? { url } : undefined);
    setBusy(null);
    if (err) return setError(err);
    setOpen(false);
    setUrl('');
    router.refresh();
  }

  if (open) {
    return (
      <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); void call('PUT'); }}>
        <span className={TEXT.label}>아지트 연결</span>
        <input
          type="password"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://agit.io/webhook/…"
          autoComplete="off"
          className={`${FIELD_BASE} w-80`}
        />
        <Btn size="sm" type="submit" disabled={!url.trim()} busy={busy === 'connect'} busyLabel="연결 중…">연결</Btn>
        <Btn size="sm" kind="quiet" disabled={busy !== null} onClick={() => { setOpen(false); setError(null); setUrl(''); }}>취소</Btn>
        <Err>{error}</Err>
      </form>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
      <span className={TEXT.label}>아지트 연결</span>
      {hook.connected ? (
        <>
          <span className="text-small font-bold text-slate-800">열린구매 그룹 웹훅</span>
          <span className={`${TEXT.meta} tabular-nums`}>연결 {hook.connectedAt?.slice(0, 10)} · {hook.connectedBy}</span>
          <Btn size="sm" kind="quiet" onClick={() => setOpen(true)}>다시 연결</Btn>
          <Btn size="sm" kind="undo" busy={busy === 'disconnect'} busyLabel="끊는 중…" onClick={() => void call('DELETE')}>연결 끊기</Btn>
        </>
      ) : (
        <>
          <Tag tone="warn">미지정</Tag>
          <Btn size="sm" kind="side" onClick={() => setOpen(true)}>아지트 연결</Btn>
        </>
      )}
      <Err>{error}</Err>
    </div>
  );
}

function AssigneeRow({ hook }: { hook: AgitHookInfo }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = hook.assignees;

  async function save() {
    setBusy(true);
    setError(null);
    const err = await send('PATCH', { assignees: value });
    setBusy(false);
    if (err) return setError(err);
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
      <span className={TEXT.label}>요청 담당</span>
      {open ? (
        <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); void save(); }}>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="아지트 ID — kiko.x, ella.a"
            autoComplete="off"
            autoFocus
            className={`${FIELD_BASE} w-64`}
          />
          <Btn size="sm" type="submit" busy={busy} busyLabel="저장 중…">저장</Btn>
          <Btn size="sm" kind="quiet" disabled={busy} onClick={() => { setOpen(false); setError(null); }}>취소</Btn>
        </form>
      ) : (
        <>
          {ids.length ? (
            <span className="text-small font-bold text-slate-800">{assigneesLabel(ids)}</span>
          ) : (
            <Tag tone="warn">미지정</Tag>
          )}
          <Btn size="sm" kind={ids.length ? 'quiet' : 'side'} onClick={() => { setValue(ids.join(', ')); setError(null); setOpen(true); }}>
            {ids.length ? '바꾸기' : '담당자 지정'}
          </Btn>
        </>
      )}
      <Err>{error}</Err>
    </div>
  );
}

export function AgitAccount({ hook }: { hook: AgitHookInfo }) {
  return (
    <div className="flex flex-col gap-1.5">
      <HookRow hook={hook} />
      <AssigneeRow hook={hook} />
    </div>
  );
}

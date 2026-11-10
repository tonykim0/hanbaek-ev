'use client';

/**
 * 정산 담당이 아지트에 글을 올리는 자리 두 줄 — 「아지트 계정」(한백의 아지트 로그인)과 「요청 담당」(요청 글의 담당자 아지트 ID).
 * 정산 담당 화면 머리말의 「보내는 메일」 밑이다(메일 연결과 같은 모양 — components/agents/MailAccount).
 *
 * ★정산 담당이 이 계정으로 올린다★(한백 2026-11-10 「에이전트가 직접 하게끔 하고싶어」 — lib/agit/publish). 연결은 아지트 ID(또는 이메일)와
 * 비밀번호를 넣으면 서버 브라우저가 아지트에 로그인해 보고 열린구매 그룹의 쓰는 칸까지 열어 본 뒤 그 로그인만 쥔다(app/api/agit/account —
 * 비밀번호는 남기지 않는다). 아지트 로그인은 석 달쯤 간다 — 끝나는 날을 곁에 적고, 올리다가 풀린 것을 알면 「로그인 풀림」으로 선다.
 * 11-08 의 「아지트 연결」(웹훅 주소)은 걷었다 — 봇 글은 한백이 고칠 수 없고 파일을 못 붙였다.
 * 요청 담당은 한 번 정해 두고 모든 글에 붙인다(쉼표로 여럿 · 비우면 지운다 — 화면 규칙 7). ★둘은 따로다★ — 담당은 연결 전에도 넣고 끊어도
 * 남는다(한백 「담당자는 미리 넣어둘수없나」). 둘 중 하나라도 비면 초안 카드의 단추가 그 까닭을 말한다.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { assigneesLabel, type AgitHookInfo } from '@/lib/agit/post';
import { Btn, Err, FIELD_BASE, Tag, TEXT } from '@/components/ui';

async function send(url: string, method: 'PUT' | 'PATCH' | 'DELETE', body?: unknown): Promise<string | null> {
  try {
    const res = await fetch(url, {
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

function AccountRow({ hook }: { hook: AgitHookInfo }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<null | 'connect' | 'disconnect'>(null);
  const [error, setError] = useState<string | null>(null);

  async function connect() {
    setBusy('connect');
    setError(null);
    const err = await send('/api/agit/account', 'PUT', { login, password });
    setBusy(null);
    /* 비밀번호는 화면에도 남기지 않는다 — 되든 안 되든 비운다 */
    setPassword('');
    if (err) return setError(err);
    setOpen(false);
    router.refresh();
  }

  async function disconnect() {
    setBusy('disconnect');
    setError(null);
    const err = await send('/api/agit/account', 'DELETE');
    setBusy(null);
    if (err) return setError(err);
    router.refresh();
  }

  if (open) {
    return (
      <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); void connect(); }}>
        <span className={TEXT.label}>아지트 계정</span>
        <input
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          placeholder="아지트 ID 또는 이메일"
          autoComplete="off"
          autoFocus
          className={`${FIELD_BASE} w-52`}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="아지트 비밀번호"
          autoComplete="off"
          className={`${FIELD_BASE} w-44`}
        />
        <Btn size="sm" type="submit" disabled={!login.trim() || !password} busy={busy === 'connect'} busyLabel="아지트에 로그인해 보는 중…">
          연결
        </Btn>
        <Btn size="sm" kind="quiet" disabled={busy !== null} onClick={() => { setOpen(false); setError(null); setPassword(''); }}>취소</Btn>
        <Err>{error}</Err>
      </form>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
      <span className={TEXT.label}>아지트 계정</span>
      {hook.login ? (
        <>
          <span className="text-small font-bold text-slate-800">{hook.login}</span>
          {hook.expired ? (
            <Tag tone="stop">로그인 풀림</Tag>
          ) : (
            <span className={`${TEXT.meta} tabular-nums`}>
              연결 {hook.connectedAt?.slice(0, 10)} · {hook.connectedBy}{hook.until ? ` · 로그인 ${hook.until}까지` : ''}
            </span>
          )}
          <Btn size="sm" kind={hook.expired ? 'side' : 'quiet'} onClick={() => { setLogin(hook.login ?? ''); setError(null); setOpen(true); }}>
            다시 연결
          </Btn>
          <Btn size="sm" kind="undo" busy={busy === 'disconnect'} busyLabel="끊는 중…" onClick={() => void disconnect()}>연결 끊기</Btn>
        </>
      ) : (
        <>
          <Tag tone="warn">미지정</Tag>
          <Btn size="sm" kind="side" onClick={() => { setLogin(''); setError(null); setOpen(true); }}>아지트 계정 연결</Btn>
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
    const err = await send('/api/agit/hook', 'PATCH', { assignees: value });
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
      <AccountRow hook={hook} />
      <AssigneeRow hook={hook} />
    </div>
  );
}

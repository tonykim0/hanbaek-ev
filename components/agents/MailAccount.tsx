'use client';

/**
 * 콘솔이 메일을 보내는 계정 한 줄 — 한백의 다음(카카오) 메일(한백 2026-11-03 「내 다음카카오 이메일로만 보내면 되는거고」).
 *
 * 연결돼 있으면 주소와 「다시 연결」 · 「연결 끊기」, 아니면 「미지정」과 「메일 연결」. 연결은 그 자리에서 칸이 열린다(화면 규칙 4) —
 * 메일 주소와 카카오 앱 비밀번호를 넣고 「연결」을 누르면 서버가 다음 메일 서버에 실제로 로그인해 보고, 되면 저장한다. 안 되면 그 까닭이
 * 단추 옆에 뜬다(규칙 9). 앱 비밀번호 칸은 가린 칸이고, 저장된 비밀번호는 다시 보여 주지 않는다. 끊어도 초안은 남는다(규칙 7).
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MailAccountInfo } from '@/types/agents';
import type { Biz } from '@/lib/biz';
import { Btn, Err, FIELD_BASE, Tag, TEXT } from '@/components/ui';

/** @param biz 그 사업의 보내는 메일 — 전기차 · 태양광이 따로 연결한다(store/agent-mail, 2026-11-04) */
export function MailAccount({ account, biz }: { account: MailAccountInfo | null; biz: Biz }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(account?.email ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<null | 'connect' | 'disconnect'>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(method: 'POST' | 'DELETE') {
    setBusy(method === 'POST' ? 'connect' : 'disconnect');
    setError(null);
    try {
      const res = await fetch('/api/agents/mail-account', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(method === 'POST' ? { email, password, biz } : { biz }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? '처리하지 못했습니다.');
      } else {
        setOpen(false);
        setPassword('');
        router.refresh();
      }
    } catch {
      setError('네트워크 오류입니다. 다시 시도해주세요.');
    }
    setBusy(null);
  }

  if (open) {
    return (
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => { e.preventDefault(); void call('POST'); }}
      >
        <span className={TEXT.label}>보내는 메일</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="메일 주소"
          autoComplete="username"
          className={`${FIELD_BASE} w-60`}
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="카카오 앱 비밀번호"
          autoComplete="new-password"
          className={`${FIELD_BASE} w-48`}
        />
        <Btn size="sm" type="submit" disabled={!email.trim() || !password.trim()} busy={busy === 'connect'} busyLabel="로그인해 보는 중…">
          연결
        </Btn>
        <Btn size="sm" kind="quiet" disabled={busy !== null} onClick={() => { setOpen(false); setError(null); setPassword(''); }}>취소</Btn>
        <Err>{error}</Err>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
      <span className={TEXT.label}>보내는 메일</span>
      {account ? (
        <>
          <span className="text-small font-bold text-slate-800">{account.email}</span>
          <span className={`${TEXT.meta} tabular-nums`}>연결 {account.connectedAt.slice(0, 10)}</span>
          <Btn size="sm" kind="quiet" onClick={() => { setEmail(account.email); setOpen(true); }}>다시 연결</Btn>
          <Btn size="sm" kind="undo" busy={busy === 'disconnect'} busyLabel="끊는 중…" onClick={() => void call('DELETE')}>연결 끊기</Btn>
        </>
      ) : (
        <>
          <Tag tone="warn">미지정</Tag>
          <Btn size="sm" kind="side" onClick={() => setOpen(true)}>메일 연결</Btn>
        </>
      )}
      <Err>{error}</Err>
    </div>
  );
}

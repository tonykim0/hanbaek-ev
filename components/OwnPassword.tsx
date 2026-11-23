'use client';

/**
 * 내 비밀번호 바꾸기 — 칸 셋(현재 · 새 · 새 확인)과 단추 하나. 화면은 app/(console)/account/password.
 *
 * 단추 이름이 못 바꾸는 까닭이다(화면 규칙 3 · lib/auth/own-password ownPasswordBlocker — 서버도 같은 판정).
 * 칸은 가려 두고 「보이기」로 셋을 같이 연다 — 새 비밀번호를 두 번 치다 오타가 나면 같은 일을 반복한다.
 * 비밀번호 관리기가 어느 계정의 비밀번호인지 알도록 로그인 ID 를 숨은 칸(username)으로 같이 싣는다.
 * 되면 칸을 비우고 그 자리에 「바꿨습니다」를 둔다(사라지지 않는다 — 규칙 9). 이 기기는 그대로 들어와 있고 다른 기기는 다시 로그인한다.
 */
import { useState } from 'react';
import { useAction } from '@/lib/use-action';
import { ownPasswordBlocker } from '@/lib/auth/own-password';
import { PASSWORD_MIN_LEN } from '@/lib/auth/types';
import { Btn, Err, FIELD, PANEL, Saved, TEXT } from '@/components/ui';

export default function OwnPassword({ loginId }: { loginId: string }) {
  const { busy, error, run } = useAction();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [show, setShow] = useState(false);
  const [done, setDone] = useState(false);

  const block = ownPasswordBlocker({ current, next, loginId, again });
  const type = show ? 'text' : 'password';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (block) return;
    const ok = await run({
      url: '/api/auth/password',
      body: { current, next },
      fail: '비밀번호를 바꾸지 못했습니다.',
    });
    if (!ok) return;
    setCurrent('');
    setNext('');
    setAgain('');
    setDone(true);
  }

  // 다시 치기 시작하면 지난 「바꿨습니다」는 걷는다 — 지금 칸의 값과 상관없는 말이 남지 않게
  const typing = (set: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    set(e.target.value);
    setDone(false);
  };

  return (
    <form onSubmit={submit} className={`flex flex-col gap-4 ${PANEL} p-5`}>
      <input type="text" name="username" autoComplete="username" value={loginId} readOnly hidden />
      <Field label="현재 비밀번호">
        <input type={type} value={current} onChange={typing(setCurrent)} autoComplete="current-password" className={FIELD} />
      </Field>
      <Field label="새 비밀번호" hint={`${PASSWORD_MIN_LEN}자 이상 · 아이디와 다르게`}>
        <input type={type} value={next} onChange={typing(setNext)} autoComplete="new-password" className={FIELD} />
      </Field>
      <Field label="새 비밀번호 확인">
        <input type={type} value={again} onChange={typing(setAgain)} autoComplete="new-password" className={FIELD} />
      </Field>
      <div className="flex flex-wrap items-center gap-2.5">
        <Btn type="submit" disabled={!!block} busy={busy} busyLabel="바꾸는 중…">
          {block ?? '비밀번호 바꾸기'}
        </Btn>
        <Btn kind="quiet" size="sm" aria-pressed={show} onClick={() => setShow((v) => !v)}>
          {show ? '가리기' : '보이기'}
        </Btn>
        <Err>{error}</Err>
        {done && <Saved>비밀번호를 바꿨습니다 — 다른 기기는 다시 로그인합니다.</Saved>}
      </div>
    </form>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={`mb-1 block ${TEXT.label}`}>{label}</span>
      {children}
      {hint && <span className={`mt-1 block ${TEXT.meta}`}>{hint}</span>}
    </label>
  );
}

'use client';

/**
 * 콘솔이 메일을 보내는 계정 한 줄 — 연결돼 있으면 주소와 「다시 연결」 · 「연결 끊기」, 아니면 「미지정」과 「Gmail 연결」.
 * 연결은 구글 로그인이다(/api/agents/gmail/connect → 구글 동의 → callback). 돌아오면 주소에 결과가 붙어 온다 —
 * 실패면 그 까닭을 이 줄 옆에 띄운다(화면 규칙 9). 끊어도 초안은 남고, 다시 연결하면 보낸다(규칙 7).
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MailAccountInfo } from '@/types/agents';
import { Btn, BtnLink, Err, Tag, TEXT } from '@/components/ui';

export function MailAccount({ account, back, error }: {
  account: MailAccountInfo | null;
  /** 연결을 마치고 돌아올 화면 */
  back: string;
  /** 연결이 실패하고 돌아왔을 때 그 까닭(주소의 mail_error) */
  error: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const connect = `/api/agents/gmail/connect?back=${encodeURIComponent(back)}`;

  async function disconnect() {
    setBusy(true);
    setFailed(null);
    try {
      const res = await fetch('/api/agents/gmail', { method: 'DELETE' });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setFailed(json.error ?? '끊지 못했습니다.');
      else router.refresh();
    } catch {
      setFailed('네트워크 오류입니다. 다시 시도해주세요.');
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
      <span className={TEXT.label}>보내는 메일</span>
      {account ? (
        <>
          <span className="text-small font-bold text-slate-800">{account.email}</span>
          <span className={`${TEXT.meta} tabular-nums`}>연결 {account.connectedAt.slice(0, 10)}</span>
          <BtnLink href={connect}>다시 연결</BtnLink>
          <Btn size="sm" kind="undo" busy={busy} busyLabel="끊는 중…" onClick={() => void disconnect()}>연결 끊기</Btn>
        </>
      ) : (
        <>
          <Tag tone="warn">미지정</Tag>
          <BtnLink kind="side" href={connect}>Gmail 연결</BtnLink>
        </>
      )}
      <Err>{failed ?? error}</Err>
    </div>
  );
}

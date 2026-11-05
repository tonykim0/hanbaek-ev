'use client';

/**
 * 메일 초안 한 통 — 담당이 올린 초안이 그것을 쓴 답 밑에 선다. ★한백이 「승인하고 보내기」를 눌러야 나간다★
 * (한백 2026-11-03 「난 그거에 대해 승인을 하고 너가 메일을 보내는건데」).
 *
 * 보내기는 되돌릴 수 없어서 한 번 더 묻는다 — 받는 사람을 다시 보여 주고 빨간 「보내기」로 확정한다(ui.tsx Confirm · 화면 규칙 12).
 * 고치기는 누를 때만 칸이 열린다(규칙 4) · 버리기는 줄의 반대쪽 끝이다(규칙 8) · 버린 것은 되살린다(규칙 7). 보내는 메일이 연결되지
 * 않았으면 단추 이름이 그 까닭을 말한다(규칙 3) — 연결하는 자리는 머리말 밑 「보내는 메일」 한 줄이다(같은 단추를 두 번 두지 않는다).
 * 모양은 띠다 — 판 안이라 사방 테두리를 두르지 않는다(규칙 1). 승인 대기는 노랑, 보냄은 초록, 보내지 못함은 빨강 선이다 —
 * 선 · 바탕은 ui.tsx Note 의 상태 색 그대로다(2026-11-05 콘솔 틀에 맞춤: 「보냄」이 사업 색이었다 — 태양광에서 귤색이면 「봐야 함」과 섞인다).
 */
import { useState } from 'react';
import type { AgentMail } from '@/types/agents';
import { Btn, Confirm, Err, FIELD, Tag, TEXT, type Tone } from '@/components/ui';
import { FileChip } from './kit';

const LOOK: Record<AgentMail['status'], { band: string; label: string; tone: Tone }> = {
  draft: { band: 'border-amber-500 bg-amber-50/70', label: '메일 초안 · 승인 대기', tone: 'warn' },
  sending: { band: 'border-amber-500 bg-amber-50/70', label: '메일 · 보내는 중', tone: 'warn' },
  sent: { band: 'border-ok-500 bg-ok-50/60', label: '메일 · 보냄', tone: 'ok' },
  failed: { band: 'border-red-500 bg-red-50', label: '메일 · 보내지 못함', tone: 'stop' },
  discarded: { band: 'border-slate-300 bg-slate-50', label: '메일 · 버림', tone: 'mute' },
};

async function call(url: string, method: 'POST' | 'PATCH', body?: unknown): Promise<{ mail?: AgentMail; error?: string }> {
  try {
    const res = await fetch(url, {
      method,
      ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
    });
    const json = (await res.json().catch(() => ({}))) as { mail?: AgentMail; error?: string };
    if (!res.ok || !json.mail) return { error: json.error ?? '처리하지 못했습니다.' };
    return { mail: json.mail };
  } catch {
    return { error: '네트워크 오류입니다. 다시 시도해주세요.' };
  }
}

export function MailCard({ agentId, mail, connected, onChange, indent = true }: {
  agentId: string;
  /** 대화에서는 담당의 표지 폭만큼 들여 그 답의 글줄에 맞춘다(AgentRoom — 표지 32px + 틈 12px) — 현장 화면에서는 들여쓰지 않는다 */
  indent?: boolean;
  mail: AgentMail;
  /** 콘솔에 보내는 메일이 연결돼 있는가 */
  connected: boolean;
  onChange: (mail: AgentMail) => void;
}) {
  const [busy, setBusy] = useState<null | 'send' | 'save' | 'discard' | 'restore'>(null);
  const [asking, setAsking] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ to: '', cc: '', subject: '', body: '' });
  const look = LOOK[mail.status];
  const base = `/api/agents/${agentId}/mails/${mail.id}`;
  const open = mail.status === 'draft' || mail.status === 'failed';

  async function run(kind: 'send' | 'save' | 'discard' | 'restore') {
    setBusy(kind);
    setError(null);
    const r = kind === 'send'
      ? await call(`${base}/send`, 'POST')
      : kind === 'save'
        ? await call(base, 'PATCH', { action: 'edit', ...form })
        : await call(base, 'PATCH', { action: kind });
    setBusy(null);
    if (kind === 'send') setAsking(false);
    if (r.mail) {
      onChange(r.mail);
      if (kind === 'save') setEditing(false);
    }
    if (r.error) setError(r.error);
  }

  function edit() {
    setForm({ to: mail.to.join(', '), cc: mail.cc.join(', '), subject: mail.subject, body: mail.body });
    setError(null);
    setEditing(true);
  }

  const who = [mail.to.join(', '), mail.cc.length ? `참조 ${mail.cc.join(', ')}` : ''].filter(Boolean).join(' · ');

  return (
    <li className={`${indent ? 'ml-11 ' : ''}rounded-box border-l-[3px] px-3.5 py-3 ${look.band}`}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Tag tone={look.tone}>{look.label}</Tag>
        <span className={`${TEXT.meta} tabular-nums`}>{mail.createdAt}</span>
        {mail.files.length > 0 && <span className={TEXT.meta}>첨부 {mail.files.length}</span>}
      </div>

      {editing ? (
        <div className="mt-2 flex flex-col gap-2">
          <MailField label="받는 사람">
            <input value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} className={FIELD} placeholder="쉼표로 여럿" />
          </MailField>
          <MailField label="참조">
            <input value={form.cc} onChange={(e) => setForm({ ...form, cc: e.target.value })} className={FIELD} />
          </MailField>
          <MailField label="제목">
            <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className={FIELD} />
          </MailField>
          <textarea
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            rows={10}
            className={`${FIELD} resize-y leading-relaxed`}
          />
        </div>
      ) : (
        <>
          <dl className="mt-2 grid grid-cols-[64px_minmax(0,1fr)] gap-x-3 gap-y-1">
            <dt className={TEXT.label}>받는 사람</dt>
            <dd className="break-all text-small font-semibold text-slate-800">{mail.to.length ? mail.to.join(', ') : <Tag tone="warn">미지정</Tag>}</dd>
            {mail.cc.length > 0 && (
              <>
                <dt className={TEXT.label}>참조</dt>
                <dd className="break-all text-small text-slate-700">{mail.cc.join(', ')}</dd>
              </>
            )}
            <dt className={TEXT.label}>제목</dt>
            <dd className="break-keep text-small font-bold text-slate-900">{mail.subject}</dd>
          </dl>
          <p className="mt-2 whitespace-pre-wrap break-keep rounded-box bg-white px-3 py-2 text-base leading-relaxed text-slate-800">
            {mail.body}
          </p>
        </>
      )}

      {mail.files.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {mail.files.map((f) => <FileChip key={f.id} file={f} />)}
        </div>
      )}

      {mail.status === 'sent' && (
        <p className={`mt-2 ${TEXT.meta} tabular-nums`}>
          {mail.sentAt} 보냄 · {mail.from}{mail.sentBy ? ` · 승인 ${mail.sentBy}` : ''}
        </p>
      )}
      {mail.status === 'failed' && mail.error && !error && <Err className="mt-2 block">{mail.error}</Err>}

      {(open || mail.status === 'discarded') && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {open && editing && (
            <>
              <Btn size="sm" busy={busy === 'save'} busyLabel="저장 중…" onClick={() => void run('save')}>저장</Btn>
              <Btn size="sm" kind="quiet" disabled={busy !== null} onClick={() => setEditing(false)}>취소</Btn>
            </>
          )}
          {open && !editing && (
            <>
              <Btn size="sm" disabled={!connected || mail.to.length === 0 || busy !== null} onClick={() => { setError(null); setAsking(true); }}>
                {!connected ? '메일 연결 전 — 보낼 수 없음'
                  : mail.to.length === 0 ? '받는 사람 미지정 — 보낼 수 없음'
                    : mail.status === 'failed' ? '다시 보내기' : '승인하고 보내기'}
              </Btn>
              <Btn size="sm" kind="quiet" disabled={busy !== null} onClick={edit}>고치기</Btn>
            </>
          )}
          {mail.status === 'discarded' && (
            <Btn size="sm" kind="quiet" busy={busy === 'restore'} busyLabel="되살리는 중…" onClick={() => void run('restore')}>되살리기</Btn>
          )}
          <Err>{error}</Err>
          {open && !editing && (
            <Btn size="sm" kind="undo" className="ml-auto" busy={busy === 'discard'} busyLabel="버리는 중…" onClick={() => void run('discard')}>
              버리기
            </Btn>
          )}
        </div>
      )}

      <Confirm
        open={asking}
        title={`이 메일을 보냅니다 — ${who.length > 60 ? `${who.slice(0, 60)}…` : who}`}
        detail={mail.subject}
        confirmLabel="보내기"
        busy={busy === 'send'}
        busyLabel="보내는 중…"
        error={error}
        onConfirm={() => void run('send')}
        onCancel={() => setAsking(false)}
      />
    </li>
  );
}

function MailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-x-3">
      <span className={TEXT.label}>{label}</span>
      {children}
    </label>
  );
}

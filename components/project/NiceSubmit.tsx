'use client';

/**
 * 나이스인프라 제출 정보 — 계약 탭 맨 밑(나이스인프라 현장만). 나이스는 계약서류와 별개로 이 줄들을 따로 받는다(한백 지시 2026-09-04).
 * 글은 lib/nice-submit 한 곳이 짓는다 — 「계약서 초안 메일」 본문과 같은 글이다.
 *
 * ★7번 「기설치 현황」은 사전현장컨설팅 결과서의 「6. 중복설치」다★ (한백 지시 2026-11-03). 결과서 칸에 파일이 들어오면 응답 뒤에
 * 저절로 읽고(lib/consult-dup-run), 한백은 「결과서에서 다시 읽기」로 지금 다시 읽는다 — 이 기능 전에 결과서를 낸 현장이 그 자리다.
 *
 * ★계약서 초안 메일★ (한백 지시 2026-11-03 「나이스인프라는 계약서 접수 시, 워드파일을 초안으로 받고 있어. 그 파일을 첨부한 메일
 * 보내고싶어」) — 누르면 「계약서 초안」 칸의 워드 파일을 붙인 초안이 나이스인프라 담당에 올라가고, 바로 밑에 카드가 선다. 한백이
 * 「승인하고 보내기」를 눌러야 나간다(components/agents/MailCard — 담당 화면의 그 카드). 받는 사람은 같은 양식으로 마지막에 보낸 주소다.
 * 한백 관리자에게만 선다(mail 이 있을 때) — 협력사는 글과 복사만 본다.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AgentMail } from '@/types/agents';
import type { ProjectDetail } from '@/types/project';
import { dupTextOf } from '@/lib/consult-dup';
import { niceSubmitText } from '@/lib/nice-submit';
import { Btn, Err, PANEL, Saved } from '@/components/ui';
import { MailCard } from '@/components/agents/MailCard';

/** 나이스인프라 담당 — 계약서 초안 메일 초안이 올라가는 자리(migrations/0109) */
const NICE_AGENT = 'op-nice';

export interface NiceMailState {
  /** 이 현장의 계약서 초안 메일 — 오래된 것이 앞 */
  mails: AgentMail[];
  /** 콘솔에 보내는 메일이 연결돼 있는가 */
  connected: boolean;
}

export function NiceSubmitInfo({
  projectId, project, lines, draftFiles, mail,
}: {
  projectId: string;
  project: ProjectDetail['project'];
  lines: ProjectDetail['lines'];
  /** 「계약서 초안」 칸의 파일 수 — 없으면 메일 단추가 그 까닭을 말한다 */
  draftFiles: number;
  /** 한백 관리자에게만 — 계약서 초안 메일 */
  mail: NiceMailState | null;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [mails, setMails] = useState<AgentMail[]>(mail?.mails ?? []);
  const [busy, setBusy] = useState<null | 'read' | 'mail'>(null);
  const [error, setError] = useState<string | null>(null);
  const qty = lines.reduce((n, l) => n + l.qty, 0);
  const text = niceSubmitText(project, qty);
  const dup = dupTextOf(project.consultDup);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false); // 권한이 없으면 글이 그대로 보이니 손으로 긁으면 된다
    }
  }

  async function post(kind: 'read' | 'mail') {
    setBusy(kind);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/${kind === 'read' ? 'consult-dup' : 'nice-draft-mail'}`, { method: 'POST' });
      const json = (await res.json().catch(() => ({}))) as { error?: string; mail?: AgentMail };
      if (!res.ok) {
        setError(json.error ?? '처리하지 못했습니다.');
      } else if (json.mail) {
        const made = json.mail;
        setMails((l) => (l.some((m) => m.id === made.id) ? l.map((m) => (m.id === made.id ? made : m)) : [...l, made]));
      } else {
        router.refresh(); // 7번이 바뀌었다 — 서버가 다시 그린다
      }
    } catch {
      setError('네트워크 오류입니다. 다시 시도해주세요.');
    }
    setBusy(null);
  }

  /* 비어 있는 줄은 글 밖에서 말한다 — 글 안에 「미지정」을 적으면 그대로 나간다 */
  const empty = [
    project.installLoc === null && '5번(설치위치 — 머리말에서 입력)',
    dup === null && (project.consultDup?.found === false ? '7번(결과서에서 6번을 찾지 못함)' : '7번(기설치 — 결과서를 아직 못 읽음)'),
    '8번(기타)',
  ].filter(Boolean);
  const open = mails.some((m) => m.status === 'draft' || m.status === 'failed');

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <h2 className="text-h3 font-black text-slate-900">나이스인프라 제출 정보</h2>
        <Btn size="sm" kind="quiet" onClick={() => void copy()}>복사</Btn>
        {copied && <Saved>복사됨</Saved>}
      </div>
      {/*
        읽는 글이 아니라 옮길 글이라 고정폭으로 둔다 — 줄 번호가 세로로 서야 빠진 줄이 보인다.
        고를 수 있게 두 곳(단추·긁기) 다 열어 둔다.
      */}
      <pre className={`${PANEL} overflow-x-auto whitespace-pre-wrap break-all p-4 font-mono text-small leading-relaxed text-slate-800`}>
        {text}
      </pre>
      <p className="mt-1.5 text-tiny text-slate-500">{empty.join(' · ')} 비어 있습니다 — 복사한 뒤 채워 보내세요.</p>

      {mail && (
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Btn
              size="sm"
              kind="side"
              disabled={draftFiles === 0 || open || busy !== null}
              busy={busy === 'mail'}
              busyLabel="초안 올리는 중…"
              onClick={() => void post('mail')}
            >
              {draftFiles === 0 ? '계약서 초안(워드) 없음 — 메일 불가' : open ? '계약서 초안 메일 — 승인 대기 중' : '계약서 초안 메일'}
            </Btn>
            <Btn size="sm" kind="quiet" busy={busy === 'read'} busyLabel="결과서 읽는 중…" disabled={busy !== null} onClick={() => void post('read')}>
              {project.consultDup ? '결과서에서 다시 읽기' : '결과서에서 읽기'}
            </Btn>
            <Err>{error}</Err>
          </div>
          {mails.length > 0 && (
            <ul className="flex flex-col gap-2">
              {mails.map((m) => (
                <MailCard
                  key={m.id}
                  agentId={NICE_AGENT}
                  mail={m}
                  connected={mail.connected}
                  indent={false}
                  onChange={(next) => setMails((l) => l.map((x) => (x.id === next.id ? next : x)))}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

'use client';

/**
 * 아지트 열린구매 글 한 장 — 정산 담당이 올린 초안이 그 말(상신 알림 · 초안을 올린 답) 밑에 선다. ★한백이 「승인하고 올리기」를 눌러야
 * 올라간다★(한백 2026-11-08 「정산담당 에이전트가 때가 되면 초안을 올려주고, 내가 승인하면 정산담당에이전트가 아지트에 글을 올리는 구조」).
 *
 * 모양은 메일 초안 카드와 같다(components/agents/MailCard — 띠 · 상태 색 · 빨간 확정). 글은 콘솔이 거래명세서로 지은 그대로라 고치는
 * 칸이 없다. 승인하면 서버가 그때 금액으로 다시 짓고, 다르면 올리지 않고 초안을 고쳐 둔다 — 카드가 새 글로 다시 그려지고 까닭이 단추
 * 옆에 뜬다. 연결 · 요청 담당이 비었으면 단추 이름이 그 까닭을 말한다(규칙 3) — 넣는 자리는 머리말 밑 「아지트 연결」 두 줄이다.
 * ★첨부 파일 받기★(한백 2026-11-08 「개별 파일로 하나의 zip으로 다운받아서 올려」) — 구매요청간소화 엑셀 · 거래명세서 PDF · 세금계산서를
 * zip 하나로 받는다(app/api/agit/posts/[id]/files). 웹훅은 파일을 못 붙여서 한백이 아지트 글에 붙인다. 거래명세서를 서버가 그려 10~20초 걸린다.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { won } from '@/lib/format';
import { downloadBlob } from '@/lib/download';
import { assigneesLabel, payDateName, type AgitPostRecord } from '@/lib/agit/post';
import { Btn, Confirm, Err, Tag, TEXT, type Tone } from '@/components/ui';

const LOOK: Record<AgitPostRecord['status'], { band: string; label: string; tone: Tone }> = {
  draft: { band: 'border-amber-500 bg-amber-50/70', label: '아지트 글 초안 · 승인 대기', tone: 'warn' },
  sending: { band: 'border-amber-500 bg-amber-50/70', label: '아지트 글 · 올리는 중', tone: 'warn' },
  posted: { band: 'border-ok-500 bg-ok-50/60', label: '아지트 글 · 올림', tone: 'ok' },
  failed: { band: 'border-red-500 bg-red-50', label: '아지트 글 · 못 올림', tone: 'stop' },
};

export function AgitCard({ post, connected, assignees }: {
  post: AgitPostRecord;
  /** 아지트가 연결돼 있는가 */
  connected: boolean;
  /** 지금 정해 둔 요청 담당 — 올릴 때 붙는다 */
  assignees: string[];
}) {
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [zipping, setZipping] = useState(false);
  const look = LOOK[post.status];
  const open = post.status === 'draft' || post.status === 'failed';
  const blocked = !connected ? '아지트 연결 전 — 올릴 수 없음' : assignees.length === 0 ? '요청 담당 미지정 — 올릴 수 없음' : null;
  const sum = `지급 ${post.batches}건 · 공급가액 ${won(post.total)}원`;
  /* 올린 글은 그때 붙인 사람, 아직이면 지금 정해 둔 사람 */
  const who = post.status === 'posted' || post.status === 'sending' ? post.assignees : assignees;

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/agit/posts/${post.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seen: post.body }),
      });
      const json = (await res.json().catch(() => ({}))) as { post?: AgitPostRecord; error?: unknown };
      if (!res.ok) setError(typeof json.error === 'string' ? json.error : '올리지 못했습니다.');
      else if (json.post && json.post.status !== 'posted') setError(json.post.error ?? '올리지 못했습니다.');
      setAsking(false);
      /* 성공이든 실패든 다시 그린다 — 금액이 바뀌었으면 고친 초안이, 올렸으면 「올림」과 대화의 한 줄이 선다 */
      router.refresh();
    } catch {
      setError('네트워크 오류입니다. 다시 시도해주세요.');
    }
    setBusy(false);
  }

  async function bundle() {
    setZipping(true);
    setError(null);
    try {
      const res = await fetch(`/api/agit/posts/${post.id}/files`);
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: unknown };
        setError(typeof json.error === 'string' ? json.error : '첨부 파일을 받지 못했습니다.');
      } else {
        const header = res.headers.get('Content-Disposition') ?? '';
        const name = /filename\*=UTF-8''([^;]+)/.exec(header)?.[1];
        downloadBlob(await res.blob(), name ? decodeURIComponent(name) : '열린구매 첨부.zip');
      }
    } catch {
      setError('네트워크 오류입니다. 다시 시도해주세요.');
    }
    setZipping(false);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(post.body);
      setCopied(true);
    } catch {
      setError('복사하지 못했습니다 — 글을 직접 골라 복사해 주세요.');
    }
  }

  return (
    <li className={`ml-11 rounded-box border-l-[3px] px-3.5 py-3 ${look.band}`}>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <Tag tone={look.tone}>{look.label}</Tag>
        {post.again && post.status !== 'posted' && <Tag>다시 올림</Tag>}
        <span className={`${TEXT.meta} tabular-nums`}>{post.createdAt}</span>
      </div>

      <dl className="mt-2 grid grid-cols-[64px_minmax(0,1fr)] gap-x-3 gap-y-1">
        <dt className={TEXT.label}>결제일</dt>
        <dd className="text-small font-bold text-slate-900 tabular-nums">{payDateName(post.payDate)} · {sum}</dd>
        <dt className={TEXT.label}>요청 담당</dt>
        <dd className="text-small font-semibold text-slate-800">{who.length ? assigneesLabel(who) : <Tag tone="warn">미지정</Tag>}</dd>
      </dl>
      <pre className="mt-2 whitespace-pre-wrap break-keep rounded-box bg-white px-3 py-2 font-sans text-small leading-relaxed text-slate-800">
        {post.body}
      </pre>

      {post.status === 'posted' && (
        <p className={`mt-2 ${TEXT.meta} tabular-nums`}>
          {post.at} 올림 · 승인 {post.postedBy}
          {post.agitUrl && (
            <>
              {' · '}
              <a href={post.agitUrl} target="_blank" rel="noreferrer" className="font-bold text-brand-700 underline-offset-2 hover:underline">
                아지트에서 보기 →
              </a>
            </>
          )}
        </p>
      )}
      {post.status === 'failed' && post.error && !error && <Err className="mt-2 block">{post.error}</Err>}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {open && (
          <Btn size="sm" disabled={blocked !== null || busy} onClick={() => { setError(null); setAsking(true); }}>
            {blocked ?? (post.status === 'failed' ? '다시 올리기' : '승인하고 올리기')}
          </Btn>
        )}
        <Btn size="sm" kind="side" busy={zipping} busyLabel="묶는 중… (거래명세서 PDF)" onClick={() => void bundle()}>
          첨부 파일 받기 (zip)
        </Btn>
        <Btn size="sm" kind="quiet" onClick={() => void copy()}>{copied ? '복사됨' : '복사'}</Btn>
        <Err>{error}</Err>
      </div>

      <Confirm
        open={asking}
        title={`${payDateName(post.payDate)} 열린구매 글을 아지트에 올립니다`}
        detail={post.again
          ? '이 결제일에 올린 글이 있습니다 — 새 글이 하나 더 섭니다. 앞 글은 아지트에서 지워 주세요.'
          : '열린구매 그룹에 요청 글로 섭니다 — 그룹 사람들에게 보이고, 콘솔에서는 지울 수 없습니다.'}
        hint={`${sum} · 담당 ${assigneesLabel(assignees)}`}
        confirmLabel="올리기"
        busy={busy}
        busyLabel="올리는 중…"
        error={error}
        onConfirm={() => void approve()}
        onCancel={() => setAsking(false)}
      />
    </li>
  );
}

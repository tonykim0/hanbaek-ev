'use client';

/**
 * 아지트 열린구매 글 한 장 — 정산 담당이 올린 초안이 그 말(상신 알림 · 초안을 올린 답) 밑에 선다.
 * (한백 2026-11-08 「정산담당 에이전트가 때가 되면 초안을 올려주고, 내가 승인하면 … 아지트에 글을 올리는 구조」)
 *
 * ★「승인하고 올리기」 — 콘솔이 한백의 아지트 계정으로 올린다★(한백 2026-11-10 「에이전트가 직접 하게끔 하고싶어」 — 11-09 의 Claude Code 길은
 * 한백이 콘솔 밖으로 나가야 했다). 올리기는 되돌릴 수 없어서 한 번 더 묻는다(메일 카드와 같다 — 빨간 「올리기」). 누르면 콘솔이 그때 금액으로
 * 다시 지어 이 글과 견주고(다르면 올리지 않고 초안을 고쳐 둔다 — 카드가 새 글로 다시 그려진다), 같으면 「올리는 중」이 되고 서버 브라우저가
 * 글양식 · 본문 · 엑셀 캡처(그림) · 첨부 zip(진짜 첨부) · 요청 담당을 넣어 올린다(app/api/agit/publish — 1~2분). 그동안 카드는 몇 초마다 다시
 * 그려 「올림」 · 「아지트에서 보기」로 바뀐다. 대화에서 「○월 ○일 열린구매 올려」라고 해도 정산 담당이 같은 길로 올린다(agit_publish).
 * 못 하는 까닭은 단추 이름이다(화면 규칙 3) — 아지트 계정 연결 전 · 로그인 풀림 · 요청 담당 미지정.
 * 「올리는 중」이 너무 오래면(서버 함수가 끝까지 못 감) 「올리다 멈춤」 — 「작성하기」까지 갔을 수 있어 아지트를 먼저 보라고 말하고 다시 올리기를 연다.
 * 모양은 메일 초안 카드와 같다(components/agents/MailCard — 띠 · 상태 색). 글은 콘솔이 거래명세서로 지은 그대로라 고치는 칸이 없다.
 * ★첨부 파일 받기★(한백 2026-11-08 「개별 파일로 하나의 zip으로」) — 올릴 때 붙는 것과 같은 zip 을 손에 받아 본다(…/files — 10~20초).
 * ★긴급 글★(한백 2026-11-09) — 머리에 「긴급」 꼬리표 · 승인 확인에 cc 재무팀. 긴급으로 바꾸는 것은 정산 담당에게 사유와 함께 말한다.
 * ★구분★(같은 날 「seperate post … 영업위탁수수료 -> 시공비」) — 글은 결제일 × 구분마다 하나라 같은 날 영업비 · 시공비 카드가 따로 선다.
 */
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { won } from '@/lib/format';
import { downloadBlob } from '@/lib/download';
import { agitPostName, assigneesLabel, payDateName, type AgitPostRecord } from '@/lib/agit/post';
import { feeMonthName } from '@/lib/agit/fee';
import { Btn, Confirm, Err, Tag, TEXT, type Tone } from '@/components/ui';

const LOOK: Record<AgitPostRecord['status'], { band: string; label: string; tone: Tone }> = {
  draft: { band: 'border-amber-500 bg-amber-50/70', label: '아지트 글 초안 · 올리기 전', tone: 'warn' },
  sending: { band: 'border-sky-500 bg-sky-50', label: '아지트 글 · 올리는 중', tone: 'stage' },
  posted: { band: 'border-ok-500 bg-ok-50/60', label: '아지트 글 · 올림', tone: 'ok' },
  failed: { band: 'border-red-500 bg-red-50', label: '아지트 글 · 못 올림', tone: 'stop' },
};
const STALLED = { band: 'border-red-500 bg-red-50', label: '아지트 글 · 올리다 멈춤', tone: 'stop' as Tone };

/** 올리는 중이면 이만큼마다 다시 그린다 */
const POLL_MS = 5000;

/** 「11월 30일」 */
const monthDayOf = (day: string): string => `${Number(day.slice(5, 7))}월 ${Number(day.slice(8))}일`;

export interface AgitAccountState {
  /** 아지트 계정의 로그인을 쥐고 있는가 */
  connected: boolean;
  /** 올리다가 로그인이 풀렸으면 그 까닭 */
  expired: string | null;
  /** 플러그링크 계좌를 넣어 두었는가 — 위탁운영수수료 글의 엑셀에 든다(lib/agit/fee) */
  feePayee: boolean;
}

export function AgitCard({ post, assignees, account }: {
  post: AgitPostRecord;
  /** 지금 정해 둔 요청 담당 — 올릴 때 붙는다 */
  assignees: string[];
  account: AgitAccountState;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [asking, setAsking] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const sending = post.status === 'sending' && !post.stalled;
  const look = post.stalled ? STALLED : LOOK[post.status];
  const open = post.status === 'draft' || post.status === 'failed' || post.stalled;
  /* 위탁운영수수료 글은 몇 차 · 몇 월분 · 세금계산서의 공급가액(지급처가 플러그링크 하나) — 거래명세서 글은 지급 건수 · 공급가액 */
  const fee = post.fee;
  const sum = fee
    ? `${fee.round}차 · ${feeMonthName(fee.month)} · 공급가액 ${won(fee.fee.supply)}원`
    : `지급 ${post.batches}건 · 공급가액 ${won(post.total)}원`;
  /* 올린 글은 그때 붙인 사람, 아직이면 지금 정해 둔 사람 */
  const who = post.status === 'posted' || post.status === 'sending' ? post.assignees : assignees;
  /* 못 올리는 까닭이 단추 이름이다(규칙 3) */
  const blocked = account.expired ? '아지트 로그인 풀림 — 다시 연결'
    : !account.connected ? '아지트 계정 연결 전 — 올릴 수 없음'
      : assignees.length === 0 ? '요청 담당 미지정 — 올릴 수 없음'
        : fee && !account.feePayee ? '플러그링크 계좌 미지정 — 올릴 수 없음'
          : null;

  /* 올리는 중 — 서버가 끝내면 카드가 「올림」으로 바뀌게 몇 초마다 다시 그린다 */
  useEffect(() => {
    if (!sending) return;
    const id = window.setInterval(() => router.refresh(), POLL_MS);
    return () => window.clearInterval(id);
  }, [sending, router]);

  async function publish() {
    setPublishing(true);
    setError(null);
    try {
      const res = await fetch('/api/agit/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ posts: [{ id: post.id, seen: post.body }] }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: unknown };
        setError(typeof json.error === 'string' ? json.error : '올리기를 시작하지 못했습니다.');
      } else {
        setAsking(false);
      }
    } catch {
      setError('네트워크 오류입니다. 다시 시도해주세요.');
    }
    setPublishing(false);
    /* 시작했으면 「올리는 중」, 금액이 바뀌었으면 고친 초안이 그려진다 */
    router.refresh();
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
        {post.urgent && <Tag tone="stop">긴급</Tag>}
        {post.again && post.status !== 'posted' && <Tag>다시 올림</Tag>}
        <span className={`${TEXT.meta} tabular-nums`}>{post.createdAt}</span>
      </div>

      <dl className="mt-2 grid grid-cols-[64px_minmax(0,1fr)] gap-x-3 gap-y-1">
        <dt className={TEXT.label}>{fee ? '지급일' : '결제일'}</dt>
        <dd className="text-small font-bold text-slate-900 tabular-nums">
          {fee ? monthDayOf(post.payDate) : payDateName(post.payDate)} · {sum}
        </dd>
        <dt className={TEXT.label}>구분</dt>
        <dd className="text-small font-semibold text-slate-800">{post.kind}</dd>
        {fee && (
          <>
            <dt className={TEXT.label}>충전매출</dt>
            <dd className="text-small font-semibold text-slate-800 tabular-nums">
              {fee.sales
                ? `합계 ${won(fee.sales.total)}원 · ${fee.sales.inDate ? `${monthDayOf(fee.sales.inDate)} 입금 예정` : '입금 예정일 미지정'}`
                : '없음'}
            </dd>
            <dt className={TEXT.label}>계산서</dt>
            <dd className="text-small text-slate-800">
              <a href={fee.fee.file.url} target="_blank" rel="noreferrer" className="font-semibold text-brand-700 underline-offset-2 hover:underline">
                {fee.fee.file.name}
              </a>
            </dd>
          </>
        )}
        <dt className={TEXT.label}>요청 담당</dt>
        <dd className="text-small font-semibold text-slate-800">{who.length ? assigneesLabel(who) : <Tag tone="warn">미지정</Tag>}</dd>
      </dl>
      <pre className="mt-2 whitespace-pre-wrap break-keep rounded-box bg-white px-3 py-2 font-sans text-small leading-relaxed text-slate-800">
        {post.body}
      </pre>

      {post.status === 'posted' && (
        <p className={`mt-2 ${TEXT.meta} tabular-nums`}>
          {post.at} 올림 · {post.postedBy}
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
      {sending && <p className={`mt-2 ${TEXT.meta} tabular-nums`}>{post.at} 올리기 시작 · {post.postedBy} — 1~2분 걸립니다</p>}
      {post.stalled && !error && (
        <Err className="mt-2 block">{`${post.at} 에 올리기 시작한 뒤 멈췄습니다 — 아지트에 올라갔는지 먼저 확인하고 다시 올려 주세요.`}</Err>
      )}
      {post.status === 'failed' && post.error && !error && <Err className="mt-2 block">{post.error}</Err>}

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        {open && (
          <Btn size="sm" disabled={blocked !== null} onClick={() => { setError(null); setAsking(true); }}>
            {blocked ?? (post.status === 'draft' ? '승인하고 올리기' : '다시 올리기')}
          </Btn>
        )}
        <Btn size="sm" kind="side" busy={zipping} busyLabel={fee ? '묶는 중… (엑셀 캡처)' : '묶는 중… (거래명세서 PDF)'} onClick={() => void bundle()}>
          첨부 파일 받기 (zip)
        </Btn>
        <Btn size="sm" kind="quiet" onClick={() => void copy()}>{copied ? '복사됨' : '복사'}</Btn>
        {!asking && <Err>{error}</Err>}
      </div>

      <Confirm
        open={asking}
        title={`아지트에 올립니다 — ${agitPostName(post)}${post.urgent ? ' · 긴급' : ''}`}
        detail={`${sum} · 요청 담당 ${assigneesLabel(assignees)}${post.urgent ? ' · cc 재무팀' : ''} · 한백 아지트 계정으로`}
        confirmLabel="올리기"
        busy={publishing}
        busyLabel="시작하는 중…"
        error={error}
        onConfirm={() => void publish()}
        onCancel={() => { setAsking(false); setError(null); }}
      />
    </li>
  );
}

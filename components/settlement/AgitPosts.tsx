'use client';

/**
 * 아지트 열린구매 글 — 앞으로 올 결제일마다 한 글(lib/agit/post). 거래명세서 화면 맨 아래, 한백의 눈에만 선다.
 * (한백 2026-11-07 「콘솔에 있는 거래명세서 기반으로 여기에 자동적으로 글을 쓰게 하고싶어」 — 결제일마다 한 글 · 누르면 올림)
 *
 * 줄마다 결제일 · 지급 건수 · 공급가액 · 올렸는지. 「글 보기」로 펼치면 아지트에 갈 글이 그대로 보이고, 「아지트에 올리기」 →
 * 확인 창의 「올리기」로 올린다(그 그룹 사람들에게 보이고 콘솔에서 지울 수 없어 확인을 한 번 더 받는다 — 메일 보내기와 같다).
 * ★올릴 때 서버가 지금 금액으로 다시 짓는다★ — 펼친 뒤 금액이 바뀌었으면 올리지 않고 새 글로 다시 그린다(app/api/agit/posts).
 * 이미 올린 결제일은 「다시 올리기」다 — 고쳐 올리는 일이 있다. 못 하는 까닭은 단추 이름에 적는다(화면 규칙 3).
 * 연결은 머리의 「아지트 연결」 — 웹훅 주소를 붙여 넣는다. 주소가 곧 열쇠라 가린 칸이고 다시 보여 주지 않는다.
 * 그 밑 「요청 담당」이 요청 글의 담당자(아지트 ID)다 — 한 번 정해 두고 모든 글에 붙인다(한백 2026-11-08). 비었으면 올리지 못한다.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { won } from '@/lib/format';
import { dayLabel } from '@/lib/business-days';
import { assigneesLabel, type AgitHookInfo, type AgitPostRecord, type AgitPostText } from '@/lib/agit/post';
import { Btn, Confirm, Err, FIELD_BASE, PANEL, SectionHead, Tag, TEXT } from '@/components/ui';

async function send(url: string, method: 'PUT' | 'PATCH' | 'POST' | 'DELETE', body?: unknown): Promise<{ ok: boolean; json: Record<string, unknown> }> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, json };
}

/** 머리의 연결 줄 — 메일 연결(components/agents/MailAccount)과 같은 모양 */
function AgitHook({ hook, canEdit }: { hook: AgitHookInfo | null; canEdit: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState<null | 'connect' | 'disconnect'>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(method: 'PUT' | 'DELETE') {
    setBusy(method === 'PUT' ? 'connect' : 'disconnect');
    setError(null);
    try {
      const { ok, json } = await send('/api/agit/hook', method, method === 'PUT' ? { url } : undefined);
      if (!ok) setError(typeof json.error === 'string' ? json.error : '처리하지 못했습니다.');
      else {
        setOpen(false);
        setUrl('');
        router.refresh();
      }
    } catch {
      setError('네트워크 오류입니다. 다시 시도해주세요.');
    }
    setBusy(null);
  }

  if (open) {
    return (
      <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); void call('PUT'); }}>
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
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      {hook ? (
        <>
          <Tag tone="ok">연결됨</Tag>
          <span className={`${TEXT.meta} tabular-nums`}>{hook.connectedAt.slice(0, 10)} · {hook.connectedBy}</span>
          {canEdit && <Btn size="sm" kind="quiet" onClick={() => setOpen(true)}>다시 연결</Btn>}
          {canEdit && (
            <Btn size="sm" kind="undo" busy={busy === 'disconnect'} busyLabel="끊는 중…" onClick={() => void call('DELETE')}>연결 끊기</Btn>
          )}
        </>
      ) : (
        <>
          <Tag tone="warn">미지정</Tag>
          {canEdit && <Btn size="sm" kind="side" onClick={() => setOpen(true)}>아지트 연결</Btn>}
        </>
      )}
      <Err>{error}</Err>
    </span>
  );
}

/** 요청 글의 담당자 — 연결 밑 한 줄. 쉼표 · 띄어쓰기로 여럿, 비우면 지운다(화면 규칙 7) */
function AgitAssignees({ hook, canEdit }: { hook: AgitHookInfo | null; canEdit: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ids = hook?.assignees ?? [];

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const { ok, json } = await send('/api/agit/hook', 'PATCH', { assignees: value });
      if (!ok) setError(typeof json.error === 'string' ? json.error : '저장하지 못했습니다.');
      else {
        setOpen(false);
        router.refresh();
      }
    } catch {
      setError('네트워크 오류입니다. 다시 시도해주세요.');
    }
    setBusy(false);
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
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
          {!hook ? (
            <span className={TEXT.meta}>—</span>
          ) : ids.length ? (
            <span className={TEXT.body}>{assigneesLabel(ids)}</span>
          ) : (
            <Tag tone="warn">미지정</Tag>
          )}
          {hook && canEdit && (
            <Btn size="sm" kind={ids.length ? 'quiet' : 'side'} onClick={() => { setValue(ids.join(', ')); setError(null); setOpen(true); }}>
              {ids.length ? '바꾸기' : '담당자 지정'}
            </Btn>
          )}
        </>
      )}
      <Err>{error}</Err>
    </div>
  );
}

function PostState({ post }: { post: AgitPostRecord | undefined }) {
  if (!post) return <Tag>안 올림</Tag>;
  if (post.status === 'posted') return <Tag tone="ok">올림 {post.at.slice(5)} · {post.postedBy}</Tag>;
  if (post.status === 'sending') return <Tag tone="warn">올리는 중</Tag>;
  return <Tag tone="stop">못 올림</Tag>;
}

function DraftRow({
  draft, posts, connected, assignees, canEdit,
}: {
  draft: AgitPostText;
  /** 이 결제일에 올린 글 — 최근이 앞 */
  posts: AgitPostRecord[];
  connected: boolean;
  /** 요청 담당자 — 비면 올리지 못한다 */
  assignees: string[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const last = posts[0];
  /* 마지막으로 올린 것 — 「다시 올리기」를 가르고, 지금 글과 다르면 그 사실을 적는다 */
  const posted = posts.find((p) => p.status === 'posted');
  const again = Boolean(posted);
  const blocked = !connected
    ? '아지트 미연결 — 올릴 수 없음'
    : assignees.length === 0 ? '요청 담당 미지정 — 올릴 수 없음' : draft.blocked;

  async function post() {
    setBusy(true);
    setError(null);
    try {
      const { ok, json } = await send('/api/agit/posts', 'POST', { payDate: draft.payDate, seen: draft.text, again });
      const out = json.post as AgitPostRecord | undefined;
      if (!ok) {
        setError(typeof json.error === 'string' ? json.error : '올리지 못했습니다.');
        setAsking(false);
      } else if (out && out.status !== 'posted') {
        setError(out.error ?? '올리지 못했습니다.');
        setAsking(false);
      } else {
        setAsking(false);
      }
      /* 성공이든 실패든 다시 그린다 — 금액이 바뀌었으면 새 글이, 올렸으면 「올림」이 선다 */
      router.refresh();
    } catch {
      setError('네트워크 오류입니다. 다시 시도해주세요.');
    }
    setBusy(false);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(draft.text);
      setCopied(true);
    } catch {
      setError('복사하지 못했습니다 — 글을 직접 골라 복사해 주세요.');
    }
  }

  return (
    <li className="border-t border-slate-100 py-3 first:border-t-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-base font-black tabular-nums text-slate-900">{dayLabel(draft.payDate)}</span>
        <span className={`${TEXT.body} tabular-nums`}>
          지급 {draft.batches}건 · 공급가액 {won(draft.total)}원
        </span>
        <PostState post={last} />
        <Btn size="sm" kind="quiet" onClick={() => setOpen((v) => !v)}>{open ? '접기' : '글 보기'}</Btn>
      </div>
      {/* 못 올린 까닭은 한 자리에만 — 펼치면 단추 옆(Err), 접혀 있으면 줄 밑(화면 규칙 5 · 9) */}
      {!open && last?.status === 'failed' && last.error && (
        <p className="mt-1 text-small font-bold text-red-700">{last.error}</p>
      )}
      {open && (
        <div className="mt-2.5 flex flex-col gap-2.5">
          <pre className="whitespace-pre-wrap break-keep rounded-box bg-slate-50 px-3.5 py-3 font-sans text-small leading-relaxed text-slate-800">
            {draft.text}
          </pre>
          <div className="flex flex-wrap items-center gap-2">
            {canEdit && (
              <Btn
                size="sm"
                kind={again ? 'side' : 'do'}
                disabled={Boolean(blocked) || busy}
                onClick={() => { setError(null); setAsking(true); }}
              >
                {blocked ?? (again ? '다시 올리기' : '아지트에 올리기')}
              </Btn>
            )}
            <Btn size="sm" kind="quiet" onClick={() => void copy()}>{copied ? '복사됨' : '복사'}</Btn>
            <Err>{error ?? (last?.status === 'failed' ? last.error : null)}</Err>
          </div>
        </div>
      )}
      <Confirm
        open={asking}
        title={`${dayLabel(draft.payDate)} 결제 글을 아지트에 ${again ? '다시 ' : ''}올립니다`}
        detail={again
          ? `${posted?.at ?? ''}에 올린 글이 있습니다 — 새 글이 하나 더 섭니다. 앞 글은 아지트에서 지워 주세요.`
          : '열린구매 그룹에 요청 글로 섭니다 — 그룹 사람들에게 보이고, 콘솔에서는 지울 수 없습니다.'}
        hint={`지급 ${draft.batches}건 · 공급가액 ${won(draft.total)}원 · 담당 ${assigneesLabel(assignees)}`}
        confirmLabel="올리기"
        busy={busy}
        busyLabel="올리는 중…"
        error={error}
        onConfirm={() => void post()}
        onCancel={() => setAsking(false)}
      />
    </li>
  );
}

export default function AgitPosts({
  drafts, posts, hook, canEdit,
}: {
  /** 앞으로 올 결제일마다 한 글 — 이른 것이 위 */
  drafts: AgitPostText[];
  posts: AgitPostRecord[];
  hook: AgitHookInfo | null;
  /** 연결 · 올리기는 관리자만 — 열람 전용은 글을 보고 복사만 한다 */
  canEdit: boolean;
}) {
  return (
    <section className={`${PANEL} p-4`}>
      <SectionHead title="아지트 열린구매 글" meta={`결제일 ${drafts.length}건`}>
        <AgitHook hook={hook} canEdit={canEdit} />
      </SectionHead>
      <AgitAssignees hook={hook} canEdit={canEdit} />
      {drafts.length === 0 ? (
        <p className={`${TEXT.meta} mt-3`}>앞으로 나갈 지급 0건</p>
      ) : (
        <ul className="mt-2">
          {drafts.map((d) => (
            <DraftRow
              key={d.payDate}
              draft={d}
              posts={posts.filter((p) => p.payDate === d.payDate)}
              connected={hook !== null}
              assignees={hook?.assignees ?? []}
              canEdit={canEdit}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

'use client';

/**
 * 이름 + 내용 줄의 목록 — 업무 정의(AgentDuties)와 팀 목표 · 방향(AgentDirections)이 같이 쓴다. 평소엔 글자, 「수정」을 눌러야
 * 칸이 열린다(화면 규칙 4). 넣고 고치면 url 에 POST { id?, title, body }, 지우면 url/{id} 에 DELETE. 고친 기록은 감사기록에 앞뒤가
 * 남고 주간 기록이 보여준다. 읽기만(readOnly)이면 단추가 없다 — 실무자 화면의 목표 · 방향(팀장 쪽에서 고친다).
 */
import { useState, type ReactNode } from 'react';
import { useAction } from '@/lib/use-action';
import { Btn, Err, FIELD, PANEL, TEXT } from '@/components/ui';
import { AgentHead, Spark } from './kit';

export interface TitledItem {
  id: string;
  title: string;
  body: string;
  /** 마지막으로 고친 때(YYYY-MM-DD HH:mm) — 처음 적은 그대로면 null */
  updatedAt: string | null;
  /** 적은 쪽 — 있으면 줄 끝에 선다(목표 · 방향). 에이전트가 적었으면 반짝이가 붙는다 */
  author?: string;
  byAgent?: boolean;
}

export function TitledList({ heading, meta, items, url, placeholder, readOnly = false, clamp = false }: {
  heading: ReactNode;
  /** 머리의 곁글 — 없으면 건수 */
  meta?: ReactNode;
  items: TitledItem[];
  /** 넣고 고치는 곳 — 지우기는 그 밑 /{id} */
  url: string;
  placeholder: { title: string; body: string };
  readOnly?: boolean;
  /** 내용을 세 줄까지만 — 다른 칸과 나란히 서는 자리(팀 화면) */
  clamp?: boolean;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <section className={`${PANEL} flex flex-col gap-3 p-5`}>
      <AgentHead
        meta={meta ?? `${items.length}건`}
        action={!readOnly && !adding && <Btn size="sm" kind="quiet" onClick={() => setAdding(true)}>추가</Btn>}
      >
        {heading}
      </AgentHead>
      {adding && <ItemForm url={url} placeholder={placeholder} onDone={() => setAdding(false)} />}
      {items.length > 0 && (
        <ol className="flex flex-col divide-y divide-slate-100">
          {items.map((item, i) => (
            <Item key={item.id} url={url} item={item} n={i + 1} placeholder={placeholder} readOnly={readOnly} clamp={clamp} />
          ))}
        </ol>
      )}
    </section>
  );
}

function Item({ url, item, n, placeholder, readOnly, clamp }: {
  url: string; item: TitledItem; n: number; placeholder: { title: string; body: string }; readOnly: boolean; clamp: boolean;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <li className="py-2.5">
        <ItemForm url={url} item={item} placeholder={placeholder} onDone={() => setEditing(false)} />
      </li>
    );
  }
  return (
    <li className="flex flex-col gap-1 py-2.5">
      <div className="flex items-baseline gap-2">
        <span className="text-tiny font-bold tabular-nums text-brand-600">{String(n).padStart(2, '0')}</span>
        <p className="min-w-0 flex-1 break-keep text-base font-bold text-slate-900">{item.title}</p>
        {!readOnly && <Btn size="sm" kind="quiet" onClick={() => setEditing(true)}>수정</Btn>}
      </div>
      {item.body.trim() && (
        <p className={`whitespace-pre-wrap break-keep pl-6 text-small leading-relaxed text-slate-600 ${clamp ? 'line-clamp-3' : ''}`}>
          {item.body}
        </p>
      )}
      {/* 누가 · 언제 — 무엇이 바뀌었는지는 주간 기록이 그 주에 앞뒤를 보여준다 */}
      {(item.author || item.updatedAt) && (
        <p className={`flex flex-wrap items-center gap-x-2 pl-6 ${TEXT.meta} tabular-nums`}>
          {item.author && (
            <span className="inline-flex items-center gap-1">
              {item.byAgent && <Spark className="h-2.5 w-2.5 text-brand-500" />}{item.author}
            </span>
          )}
          {item.updatedAt && <span>고침 {item.updatedAt.slice(5)}</span>}
        </p>
      )}
    </li>
  );
}

function ItemForm({ url, item, placeholder, onDone }: {
  url: string; item?: TitledItem; placeholder: { title: string; body: string }; onDone: () => void;
}) {
  const { busyKey, error, run } = useAction();
  const [title, setTitle] = useState(item?.title ?? '');
  const [body, setBody] = useState(item?.body ?? '');
  const [asking, setAsking] = useState(false);

  async function save() {
    const ok = await run({
      url,
      body: { ...(item ? { id: item.id } : {}), title, body },
      fail: '저장하지 못했습니다.',
      key: 'save',
    });
    if (ok) onDone();
  }

  async function remove() {
    if (!item) return;
    const ok = await run({ url: `${url}/${item.id}`, method: 'DELETE', fail: '지우지 못했습니다.', key: 'del' });
    if (ok) onDone();
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={60}
        placeholder={placeholder.title}
        className={FIELD}
        autoFocus
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={5}
        placeholder={placeholder.body}
        className={`${FIELD} resize-y leading-relaxed`}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Btn size="sm" disabled={!title.trim() || busyKey !== null} busy={busyKey === 'save'} busyLabel="저장 중…" onClick={() => void save()}>
          {item ? '저장' : '추가'}
        </Btn>
        <Btn size="sm" kind="quiet" disabled={busyKey !== null} onClick={onDone}>취소</Btn>
        <Err>{error}</Err>
        {item && (
          <span className="ml-auto flex items-center gap-1">
            {asking ? (
              <>
                <Btn size="sm" kind="undo" busy={busyKey === 'del'} busyLabel="삭제 중…" onClick={() => void remove()}>삭제합니다</Btn>
                <Btn size="sm" kind="quiet" disabled={busyKey !== null} onClick={() => setAsking(false)}>취소</Btn>
              </>
            ) : (
              <Btn size="sm" kind="undo" onClick={() => setAsking(true)}>삭제</Btn>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

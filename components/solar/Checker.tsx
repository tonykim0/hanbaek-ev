'use client';

import { useEffect, useRef, useState } from 'react';
import { Btn, Err, FIELD, Tag } from '@/components/ui';
import type { Mode, Report, Suggestion } from '@/lib/solar/types';
import ReportView from './ReportView';
import { PANEL, TEXT } from './ui';

/** 검색창 둘 — 지붕형 · 지상형을 나눠 둔다(한백 지시). 고르는 단추 대신 창마다 제 검토를 돌린다 */
const BOXES: { mode: Mode; title: string; sub: string; placeholder: string }[] = [
  { mode: 'roof', title: '지붕형', sub: '건물 지붕에 설치', placeholder: '도로명·지번 주소 또는 건물명' },
  { mode: 'ground', title: '지상형', sub: '땅에 설치', placeholder: '도로명·지번 주소 또는 장소명' },
];

/** 후보 한 줄의 굵은 글자와 밑의 작은 글자 */
function linesOf(s: Suggestion): { main: string; sub: string | null } {
  if (s.kind === 'place') return { main: s.name ?? '', sub: s.road ?? s.parcel };
  const main = s.road ?? s.parcel ?? '';
  const sub = [s.name, s.road ? s.parcel : null].filter(Boolean).join(' · ') || null;
  return { main, sub };
}

/**
 * 태양광 부지 검토 — 주소 하나를 넣으면 필지 · 건물 · 용도지역 · 계통 · 조례를 보고 판정과 설치 가능 용량을 낸다.
 * 검토 사이트(solar-site)에서 콘솔로 들였다(2026-11-03, 한백 「태양광 설치 검토 기능을 이 페이지에」). DB 에는 아무것도 안 남긴다.
 *
 * @param mapKey 카카오 JavaScript 키 — 서버(page)가 환경변수에서 넘긴다. 브라우저에 보이는 것이 정상인 키다(도메인으로 묶인다)
 */
export default function Checker({
  mapKey,
  initial = null,
  canRegister = false,
  canPropose = false,
  canManage = false,
}: {
  mapKey: string | null;
  /** 들고 온 주소 — 그 갈래의 검색창에 넣고 한 번 돈다(현장 상세의 「부지 검토」) */
  initial?: { q: string; mode: Mode } | null;
  /** 결과에서 상담 접수로 가는 길을 세우는가 — 쓰는 계정만(열람 전용은 아니다) */
  canRegister?: boolean;
  /** 결과에 제안서 구역을 세우는가 — 한백의 눈 */
  canPropose?: boolean;
  /** 제안서 틀 · 조건을 고치는가 — 한백 관리자 */
  canManage?: boolean;
}) {
  /** 도는 검토의 갈래 — 결과 자리가 하나라 한 번에 하나만 돈다 */
  const [busy, setBusy] = useState<Mode | null>(null);
  const [error, setError] = useState<{ mode: Mode; text: string } | null>(null);
  const [report, setReport] = useState<Report | null>(null);

  async function run(mode: Mode, q: string, picked?: Suggestion) {
    if (!q.trim() || busy) return;
    setBusy(mode);
    setError(null);
    const params = new URLSearchParams({ q: q.trim(), mode });
    if (picked) {
      params.set('lat', String(picked.lat));
      params.set('lng', String(picked.lng));
      if (picked.road) params.set('road', picked.road);
      if (picked.parcel) params.set('parcel', picked.parcel);
      if (picked.name) params.set('name', picked.name);
      params.set('kind', picked.kind);
    }
    try {
      const res = await fetch(`/api/solar/check?${params}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? `검토 실패 (${res.status})`);
      setReport(body as Report);
    } catch (err) {
      setReport(null);
      setError({ mode, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(null);
    }
  }

  // 들고 온 주소는 처음 한 번만 — 다시 그려질 때마다 돌면 바깥 자료의 하루 한도를 깎는다
  const started = useRef(false);
  useEffect(() => {
    if (!initial || started.current) return;
    started.current = true;
    void run(initial.mode, initial.q);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 처음 한 번
  }, []);

  return (
    <div>
      {/* 위에서 아래로(한백 지시) — 주소 칸이 넓어야 긴 주소·후보 목록이 잘리지 않는다 */}
      <div className="grid gap-3">
        {BOXES.map((b) => (
          <SearchBox
            key={b.mode}
            {...b}
            initialQuery={initial?.mode === b.mode ? initial.q : ''}
            busy={busy}
            error={error?.mode === b.mode ? error.text : null}
            onRun={run}
          />
        ))}
      </div>

      {/* 검토마다 새로 — 앞 결과에서 고른 지붕이 남지 않게 */}
      {report && (
        <ReportView key={report.checkedAt} report={report} mapKey={mapKey} canRegister={canRegister} canPropose={canPropose} canManage={canManage} />
      )}
    </div>
  );
}

/** 검색창 하나 — 입력 · 후보 목록 · 검토 단추. 실패 문구는 이 창 밑에 뜬다(누른 자리) */
function SearchBox({
  mode,
  title,
  sub,
  placeholder,
  initialQuery,
  busy,
  error,
  onRun,
}: {
  mode: Mode;
  title: string;
  sub: string;
  placeholder: string;
  initialQuery: string;
  busy: Mode | null;
  error: string | null;
  onRun: (mode: Mode, q: string, picked?: Suggestion) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const seq = useRef(0);
  /** 후보를 고른 직후(그리고 들고 온 주소로 시작할 때)는 입력칸 글자가 있어도 후보를 찾지 않는다 */
  const skipNext = useRef(initialQuery !== '');
  const boxRef = useRef<HTMLDivElement>(null);
  const listId = `suggest-${mode}`;

  useEffect(() => {
    if (skipNext.current) {
      skipNext.current = false;
      return;
    }
    const q = query.trim();
    if (q.length < 2) {
      setItems([]);
      setOpen(false);
      return;
    }
    const my = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/solar/suggest?q=${encodeURIComponent(q)}`);
        const body = (await res.json()) as { items?: Suggestion[]; error?: string | null };
        if (my !== seq.current) return; // 늦게 온 앞 글자의 답은 버린다
        setItems(body.items ?? []);
        setListError(body.error ?? null);
        setActive(-1);
        setOpen(true);
      } catch (err) {
        if (my !== seq.current) return;
        setItems([]);
        setListError(`후보를 못 받았습니다 — ${err instanceof Error ? err.message : String(err)}`);
        setOpen(true);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  function go(q: string, picked?: Suggestion) {
    setOpen(false);
    onRun(mode, q, picked);
  }

  function pick(s: Suggestion) {
    const { main } = linesOf(s);
    skipNext.current = true;
    setQuery(main);
    setItems([]);
    go(main, s);
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || items.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => (a + 1) % items.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      pick(items[active]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const showList = open && query.trim().length >= 2;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        go(query);
      }}
      className={`${PANEL} p-4 sm:p-5`}
      aria-label={`${title} 검토`}
    >
      <p className="flex items-baseline gap-2">
        <span className={TEXT.item}>{title}</span>
        <span className={TEXT.label}>{sub}</span>
      </p>
      <div className="mt-3 flex items-start gap-2">
        <div ref={boxRef} className="relative min-w-0 flex-1">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            onFocus={() => items.length && setOpen(true)}
            placeholder={placeholder}
            role="combobox"
            aria-label={`${title} 주소`}
            aria-expanded={showList}
            aria-controls={listId}
            aria-autocomplete="list"
            autoComplete="off"
            className={FIELD}
          />
          {showList && (
            <ul
              id={listId}
              role="listbox"
              className="absolute left-0 right-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-box border border-slate-200 bg-white py-1 shadow-lg"
            >
              {listError ? (
                <li className="px-3 py-2.5">
                  <Err>{listError}</Err>
                </li>
              ) : items.length === 0 ? (
                <li className={`px-3 py-2.5 ${TEXT.label}`}>후보 0건</li>
              ) : (
                items.map((s, i) => {
                  const { main, sub: line } = linesOf(s);
                  return (
                    <li
                      key={`${s.lng},${s.lat},${i}`}
                      role="option"
                      aria-selected={i === active}
                      onMouseDown={(e) => e.preventDefault()}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => pick(s)}
                      className={`cursor-pointer px-3 py-2 ${i === active ? 'bg-slate-50' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`truncate ${TEXT.item}`}>{main}</span>
                        {s.kind === 'place' && <Tag>{s.category ?? '장소'}</Tag>}
                      </div>
                      {line && <p className={`truncate ${TEXT.label}`}>{line}</p>}
                    </li>
                  );
                })
              )}
            </ul>
          )}
        </div>
        <Btn type="submit" disabled={busy !== null || !query.trim()} busy={busy === mode} busyLabel="검토 중…" className="shrink-0 whitespace-nowrap">
          검토하기
        </Btn>
      </div>
      <Err className="mt-2 block">{error}</Err>
    </form>
  );
}

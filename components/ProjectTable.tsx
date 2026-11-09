'use client';

/**
 * 현장 표 — 전부 한 줄씩.
 *
 * 보드는 「어느 단계에 몇 건」을 답하고, 이 표는 「이 조건에 맞는 현장이 무엇인가」를 답한다.
 * 그래서 보드 카드에 안 넣은 것들(사업유형·건축물·수전방식·접수일)이 여기 열로 있다.
 *
 * ★열 머리글에서 바로 거른다.★ 위쪽 필터 막대로도 되지만, 표를 보다가 「이 운영사만」이
 * 궁금해지는 자리는 그 열이다 — 눈이 있는 곳에서 걸 수 있어야 한다.
 * 상태는 껍데기(ProjectsView)가 쥔다. 표가 따로 쥐면 보드로 넘어갈 때 풀린다.
 *
 * 단계 칸은 고르는 자리다. 보드는 끌어야 옮겨지지만 표에서는 골라서 옮긴다 —
 * 끌기만 있으면 마우스 없이는 아무것도 못 옮긴다.
 *
 * ★시공 날짜도 표에서 적는다★ (한백 지시 2026-11-05 「표에서 날짜를 기입하게」) — 필터로 좁혀 둔 현장들의 날짜를
 * 하나씩 상세에 들어가 넣지 않고 줄마다 쭉 넣는다. 저장하는 길(/process)과 누가 어느 칸을 적는지(processEditOf ·
 * 한백 전용 칸)는 현장 상세의 시공 탭과 같다. 날짜는 전이가 아니라 단계를 옮기지 않는다 — 완료 선언(✓)은 여기서
 * 찍지 않는다. 그것은 조건을 묻는 선언이라 상세의 「다음 단계로 진행」이 한다.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { useAction } from '@/lib/use-action';
import Link from 'next/link';
import type { ProcessStatus, ProjectSummary } from '@/types/project';
import { PROCESS_STATUSES, subsidized } from '@/types/project';
import { isHanbaekOnlyProcessField, processEditOf, type ProcessEdit } from '@/lib/process';
import { DatePicker } from '@/components/DatePicker';
import {
  BAND_TONE, bandOfColumn, boardColumnOf, constructionLabelOf, type BoardColumn,
} from '@/lib/board';
import type { AttrFilters, AttrKey } from '@/lib/project-filter';
import {
  DATE_COLS, DATE_KEYS, DEFAULT_HIDDEN, filterAttrOf, labelOf, PICK_GROUPS, PICKABLE, qtyOf, restoreHidden, sortProjects,
  tableSheet, termsOf, type ColKey, type SortKey, type TableDateField, type TableTab,
} from '@/lib/project-table';
import { today } from '@/lib/date';
import { Badge, Blank, Btn, Err, Tag } from '@/components/ui';
import CheckMenu from '@/components/CheckMenu';

/*
 * 열 정의·정렬·엑셀 한 장은 lib/project-table 에 있다 — 「엑셀 받기」가 화면과 같은 열·같은 차례로 내려면
 * 같은 정의를 봐야 한다(2026-11-05).
 */

/**
 * 열 상태 — 표 밖(필터 줄)의 「열」 단추와 표가 같은 것을 봐야 해서 훅으로 뺐다
 * (한백 지시 2026-09-02 「표 항목 필터 설정하는 것도 필터 옆에 두고」).
 * 숨긴 열에 걸린 필터를 푸는 일이 있어 필터의 주인(껍데기)이 부르는 것이 맞다.
 */
export function useTableColumns(
  tab: TableTab,
  filters: AttrFilters,
  onFilter: (key: AttrKey, values: string[]) => void
) {
  const storageKey = `hb-table-cols-${tab}`;
  const [hidden, setHidden] = useState<Set<ColKey>>(() => new Set(DEFAULT_HIDDEN[tab]));
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setHidden(restoreHidden(JSON.parse(raw), DEFAULT_HIDDEN[tab]));
    } catch { /* 저장값이 없거나 깨졌으면 페이지 기본으로 */ }
  }, [storageKey, tab]);

  function setHiddenAndSave(next: Set<ColKey>) {
    setHidden(next);
    try {
      /* 그때 있던 열(seen)을 같이 남긴다 — 나중에 열이 더해지면 그 열은 페이지 기본을 따른다(restoreHidden) */
      localStorage.setItem(storageKey, JSON.stringify({ hidden: [...next], seen: PICKABLE.map((c) => c.key) }));
    } catch { /* 못 남겨도 화면은 돈다 */ }
  }

  /** 열 여러 개를 한 번에 켜고 끈다 — 그룹 토글과 개별 토글이 같은 길을 쓴다 */
  function setColumns(keys: readonly ColKey[], visible: boolean) {
    const next = new Set(hidden);
    for (const key of keys) {
      if (visible) {
        next.delete(key);
      } else if (!next.has(key)) {
        next.add(key);
        // 숨긴 열에 걸려 있던 필터는 푼다 — 안 보이는 필터가 몰래 표를 거르면 안 된다(날짜 열의 있음 · 없음도)
        const attr = filterAttrOf(key);
        if (attr && (filters[attr]?.length ?? 0) > 0) onFilter(attr, []);
      }
    }
    setHiddenAndSave(next);
  }

  return {
    hidden,
    setColumns,
    toggleColumn: (key: ColKey) => setColumns([key], hidden.has(key)),
    reset: () => setHiddenAndSave(new Set(DEFAULT_HIDDEN[tab])),
    defaultHidden: DEFAULT_HIDDEN[tab],
  };
}

export type TableColumns = ReturnType<typeof useTableColumns>;

/**
 * 정렬 상태 — 머리글을 눌러 고른다. 표 밖(필터 줄)의 「엑셀 받기」가 화면과 같은 차례로 내야 해서
 * 껍데기가 쥔다(열 상태와 같은 까닭).
 */
export function useTableSort() {
  const [sort, setSort] = useState<SortKey>('stage');
  const [desc, setDesc] = useState(false);
  return { sort, desc, setSort, setDesc };
}

export type TableSort = ReturnType<typeof useTableSort>;

/*
 * ★현장 열은 가로로 밀어도 왼쪽에 붙어 있다★ (한백 지시 2026-11-05 「표에서 정보가 많아져서 오른쪽으로 드래그하더라도
 * 현장명은 고정값으로」) — 시공 날짜 열이 열일곱으로 늘어 표가 화면 두 배를 넘는다. 어느 줄의 날짜인지 이름이 같이 보여야 한다.
 *
 * 붙은 칸은 제 바탕이 있어야 한다 — 없으면 밀려 들어오는 칸의 글자가 비친다. 그래서 줄 위의 옅은 바탕(hover)도 반투명이
 * 아니라 불투명 brand-50 이다(줄과 붙은 칸이 같은 색이어야 한 줄로 읽힌다). 경계는 테두리가 아니라 그림자 한 줄이다 —
 * 표가 border-collapse 라 칸의 테두리는 칸을 따라 붙지 않고 밀려간다.
 * 머리 칸은 몸 칸보다 위다 — 머리 줄도 위에 붙어(sticky top) 있어 둘이 겹치는 모서리가 생긴다.
 */
const PIN_EDGE = 'shadow-[inset_-1px_0_0_theme(colors.slate.200)]';
const PIN_HEAD = `sticky left-0 z-20 bg-slate-50 ${PIN_EDGE}`;
const PIN_CELL = `sticky left-0 z-[1] bg-white group-hover:bg-brand-50 ${PIN_EDGE}`;
const PIN_FOOT = `sticky left-0 z-[1] bg-slate-50 ${PIN_EDGE}`;

export default function ProjectTable({
  projects, canMove, onMove, busyId, filters, options, onFilter, tab, columns, sort: sorting, viewer,
}: {
  projects: ProjectSummary[];
  canMove: boolean;
  /** 보는 사람 — 줄마다 그 현장의 날짜를 적을 수 있는지 가른다(processEditOf) */
  viewer: { role: string; org: string | null };
  /** 상세를 열 때 먼저 보일 탭 — 이 페이지의 국면(계약·시공)을 따라간다 */
  tab: TableTab;
  onMove: (p: ProjectSummary, status: ProcessStatus) => void;
  busyId: string | null;
  /** 지금 걸린 필터 — 껍데기가 쥐고 있다 */
  filters: AttrFilters;
  options: Record<AttrKey, string[]>;
  onFilter: (key: AttrKey, values: string[]) => void;
  /** 열 상태 — 껍데기가 useTableColumns 로 쥐고 「열」 단추와 나눠 쓴다 */
  columns: TableColumns;
  /** 정렬 상태 — 껍데기가 useTableSort 로 쥐고 「엑셀 받기」와 나눠 쓴다 */
  sort: TableSort;
}) {
  const { sort, desc, setSort, setDesc } = sorting;

  const { hidden } = columns;
  const show = (k: ColKey) => !hidden.has(k);

  const rows = useMemo(() => sortProjects(projects, sort, desc), [projects, sort, desc]);
  /* 합계 줄 — 지금 걸러 둔 줄의 대수를 더한다(아래 tfoot) */
  const units = useMemo(() => rows.reduce((n, p) => n + qtyOf(p), 0), [rows]);
  const shown = PICKABLE.filter((c) => show(c.key)).length;

  /** 정렬 단추. 필터가 함께 붙는 열은 attr 를 준다. */
  function head(
    label: string,
    opts: { sort?: SortKey; attr?: AttrKey; left?: boolean; pin?: boolean } = {}
  ) {
    const { sort: key, attr, left, pin } = opts;
    const on = key !== undefined && sort === key;
    return (
      <th
        className={`whitespace-nowrap px-3 py-2 ${left ? 'text-left' : ''} ${pin ? PIN_HEAD : ''}`}
      >
        <div className="inline-flex items-center gap-1">
          {key ? (
            <button
              type="button"
              onClick={() => {
                if (on) setDesc((v) => !v);
                else {
                  setSort(key);
                  setDesc(key === 'qty' || key === 'term' || key === 'created');
                }
              }}
              className={`inline-flex items-center gap-1 font-bold transition hover:text-slate-800 ${
                on ? 'text-brand-800' : 'text-slate-500'
              }`}
            >
              {label}
              <span aria-hidden className={on ? 'text-brand-600' : 'text-transparent'}>
                {desc ? '▾' : '▴'}
              </span>
            </button>
          ) : (
            <span className="font-bold text-slate-500">{label}</span>
          )}
          {attr && (
            <ColumnFilter
              label={label}
              options={options[attr] ?? []}
              picked={filters[attr] ?? []}
              onChange={(v) => onFilter(attr, v)}
            />
          )}
        </div>
      </th>
    );
  }

  if (rows.length === 0) return <Blank>조건에 맞는 현장이 없습니다.</Blank>;

  return (
    <div className="overflow-hidden rounded-panel border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        {/* 최소 폭은 보이는 열 수에 따라간다 — 열이 적은데 가로 스크롤이 남으면 이상하다 */}
        <table
          className="text-center w-full text-base"
          style={{ minWidth: 260 + (PICKABLE.length - hidden.size) * 92 }}
        >
          {/* 머리글은 붙여 둔다 — 138건을 훑으면서 어느 열인지 계속 알아야 한다 */}
          <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-tiny tracking-[0.06em]">
            <tr>
              {head('현장', { sort: 'name', left: true, pin: true })}
              {show('stage') && head('단계', { sort: 'stage', attr: 'col' })}
              {show('qty') && head('대수', { sort: 'qty' })}
              {show('term') && head('계약연수', { sort: 'term', attr: 'term' })}
              {show('cpo') && head('운영사', { attr: 'cpo' })}
              {show('queue') && head('환경부 대기번호', { attr: 'queue' })}
              {show('biz') && head('사업유형', { attr: 'biz' })}
              {show('bldg') && head('건축물', { attr: 'bldg' })}
              {show('powerIn') && head('전력인입', { attr: 'power' })}
              {show('sales') && head('영업사', { attr: 'sales' })}
              {show('gc') && head('시공사', { attr: 'gc' })}
              {/*
                * 날짜 열 — 정의(무슨 값 · 어디에 저장 · 언제 해당없음)는 lib/project-table DATE_COLS 한 곳이다.
                * 머리글에서 있음 · 없음 · 해당없음으로 거른다(한백 2026-11-10 — lib/project-filter 날짜 축).
                */}
              {DATE_KEYS.filter(show).map((k) => (
                <Fragment key={k}>{head(labelOf(k), { attr: filterAttrOf(k) })}</Fragment>
              ))}
              {show('created') && head('접수일', { sort: 'created', attr: 'month' })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((p) => {
              const col = boardColumnOf(p);
              const busy = busyId === p.id;
              const edit = processEditOf(viewer, p.gcOrg);
              return (
                <tr key={p.id} className={`group transition hover:bg-brand-50 ${busy ? 'opacity-50' : ''}`}>
                  {/*
                    * 현장 열만 왼쪽 — 줄을 찾는 열쇠다(화면 규칙 13, 한백 지시 2026-09-02).
                    * 최소 폭을 준다 — 날짜 칸이 달력 단추가 되며 넓어지자 브라우저가 이 열을 눌러 현장명이 글자 몇 개씩 접혔다.
                    * 좁으면 접지 않고 표가 가로로 밀린다.
                    * ★가로로 밀어도 이 열은 왼쪽에 붙어 있다★(PIN_CELL — 한백 지시 2026-11-05 「오른쪽으로 드래그하더라도 현장명은 고정」).
                    */}
                  <td className={`min-w-[220px] max-w-[300px] px-3 py-2.5 text-left ${PIN_CELL}`}>
                    <Link
                      href={`/projects/${p.id}?tab=${tab}`}
                      className="font-bold text-slate-900 hover:text-brand-800 hover:underline"
                    >
                      {p.name}
                    </Link>
                    <span className="ml-2 text-tiny tabular-nums text-slate-400">
                      {p.mgmtNo ?? p.id}
                    </span>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1">
                      {p.addr && <span className="text-tiny text-slate-400">{p.addr}</span>}
                      {p.rejectedDocs > 0 && <Tag tone="stop">반려 {p.rejectedDocs}</Tag>}
                      {!p.priced && <Tag>단가 미지정</Tag>}
                    </div>
                  </td>
                  {show('stage') && (
                    <td className="px-3 py-2.5">
                      <StageCell p={p} col={col} canMove={canMove} onMove={onMove} busy={busy} construction={tab === 'construction'} />
                    </td>
                  )}
                  {show('qty') && (
                    <td className="px-3 py-2.5 font-bold tabular-nums text-slate-700">
                      {qtyOf(p)}
                      <span
                        className="ml-1 text-tiny font-normal text-slate-400"
                        title={p.lines.map((l) => `${l.termYears}년×${l.qty}대`).join(' + ')}
                      >
                        대
                      </span>
                    </td>
                  )}
                  {show('term') && (
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{termsOf(p)}</td>
                  )}
                  {show('cpo') && (
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{p.cpo}</td>
                  )}
                  {show('queue') && (
                    <td className="px-3 py-2.5">
                      <QueueCell p={p} canEdit={canMove} />
                    </td>
                  )}
                  {show('biz') && <Cell value={p.bizType} />}
                  {show('bldg') && <Cell value={p.bldgType} />}
                  {show('powerIn') && <Cell value={p.powerType} />}
                  {show('sales') && <Cell value={p.salesOrg} />}
                  {show('gc') && <Cell value={p.gcOrg} />}
                  {DATE_KEYS.filter(show).map((k) => {
                    const c = DATE_COLS[k]!;
                    if (c.na?.(p)) return <NaCell key={k} />;
                    return (
                      <MilestoneCell
                        key={k}
                        p={p}
                        field={c.field}
                        label={c.name}
                        date={c.date(p)}
                        done={c.done?.(p)}
                        canEdit={c.field !== undefined && canDate(edit, c.field)}
                      />
                    );
                  })}
                  {show('created') && (
                    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-slate-500">
                      {p.createdAt}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          {/*
            * 합계 줄 — 지금 걸러 둔 줄의 건수와 대수 합(한백 지시 2026-11-06 「필터링 하면 현재 필터에서 총 대수 합계를
            * 볼 수 있게」). 대수는 대수 열 밑에 선다 — 그 열을 꺼 두면 건수 곁에 붙인다. 위 건수 줄(필터 줄 오른쪽 끝)과
            * 같은 줄 목록에서 세니 둘이 갈리지 않는다. 엑셀에는 넣지 않는다 — 합계 줄이 섞이면 엑셀의 필터 · 정렬이 그 줄까지 옮긴다.
            */}
          <tfoot className="border-t border-slate-200 bg-slate-50">
            <tr>
              <td className={`px-3 py-2.5 text-left font-bold text-slate-700 ${PIN_FOOT}`}>
                합계 <span className="tabular-nums">{rows.length.toLocaleString('ko-KR')}</span>건
                {!show('qty') && (
                  <> · <span className="tabular-nums">{units.toLocaleString('ko-KR')}</span>대</>
                )}
              </td>
              {show('stage') && <td />}
              {show('qty') && (
                <td className="px-3 py-2.5 font-bold tabular-nums text-slate-900">
                  {units.toLocaleString('ko-KR')}
                  <span className="ml-1 text-tiny font-normal text-slate-500">대</span>
                </td>
              )}
              {shown - (show('stage') ? 1 : 0) - (show('qty') ? 1 : 0) > 0 && (
                <td colSpan={shown - (show('stage') ? 1 : 0) - (show('qty') ? 1 : 0)} />
              )}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/**
 * 「열」 고르기 — 현장(이름)은 항상 있고 나머지 열을 켜고 끈다. 필터 줄에 선다.
 *
 * ★이름이 「표 항목」이었다★ (한백 지적 2026-09-02 「필터랑 표 항목 용어도 중복되는 것
 * 같은데」). 「항목」은 필터가 거르는 것과 같은 말로 읽힌다 — 필터는 ★줄★을 거르고
 * 이것은 ★열★을 켜고 끈다. 물건의 이름을 그대로 쓴다.
 * 끈 것이 있으면 개수가 단추에 붙는다 — 열이 왜 없는지 표만 보고 알 수 있어야 한다.
 */
export function ColumnPicker({ columns }: { columns: TableColumns }) {
  const { hidden, defaultHidden, toggleColumn: onToggle, setColumns: onSetMany, reset: onReset } = columns;
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const isDefault =
    hidden.size === defaultHidden.length && defaultHidden.every((k) => hidden.has(k));

  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', off);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', off);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 rounded-ctl border px-3.5 py-2 text-lead font-bold transition ${
          !isDefault
            ? 'border-brand-300 bg-brand-50 text-brand-800'
            : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700'
        }`}
      >
        열
        <span className="rounded-tag bg-slate-100 px-1.5 py-0.5 text-micro font-bold text-slate-500 tabular-nums">
          {PICKABLE.length - hidden.size + 1}
        </span>
      </button>

      {open && (
        /* 왼쪽 기준으로 오른쪽을 향해 연다 — right 기준이면 사이드바 밑으로 들어간다 */
        <div className="absolute left-0 top-full z-30 mt-1 max-h-[70vh] w-[210px] overflow-y-auto rounded-box border border-slate-200 bg-white p-1.5 shadow-lg">
          {PICK_GROUPS.map((group) => {
            // 그룹 머리의 체크가 그룹 전체를 켜고 끈다 — 일부만 켜져 있으면 indeterminate
            const keys = PICKABLE.filter((c) => c.group === group).map((c) => c.key);
            const onCount = keys.filter((k) => !hidden.has(k)).length;
            const allOn = onCount === keys.length;
            return (
            <div key={group}>
              <label className="flex cursor-pointer items-center gap-2 px-2 pb-0.5 pt-2 first:pt-1">
                <input
                  type="checkbox"
                  aria-label={`${group} 전체`}
                  checked={allOn}
                  ref={(el) => { if (el) el.indeterminate = onCount > 0 && !allOn; }}
                  onChange={() => onSetMany(keys, !allOn)}
                  className="h-3.5 w-3.5 accent-brand-600"
                />
                <span className="text-micro font-bold tracking-[0.12em] text-slate-400">
                  {group}
                </span>
              </label>
              {PICKABLE.filter((c) => c.group === group).map((c) => {
                const on = !hidden.has(c.key);
                return (
                  <label
                    key={c.key}
                    className="flex cursor-pointer items-center gap-2 rounded-ctl px-2 py-1.5 text-small font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => onToggle(c.key)}
                      className="h-3.5 w-3.5 accent-brand-600"
                    />
                    <span className="truncate">{c.label}</span>
                  </label>
                );
              })}
            </div>
            );
          })}
          {!isDefault && (
            <button
              type="button"
              onClick={() => { onReset(); setOpen(false); }}
              className="mt-1 w-full rounded-ctl border-t border-slate-100 px-2 py-1.5 text-tiny font-bold text-slate-400 transition hover:text-slate-700"
            >
              기본으로
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 「엑셀 받기」 — 표를 그대로 엑셀로 (한백 지시 2026-11-05 「표를 엑셀로 다운받게」).
 *
 * ★화면에서 보는 그대로★ — 걸러 둔 줄, 머리글로 고른 정렬, 「열」에서 켜 둔 열. 다른 열이 필요하면 「열」에서
 * 켜고 받는다. 자료는 이미 브라우저에 있어 서버에 다시 묻지 않는다 — 그래서 협력사는 자기 현장만, 금액은
 * 처음부터 없다(표에 실리는 값 그대로다). 만드는 코드(jszip)는 누를 때 불러온다 — 표를 여는 데 싣지 않는다.
 */
export function ExportButton({
  projects, columns, sort, tab, fileBase,
}: {
  /** 걸러 둔 줄 — 껍데기의 filtered */
  projects: ProjectSummary[];
  columns: TableColumns;
  sort: TableSort;
  tab: TableTab;
  /** 파일·시트 이름의 앞 — 「시공관리」면 시공관리_2026-11-05.xlsx */
  fileBase: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const [{ buildXlsx }, { downloadBlob }] = await Promise.all([
        import('@/lib/xlsx-write'),
        import('@/lib/download'),
      ]);
      const sheet = tableSheet(sortProjects(projects, sort.sort, sort.desc), columns.hidden, tab);
      const bytes = await buildXlsx({ name: fileBase, ...sheet });
      downloadBlob(
        new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
        `${fileBase}_${today()}.xlsx`
      );
    } catch {
      setError('엑셀을 만들지 못했습니다. 다시 눌러 주세요.');
    } finally {
      setBusy(false);
    }
  }

  const none = projects.length === 0;
  return (
    <span className="flex shrink-0 items-center gap-2">
      <Btn kind="side" busy={busy} busyLabel="만드는 중…" disabled={none} onClick={() => void download()}>
        {/* 못 하는 이유를 단추 이름에 적는다(화면 규칙 3) */}
        {none ? '0건 — 받을 것 없음' : '엑셀 받기'}
      </Btn>
      <Err>{error}</Err>
    </span>
  );
}

/**
 * 환경부 대기번호 칸.
 *
 * 칸을 떠날 때 저장한다. 글자마다 저장하면 「2026-5」 같은 반쪽 값이 계속 올라간다.
 */
function QueueCell({ p, canEdit }: { p: ProjectSummary; canEdit: boolean }) {
  const { busy, error, run } = useAction();

  // 자체투자·연동은 환경부 보조금을 받지 않는다 — 받을 대기번호가 없다
  if (!subsidized(p.bizType)) {
    return <span className="text-slate-300">해당없음</span>;
  }
  if (!canEdit) {
    return (
      <span className={`tabular-nums ${p.envQueueNo ? 'text-slate-700' : 'text-slate-300'}`}>
        {p.envQueueNo ?? '—'}
      </span>
    );
  }

  async function save(value: string) {
    const next = value.trim() === '' ? null : value.trim();
    if (next === p.envQueueNo) return;
    await run({
      url: `/api/projects/${p.id}/env-queue`,
      body: { value: next },
      fail: '저장하지 못했습니다.',
    });
  }

  return (
    <input
      /*
       * 비제어 입력에 key 를 건다 — 다른 세션이 값을 바꿔 새로 그려지면 옛 DOM 값이 남아, 포커스만 옮겨도 그 옛 값을
       * 되저장해 남의 편집을 덮었다 (감사 M7). 값이 바뀌면 칸을 새로 만든다.
       */
      key={p.envQueueNo ?? ''}
      aria-label={`${p.name} 환경부 대기번호`}
      defaultValue={p.envQueueNo ?? ''}
      placeholder="2026-595"
      disabled={busy}
      /* 표 칸에는 문구를 놓을 자리가 없다 — 빨간 테두리로 알리고 이유는 마우스를 올리면 나온다 */
      title={error ?? undefined}
      onBlur={(e) => void save(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      className={`w-[104px] rounded-ctl border px-2 py-1 text-small tabular-nums transition placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-100 ${
        error
          ? 'border-red-400 text-red-800'
          : p.envQueueNo
            ? 'border-slate-200 text-slate-800'
            : 'border-dashed border-slate-300 text-slate-500'
      } ${busy ? 'opacity-50' : 'hover:border-brand-300'}`}
    />
  );
}

/**
 * 단계 칸.
 *
 * 계약 단계는 서류·단가에서 유도되므로 고를 수 없다 — 글자로만 보여준다.
 * 공정 단계는 조건이 찬 것만 목록에 올린다. 못 고르는 값을 올려놓고 거절하지 않는다.
 */
function StageCell({
  p, col, canMove, onMove, busy, construction = false,
}: {
  p: ProjectSummary;
  col: BoardColumn;
  canMove: boolean;
  onMove: (p: ProjectSummary, status: ProcessStatus) => void;
  busy: boolean;
  /**
   * 시공관리 표인가 — 그러면 맞물리는 칸을 보드와 같은 이름(「환경부 승인 대기」)으로 부른다(감사 L3).
   * 같은 현장을 보드와 표가 다른 이름으로 부르면 둘이 다른 칸처럼 읽힌다(lib/board constructionLabelOf).
   */
  construction?: boolean;
}) {
  const name = (s: string) => (construction ? constructionLabelOf(s as ProcessStatus) : s);
  const fixed = !canMove || p.stage === 'intake' || p.holdState !== null;
  if (fixed) {
    // 색으로 계약·시공·멈춤을 가른다 — 138줄을 훑을 때 글자보다 색이 먼저 읽힌다
    return (
      <Badge tone={BAND_TONE[bandOfColumn(col)]}>{name(col)}</Badge>
    );
  }
  const options = PROCESS_STATUSES.filter((s) => s === p.status || p.entryOk.includes(s));
  return (
    <>
      <label className="sr-only" htmlFor={`stage-${p.id}`}>
        {p.name} 단계
      </label>
      <select
        id={`stage-${p.id}`}
        value={p.status}
        disabled={busy}
        onChange={(e) => onMove(p, e.target.value as ProcessStatus)}
        className="rounded-ctl border border-slate-200 bg-white px-2 py-1 text-tiny font-bold text-slate-700 transition hover:border-brand-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
      >
        {options.map((s) => (
          <option key={s} value={s}>
            {name(s)}
          </option>
        ))}
      </select>
    </>
  );
}

/** 그 칸을 적을 수 있나 — 시공사는 한백 전용 칸(환경부 승인일·충전기 발주일)을 못 적는다. 상세와 같은 목록이고 저장소가 다시 본다 */
function canDate(edit: ProcessEdit, field: TableDateField): boolean {
  return edit === 'all' || (edit === 'partner' && !isHanbaekOnlyProcessField(field));
}

/** 규칙상 없는 칸 — 고치는 자리를 주지 않는다(화면 규칙 10) */
function NaCell() {
  return (
    <td className="whitespace-nowrap px-3 py-2.5"><span className="text-slate-500">해당없음</span></td>
  );
}

/** 완료 선언의 표시 — 날짜와 따로 산다(날짜 없이 선언만 있는 옛 현장이 있다) */
function DoneMark({ gap = false }: { gap?: boolean }) {
  return (
    <span aria-label="완료 확인됨" title="완료 확인됨" className={`font-black text-ok-600 ${gap ? 'ml-1' : ''}`}>
      ✓
    </span>
  );
}

/**
 * 마일스톤 칸 — 날짜가 곧 그 일의 여부다.
 * 완료 체크가 따로 있는 단계(행위신고·충전기 수령·설치·개통)는 ✓ 를 얹는다.
 * 적을 수 있는 사람에게는 달력이다(DateEditCell).
 */
function MilestoneCell({
  p, field, label, date, done, canEdit = false,
}: {
  date: string | null;
  done?: boolean;
  /** 적는 칸이면 셋 다 준다 — 없으면 글자만 */
  p?: ProjectSummary;
  field?: TableDateField;
  label?: string;
  canEdit?: boolean;
}) {
  if (canEdit && p && field && label) {
    return <DateEditCell p={p} field={field} label={label} date={date} done={done} />;
  }
  return (
    <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">
      {date ? (
        <span className="text-slate-600">
          {date}
          {done && <DoneMark gap />}
        </span>
      ) : done ? (
        <DoneMark />
      ) : (
        <span className="text-slate-300">—</span>
      )}
    </td>
  );
}

/**
 * 표에서 적는 날짜 칸 — 표의 칸은 늘 열린 입력칸이다(화면 규칙 4 의 예외 — 여러 건을 쭉 넣는 자리).
 *
 * 고른 날짜는 서버가 다시 그려 줄 때까지 그 자리에 둔다 — 옛 날짜로 잠깐 되돌아가면 저장이 안 된 줄 안다.
 * 실패하면 서버 값으로 되돌리고 칸을 빨갛게 한다(이유는 마우스를 올리면 — 환경부 대기번호 칸과 같다).
 */
function DateEditCell({
  p, field, label, date, done,
}: {
  p: ProjectSummary;
  field: TableDateField;
  label: string;
  date: string | null;
  done?: boolean;
}) {
  const { busy, error, run } = useAction();
  /** 고른 값 — undefined 면 서버 값을 그린다 */
  const [picked, setPicked] = useState<string | null | undefined>(undefined);
  // 서버가 따라잡으면(다른 사람이 고친 것까지) 서버 값이 이긴다
  useEffect(() => setPicked(undefined), [date]);
  const shown = picked === undefined ? date : picked;

  async function save(next: string | null) {
    if (next === shown) return;
    setPicked(next);
    const ok = await run({
      url: `/api/projects/${p.id}/process`,
      body: { [field]: next },
      fail: '저장하지 못했습니다.',
    });
    if (!ok) setPicked(undefined);
  }

  return (
    <td className="whitespace-nowrap px-3 py-2">
      <span className="inline-flex items-center">
        <DatePicker
          size="sm"
          ariaLabel={`${p.name} ${label}`}
          value={shown}
          empty="—"
          disabled={busy}
          error={error}
          onChange={(v) => void save(v)}
        />
        {done && <DoneMark gap />}
      </span>
    </td>
  );
}

/** 값이 없는 칸은 흐리게 — 빈 칸이 눈에 걸리면 「안 적힌 현장」이 보인다 */
function Cell({ value }: { value: string | null }) {
  return (
    <td className={`whitespace-nowrap px-3 py-2.5 ${value ? 'text-slate-600' : 'text-slate-300'}`}>
      {value ?? '—'}
    </td>
  );
}

/**
 * 열 머리글의 필터.
 *
 * 값을 여러 개 고를 수 있다 — 「플러그링크와 SK만」이 실제로 묻는 방식이다.
 * 고를 수 있는 값은 지금 화면에 있는 것뿐이라, 걸어도 0건이 되는 값은 목록에 없다.
 */
function ColumnFilter({
  label, options, picked, onChange,
}: {
  label: string;
  options: string[];
  picked: string[];
  onChange: (values: string[]) => void;
}) {
  /*
   * 모양·동작은 공용 부품이 갖는다(components/CheckMenu) — 기성관리 필터가 같은 것을
   * 쓰면서 두 벌이 되었고, 두 벌이면 한쪽만 고쳐진다(2026-08-28). 여기는 표 머리글이라
   * 작은 ▾ 로 뜬다. 값이 문자열 목록이라 그대로 옵션으로 옮긴다.
   */
  return (
    <CheckMenu
      label={label}
      trigger="chip"
      options={options.map((v) => ({ value: v, label: v }))}
      picked={picked}
      onChange={onChange}
    />
  );
}

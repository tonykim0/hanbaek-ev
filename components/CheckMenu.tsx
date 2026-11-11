'use client';

/**
 * 눌러서 펴고, 안에서 체크하는 필터 — 노션의 필터와 같은 모양이다(한백 지시 2026-08-28).
 *
 * ★왜 칩이 아니라 드롭다운인가★ 고를 것이 넷을 넘으면 칩은 줄을 통째로 먹는다. 운영사가
 * 다섯이고 상태가 넷이라, 나란히 늘어놓으면 표보다 필터가 커진다. 접어 두고 고른 개수만
 * 단추에 적으면 한 줄에 둘이 들어간다.
 *
 * ★한 부품인 이유★ 이 모양이 현장 표의 열 머리글 필터에 이미 있었다(ProjectTable 의
 * ColumnFilter). 같은 것을 두 벌 두면 한쪽만 고쳐진다 — 열 머리글의 작은 ▾ 와 이름이 붙은
 * 단추는 자리만 다르므로 trigger 로 가른다.
 *
 * ★펴는 판은 포털로 띄운다★ (2026-11-11) — 현장 표가 제 상자 안에서 스크롤하게 되며(머리 줄을 붙여 두려고) 머리글 ▾ 의 판이
 * 그 상자에 잘렸다. 줄이 몇 안 되는 표에서 날짜 열의 달 목록을 펴면 판 아래가 사라졌다. 날짜 고르기(DatePicker)와 같은 길이다:
 * 문서 최상위에 고정 좌표로 띄우고, 화면 아래가 모자라면 위로 편다 · 바깥을 누르거나 스크롤하면 닫는다(고정 좌표라 어긋난다).
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface CheckOption {
  value: string;
  label: string;
}

/** 판의 줄 하나 · 목록 높이 상한 — 위 · 아래 어느 쪽에 펼지 어림하는 데만 쓴다 */
const ROW_H = 30;
const LIST_MAX = 280;

export default function CheckMenu({
  label, options, picked, onChange, trigger = 'button', width = 190, sepAt = -1,
}: {
  /** 무엇을 고르는 자리인가 — 단추와 도움말에 쓴다 */
  label: string;
  options: CheckOption[];
  picked: string[];
  onChange: (values: string[]) => void;
  /** button = 이름이 붙은 단추 · chip = 표 머리글의 작은 ▾ */
  trigger?: 'button' | 'chip';
  width?: number;
  /** 이 차례의 값 앞에 가는 선을 긋는다 — 날짜 열의 있음 · 없음 · 해당없음과 달 사이. -1 이면 없다 */
  sepAt?: number;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const r = btn.current!.getBoundingClientRect();
    const h = Math.min(LIST_MAX, options.length * ROW_H) + 12 + (picked.length > 0 ? 34 : 0);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    // 아래가 모자라면 위로 편다 — 아래 끝을 단추 위에 붙여, 고르며 「필터 해제」 줄이 생겨도 위로 자란다
    setPos(
      r.bottom + 4 + h > window.innerHeight && r.top - 4 - h > 0
        ? { left, bottom: window.innerHeight - r.top + 4 }
        : { left, top: r.bottom + 4 }
    );
    setOpen(true);
  };

  // 바깥을 누르면 닫는다(열린 채로 표를 훑으면 아래 줄이 가린다) · 스크롤하면 닫는다(판 안의 목록 스크롤은 빼고)
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => {
      const t = e.target as Node;
      if (box.current?.contains(t) || pop.current?.contains(t)) return;
      setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    const move = (e: Event) => {
      if (pop.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const resize = () => setOpen(false);
    document.addEventListener('mousedown', off);
    document.addEventListener('keydown', esc);
    window.addEventListener('scroll', move, true);
    window.addEventListener('resize', resize);
    return () => {
      document.removeEventListener('mousedown', off);
      document.removeEventListener('keydown', esc);
      window.removeEventListener('scroll', move, true);
      window.removeEventListener('resize', resize);
    };
  }, [open]);

  if (options.length === 0) return null;
  const on = picked.length > 0;
  /* 고른 것이 하나면 그 이름을 적는다 — 「운영사 1」보다 「운영사 · 에버온」이 읽힌다 */
  const only = picked.length === 1
    ? options.find((o) => o.value === picked[0])?.label ?? null
    : null;

  return (
    <div ref={box} className="relative">
      <button
        ref={btn}
        type="button"
        aria-label={`${label} 필터`}
        aria-expanded={open}
        onClick={toggle}
        className={
          trigger === 'chip'
            ? `rounded-tag px-1 py-0.5 text-micro font-black leading-none transition ${
              on ? 'bg-brand-600 text-white' : 'text-slate-300 hover:bg-slate-200 hover:text-slate-600'
            }`
            : `inline-flex shrink-0 items-center gap-1.5 rounded-ctl border px-3 py-2 text-small font-bold transition ${
              on
                ? 'border-brand-300 bg-brand-50 text-brand-800 hover:bg-brand-100'
                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
            }`
        }
      >
        {trigger === 'chip' ? (on ? picked.length : '▾') : (
          <>
            <span>{label}</span>
            {only && <span className="font-semibold text-brand-700">· {only}</span>}
            {!only && on && <span className="tabular-nums">{picked.length}</span>}
            <span aria-hidden className="text-slate-400">▾</span>
          </>
        )}
      </button>

      {open && pos && createPortal(
        <div
          ref={pop}
          style={{ width, left: pos.left, top: pos.top, bottom: pos.bottom }}
          className="fixed z-[100] rounded-box border border-slate-200 bg-white p-1.5 shadow-lg"
        >
          <div className="max-h-[280px] overflow-y-auto">
            {options.map((o, i) => {
              const checked = picked.includes(o.value);
              return (
                <label
                  key={o.value}
                  className={`flex cursor-pointer items-center gap-2 rounded-ctl px-2 py-1.5 text-small font-semibold text-slate-700 hover:bg-slate-50 ${
                    i === sepAt ? 'mt-1 border-t border-slate-100 pt-2' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      onChange(checked ? picked.filter((x) => x !== o.value) : [...picked, o.value])
                    }
                    className="h-3.5 w-3.5 accent-brand-600"
                  />
                  <span className="truncate">{o.label}</span>
                </label>
              );
            })}
          </div>
          {on && (
            <button
              type="button"
              onClick={() => { onChange([]); setOpen(false); }}
              className="mt-1 w-full rounded-ctl border-t border-slate-100 px-2 py-1.5 text-tiny font-bold text-slate-400 transition hover:text-slate-700"
            >
              {label} 필터 해제
            </button>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

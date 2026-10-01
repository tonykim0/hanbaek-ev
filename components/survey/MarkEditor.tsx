'use client';

/**
 * 사진 위에 번호를 찍는 자리 — 「어느 주차면에 몇 기」를 사진에서 보이게 (한백 지시 2026-10-01).
 *
 * 기존 제출본은 주차면(또는 서 있는 차) 위에 번호 동그라미를 워드·엑셀에서 손으로 얹었다.
 * 여기서 찍어 두면 서식에 넣을 때 사진에 합쳐 굽는다(lib/survey/prepare-image drawMarks) — 받은
 * 파일을 다시 열어 그릴 일이 없다.
 *
 *   빈 곳을 누른다     → 다음 번호
 *   번호를 끈다        → 옮긴다
 *   번호를 두 번 누른다 → 그 번호를 뺀다(뒤 번호가 하나씩 당겨진다)
 *
 * 찍은 수와 그 거점 설치 대수를 나란히 적는다 — 다르면 노랗게. 막지는 않는다(한 대를 두 장에 나눠
 * 보일 때가 있다).
 */
import { useEffect, useRef, useState } from 'react';
import { Btn } from '@/components/ui';
import type { Mark } from '@/lib/survey/spec';

/**
 * 원의 지름 — 폭에 대한 % 로. 굽는 크기가 「긴 변의 2.6%(반지름)」이라 세로 사진이면 폭보다 커진다.
 * 화면에서 본 크기와 받은 파일의 크기가 같아야 한다.
 */
export const markSize = (aspect: number) => `${5.2 * Math.max(1, 1 / (aspect || 1))}%`;

export function MarkOverlay({ marks, aspect }: { marks: Mark[]; aspect: number }) {
  const d = markSize(aspect);
  return (
    <>
      {marks.map((m, i) => (
        <span
          key={i}
          className="pointer-events-none absolute flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-[3px] border-[#e11d2a] bg-white/80 font-black text-[#e11d2a]"
          style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, width: d, aspectRatio: '1', fontSize: '10px' }}
        >
          {i + 1}
        </span>
      ))}
    </>
  );
}

export default function MarkEditor({ file, marks, expected, title, onDone, onClose }: {
  file: File;
  marks: Mark[];
  /** 그 거점의 설치 대수 — 찍은 수와 견준다 */
  expected?: number | null;
  title: string;
  onDone: (marks: Mark[]) => void;
  onClose: () => void;
}) {
  const [list, setList] = useState<Mark[]>(marks);
  const [url, setUrl] = useState<string | null>(null);
  const [aspect, setAspect] = useState(4 / 3);
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<{ i: number; moved: boolean } | null>(null);
  const lastTap = useRef<{ i: number; t: number } | null>(null);

  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const at = (e: { clientX: number; clientY: number }): Mark | null => {
    const r = frame.current?.getBoundingClientRect();
    if (!r || r.width === 0) return null;
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y };
  };

  const remove = (i: number) => setList((l) => l.filter((_, k) => k !== i));

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/80 p-3 sm:p-6" role="dialog" aria-label={title}>
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-2 rounded-t-box bg-white px-4 py-3">
        <span className="min-w-0 flex-1 text-base font-black text-slate-900">{title}</span>
        <span className={`text-base font-bold tabular-nums ${expected && expected !== list.length ? 'text-amber-700' : 'text-brand-700'}`}>
          번호 {list.length}{expected ? ` / 설치 ${expected}기` : ''}
        </span>
        <Btn size="sm" kind="quiet" disabled={list.length === 0} onClick={() => setList((l) => l.slice(0, -1))}>마지막 빼기</Btn>
        <Btn size="sm" kind="quiet" disabled={list.length === 0} onClick={() => setList([])}>모두 지우기</Btn>
        <Btn size="sm" kind="side" onClick={onClose}>취소</Btn>
        <Btn size="sm" onClick={() => onDone(list)}>완료</Btn>
      </div>
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 items-center justify-center overflow-auto rounded-b-box bg-slate-100 p-3">
        {url && (
          <div
            ref={frame}
            className="relative inline-block cursor-crosshair touch-none select-none"
            onPointerDown={(e) => {
              // 번호 위에서 누른 것은 끌기·지우기다 — 빈 곳만 새 번호를 찍는다
              if ((e.target as HTMLElement).dataset.mark !== undefined) return;
              const p = at(e);
              if (p) setList((l) => [...l, p]);
            }}
            onPointerMove={(e) => {
              if (!drag.current) return;
              const p = at(e);
              if (!p) return;
              drag.current.moved = true;
              const i = drag.current.i;
              setList((l) => l.map((m, k) => (k === i ? p : m)));
            }}
            onPointerUp={() => { drag.current = null; }}
            onPointerLeave={() => { drag.current = null; }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={title}
              draggable={false}
              onLoad={(e) => setAspect(e.currentTarget.naturalWidth / (e.currentTarget.naturalHeight || 1))}
              className="block max-h-[75vh] max-w-full"
            />
            {list.map((m, i) => (
              <span
                key={i}
                data-mark=""
                role="button"
                aria-label={`${i + 1}번 — 두 번 눌러 빼기`}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  (e.currentTarget.parentElement as HTMLElement).setPointerCapture?.(e.pointerId);
                  // 두 번 누름(마우스 더블클릭·손가락 두 번)은 빼기
                  const now = Date.now();
                  if (lastTap.current && lastTap.current.i === i && now - lastTap.current.t < 350) {
                    lastTap.current = null;
                    remove(i);
                    return;
                  }
                  lastTap.current = { i, t: now };
                  drag.current = { i, moved: false };
                }}
                className="absolute flex -translate-x-1/2 -translate-y-1/2 cursor-grab items-center justify-center rounded-full border-[3px] border-[#e11d2a] bg-white/80 font-black text-[#e11d2a] active:cursor-grabbing"
                style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%`, width: markSize(aspect), minWidth: 22, aspectRatio: '1', fontSize: 'clamp(10px, 2.2vw, 22px)' }}
              >
                {i + 1}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

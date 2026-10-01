'use client';

/**
 * 전체 도면에서 거점별 도면 자르기 (한백 지시 2026-10-02 「전체 도면에서 각 화면을 잘라서 거점별 도면으로」).
 *
 * 제출본의 사진대지 첫 칸 「도면 확대도」는 전체 평면도에서 그 거점 자리를 잘라 키운 것이다(같은 기호·배선·
 * 라벨이 그대로 보인다). 그 일을 여기서 한다: 거점을 고르고 도면 위를 끌면, 그 부분이 그 거점의 도면 확대도
 * 사진이 되고 그 안의 표시도 같이 옮겨 간다(옮긴 표시는 거점 사진에서 따로 고친다 — 도면과 묶이지 않는다).
 *
 * 고르는 틀은 사진대지 칸의 모양(가로 3 : 세로 2)으로 고정이다 — 칸에 넣을 때 다시 잘리지 않게.
 */
import { useEffect, useRef, useState } from 'react';
import { Btn, Choice } from '@/components/ui';
import { AnnotCanvas } from './MarkEditor';
import type { Annot } from '@/lib/survey/annot';
import type { CropRect } from '@/lib/survey/plan-crop';

export type { CropRect };
/** 사진대지 사진 칸(A6:L28)의 가로/세로 — 열 12칸 × 행 23줄 */
export const ZOOM_ASPECT = 1.5;

export default function PlanCrop({ file, marks, spots, crops, onCrop, onClose }: {
  file: File;
  /** 도면 위 표시(거점 라벨은 지금 값으로 풀어 둔 것) */
  marks: Annot[];
  /** 거점 이름 — 「1거점」… */
  spots: string[];
  /** 이미 자른 자리 — 거점 순번 → 틀 */
  crops: Record<number, CropRect | undefined>;
  onCrop: (spot: number, rect: CropRect) => Promise<void>;
  onClose: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [pick, setPick] = useState(() => Math.max(0, spots.findIndex((_, i) => !crops[i])));
  const [drag, setDrag] = useState<{ a: { x: number; y: number }; b: { x: number; y: number } } | null>(null);
  const [busy, setBusy] = useState(false);
  const [aspect, setAspect] = useState(4 / 3);
  const frame = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const at = (e: { clientX: number; clientY: number }) => {
    const r = frame.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };

  /** 끈 두 점 → 칸 모양(3:2)의 틀. 사진 밖으로 나가지 않게 줄인다 */
  const rectOf = (a: { x: number; y: number }, b: { x: number; y: number }): CropRect => {
    // 비율 좌표에서 3:2 — 사진의 가로/세로(aspect)를 감안해 높이를 정한다
    let w = Math.abs(b.x - a.x);
    let h = (w * aspect) / ZOOM_ASPECT;
    if (h < Math.abs(b.y - a.y)) { h = Math.abs(b.y - a.y); w = (h * ZOOM_ASPECT) / aspect; }
    if (w > 1) { w = 1; h = aspect / ZOOM_ASPECT; }
    if (h > 1) { h = 1; w = ZOOM_ASPECT / aspect; }
    const x = Math.min(Math.max(0, b.x >= a.x ? a.x : a.x - w), 1 - w);
    const y = Math.min(Math.max(0, b.y >= a.y ? a.y : a.y - h), 1 - h);
    return { x, y, w, h };
  };

  async function finish() {
    if (!drag) return;
    const r = rectOf(drag.a, drag.b);
    setDrag(null);
    if (r.w < 0.03) return; // 거의 안 끈 것은 실수로 본다
    setBusy(true);
    try {
      await onCrop(pick, r);
      // 다음 거점으로 — 아직 안 자른 것부터
      const next = spots.findIndex((_, i) => i > pick && !crops[i]);
      if (next >= 0) setPick(next);
    } finally {
      setBusy(false);
    }
  }

  const live = drag ? rectOf(drag.a, drag.b) : null;
  const box = (r: CropRect, color: string, name?: string, key?: string | number) => (
    <span
      key={key}
      className="pointer-events-none absolute border-2"
      style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%`, borderColor: color }}
    >
      {name && <span className="absolute left-0 top-0 px-1 text-tiny font-black text-white" style={{ background: color }}>{name}</span>}
    </span>
  );

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/80 p-3 sm:p-6" role="dialog" aria-label="거점별 도면 자르기">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 rounded-t-box bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 text-base font-black text-slate-900">거점별 도면 자르기</span>
          <Btn size="sm" onClick={onClose} disabled={busy}>완료</Btn>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {spots.map((n, i) => (
            <Choice key={n} on={pick === i} onClick={() => setPick(i)}>{n}{crops[i] ? ' ✓' : ''}</Choice>
          ))}
          <span className="text-small text-slate-500">
            {busy ? '자르는 중…' : `도면에서 ${spots[pick]} 자리를 끌어 고릅니다 — 고른 부분이 그 거점의 「도면 확대도」가 됩니다`}
          </span>
        </div>
      </div>
      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 overflow-auto rounded-b-box bg-slate-100 p-3">
        {url && (
          <div
            ref={frame}
            className="relative m-auto inline-block shrink-0 cursor-crosshair touch-none select-none"
            onPointerDown={(e) => { if (e.button !== 0 || busy) return; frame.current?.setPointerCapture?.(e.pointerId); const p = at(e); setDrag({ a: p, b: p }); }}
            onPointerMove={(e) => { if (drag && e.buttons) setDrag({ ...drag, b: at(e) }); }}
            onPointerUp={() => void finish()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt="전체 도면"
              draggable={false}
              onLoad={(e) => setAspect(e.currentTarget.naturalWidth / (e.currentTarget.naturalHeight || 1))}
              className="block max-h-[72vh] max-w-full"
            />
            <AnnotCanvas list={marks} />
            {spots.map((n, i) => (crops[i] ? box(crops[i]!, i === pick ? '#0ea5e9' : '#64748b', n, n) : null))}
            {live && box(live, '#0ea5e9', spots[pick], 'live')}
          </div>
        )}
      </div>
    </div>
  );
}

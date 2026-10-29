'use client';

/**
 * 서류 문구 수정 — 고친 쪽을 그대로 보여 주고, 고칠 자리의 상자를 끌어 옮기거나 늘린다.
 *
 * 캔버스는 원본 해상도 그대로다(보이는 크기만 CSS 로 줄인다) — 받을 PDF 와 화면이 같은 그림이어야 「이대로 받는다」가
 * 참이다. 상자는 원본 화소 좌표를 쪽 크기의 %로 얹는다. 끌 때의 화소 이동은 「캔버스 폭 ÷ 보이는 폭」을 곱해 옮긴다.
 */
import { useEffect, useRef } from 'react';
import { grow } from '@/lib/retouch/ink';
import { ensureFonts, paintEdits, type Edit, type FontKey, type Painted, type Raster } from '@/lib/retouch/paint';

/**
 * 그린 결과에 그 자리의 확대 비교를 붙인다 — 쪽 전체는 1/3 쯤으로 줄어 보여서 글꼴·굵기가 맞는지 거기서는 못 본다.
 * 원본 화소 그대로 잘라(앞뒤 글자 몇 개를 같이) 「원본 / 고친 뒤」로 나란히 세운다.
 */
export interface Shown extends Painted { before: string | null; after: string | null }

function cropOf(src: HTMLCanvasElement, ink: NonNullable<Painted['ink']>): string {
  const r = grow(ink, Math.max(24, ink.h * 2), Math.max(12, ink.h * 0.6));
  const x = Math.max(0, Math.floor(r.x)), y = Math.max(0, Math.floor(r.y));
  const w = Math.min(src.width - x, Math.ceil(r.w)), h = Math.min(src.height - y, Math.ceil(r.h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, w); c.height = Math.max(1, h);
  c.getContext('2d')?.drawImage(src, x, y, w, h, 0, 0, w, h);
  return c.toDataURL('image/png');
}

type Drag = { id: string; mode: 'move' | 'size'; x: number; y: number; box: Edit['box']; k: number };

export default function PageView({
  raster, base, edits, fonts, mono, selected, onSelect, onBox, onPainted,
}: {
  raster: Raster;
  /** 원본을 한 번 그려 둔 캔버스 — 다시 그릴 때마다 여기서 베낀다 */
  base: HTMLCanvasElement;
  edits: Edit[];
  fonts: Record<FontKey, string>;
  mono: boolean;
  selected: string | null;
  onSelect: (id: string) => void;
  onBox: (id: string, box: Edit['box']) => void;
  onPainted: (shown: Map<string, Shown>) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<Drag | null>(null);
  const gen = useRef(0);

  useEffect(() => {
    const cv = canvas.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    const mine = (gen.current += 1);
    void ensureFonts(fonts, edits).then(() => {
      if (mine !== gen.current) return; // 그새 또 바뀌었다 — 늦게 끝난 차례는 버린다
      ctx.drawImage(base, 0, 0);
      const painted = paintEdits(ctx, raster, edits, fonts, mono);
      const shown = new Map<string, Shown>();
      for (const [id, p] of painted) {
        shown.set(id, { ...p, before: p.ink ? cropOf(base, p.ink) : null, after: p.ink ? cropOf(cv, p.ink) : null });
      }
      onPainted(shown);
    });
    // onPainted 는 부모가 매번 새로 만든다 — 그것 때문에 다시 그리지 않는다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raster, base, edits, fonts, mono]);

  const pct = (v: number, of: number) => `${(v / of) * 100}%`;

  const start = (e: React.PointerEvent, ed: Edit, mode: Drag['mode']) => {
    e.stopPropagation();
    e.preventDefault();
    const shown = canvas.current?.clientWidth || raster.width;
    drag.current = { id: ed.id, mode, x: e.clientX, y: e.clientY, box: ed.box, k: raster.width / shown };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    onSelect(ed.id);
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.x) * d.k, dy = (e.clientY - d.y) * d.k;
    onBox(d.id, d.mode === 'move'
      ? { ...d.box, x: d.box.x + dx, y: d.box.y + dy }
      : { ...d.box, w: Math.max(6, d.box.w + dx), h: Math.max(6, d.box.h + dy) });
  };
  const end = () => { drag.current = null; };

  return (
    <div className="relative select-none">
      <canvas ref={canvas} width={raster.width} height={raster.height} className="block h-auto w-full border border-slate-200" />
      {edits.map((ed) => (
        <div
          key={ed.id}
          role="button"
          tabIndex={0}
          onPointerDown={(e) => start(e, ed, 'move')}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          /* 테두리는 상자 바깥에 두른다 — 안쪽에 그으면 줄어든 화면에서 고친 글자를 덮는다 */
          className={`absolute cursor-move rounded-[2px] outline-dashed outline-2 outline-offset-[3px] ${
            selected === ed.id ? 'outline-brand-600' : 'outline-amber-500/80'
          }`}
          style={{
            left: pct(ed.box.x, raster.width), top: pct(ed.box.y, raster.height),
            width: pct(ed.box.w, raster.width), height: pct(ed.box.h, raster.height),
          }}
        >
          <span
            onPointerDown={(e) => start(e, ed, 'size')}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize rounded-[2px] border border-white bg-brand-600"
          />
        </div>
      ))}
    </div>
  );
}

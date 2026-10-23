'use client';

/**
 * 위성사진 패널 배치 — 협력사 회의 Agenda 의 배치도를 만드는 자리.
 *
 * ★우리 DB 에 아무것도 안 쓴다★ — 사진도 결과도 브라우저 안에서만 돈다(제안서·실사보고서와 같다).
 *
 * 하는 일은 Agenda 21차 12~36쪽이 하던 그것이다: 위성사진에서 지붕면을 네 점으로 집고,
 * 그 안을 모듈 격자로 채우고, 센 장수에 출력을 곱해 「650(W)*136장=88.4kW」를 적는다.
 * 셈은 `lib/solar/layout` 이 하고 여기는 그리기와 조작만 한다.
 *
 * ★점은 SVG 로 얹는다★ (PhotoScanner 와 같은 길) — 캔버스에 같이 그리면 끌 때마다 사진까지
 * 다시 그려야 한다. 좌표는 원본 화소로 들고 viewBox 가 화면 크기를 맞춘다.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Btn, Err, PANEL, TEXT } from '@/components/ui';
import { downloadBlob } from '@/lib/download';
import {
  MODULE_650, capacityLabel, layoutPanels, totalOf, type Pt, type Quad,
} from '@/lib/solar/layout';

/** 지붕면 하나 — 사람이 찍은 네 점과 그 면의 조건 */
interface Block {
  id: string;
  quad: Quad;
  /** a→b 변의 실제 길이 (m) — 축척의 근거. 위성사진에는 축척이 없다 */
  edgeMeters: number;
  landscape: boolean;
  gap: number;
  margin: number;
}

/** 새 면은 사진 가운데에 선다 — 거기서 네 점을 끌어 맞춘다 */
function blockAt(w: number, h: number, n: number): Block {
  /* 면이 늘수록 조금씩 비껴 놓는다 — 겹쳐 놓으면 새로 생긴 것을 못 잡는다 */
  const off = (n % 4) * 0.04;
  const x0 = w * (0.22 + off);
  const x1 = w * (0.62 + off);
  const y0 = h * (0.22 + off);
  const y1 = h * (0.62 + off);
  return {
    id: `${Date.now()}-${n}`,
    quad: [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }],
    edgeMeters: 40,
    landscape: true,
    /* 구조물 위 모듈 사이 틈과 가장자리 여백 — 눌러 가며 맞춘다 */
    gap: 0.02,
    margin: 0.3,
  };
}

const COLORS = ['#1d4ed8', '#be123c', '#047857', '#b45309', '#6d28d9', '#0e7490'];

export default function LayoutBoard() {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const url = useRef<string | null>(null);

  useEffect(() => () => { if (url.current) URL.revokeObjectURL(url.current); }, []);

  function take(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('그림 파일을 넣어주세요 — 네이버 지도 위성사진 캡처면 됩니다.');
      return;
    }
    setError(null);
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => {
      setImg(el);
      setBlocks([blockAt(el.naturalWidth, el.naturalHeight, 0)]);
      setPicked(null);
    };
    el.onerror = () => setError('그림을 열지 못했습니다 — 다른 파일로 해주세요.');
    el.src = url.current;
  }

  const layouts = useMemo(
    () => blocks.map((b) => layoutPanels({ ...b, quad: b.quad, module: MODULE_650 })),
    [blocks]
  );
  const total = totalOf(layouts);
  const label = capacityLabel(MODULE_650, total.count);

  const set = (id: string, patch: Partial<Block>) =>
    setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  async function savePng() {
    if (!img) return;
    setBusy(true);
    setError(null);
    try {
      const blob = await drawPng(img, blocks, layouts, label);
      downloadBlob(blob, `배치도 ${label}.png`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {!img ? (
        <Drop onFile={take} error={error} />
      ) : (
        <>
          <div className="flex flex-col gap-4 lg:flex-row">
            <section className={`${PANEL} min-w-0 flex-1 p-3`}>
              <Canvas
                img={img}
                blocks={blocks}
                layouts={layouts}
                picked={picked}
                onPick={setPicked}
                onQuad={(id, q) => set(id, { quad: q })}
              />
            </section>

            <div className="flex w-full flex-col gap-3 lg:w-[320px] lg:shrink-0">
              <section className={`${PANEL} p-4`}>
                <h2 className={`${TEXT.section} mb-3`}>설비용량</h2>
                <p className="text-h2 font-black tabular-nums text-slate-900">{total.kw}kW</p>
                <p className={`${TEXT.meta} mt-1 tabular-nums`}>{label}</p>
              </section>

              {blocks.map((b, i) => (
                <BlockCard
                  key={b.id}
                  n={i + 1}
                  color={COLORS[i % COLORS.length]}
                  block={b}
                  cols={layouts[i].cols}
                  rows={layouts[i].rows}
                  count={layouts[i].count}
                  active={picked === b.id}
                  onPick={() => setPicked(b.id)}
                  onChange={(patch) => set(b.id, patch)}
                  onDrop={() => {
                    setBlocks((bs) => bs.filter((x) => x.id !== b.id));
                    setPicked(null);
                  }}
                />
              ))}

              <Btn
                kind="side"
                onClick={() => {
                  const nb = blockAt(img.naturalWidth, img.naturalHeight, blocks.length);
                  setBlocks((bs) => [...bs, nb]);
                  setPicked(nb.id);
                }}
              >
                지붕면 추가
              </Btn>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Btn onClick={() => void savePng()} busy={busy} busyLabel="그리는 중…" disabled={total.count === 0}>
              {total.count === 0 ? '패널 0장 — 배치도 없음' : '배치도 PNG 받기'}
            </Btn>
            <Btn kind="quiet" onClick={() => { setImg(null); setBlocks([]); setPicked(null); }}>
              다른 사진으로
            </Btn>
            <Err>{error}</Err>
          </div>
        </>
      )}
    </div>
  );
}

/* ── 사진 받기 ─────────────────────────────────────────────────────────── */

function Drop({ onFile, error }: { onFile: (f: File | undefined) => void; error: string | null }) {
  const [over, setOver] = useState(false);
  const pick = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => pick.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); onFile(e.dataTransfer.files[0]); }}
        className={`flex h-[320px] w-full flex-col items-center justify-center gap-2 rounded-panel border-2 border-dashed transition ${
          over ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-white hover:border-brand-400'
        }`}
      >
        <span className="text-h3 font-black text-slate-700">위성사진을 끌어다 놓으세요</span>
        <span className={TEXT.meta}>네이버 지도 캡처 · 눌러서 고를 수도 있습니다</span>
      </button>
      <input
        ref={pick}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <Err>{error}</Err>
    </div>
  );
}

/* ── 그림 + 네 점 + 패널 ───────────────────────────────────────────────── */

function Canvas({ img, blocks, layouts, picked, onPick, onQuad }: {
  img: HTMLImageElement;
  blocks: Block[];
  layouts: ReturnType<typeof layoutPanels>[];
  picked: string | null;
  onPick: (id: string) => void;
  onQuad: (id: string, q: Quad) => void;
}) {
  const [drag, setDrag] = useState<{ id: string; i: number } | null>(null);
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const thin = Math.max(1, W / 1200);
  const r = Math.max(7, W / 110);

  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!drag) return;
    const box = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * W;
    const y = ((e.clientY - box.top) / box.height) * H;
    const p: Pt = { x: Math.max(0, Math.min(W, x)), y: Math.max(0, Math.min(H, y)) };
    const b = blocks.find((q) => q.id === drag.id);
    if (!b) return;
    onQuad(drag.id, b.quad.map((q, i) => (i === drag.i ? p : q)) as Quad);
  };

  return (
    <div className="relative overflow-hidden rounded-box bg-slate-100">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={img.src} alt="위성사진" className="block w-full" />
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="absolute inset-0 h-full w-full touch-none"
        onPointerMove={move}
        onPointerUp={() => setDrag(null)}
        onPointerLeave={() => setDrag(null)}
      >
        {blocks.map((b, bi) => {
          const color = COLORS[bi % COLORS.length];
          const on = picked === null || picked === b.id;
          return (
            <g key={b.id} opacity={on ? 1 : 0.35}>
              <polygon
                points={b.quad.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke={color}
                strokeWidth={thin * 2}
                strokeDasharray={`${thin * 8} ${thin * 5}`}
                onPointerDown={() => onPick(b.id)}
              />
              {layouts[bi].cells.map((cell, ci) => (
                <polygon
                  key={ci}
                  points={cell.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill={color}
                  fillOpacity={0.55}
                  stroke="#ffffff"
                  strokeWidth={thin * 0.6}
                />
              ))}
              {b.quad.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={r}
                  fill={drag?.id === b.id && drag.i === i ? color : '#ffffff'}
                  stroke={color}
                  strokeWidth={thin * 2}
                  className="cursor-grab"
                  onPointerDown={(e) => {
                    (e.target as Element).setPointerCapture?.(e.pointerId);
                    onPick(b.id);
                    setDrag({ id: b.id, i });
                  }}
                />
              ))}
              {/* a→b 가 축척의 변이다 — 어느 변에 길이를 적는지 보여야 한다 */}
              <line
                x1={b.quad[0].x} y1={b.quad[0].y} x2={b.quad[1].x} y2={b.quad[1].y}
                stroke={color} strokeWidth={thin * 4}
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ── 면 하나의 조건 ────────────────────────────────────────────────────── */

function BlockCard({ n, color, block, cols, rows, count, active, onPick, onChange, onDrop }: {
  n: number;
  color: string;
  block: Block;
  cols: number;
  rows: number;
  count: number;
  active: boolean;
  onPick: () => void;
  onChange: (patch: Partial<Block>) => void;
  onDrop: () => void;
}) {
  return (
    <section
      className={`${PANEL} p-4 ${active ? 'ring-2 ring-brand-300' : ''}`}
      onPointerDown={onPick}
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: color }} />
        <h3 className={TEXT.group}>지붕면 {n}</h3>
        <span className={`${TEXT.meta} tabular-nums`}>
          {count > 0 ? `${cols}×${rows} · ${count}장` : '0장'}
        </span>
        {/* 지우기는 반대쪽 끝 — 자주 누르는 것과 붙여 두지 않는다(화면 규칙 8) */}
        <Btn kind="quiet" size="sm" className="ml-auto" onClick={onDrop}>빼기</Btn>
      </div>

      <div className="flex flex-col gap-2.5">
        <Num
          label="굵은 변의 실제 길이 (m)"
          value={block.edgeMeters}
          step={1}
          onChange={(v) => onChange({ edgeMeters: v })}
        />
        <div className="grid grid-cols-2 gap-2.5">
          <Num label="모듈 간격 (m)" value={block.gap} step={0.01} onChange={(v) => onChange({ gap: v })} />
          <Num label="가장자리 여백 (m)" value={block.margin} step={0.1} onChange={(v) => onChange({ margin: v })} />
        </div>
        <div className="flex gap-1.5">
          <Btn
            kind={block.landscape ? 'do' : 'side'}
            size="sm"
            onClick={() => onChange({ landscape: true })}
          >
            눕힘
          </Btn>
          <Btn
            kind={block.landscape ? 'side' : 'do'}
            size="sm"
            onClick={() => onChange({ landscape: false })}
          >
            세움
          </Btn>
        </div>
      </div>
    </section>
  );
}

function Num({ label, value, step, onChange }: {
  label: string;
  value: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className={TEXT.label}>{label}</span>
      <input
        type="number"
        min={0}
        step={step}
        value={value}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className="w-full rounded-ctl border border-slate-300 px-2.5 py-1.5 text-base tabular-nums outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
      />
    </label>
  );
}

/* ── PNG ───────────────────────────────────────────────────────────────── */

/**
 * 회의자료에 붙일 한 장 — 사진 + 패널 + 용량 글.
 * ★단서를 같이 굽는다★ — 위성지도 어림이라는 말이 그림에 붙어 있어야 한다(Agenda 의 그 문장).
 */
async function drawPng(
  img: HTMLImageElement,
  blocks: Block[],
  layouts: ReturnType<typeof layoutPanels>[],
  label: string
): Promise<Blob> {
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  if (!ctx) throw new Error('그림을 그리지 못했습니다 — 브라우저를 새로고침 해주세요.');

  ctx.drawImage(img, 0, 0, W, H);

  blocks.forEach((b, bi) => {
    const color = COLORS[bi % COLORS.length];
    ctx.lineWidth = Math.max(1, W / 1800);
    ctx.strokeStyle = '#ffffff';
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.62;
    for (const cell of layouts[bi].cells) {
      ctx.beginPath();
      ctx.moveTo(cell[0].x, cell[0].y);
      for (let i = 1; i < 4; i += 1) ctx.lineTo(cell[i].x, cell[i].y);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.stroke();
      ctx.globalAlpha = 0.62;
    }
    ctx.globalAlpha = 1;
  });

  /* 용량 글 — 왼쪽 아래, 반투명 띠 위에 (Agenda 의 그 자리) */
  const pad = Math.round(W / 60);
  const big = Math.max(16, Math.round(W / 26));
  const small = Math.round(big * 0.42);
  ctx.font = `700 ${big}px -apple-system, "Apple SD Gothic Neo", sans-serif`;
  const tw = ctx.measureText(label).width;
  const note = '위성지도를 참고하여 배치함 · 설치용량은 현장 실측 후 변경될 수 있음';
  ctx.font = `400 ${small}px -apple-system, "Apple SD Gothic Neo", sans-serif`;
  const nw = ctx.measureText(note).width;

  const bw = Math.max(tw, nw) + pad * 2;
  const bh = big + small + pad * 2.2;
  const bx = pad;
  const by = H - bh - pad;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
  ctx.fillRect(bx, by, bw, bh);

  ctx.fillStyle = '#ffffff';
  ctx.font = `700 ${big}px -apple-system, "Apple SD Gothic Neo", sans-serif`;
  ctx.textBaseline = 'top';
  ctx.fillText(label, bx + pad, by + pad * 0.7);
  ctx.fillStyle = 'rgba(255,255,255,0.78)';
  ctx.font = `400 ${small}px -apple-system, "Apple SD Gothic Neo", sans-serif`;
  ctx.fillText(note, bx + pad, by + pad * 0.7 + big * 1.12);

  return new Promise((ok, no) =>
    cv.toBlob((b) => (b ? ok(b) : no(new Error('PNG 로 묶지 못했습니다.'))), 'image/png')
  );
}

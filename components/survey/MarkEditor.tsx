'use client';

/**
 * 사진·도면 위에 표시를 그리는 자리 (한백 지시 2026-10-01).
 *
 * 표시의 종류와 모양은 제출본에서 왔다 — lib/survey/annot 머리말. 여기서 그려 두면 서식에 넣을 때
 * 사진에 합쳐 굽는다. ★그리는 함수가 하나다★ — 이 화면·미리보기·구운 사진이 모두 drawAnnots 를
 * 부르므로 본 대로 나온다(도구 단추의 기호 그림도 같은 drawSym 으로 그린다).
 *
 * ★조작은 「누르면 고른다」가 기본이다★ (한백 「사람 입장에서 편리한 조작」):
 *   · 이미 있는 표시를 누르면 골라진다(파란 점선 틀). 끌면 통째로 옮겨지고, 위 줄에서 크기·돌리기·빼기.
 *     Delete 키로도 뺀다. 선·동그라미·네모를 그리는 중에는 누르면 그리기다(표시 위에서 시작하는 선).
 *   · 크기는 작게·보통·크게 — 고른 표시에 바로 먹고, 다음에 찍는 것도 그 크기다. 도면은 작게로 연다.
 *   · 확대·축소 — 평면도는 칸이 촘촘해 100% 로는 주차면을 못 짚는다.
 *   · 선은 가로·세로에 가까우면 곧게 붙는다(annot snapPt).
 *
 *   번호      빈 곳을 누르면 다음 번호 · 두 번 누르면 뺌
 *   기호      충전기 · 충전기 분전반 · 기존 분전반 · 전신주 · IP 전주 (플러그링크) — 돌린 방향은 다음 것에도
 *   선        화살표 · 배선 경로 · 점선 · 지시선 — 누를 때마다 꺾이고, 두 번 누르거나 「선 끝」
 *   동그라미·네모  끌어서 그린다
 *   글자      고른(적은) 글자를 누른 자리에 — 자주 쓰는 말은 제출본의 글상자에서 셌다
 *   거점 라벨  거점 값으로 만든 도면 라벨을 누른 자리에 (플러그링크)
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Btn, Choice, FIELD_BASE, Picks } from '@/components/ui';
import {
  SYM_LABEL, annotBounds, drawAnnots, drawSym, hitAnnot, moveAnnot, numCount, snapPt,
  type Annot, type LineKind, type NumStyle, type Pt, type SymKind,
} from '@/lib/survey/annot';

type Tool = 'pick' | 'num' | 'sym' | 'line' | 'oval' | 'box' | 'text' | 'label';
const TOOLS: Array<{ key: Tool; label: string; hint: string }> = [
  { key: 'pick', label: '고르기', hint: '표시를 누르면 골라집니다 · 끌면 옮김' },
  { key: 'num', label: '번호', hint: '빈 곳을 누르면 다음 번호 · 두 번 누르면 뺌' },
  { key: 'sym', label: '기호', hint: '기호를 고르고 넣을 자리를 누릅니다' },
  { key: 'line', label: '선', hint: '누를 때마다 꺾입니다 · 두 번 누르거나 「선 끝」' },
  { key: 'oval', label: '동그라미', hint: '끌어서 그립니다' },
  { key: 'box', label: '네모', hint: '끌어서 그립니다' },
  { key: 'text', label: '글자', hint: '글자를 고르고 넣을 자리를 누릅니다' },
  { key: 'label', label: '거점 라벨', hint: '거점을 고르고 넣을 자리를 누릅니다' },
];
/** 누르면 그리는 도구 — 이미 있는 표시 위를 눌러도 고르지 않고 그린다 */
const DRAWS: Tool[] = ['line', 'oval', 'box'];

const SYMS: SymKind[] = ['charger', 'panelNew', 'panelOld', 'pole', 'ipPole'];
const LINES: Array<{ key: LineKind; label: string }> = [
  { key: 'arrow', label: '화살표' },
  { key: 'wire', label: '배선 경로' },
  { key: 'dash', label: '점선' },
  { key: 'leader', label: '지시선' },
];
const SIZES: Array<{ z: number; label: string }> = [
  { z: 0.7, label: '작게' },
  { z: 1, label: '보통' },
  { z: 1.4, label: '크게' },
];
const ZOOMS = [1, 1.5, 2, 3, 4];

/**
 * 자주 쓰는 글 — 2025~26 제출본의 사진대지·도면 글상자에서 많이 나온 말(플러그링크 엑셀 349곳,
 * 현대엔지니어링 별지). 고르면 입력칸에 들어가고 고칠 수 있다(「보도블럭 해체·복구 10m」처럼).
 */
const TEXT_PRESETS = [
  '기존 한전전주', 'IP전주 신설', '분전반 신설', '차단기 신설', '차단기 교체', '코어타공',
  '터파기', '보도블럭 해체·복구', '노출배관', '기설 트레이', 'CCTV', '한전 협의',
];

export interface SpotLabel { name: string; head: string[]; body: string[] }

/** 이미지 위에 표시를 그리는 캔버스 — 부모(사진과 같은 틀)를 꽉 채운다 */
export function AnnotCanvas({ list, style = 'red' }: { list: Annot[]; style?: NumStyle }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const draw = useCallback(() => {
    const c = ref.current;
    const box = c?.parentElement;
    if (!c || !box) return;
    const dpr = window.devicePixelRatio || 1;
    const w = box.clientWidth; const h = box.clientHeight;
    c.width = Math.max(1, Math.round(w * dpr));
    c.height = Math.max(1, Math.round(h * dpr));
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    drawAnnots(ctx, c.width, c.height, list, style);
  }, [list, style]);
  useEffect(() => {
    draw();
    const box = ref.current?.parentElement;
    if (!box || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(draw);
    ro.observe(box);
    return () => ro.disconnect();
  }, [draw]);
  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" />;
}

/** 기호 단추 그림 — 굽는 함수(drawSym)로 그린다, 범례와 같은 모양 */
function SymSwatch({ k }: { k: SymKind }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = 22 * dpr; c.height = 22 * dpr;
    ctx.clearRect(0, 0, c.width, c.height);
    // 칸(22px)의 70% 가 기호의 긴 변이 되게 — drawSym 의 크기는 긴 변 u 에 비례한다
    drawSym(ctx, k, c.width / 2, c.height / 2, (c.width * 0.7) / (0.016 * 1.3));
  }, [k]);
  return <canvas ref={ref} aria-hidden className="mr-1 inline-block h-[22px] w-[22px] align-middle" />;
}

export default function MarkEditor({
  file, marks, expected, title, style = 'red', legend = false, labels = [], line = 'arrow', size = 1, onDone, onClose,
}: {
  file: File;
  marks: Annot[];
  /** 그 거점의 설치 대수 — 찍은 번호 수와 견준다 */
  expected?: number | null;
  title: string;
  /** 번호 모양 — 서식이 정한다(lib/survey/spec markStyleOf) */
  style?: NumStyle;
  /** 도면 기호(충전기·분전반·전주)를 쓴다 — 플러그링크 */
  legend?: boolean;
  /** 거점 라벨 — 거점 값으로 만든 것(spec plSpotLabel). 비면 도구를 감춘다 */
  labels?: SpotLabel[];
  /** 처음 고른 선 — 도면은 배선 경로, 사진은 화살표 */
  line?: LineKind;
  /** 처음 크기 — 도면은 작게 */
  size?: number;
  onDone: (marks: Annot[]) => void;
  onClose: () => void;
}) {
  const [list, setList] = useState<Annot[]>(marks);
  const [draft, setDraft] = useState<Annot | null>(null);
  const [tool, setTool] = useState<Tool>(legend ? 'sym' : 'num');
  const [sym, setSym] = useState<SymKind>('charger');
  const [symRot, setSymRot] = useState(0);
  const [lineKind, setLineKind] = useState<LineKind>(line);
  const [z, setZ] = useState(size);
  const [text, setText] = useState('');
  const [label, setLabel] = useState<string | null>(labels[0]?.name ?? null);
  const [sel, setSel] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [fitW, setFitW] = useState<number | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [aspect, setAspect] = useState(4 / 3);
  const frame = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const drag = useRef<{ i: number; from: Pt; orig: Annot } | null>(null);
  const lastTap = useRef<{ i: number; t: number } | null>(null);
  const lastLineTap = useRef(0);
  const down = useRef(false);

  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  /* 그리던 선은 다른 일을 하면 끝낸 것으로 본다 — 두 점이 안 되면 버린다 */
  const commitDraft = useCallback((d: Annot | null = draft) => {
    if (d && d.t === 'line') {
      const pts = d.pts.slice(0, -1); // 마지막 점은 손가락을 따라오던 자리다
      if (pts.length >= 2) setList((l) => [...l, { ...d, pts }]);
    }
    setDraft(null);
  }, [draft]);

  const remove = useCallback((i: number) => {
    setList((l) => l.filter((_, k) => k !== i));
    setSel(null);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
      if (e.key === 'Escape') {
        if (draft) setDraft(null);
        else if (sel !== null) setSel(null);
        else onClose();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && sel !== null) {
        e.preventDefault();
        remove(sel);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [draft, sel, onClose, remove]);

  const at = (e: { clientX: number; clientY: number }): Pt | null => {
    const r = frame.current?.getBoundingClientRect();
    if (!r || r.width === 0) return null;
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
  };

  const pickTool = (t: Tool) => { commitDraft(); setSel(null); setTool(t); };
  const add = (a: Annot) => { setList((l) => [...l, a]); setSel(null); };
  /** 고른 표시를 고친다 */
  const patchSel = (f: (a: Annot) => Annot) => {
    if (sel === null) return;
    setList((l) => l.map((a, k) => (k === sel ? f(a) : a)));
  };

  function onDown(e: React.PointerEvent) {
    const p = at(e);
    if (!p) return;
    frame.current?.setPointerCapture?.(e.pointerId);
    down.current = true;
    const now = Date.now();
    const hit = DRAWS.includes(tool) ? -1 : hitAnnot(list, p, aspect);
    if (hit >= 0) {
      // 번호 도구에서 번호를 두 번 누르면 뺀다(빠르게 고쳐 찍는 일이 많다)
      if (tool === 'num' && list[hit].t === 'num' && lastTap.current?.i === hit && now - lastTap.current.t < 350) {
        lastTap.current = null;
        remove(hit);
        return;
      }
      lastTap.current = { i: hit, t: now };
      setSel(hit);
      drag.current = { i: hit, from: p, orig: list[hit] };
      return;
    }
    setSel(null);
    if (tool === 'num') add({ t: 'num', x: p.x, y: p.y, z });
    else if (tool === 'sym') add({ t: 'sym', k: sym, x: p.x, y: p.y, r: symRot, z });
    else if (tool === 'line') {
      if (!draft || draft.t !== 'line') {
        setDraft({ t: 'line', pts: [p, p], k: lineKind, z });
      } else if (now - lastLineTap.current < 350) {
        commitDraft();
      } else {
        const fixed = draft.pts.slice(0, -1);
        const q = snapPt(fixed[fixed.length - 1], p, aspect);
        setDraft({ ...draft, pts: [...fixed, q, q] });
      }
      lastLineTap.current = now;
    } else if (tool === 'oval' || tool === 'box') {
      setDraft({ t: tool, a: p, b: p, z });
    } else if (tool === 'text') {
      down.current = false;
      if (text.trim()) add({ t: 'text', x: p.x, y: p.y, text: text.trim(), z });
    } else if (tool === 'label') {
      down.current = false;
      const l = labels.find((x) => x.name === label);
      if (l) add({ t: 'label', x: p.x, y: p.y, head: l.head, body: l.body, z });
    }
  }

  function onMove(e: React.PointerEvent) {
    const p = at(e);
    if (!p) return;
    const d = drag.current;
    if (d && down.current) {
      setList((l) => l.map((a, k) => (k === d.i ? moveAnnot(d.orig, p.x - d.from.x, p.y - d.from.y) : a)));
      return;
    }
    if (draft?.t === 'line') {
      const fixed = draft.pts.slice(0, -1);
      setDraft({ ...draft, pts: [...fixed, snapPt(fixed[fixed.length - 1], p, aspect)] });
    } else if ((draft?.t === 'oval' || draft?.t === 'box') && down.current) {
      setDraft({ ...draft, b: p });
    }
  }

  function onUp() {
    down.current = false;
    drag.current = null;
    if (draft && (draft.t === 'oval' || draft.t === 'box')) {
      // 거의 안 끈 것은 실수로 본다
      if (Math.abs(draft.a.x - draft.b.x) > 0.01 || Math.abs(draft.a.y - draft.b.y) > 0.01) add(draft);
      setDraft(null);
    }
  }

  const shown = draft ? [...list, draft] : list;
  const nums = numCount(list);
  const tools = TOOLS.filter((t) => (t.key !== 'sym' || legend) && (t.key !== 'label' || labels.length > 0));
  const current = TOOLS.find((t) => t.key === tool)!;
  const picked = sel !== null ? list[sel] : null;
  const box = picked ? annotBounds([picked]) : null;
  /** 크기 단추 — 고른 표시가 있으면 그것을, 없으면 다음에 찍을 크기를 바꾼다 */
  const curZ = picked ? picked.z ?? 1 : z;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/80 p-3 sm:p-6" role="dialog" aria-label={title}>
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 rounded-t-box bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 text-base font-black text-slate-900">{title}</span>
          <span className={`text-base font-bold tabular-nums ${expected && expected !== nums ? 'text-amber-700' : 'text-brand-700'}`}>
            번호 {nums}{expected ? ` / 설치 ${expected}기` : ''}
          </span>
          <Btn size="sm" kind="side" onClick={onClose}>취소</Btn>
          <Btn
            size="sm"
            onClick={() => {
              // 그리던 선도 담아 낸다 — 마지막 점은 손가락을 따라오던 자리라 뺀다
              const tail = draft?.t === 'line' && draft.pts.length > 2 ? [{ ...draft, pts: draft.pts.slice(0, -1) }] : [];
              onDone([...list, ...tail]);
            }}
          >
            완료
          </Btn>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {tools.map((t) => (
            <Choice key={t.key} on={tool === t.key} onClick={() => pickTool(t.key)}>{t.label}</Choice>
          ))}
          <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden />
          <span className="text-small font-bold text-slate-500">크기</span>
          {SIZES.map((s) => (
            <Choice
              key={s.z}
              on={Math.abs(curZ - s.z) < 0.01}
              onClick={() => { setZ(s.z); patchSel((a) => ({ ...a, z: s.z })); }}
            >
              {s.label}
            </Choice>
          ))}
          <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden />
          <Btn size="sm" kind="quiet" disabled={zoom <= ZOOMS[0]} onClick={() => setZoom((v) => ZOOMS[Math.max(0, ZOOMS.indexOf(v) - 1)])}>－</Btn>
          <span className="w-12 text-center text-small font-bold tabular-nums text-slate-600">{Math.round(zoom * 100)}%</span>
          <Btn size="sm" kind="quiet" disabled={zoom >= ZOOMS[ZOOMS.length - 1]} onClick={() => setZoom((v) => ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(v) + 1)])}>＋</Btn>
        </div>

        {/* 둘째 줄 — 고른 표시가 있으면 그것을 다루고, 없으면 지금 도구의 고를 거리 */}
        <div className="flex min-h-9 flex-wrap items-center gap-1.5">
          {picked ? (
            <>
              <span className="text-small font-bold text-sky-700">고른 표시</span>
              {picked.t === 'sym' && (
                <Btn size="sm" kind="side" onClick={() => {
                  const r = ((picked.r ?? 0) + 90) % 180;
                  setSymRot(r);
                  patchSel((a) => (a.t === 'sym' ? { ...a, r } : a));
                }}>돌리기</Btn>
              )}
              <Btn size="sm" kind="undo" onClick={() => remove(sel!)}>빼기</Btn>
              <Btn size="sm" kind="quiet" onClick={() => setSel(null)}>고르기 풀기</Btn>
            </>
          ) : (
            <>
              {tool === 'sym' && SYMS.map((k) => (
                <Choice key={k} on={sym === k} onClick={() => setSym(k)}><SymSwatch k={k} />{SYM_LABEL[k]}</Choice>
              ))}
              {tool === 'line' && LINES.map((l) => (
                <Choice key={l.key} on={lineKind === l.key} onClick={() => { commitDraft(); setLineKind(l.key); }}>{l.label}</Choice>
              ))}
              {tool === 'line' && draft?.t === 'line' && <Btn size="sm" kind="side" onClick={() => commitDraft()}>선 끝</Btn>}
              {tool === 'text' && (
                <>
                  <input value={text} onChange={(e) => setText(e.target.value)} placeholder="넣을 글자" className={`${FIELD_BASE} w-56`} />
                  <Picks options={TEXT_PRESETS} onPick={setText} />
                </>
              )}
              {tool === 'label' && labels.map((l) => (
                <Choice key={l.name} on={label === l.name} onClick={() => setLabel(l.name)}>{l.name}</Choice>
              ))}
              {tool === 'label' && (() => {
                const l = labels.find((x) => x.name === label);
                return l ? <span className="text-small text-slate-500">{[...l.head, ...l.body].join(' · ')}</span> : null;
              })()}
            </>
          )}
          <span className="ml-auto flex items-center gap-1.5">
            <span className="text-small text-slate-500">{picked ? 'Delete 키로도 뺍니다' : current.hint}</span>
            <Btn size="sm" kind="quiet" disabled={!draft && list.length === 0} onClick={() => { setSel(null); if (draft) setDraft(null); else setList((l) => l.slice(0, -1)); }}>되돌리기</Btn>
            <Btn size="sm" kind="quiet" disabled={list.length === 0} onClick={() => { setSel(null); setDraft(null); setList([]); }}>모두 지우기</Btn>
          </span>
        </div>
      </div>

      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 overflow-auto rounded-b-box bg-slate-100 p-3">
        {url && (
          <div
            ref={frame}
            className={`relative m-auto inline-block shrink-0 touch-none select-none ${tool === 'pick' ? 'cursor-default' : 'cursor-crosshair'}`}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={img}
              src={url}
              alt={title}
              draggable={false}
              onLoad={(e) => {
                setAspect(e.currentTarget.naturalWidth / (e.currentTarget.naturalHeight || 1));
                setFitW(e.currentTarget.clientWidth);
              }}
              // 확대하면 처음 맞춘 폭의 배수로 — 표시는 사진 크기 비율이라 같이 커진다(구운 모양 그대로)
              style={zoom > 1 && fitW ? { width: fitW * zoom, maxWidth: 'none', maxHeight: 'none' } : undefined}
              className="block max-h-[70vh] max-w-full"
            />
            <AnnotCanvas list={shown} style={style} />
            {box && (
              <span
                aria-hidden
                className="pointer-events-none absolute rounded-sm border-2 border-dashed border-sky-500"
                style={{ left: `${box.x0 * 100}%`, top: `${box.y0 * 100}%`, width: `${(box.x1 - box.x0) * 100}%`, height: `${(box.y1 - box.y0) * 100}%` }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

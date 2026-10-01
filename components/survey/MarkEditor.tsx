'use client';

/**
 * 사진·도면 위에 표시를 그리는 자리 (한백 지시 2026-10-01).
 *
 * 표시의 종류와 모양은 제출본에서 왔다 — lib/survey/annot 머리말. ★그리는 함수가 하나다★ — 이 화면·
 * 미리보기·구운 사진이 모두 drawAnnots 를 부르고, 엑셀 도형도 같은 상자(boxOf)에서 나온다.
 *
 * ★조작은 파워포인트처럼★ (한백 「고르기 기능 말고, 클릭하면 객체는 다 선택해서 조정 가능하게 · 회전은
 * 위에 꼭지 잡아서 · 모든 객체의 크기는 모서리를 잡고」):
 *   · 표시를 누르면 골라진다 — 파란 틀에 모서리 손잡이 넷과 위 회전 꼭지. 끌면 옮기고, 모서리를 끌면
 *     크기, 꼭지를 끌면 회전(15° 근처에서 붙는다). Delete 로 빼고, 화살표 키로 한 칸씩 민다.
 *   · 도구를 고르면 빈 곳을 누를 때 그것이 찍힌다 — 표시 위를 누르면 찍지 않고 고른다(같은 자리에
 *     하나 더 찍히지 않게). 고른 도구를 다시 누르면 풀린다.
 *   · 지우기 — 도구 줄의 「지우기」를 켜고 표시를 누르면 지워진다(Delete 키는 고른 것을). 오른쪽 단추로
 *     지우던 것은 걷었다 — 손에 따라 안 먹었다(한백 「안 되는데 그냥 없애줘, 지우기 기능을 추가」). 고른 틀 옆의
 *     「빼기」 단추도 걷었다(잘 안 보였다).
 *   · 되돌리기 — 찍기·지우기·옮기기·크기·회전을 하나씩 거꾸로(마지막 것만 빼던 것을 바꿨다 — 지운 것도 살아난다).
 *   · 선 — 누를 때마다 꺾이고, 두 번 누르거나 「선 끝」. 기호·번호를 누르면 그 가운데에 붙는다(분전반에서
 *     분전반으로 잇는 배선이 정확히 닿게). 가로·세로에 가까우면 곧게 붙는다.
 *   · 크기를 바꾼 기호·번호·글자는 다음에 찍는 같은 것도 그 크기로 나온다 — 충전기 넷을 하나씩 줄이지 않게.
 *   · 확대·축소 — 평면도는 칸이 촘촘해 100% 로는 주차면을 못 짚는다.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Btn, Choice, FIELD_BASE, Picks } from '@/components/ui';
import {
  SYM_LABEL, boxOf, drawAnnots, drawSym, hitAnnot, moveAnnot, numCount, resizeAnnot, resolveLabels, rotateAnnot, snapPt,
  type Annot, type LineKind, type NumStyle, type Pt, type SpotLabel, type SymKind,
} from '@/lib/survey/annot';

/* 동그라미는 걷었다(한백 「동그라미는 필요 없어」) — 예전에 그린 동그라미는 그대로 그려지고 고를 수 있다 */
type Tool = 'num' | 'sym' | 'line' | 'box' | 'text' | 'label' | 'erase';
const TOOLS: Array<{ key: Tool; label: string; hint: string }> = [
  { key: 'num', label: '번호', hint: '빈 곳을 누르면 다음 번호' },
  { key: 'sym', label: '기호', hint: '기호를 고르고 빈 곳을 누릅니다' },
  { key: 'line', label: '선', hint: '누를 때마다 꺾입니다 · 두 번 누르거나 「선 끝」 · 기호를 누르면 가운데에 붙습니다' },
  { key: 'box', label: '네모', hint: '빈 곳에서 끌어서 그립니다' },
  { key: 'text', label: '글자', hint: '글자를 고르고 빈 곳을 누릅니다' },
  { key: 'label', label: '거점 라벨', hint: '거점을 고르고 빈 곳을 누릅니다' },
  { key: 'erase', label: '지우기', hint: '지울 표시를 누릅니다 · 잘못 지웠으면 되돌리기' },
];

const SYMS: SymKind[] = ['charger', 'panelNew', 'panelOld', 'pole', 'ipPole'];
const LINES: Array<{ key: LineKind; label: string }> = [
  { key: 'arrow', label: '화살표' },
  { key: 'wire', label: '배선 경로' },
  { key: 'dash', label: '점선' },
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

export type { SpotLabel };

/** 다음에 찍을 크기를 기억하는 갈래 — 기호는 종류마다 */
const kindKey = (a: Annot) => (a.t === 'sym' ? `sym:${a.k}` : a.t);

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
    drawSym(ctx, k, c.width / 2, c.height / 2, (c.width * 0.7) / (0.016 * 1.3));
  }, [k]);
  return <canvas ref={ref} aria-hidden className="mr-1 inline-block h-[22px] w-[22px] align-middle" />;
}

type Op =
  | { kind: 'move'; i: number; orig: Annot; from: Pt }
  | { kind: 'resize'; i: number; orig: Annot; sx: number; sy: number }
  | { kind: 'rotate'; i: number; orig: Annot; a0: number };

export default function MarkEditor({
  file, marks, expected, title, style = 'red', legend = false, labels = [], labelPick, line = 'arrow', size = 1, onDone, onClose,
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
  /** 처음 고른 라벨 — 거점 사진이면 그 거점 */
  labelPick?: string;
  /** 처음 고른 선 — 도면은 배선 경로, 사진은 화살표 */
  line?: LineKind;
  /** 처음 찍는 크기 — 도면은 작게 */
  size?: number;
  onDone: (marks: Annot[]) => void;
  onClose: () => void;
}) {
  const [list, setList] = useState<Annot[]>(marks);
  const [draft, setDraft] = useState<Annot | null>(null);
  const [tool, setTool] = useState<Tool | null>(legend ? 'sym' : 'num');
  const [sym, setSym] = useState<SymKind>('charger');
  const [lineKind, setLineKind] = useState<LineKind>(line === ('leader' as LineKind) ? 'arrow' : line);
  const [text, setText] = useState('');
  const [label, setLabel] = useState<string | null>(labelPick ?? labels[0]?.name ?? null);
  const [sel, setSel] = useState<number | null>(null);
  const [zoom, setZoom] = useState(1);
  const [fitW, setFitW] = useState<number | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: 1, h: 1 });
  const [url, setUrl] = useState<string | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const op = useRef<Op | null>(null);
  const lastZ = useRef<Record<string, number>>({});
  const lastTap = useRef<{ i: number; t: number } | null>(null);
  const lastLineTap = useRef(0);

  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  /* 틀의 화면 크기 — 표시의 상자는 이 픽셀로 잰다(긴 변 비례라 구운 사진과 같은 모양) */
  useEffect(() => {
    const el = frame.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setDims({ w: el.clientWidth || 1, h: el.clientHeight || 1 }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [url]);
  const { w: W, h: H } = dims;

  const zOf = (key: string) => lastZ.current[key] ?? size;

  /*
   * 되돌리기 — 바꾸기 직전의 목록을 쌓는다. 끌기는 시작할 때 한 번 쌓고, 끝나서 그대로면(누르기만 한 것) 걷는다.
   */
  const past = useRef<Annot[][]>([]);
  const [undoN, setUndoN] = useState(0);
  const listRef = useRef(list);
  listRef.current = list;
  const snap = useCallback(() => {
    past.current.push(listRef.current);
    if (past.current.length > 200) past.current.shift();
    setUndoN(past.current.length);
  }, []);
  const undo = () => {
    setSel(null);
    if (draft) { setDraft(null); return; }
    const prev = past.current.pop();
    setUndoN(past.current.length);
    if (prev) setList(prev);
  };

  /* 그리던 선은 다른 일을 하면 끝낸 것으로 본다 — 두 점이 안 되면 버린다 */
  const commitDraft = useCallback((d: Annot | null = draft) => {
    if (d && d.t === 'line') {
      const pts = d.pts.slice(0, -1); // 마지막 점은 손가락을 따라오던 자리다
      if (pts.length >= 2) {
        snap();
        setList((l) => { setSel(l.length); return [...l, { ...d, pts }]; });
      }
    }
    setDraft(null);
  }, [draft, snap]);

  const remove = useCallback((i: number) => {
    snap();
    setList((l) => l.filter((_, k) => k !== i));
    setSel(null);
  }, [snap]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
      if (e.key === 'Escape') {
        // 그리던 것 → 고른 것 → 도구 순으로 푼다. 창은 닫지 않는다(그린 것을 잃는다)
        if (draft) setDraft(null);
        else if (sel !== null) setSel(null);
        else setTool(null);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && sel !== null) {
        e.preventDefault();
        remove(sel);
      } else if (sel !== null && e.key.startsWith('Arrow')) {
        e.preventDefault();
        const step = (e.shiftKey ? 10 : 1);
        const dx = e.key === 'ArrowLeft' ? -step / W : e.key === 'ArrowRight' ? step / W : 0;
        const dy = e.key === 'ArrowUp' ? -step / H : e.key === 'ArrowDown' ? step / H : 0;
        snap();
        setList((l) => l.map((a, k) => (k === sel ? moveAnnot(a, dx, dy) : a)));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [draft, sel, remove, snap, W, H]);

  const at = (e: { clientX: number; clientY: number }): Pt | null => {
    const r = frame.current?.getBoundingClientRect();
    if (!r || r.width === 0) return null;
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
    };
  };

  const pickTool = (t: Tool) => { commitDraft(); setSel(null); setTool((cur) => (cur === t ? null : t)); };
  /** 고른 표시를 고친다 */
  const patchSel = (f: (a: Annot) => Annot) => {
    if (sel === null) return;
    snap();
    setList((l) => l.map((a, k) => (k === sel ? f(a) : a)));
  };
  const add = (a: Annot) => { snap(); setList((l) => { setSel(l.length); return [...l, a]; }); };
  /** 끌기를 시작한다 — 되돌리기 자리를 하나 쌓아 둔다(끝나서 그대로면 onUp 이 걷는다) */
  const begin = (o: Op) => { snap(); op.current = o; };

  function onDown(e: React.PointerEvent) {
    // 왼쪽 단추만 — 오른쪽·가운데 단추는 쓰지 않는다(오른쪽으로 지우던 것은 걷었다)
    if (e.button !== 0) return;
    const p = at(e);
    if (!p) return;
    frame.current?.setPointerCapture?.(e.pointerId);
    const handle = (e.target as HTMLElement).dataset?.h;
    // 손잡이 — 고른 표시의 크기·회전
    if (handle && sel !== null) {
      const orig = list[sel];
      if (handle === 'rot') {
        const b = boxOf(orig, W, H);
        begin({ kind: 'rotate', i: sel, orig, a0: Math.atan2(p.y * H - b.cy, p.x * W - b.cx) });
      } else {
        begin({ kind: 'resize', i: sel, orig, sx: handle.includes('e') ? 1 : -1, sy: handle.includes('s') ? 1 : -1 });
      }
      return;
    }
    const now = Date.now();
    const hit = hitAnnot(list, p.x * W, p.y * H, W, H);

    if (tool === 'erase') {
      if (hit >= 0) remove(hit);
      return;
    }

    if (tool === 'line') {
      // 기호·번호를 누르면 그 가운데에 붙는다 — 분전반에서 분전반으로 정확히 잇게
      const target = hit >= 0 ? list[hit] : null;
      const center = target && (target.t === 'sym' || target.t === 'num') ? { x: target.x, y: target.y } : null;
      if (!draft || draft.t !== 'line') {
        if (target && target.t === 'line') { setSel(hit); begin({ kind: 'move', i: hit, orig: target, from: p }); return; }
        setSel(null);
        const q = center ?? p;
        setDraft({ t: 'line', pts: [q, q], k: lineKind });
      } else if (now - lastLineTap.current < 350) {
        commitDraft();
      } else {
        const fixed = draft.pts.slice(0, -1);
        const q = center ?? snapPt(fixed[fixed.length - 1], p, W / H);
        setDraft({ ...draft, pts: [...fixed, q, q] });
      }
      lastLineTap.current = now;
      return;
    }

    if (hit >= 0) {
      // 번호 도구에서 번호를 두 번 누르면 뺀다(빠르게 고쳐 찍는 일이 많다)
      if (tool === 'num' && list[hit].t === 'num' && lastTap.current?.i === hit && now - lastTap.current.t < 350) {
        lastTap.current = null;
        remove(hit);
        return;
      }
      lastTap.current = { i: hit, t: now };
      setSel(hit);
      begin({ kind: 'move', i: hit, orig: list[hit], from: p });
      return;
    }
    setSel(null);
    if (tool === 'num') add({ t: 'num', x: p.x, y: p.y, z: zOf('num') });
    else if (tool === 'sym') add({ t: 'sym', k: sym, x: p.x, y: p.y, z: zOf(`sym:${sym}`) });
    else if (tool === 'box') setDraft({ t: tool, a: p, b: p });
    else if (tool === 'text' && text.trim()) add({ t: 'text', x: p.x, y: p.y, text: text.trim(), z: zOf('text') });
    else if (tool === 'label') {
      const l = labels.find((x) => x.name === label);
      // 거점 번호를 같이 적어 둔다 — 그 거점 값이 바뀌면 라벨 글이 따라 바뀐다(resolveLabels)
      const spot = Number(/^(\d+)거점$/.exec(l?.name ?? '')?.[1]) || undefined;
      if (l) add({ t: 'label', x: p.x, y: p.y, head: l.head, body: l.body, spot, z: zOf('label') });
    }
  }

  function onMove(e: React.PointerEvent) {
    const p = at(e);
    if (!p) return;
    const o = op.current;
    if (o) {
      let next: Annot;
      if (o.kind === 'move') next = moveAnnot(o.orig, p.x - o.from.x, p.y - o.from.y);
      else if (o.kind === 'resize') next = resizeAnnot(o.orig, o.sx, o.sy, p.x * W, p.y * H, W, H);
      else {
        const b = boxOf(o.orig, W, H);
        const a1 = Math.atan2(p.y * H - b.cy, p.x * W - b.cx);
        next = rotateAnnot(o.orig, ((a1 - o.a0) * 180) / Math.PI, W, H);
      }
      setList((l) => l.map((a, k) => (k === o.i ? next : a)));
      return;
    }
    if (draft?.t === 'line') {
      const fixed = draft.pts.slice(0, -1);
      setDraft({ ...draft, pts: [...fixed, snapPt(fixed[fixed.length - 1], p, W / H)] });
    } else if ((draft?.t === 'oval' || draft?.t === 'box') && e.buttons) {
      setDraft({ ...draft, b: p });
    }
  }

  function onUp() {
    const o = op.current;
    op.current = null;
    // 누르기만 하고 안 움직였으면 쌓아 둔 되돌리기 자리는 걷는다(같은 목록이다)
    if (o && past.current.length && past.current[past.current.length - 1] === listRef.current) {
      past.current.pop();
      setUndoN(past.current.length);
    }
    // 크기를 바꾼 것은 다음에 찍는 같은 것의 크기가 된다
    if (o?.kind === 'resize') {
      const a = list[o.i];
      if (a && a.z !== undefined) lastZ.current[kindKey(a)] = a.z;
    }
    if (draft && (draft.t === 'oval' || draft.t === 'box')) {
      // 거의 안 끈 것은 실수로 본다
      if (Math.abs(draft.a.x - draft.b.x) > 0.01 || Math.abs(draft.a.y - draft.b.y) > 0.01) add(draft);
      setDraft(null);
    }
  }

  const shown = resolveLabels(draft ? [...list, draft] : list, labels);
  const nums = numCount(list);
  const tools = TOOLS.filter((t) => (t.key !== 'sym' || legend) && (t.key !== 'label' || labels.length > 0));
  const current = tool ? TOOLS.find((t) => t.key === tool)! : null;
  const picked = sel !== null ? shown[sel] ?? null : null;

  /* 고른 표시의 틀 — 돌린 상자의 네 모서리 · 위 꼭지(화면 픽셀) */
  const handles = useMemo(() => {
    if (!picked || W <= 1) return null;
    const b = boxOf(picked, W, H);
    const t = (b.r * Math.PI) / 180;
    const pt = (lx: number, ly: number) => ({ x: b.cx + lx * Math.cos(t) - ly * Math.sin(t), y: b.cy + lx * Math.sin(t) + ly * Math.cos(t) });
    const hw = b.w / 2 + 4; const hh = b.h / 2 + 4;
    return {
      corners: { nw: pt(-hw, -hh), ne: pt(hw, -hh), se: pt(hw, hh), sw: pt(-hw, hh) },
      top: pt(0, -hh),
      rot: pt(0, -hh - 22),
    };
  }, [picked, W, H]);

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
          <Btn size="sm" kind="quiet" disabled={zoom <= ZOOMS[0]} onClick={() => setZoom((v) => ZOOMS[Math.max(0, ZOOMS.indexOf(v) - 1)])}>－</Btn>
          <span className="w-12 text-center text-small font-bold tabular-nums text-slate-600">{Math.round(zoom * 100)}%</span>
          <Btn size="sm" kind="quiet" disabled={zoom >= ZOOMS[ZOOMS.length - 1]} onClick={() => setZoom((v) => ZOOMS[Math.min(ZOOMS.length - 1, ZOOMS.indexOf(v) + 1)])}>＋</Btn>
          <span className="ml-auto flex items-center gap-1.5">
            <Btn size="sm" kind="quiet" disabled={!draft && undoN === 0} onClick={undo}>되돌리기</Btn>
            <Btn size="sm" kind="quiet" disabled={list.length === 0} onClick={() => { snap(); setSel(null); setDraft(null); setList([]); }}>모두 지우기</Btn>
          </span>
        </div>

        {/*
          둘째 줄 — 지금 도구의 고를 거리(늘 보인다). 표시를 골랐으면 오른쪽에 그 표시의 일.
          ★기호·선·라벨 종류를 누르면 다음에 찍을 것이 바뀐다★ — 고른 표시를 바꾸지 않는다(충전기를 고른 채
          분전반을 누르면 분전반을 하나 더 찍으려는 것이다). 고른 글상자만은 입력칸이 그 글을 고친다.
        */}
        <div className="flex min-h-9 flex-wrap items-center gap-1.5">
          {tool === 'sym' && SYMS.map((k) => (
            <Choice key={k} on={sym === k} onClick={() => { setSym(k); setSel(null); }}><SymSwatch k={k} />{SYM_LABEL[k]}</Choice>
          ))}
          {tool === 'line' && LINES.map((l) => (
            <Choice key={l.key} on={lineKind === l.key} onClick={() => { commitDraft(); setLineKind(l.key); setSel(null); }}>{l.label}</Choice>
          ))}
          {tool === 'line' && draft?.t === 'line' && <Btn size="sm" kind="side" onClick={() => commitDraft()}>선 끝</Btn>}
          {tool === 'text' && (
            <>
              <input
                value={picked?.t === 'text' ? picked.text : text}
                onChange={(e) => { setText(e.target.value); patchSel((a) => (a.t === 'text' ? { ...a, text: e.target.value } : a)); }}
                placeholder="넣을 글자"
                className={`${FIELD_BASE} w-56`}
              />
              <Picks options={TEXT_PRESETS} onPick={(v) => { setText(v); patchSel((a) => (a.t === 'text' ? { ...a, text: v } : a)); }} />
            </>
          )}
          {tool === 'label' && labels.map((l) => (
            <Choice key={l.name} on={label === l.name} onClick={() => { setLabel(l.name); setSel(null); }}>{l.name}</Choice>
          ))}
          {!picked && (
            <span className="text-small text-slate-500">{current ? current.hint : '표시를 누르면 골라집니다 · 위에서 도구를 고르면 그것을 찍습니다'}</span>
          )}
          {picked && (
            <span className="ml-auto text-small text-slate-500">끌면 옮김 · 모서리는 크기 · 위 꼭지는 회전 · Delete 키나 「지우기」로 지움</span>
          )}
        </div>
      </div>

      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 overflow-auto rounded-b-box bg-slate-100 p-3">
        {url && (
          <div
            ref={frame}
            className={`relative m-auto inline-block shrink-0 touch-none select-none ${tool === 'erase' ? 'cursor-pointer' : tool ? 'cursor-crosshair' : 'cursor-default'}`}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={title}
              draggable={false}
              onLoad={(e) => setFitW(e.currentTarget.clientWidth)}
              // 확대하면 처음 맞춘 폭의 배수로 — 표시는 사진 크기 비율이라 같이 커진다(구운 모양 그대로)
              style={zoom > 1 && fitW ? { width: fitW * zoom, maxWidth: 'none', maxHeight: 'none' } : undefined}
              className="block max-h-[70vh] max-w-full"
            />
            <AnnotCanvas list={shown} style={style} />
            {handles && (
              <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden>
                <polygon
                  points={[handles.corners.nw, handles.corners.ne, handles.corners.se, handles.corners.sw].map((q) => `${q.x},${q.y}`).join(' ')}
                  fill="none" stroke="#0ea5e9" strokeWidth={1.5} strokeDasharray="5 3"
                />
                <line x1={handles.top.x} y1={handles.top.y} x2={handles.rot.x} y2={handles.rot.y} stroke="#0ea5e9" strokeWidth={1.5} />
                <circle data-h="rot" cx={handles.rot.x} cy={handles.rot.y} r={7} fill="#fff" stroke="#0ea5e9" strokeWidth={2} className="pointer-events-auto cursor-grab" />
                {(Object.entries(handles.corners) as Array<[string, { x: number; y: number }]>).map(([k, q]) => (
                  <rect
                    key={k} data-h={k} x={q.x - 6} y={q.y - 6} width={12} height={12}
                    fill="#fff" stroke="#0ea5e9" strokeWidth={2}
                    className={`pointer-events-auto ${k === 'nw' || k === 'se' ? 'cursor-nwse-resize' : 'cursor-nesw-resize'}`}
                  />
                ))}
              </svg>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

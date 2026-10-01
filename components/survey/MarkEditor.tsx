'use client';

/**
 * 사진 위에 표시를 그리는 자리 — 번호 · 경로 선(화살표) · 동그라미 · 네모 · 글자 (한백 지시 2026-10-01).
 *
 * 제출본들이 워드·엑셀에서 도형으로 얹던 것이다(lib/survey/annot 머리말). 여기서 그려 두면 서식에
 * 넣을 때 사진에 합쳐 굽는다. ★그리는 함수가 하나다★ — 이 화면과 미리보기와 구운 사진이 모두
 * drawAnnots 를 부르므로, 본 대로 나온다.
 *
 *   번호      빈 곳을 누르면 다음 번호 · 번호를 끌면 옮김 · 두 번 누르면 뺌
 *   선        누를 때마다 꺾이고, 두 번 누르거나 「선 끝」 — 끝에 화살표
 *   동그라미·네모  끌어서 그린다
 *   글자      고른(적은) 글자를 누른 자리에 — 자주 쓰는 말은 제출본의 사진·도면 글상자에서 셌다
 *   충전기    도면에만 — 범례의 하늘색 네모(lib/survey/annot)
 *   지우개    누른 표시를 뺀다
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Btn, Choice, FIELD_BASE, Picks } from '@/components/ui';
import { drawAnnots, hitAnnot, numCount, type Annot, type NumStyle, type Pt } from '@/lib/survey/annot';

type Tool = 'num' | 'charger' | 'line' | 'oval' | 'box' | 'text' | 'erase';
const TOOLS: Array<{ key: Tool; label: string; hint: string }> = [
  { key: 'num', label: '번호', hint: '빈 곳을 누르면 다음 번호 · 끌면 옮김 · 두 번 누르면 뺌' },
  { key: 'charger', label: '충전기', hint: '누른 자리에 충전기 표시 · 끌면 옮김' },
  { key: 'line', label: '선·화살표', hint: '누를 때마다 꺾입니다 · 두 번 누르거나 「선 끝」' },
  { key: 'oval', label: '동그라미', hint: '끌어서 그립니다' },
  { key: 'box', label: '네모', hint: '끌어서 그립니다' },
  { key: 'text', label: '글자', hint: '글자를 고르고 넣을 자리를 누릅니다' },
  { key: 'erase', label: '지우개', hint: '지울 표시를 누릅니다' },
];

/**
 * 자주 쓰는 글 — 2025~26 제출본의 사진대지·도면 글상자에서 많이 나온 말(플러그링크 엑셀 349곳,
 * 현대엔지니어링 별지). 고르면 입력칸에 들어가고 고칠 수 있다(「보도블럭 해체·복구 10m」처럼).
 */
const TEXT_PRESETS = [
  '기존 한전전주', 'IP전주 신설', '분전반 신설', '차단기 신설', '차단기 교체', '코어타공',
  '터파기', '보도블럭 해체·복구', '노출배관', '기설 트레이', 'CCTV', '한전 협의',
];

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

export default function MarkEditor({ file, marks, expected, title, style = 'red', charger = false, onDone, onClose }: {
  file: File;
  marks: Annot[];
  /** 그 거점의 설치 대수 — 찍은 번호 수와 견준다 */
  expected?: number | null;
  title: string;
  /** 번호 모양 — 서식이 정한다(lib/survey/spec markStyleOf) */
  style?: NumStyle;
  /** 충전기 표시 도구를 보인다 — 도면에서만 */
  charger?: boolean;
  onDone: (marks: Annot[]) => void;
  onClose: () => void;
}) {
  const [list, setList] = useState<Annot[]>(marks);
  const [draft, setDraft] = useState<Annot | null>(null);
  const [tool, setTool] = useState<Tool>('num');
  const [text, setText] = useState('');
  const [url, setUrl] = useState<string | null>(null);
  const [aspect, setAspect] = useState(4 / 3);
  const frame = useRef<HTMLDivElement>(null);
  const drag = useRef<number | null>(null);
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
      if (pts.length >= 2) setList((l) => [...l, { t: 'line', pts }]);
    }
    setDraft(null);
  }, [draft]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (draft) setDraft(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [draft, onClose]);

  const at = (e: { clientX: number; clientY: number }): Pt | null => {
    const r = frame.current?.getBoundingClientRect();
    if (!r || r.width === 0) return null;
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
  };

  const pickTool = (t: Tool) => { commitDraft(); setTool(t); };

  function onDown(e: React.PointerEvent) {
    const p = at(e);
    if (!p) return;
    frame.current?.setPointerCapture?.(e.pointerId);
    down.current = true;
    const now = Date.now();
    if (tool === 'charger') {
      const i = hitAnnot(list, p, aspect);
      if (i >= 0 && list[i].t === 'charger') { drag.current = i; return; }
      setList((l) => [...l, { t: 'charger', x: p.x, y: p.y }]);
    } else if (tool === 'num') {
      const i = hitAnnot(list, p, aspect);
      if (i >= 0 && list[i].t === 'num') {
        if (lastTap.current && lastTap.current.i === i && now - lastTap.current.t < 350) {
          lastTap.current = null;
          setList((l) => l.filter((_, k) => k !== i));
          return;
        }
        lastTap.current = { i, t: now };
        drag.current = i;
        return;
      }
      setList((l) => [...l, { t: 'num', x: p.x, y: p.y }]);
    } else if (tool === 'line') {
      if (!draft || draft.t !== 'line') {
        setDraft({ t: 'line', pts: [p, p] });
      } else if (now - lastLineTap.current < 350) {
        commitDraft();
      } else {
        setDraft({ t: 'line', pts: [...draft.pts.slice(0, -1), p, p] });
      }
      lastLineTap.current = now;
    } else if (tool === 'oval' || tool === 'box') {
      setDraft({ t: tool, a: p, b: p });
    } else if (tool === 'text') {
      down.current = false;
      if (text.trim()) setList((l) => [...l, { t: 'text', x: p.x, y: p.y, text: text.trim() }]);
    } else if (tool === 'erase') {
      const i = hitAnnot(list, p, aspect);
      if (i >= 0) setList((l) => l.filter((_, k) => k !== i));
    }
  }

  function onMove(e: React.PointerEvent) {
    const p = at(e);
    if (!p) return;
    if (drag.current !== null && down.current) {
      const i = drag.current;
      setList((l) => l.map((a, k) => (k === i && (a.t === 'num' || a.t === 'charger') ? { ...a, x: p.x, y: p.y } : a)));
      return;
    }
    if (draft?.t === 'line') {
      setDraft({ t: 'line', pts: [...draft.pts.slice(0, -1), p] });
    } else if ((draft?.t === 'oval' || draft?.t === 'box') && down.current) {
      setDraft({ ...draft, b: p });
    }
  }

  function onUp() {
    down.current = false;
    drag.current = null;
    if (draft && (draft.t === 'oval' || draft.t === 'box')) {
      // 거의 안 끈 것은 실수로 본다
      if (Math.abs(draft.a.x - draft.b.x) > 0.01 || Math.abs(draft.a.y - draft.b.y) > 0.01) setList((l) => [...l, draft]);
      setDraft(null);
    }
  }

  const shown = draft ? [...list, draft] : list;
  const nums = numCount(list);
  const current = TOOLS.find((t) => t.key === tool)!;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/80 p-3 sm:p-6" role="dialog" aria-label={title}>
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 rounded-t-box bg-white px-4 py-3">
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
              const tail = draft?.t === 'line' && draft.pts.length > 2 ? [{ t: 'line' as const, pts: draft.pts.slice(0, -1) }] : [];
              onDone([...list, ...tail]);
            }}
          >
            완료
          </Btn>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {TOOLS.filter((t) => charger || t.key !== 'charger').map((t) => (
            <Choice key={t.key} on={tool === t.key} onClick={() => pickTool(t.key)}>{t.label}</Choice>
          ))}
          <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden />
          {draft?.t === 'line' && <Btn size="sm" kind="side" onClick={() => commitDraft()}>선 끝</Btn>}
          <Btn size="sm" kind="quiet" disabled={!draft && list.length === 0} onClick={() => (draft ? setDraft(null) : setList((l) => l.slice(0, -1)))}>되돌리기</Btn>
          <Btn size="sm" kind="quiet" disabled={list.length === 0} onClick={() => { setDraft(null); setList([]); }}>모두 지우기</Btn>
          <span className="text-small text-slate-500">{current.hint}</span>
        </div>
        {tool === 'text' && (
          <div className="flex flex-wrap items-center gap-1.5">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="넣을 글자"
              className={`${FIELD_BASE} w-56`}
            />
            <Picks options={TEXT_PRESETS} onPick={setText} />
          </div>
        )}
      </div>
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 items-center justify-center overflow-auto rounded-b-box bg-slate-100 p-3">
        {url && (
          <div
            ref={frame}
            className={`relative inline-block touch-none select-none ${tool === 'erase' ? 'cursor-pointer' : 'cursor-crosshair'}`}
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
              onLoad={(e) => setAspect(e.currentTarget.naturalWidth / (e.currentTarget.naturalHeight || 1))}
              className="block max-h-[72vh] max-w-full"
            />
            <AnnotCanvas list={shown} style={style} />
          </div>
        )}
      </div>
    </div>
  );
}

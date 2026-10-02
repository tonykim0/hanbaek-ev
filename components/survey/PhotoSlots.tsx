'use client';

/**
 * 사진 칸 — 실사보고서 화면 셋(현대엔지니어링·SK·나이스 SurveyEditor, 플러그링크 PluglinkEditor)이 같이 쓴다.
 *
 *   PhotoSlots  칸 목록(서식의 사진 자리) — 한 줄 두 칸, 여러 장 칸·한 칸에 모으는 묶음
 *   PhotoBox    칸 하나 — 넣기·끌어다 놓기·바꾸기·빼기, 사진 위에 그리기(MarkEditor)
 */
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Err } from '@/components/ui';
import { useFileDragging } from '@/components/DocFiles';
import { resolveLabels, type LineKind, type NumStyle } from '@/lib/survey/annot';
import { slotFiles, subKey, type Mark, type PhotoSlot } from '@/lib/survey/spec';
import MarkEditor, { AnnotCanvas, type SpotLabel } from './MarkEditor';

/** 표시 화면의 도구 — 플러그링크만 도면 기호·거점 라벨을 쓴다(MarkEditor) */
export interface MarkTools { legend?: boolean; labels?: SpotLabel[]; labelPick?: string; line?: LineKind; size?: number; large?: boolean }

const isImage = (f: File) => f.type.startsWith('image/') || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name);
const isHeic = (f: File) => /hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name);

/**
 * 사진 받기 — 고르기·끌어다 놓기 · 그림 파일만 넘긴다. ★이 브라우저가 못 여는 사진(크롬·파이어폭스의 아이폰
 * HEIC)은 받을 때 거른다★ — 받아 두면 칸에 깨진 그림이 서고, 판넬 읽기도 조용히 실패하고, 「만들기」에 가서야
 * 오류가 났다. 사파리는 HEIC 를 열므로 열어 보고 가린다.
 */
function useImageIntake(onFiles: (files: File[]) => void) {
  const dragging = useFileDragging();
  const [over, setOver] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const take = async (list: File[]) => {
    setErr(null);
    const ok: File[] = [];
    const bad: string[] = [];
    for (const f of list.filter(isImage)) {
      if (isHeic(f)) {
        try {
          (await createImageBitmap(f)).close?.();
        } catch {
          bad.push(f.name);
          continue;
        }
      }
      ok.push(f);
    }
    if (bad.length) setErr(`${bad.join(', ')} — 이 브라우저는 HEIC 사진을 못 엽니다. JPG 로 바꿔 넣어주세요(아이폰 설정 › 카메라 › 포맷 › 호환성 우선).`);
    if (ok.length) onFiles(ok);
  };
  const dropProps = {
    onDragEnter: (e: DragEvent) => { e.preventDefault(); setOver(true); },
    onDragOver: (e: DragEvent) => { e.preventDefault(); setOver(true); },
    onDragLeave: (e: DragEvent) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false); },
    onDrop: (e: DragEvent) => { e.preventDefault(); setOver(false); void take([...e.dataTransfer.files]); },
  };
  const inputEl = (
    <input
      ref={input}
      type="file"
      accept="image/*"
      multiple
      className="hidden"
      onChange={(e) => { const picked = [...(e.target.files ?? [])]; e.target.value = ''; void take(picked); }}
    />
  );
  return { dragging, over, err, dropProps, inputEl, pick: () => input.current?.click() };
}

/**
 * 사진 칸 목록 — 칸마다 사진 한 장, 여러 장 칸(slot.multi)은 넣은 만큼 칸이 늘고 끝에 빈 칸 하나가 붙는다.
 *
 * ★여러 장을 한꺼번에 고르면★ 한 장 칸에서는 그 칸부터 뒤의 빈 한 장 칸 순서대로(현장 사진은 한꺼번에
 * 고르는 일이 많다), 여러 장 칸에서는 그 묶음에 다 넣는다 — 「인입라인에 고른 사진은 인입라인으로」.
 * 넘치는 장은 버린다. 여러 장 칸에서 하나를 빼면 뒤의 것이 당겨진다(서식에 빈 칸을 남기지 않는다).
 *
 * ★from·to 는 그리는 칸만 가른다★ — 화면이 칸 사이에 입력칸을 끼울 때(SurveyEditor 「사진 먼저, 글 나중」)도
 * 한꺼번에 고른 사진은 칸 목록 전체로 흘러간다. 목록을 잘라 넘기면 넘친 사진이 첫 묶음에서 버려졌다.
 */
export function PhotoSlots({ slots, photos, marks, onChange, expected, style, tools, from = 0, to = slots.length }: {
  slots: PhotoSlot[];
  photos: Record<string, File | null>;
  marks: Record<string, Mark[]>;
  onChange: (p: { photos: Record<string, File | null>; marks: Record<string, Mark[]> }) => void;
  expected?: number | null;
  style: NumStyle;
  tools?: MarkTools;
  from?: number;
  to?: number;
}) {
  /* 사진이 바뀐 자리의 표시는 걷는다 — 다른 사진 위의 자리는 뜻이 없다. 자리를 옮긴 사진은 표시도 같이 옮긴다 */
  const commit = (next: Record<string, File | null>, moved: Record<string, string> = {}) => {
    const m: Record<string, Mark[]> = {};
    for (const [k, f] of Object.entries(next)) {
      if (!f) continue;
      const src = moved[k] ?? k;
      if (photos[src] === f && marks[src]) m[k] = marks[src];
    }
    onChange({ photos: next, marks: m });
  };

  const putSingle = (i: number, files: File[]) => {
    const next = { ...photos, [slots[i].key]: files[0] };
    const rest = files.slice(1);
    for (const later of slots.slice(i + 1)) {
      if (rest.length === 0) break;
      if (!later.multi && !next[later.key]) next[later.key] = rest.shift()!;
    }
    commit(next);
  };

  const putMulti = (sl: PhotoSlot, pos: number, files: File[]) => {
    const list = slotFiles(photos, sl).map((x) => x.file);
    list[pos] = files[0];
    list.push(...files.slice(1));
    const next = { ...photos };
    list.slice(0, sl.multi).forEach((f, i) => { next[subKey(sl.key, i)] = f; });
    commit(next);
  };

  const dropMulti = (sl: PhotoSlot, pos: number) => {
    const have = slotFiles(photos, sl);
    const next = { ...photos };
    const moved: Record<string, string> = {};
    have.forEach((_, i) => { next[subKey(sl.key, i)] = null; });
    have.filter((_, i) => i !== pos).forEach((x, i) => {
      next[subKey(sl.key, i)] = x.file;
      moved[subKey(sl.key, i)] = x.key;
    });
    commit(next, moved);
  };

  // 한 줄 두 칸 — 워드·엑셀 사진대지가 그렇다(한백 「워드형식에 맞춰서 2칸씩」 2026-10-02)
  return (
    <div className="grid items-start gap-x-3 gap-y-4 sm:grid-cols-2">
      {slots.flatMap((sl, i) => {
        if (i < from || i >= to) return [];
        const box = (key: string, label: string, file: File | null, onFiles: (fs: File[]) => void, onClear: () => void, hint?: string) => (
          <PhotoBox
            key={key}
            slot={{ key, label, hint, draw: sl.draw, reads: sl.reads }}
            file={file}
            onFiles={onFiles}
            onClear={onClear}
            marks={marks[key]}
            onMarks={(m) => onChange({ photos, marks: { ...marks, [key]: m } })}
            expected={expected}
            style={style}
            tools={tools}
          />
        );
        if (!sl.multi) {
          return [box(sl.key, sl.label, photos[sl.key] ?? null, (fs) => putSingle(i, fs), () => commit({ ...photos, [sl.key]: null }), sl.hint)];
        }
        const max = sl.multi;
        const have = slotFiles(photos, sl);
        // 모으는 묶음은 「더 넣기」가 칸이 아니라 줄이라 실제 장 수로 번호를 붙인다
        const shown = sl.collage ? have.length : have.length + (have.length < max ? 1 : 0);
        const label = (k: number) => (shown > 1 ? `${sl.label} - ${k + 1}` : sl.label);
        const cells = have.map((x, k) =>
          box(x.key, label(k), x.file, (fs) => putMulti(sl, k, fs), () => dropMulti(sl, k), k === 0 ? sl.hint : undefined));
        if (sl.collage) {
          /*
           * 서식 칸 하나에 모이는 묶음 — 그 칸 자리 하나에 세로로 쌓는다(워드의 한 칸 = 화면의 한 칸, 한 줄 두 칸이
           * 서식과 같게). 둘째 장부터는 낮은 「사진 더 넣기」 줄로 받는다 — 빈 칸을 통째로 두면 이웃 칸과 줄이 어긋난다.
           */
          const k = have.length;
          if (k === 0) return [box(subKey(sl.key, 0), sl.label, null, (fs) => putMulti(sl, 0, fs), () => undefined, sl.hint)];
          return [
            <div key={sl.key} className="flex flex-col gap-2">
              {cells}
              {k < max && <AddMore count={k} max={max} onFiles={(fs) => putMulti(sl, k, fs)} />}
            </div>,
          ];
        }
        if (have.length < max) {
          const k = have.length;
          cells.push(box(subKey(sl.key, k), label(k), null, (fs) => putMulti(sl, k, fs), () => undefined, k === 0 ? sl.hint : undefined));
        }
        return cells;
      })}
    </div>
  );
}

/** 한 칸에 모으는 묶음의 「한 장 더」 — 낮은 줄, 눌러 고르거나 끌어다 놓는다 */
function AddMore({ count, max, onFiles }: { count: number; max: number; onFiles: (files: File[]) => void }) {
  const { dragging, over, err, dropProps, inputEl, pick } = useImageIntake(onFiles);
  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={pick}
        {...dropProps}
        className={`flex items-center justify-center gap-1.5 rounded-box border-2 border-dashed px-3 py-2.5 text-small font-bold transition ${
          over ? 'border-brand-500 bg-brand-50 text-brand-700' : dragging ? 'border-slate-400 bg-white text-slate-600' : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-slate-300 hover:text-slate-700'
        }`}
      >
        <PlusIcon />
        {dragging ? '여기에 놓기' : '사진 더 넣기'}
        <span className="tabular-nums text-slate-400">{count}/{max}</span>
      </button>
      {inputEl}
      <Err>{err}</Err>
    </div>
  );
}

/** 펜 — 「사진 위에 그린다」를 말 없이 알리는 그림 */
function PenIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className="h-4 w-4" fill="currentColor">
      <path d="M13.6 2.6a2 2 0 0 1 2.8 0l1 1a2 2 0 0 1 0 2.8l-9.3 9.3-4.1 1.1a.6.6 0 0 1-.7-.7l1.1-4.1 9.2-9.4Zm-1 2.9L5.3 12.8l-.6 2.1 2.1-.6 7.3-7.3-1.5-1.5Z" />
    </svg>
  );
}

/** 더하기 — 빈 칸 */
function PlusIcon({ big = false }: { big?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden className={big ? 'h-10 w-10' : 'h-4 w-4'} fill="none" stroke="currentColor" strokeWidth={big ? 1.5 : 2.2} strokeLinecap="round">
      <path d="M10 4v12M4 10h12" />
    </svg>
  );
}

/** 단추가 말한 일의 도구 — 「주차면 번호 찍기」를 눌렀는데 기호가 잡혀 있으면 단추가 거짓말이 된다 */
function startToolOf(draw?: string): 'num' | 'line' | 'box' | undefined {
  if (!draw) return undefined;
  if (draw.endsWith('번호 찍기')) return 'num';
  if (draw.endsWith('선 긋기')) return 'line';
  if (draw.endsWith('짚기')) return 'box';
  return undefined;
}

const NO_MARKS: Mark[] = [];

/**
 * 사진 칸 하나 — 빈 칸은 누르거나 끌어다 놓아 사진을 넣는다.
 *
 * ★사진이 든 칸은 누르면 그 위에 그린다★ (한백 「표시하기라는 단어는 별로 · 텍스트라 잘 안 보이고 뭘 표시하라는
 * 건지 알 수 없어 · 설명하지 않아도 이해할 수 있어야」 2026-10-02). 사진 밑에 펜 그림과 그 사진에서 할 일
 * (「주차면 번호 찍기」·「경로 선 긋기」 — spec 의 slot.draw)을 단 띠 단추를 늘 두고, 사진 어디를 눌러도 그린다.
 * 그린 것이 있으면 단추에 그 수가 붙는다. 사진을 바꾸는 것은 밑의 「바꾸기」 — 사진 누르기가 그리기라서다.
 *
 * ★그린 것이 있는 사진을 바꾸면 묻는다★ — 바꾸면 그 표시가 걷힌다(다른 사진 위의 자리는 뜻이 없다). 끌어다 놓기는
 * 지나가다 떨어뜨리기 쉽고, 전체 도면이면 도면 위 표시가 통째로 사라진다.
 */
export function PhotoBox({ slot, file, onFiles, onClear, marks = NO_MARKS, onMarks, expected, style = 'red', tools }: {
  slot: PhotoSlot;
  file: File | null;
  onFiles: (files: File[]) => void;
  onClear: () => void;
  /** 사진 위 표시 — onMarks 를 주면 사진 위에 그릴 수 있다 */
  marks?: Mark[];
  onMarks?: (marks: Mark[]) => void;
  /** 그 거점의 설치 대수 — 찍은 번호 수와 견준다 */
  expected?: number | null;
  /** 번호 모양 — 서식이 정한다 */
  style?: NumStyle;
  /** 표시 화면의 도구 — 플러그링크의 도면 기호·거점 라벨 */
  tools?: MarkTools;
}) {
  const replace = (fs: File[]) => {
    if (file && marks.length && !window.confirm(`이 사진에 그린 표시 ${marks.length}개가 지워집니다. 사진을 바꿀까요?`)) return;
    onFiles(fs);
  };
  const { dragging, over, err, dropProps, inputEl, pick } = useImageIntake(replace);
  const [url, setUrl] = useState<string | null>(null);
  const [aspect, setAspect] = useState(4 / 3);
  const [marking, setMarking] = useState(false);
  useEffect(() => {
    if (!file) { setUrl(null); return; }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  // 거점 라벨은 지금 거점 값으로 — 매번 새 배열이면 칸마다 캔버스를 다시 그린다(입력 한 글자마다)
  const shown = useMemo(() => resolveLabels(marks, tools?.labels), [marks, tools?.labels]);

  const canDraw = !!(file && onMarks);
  const drawLabel = slot.draw ?? '그려 넣기';
  const open = () => (canDraw ? setMarking(true) : pick());

  return (
    <div className="flex flex-col gap-1">
      <div
        {...dropProps}
        className={`flex flex-col overflow-hidden rounded-box border-2 transition ${
          over ? 'border-dashed border-brand-500 bg-brand-50' : file ? 'border-solid border-slate-200 bg-slate-900 hover:border-brand-400' : dragging ? 'border-dashed border-slate-400 bg-white' : 'border-dashed border-slate-200 bg-slate-50'
        }`}
      >
        <div
          role="button"
          tabIndex={0}
          aria-label={canDraw ? `${slot.label} — ${drawLabel}` : `${slot.label} — 사진 고르기`}
          onClick={open}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } }}
          className="flex aspect-[4/3] cursor-pointer items-center justify-center overflow-hidden"
        >
          {url ? (
            /* 번호는 사진 위 자리라 사진과 같은 틀(비율)에 얹는다 — object-contain 의 빈 띠에 뜨지 않게 */
            <span
              className="relative block"
              // 칸은 4:3 이다 — 그보다 넓은 사진은 폭을, 좁은(세로) 사진은 높이를 채운다
              style={aspect >= 4 / 3 ? { width: '100%', aspectRatio: String(aspect) } : { height: '100%', aspectRatio: String(aspect) }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={slot.label}
                onLoad={(e) => setAspect(e.currentTarget.naturalWidth / (e.currentTarget.naturalHeight || 1))}
                className="h-full w-full object-contain"
              />
              {shown.length > 0 && <AnnotCanvas list={shown} style={style} />}
            </span>
          ) : (
            <span className="flex flex-col items-center gap-2 px-3 text-center text-sm font-bold text-slate-400">
              {dragging ? '여기에 놓기' : <PlusIcon big />}
              {/* 이 사진에서 글자를 읽어 칸을 채운다 — 넣기 전에 안다 */}
              {slot.reads && !dragging && <span className="rounded-tag bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700">넣으면 {slot.reads} 자동 입력</span>}
            </span>
          )}
        </div>
        {/* 사진 밑의 띠 — 사진 위에 얹으면 아래쪽에 찍은 표시를 가린다. 빈 칸에도 같은 높이로 두어 줄이 맞는다 */}
        <Strip draw={canDraw} onClick={canDraw ? () => setMarking(true) : pick} count={marks.length}>
          {canDraw ? drawLabel : file ? '사진 바꾸기' : '사진 넣기'}
        </Strip>
        {inputEl}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 text-sm font-bold text-gray-800">
          {slot.label}
          {slot.hint && <span className="ml-1 text-xs font-normal text-gray-400">{slot.hint}</span>}
        </span>
        {file && (
          <>
            {canDraw && (
              <button type="button" onClick={pick} className="text-xs font-bold text-slate-500 hover:text-brand-700">
                바꾸기
              </button>
            )}
            <button type="button" onClick={onClear} className="text-xs font-bold text-slate-400 hover:text-red-700">
              빼기
            </button>
          </>
        )}
      </div>
      <Err>{err}</Err>
      {marking && file && onMarks && (
        <MarkEditor
          file={file}
          marks={marks}
          expected={expected}
          title={`${slot.label} — ${drawLabel}`}
          style={style}
          start={startToolOf(slot.draw)}
          {...tools}
          onClose={() => setMarking(false)}
          onDone={(m) => { onMarks(m); setMarking(false); }}
        />
      )}
    </div>
  );
}

function Strip({ draw, onClick, count, children }: { draw: boolean; onClick: () => void; count: number; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 px-3 py-2 text-small font-bold transition ${
        draw ? 'bg-brand-600 text-white hover:bg-brand-700' : 'bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700'
      }`}
    >
      {draw ? <PenIcon /> : <PlusIcon />}
      {children}
      {draw && count > 0 && <span className="rounded bg-white/25 px-1.5 tabular-nums">{count}</span>}
    </button>
  );
}

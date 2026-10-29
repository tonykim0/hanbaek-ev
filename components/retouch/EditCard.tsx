'use client';

/**
 * 서류 문구 수정 — 고칠 자리 하나. 원래 글자 → 바꿀 글자, 글꼴 · 굵기 · 맞춤 · 크기 · 위치.
 *
 * 판독이 정한 값은 시작점일 뿐이다 — 글꼴 갈래(명조·고딕)나 크기가 원본과 다르게 보이면 여기서 고친다. 원래 글자 칸은
 * 크기를 재는 잣대라 같이 고칠 수 있게 둔다(판독이 잘못 읽으면 글자가 크거나 작게 나온다).
 */
import { Btn, Choice, Err, FIELD, TEXT } from '@/components/ui';
import { WEIGHTS, type Edit } from '@/lib/retouch/paint';
import type { Align } from '@/lib/retouch/types';
import type { Shown } from './PageView';

const ALIGN: Array<[Align, string]> = [['left', '왼쪽'], ['center', '가운데'], ['right', '오른쪽']];


export default function EditCard({
  edit, painted, selected, onSelect, onChange, onRemove,
}: {
  edit: Edit;
  painted: Shown | undefined;
  selected: boolean;
  onSelect: () => void;
  onChange: (patch: Partial<Edit>) => void;
  onRemove: () => void;
}) {
  const nudge = (dx: number, dy: number) => onChange({ dx: edit.dx + dx, dy: edit.dy + dy });
  return (
    <li
      onClick={onSelect}
      className={`flex flex-col gap-2 border-l-4 py-3 pl-3 pr-1 ${selected ? 'border-brand-600 bg-brand-50/40' : 'border-transparent'}`}
    >
      <div className="flex items-center gap-2">
        <span className={TEXT.meta}>{edit.page}쪽</span>
        <Btn size="sm" kind="undo" className="ml-auto" onClick={onRemove}>빼기</Btn>
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
        <input
          className={FIELD}
          value={edit.original}
          aria-label="원래 글자"
          onChange={(e) => onChange({ original: e.target.value })}
        />
        <span className={TEXT.meta}>→</span>
        <input
          className={FIELD}
          value={edit.replacement}
          aria-label="바꿀 글자"
          onChange={(e) => onChange({ replacement: e.target.value })}
        />
      </div>
      {painted?.before && painted.after && (
        <div className="grid grid-cols-2 gap-1.5">
          {([['원본', painted.before], ['고친 뒤', painted.after]] as const).map(([label, src]) => (
            <figure key={label} className="flex flex-col gap-0.5">
              <figcaption className={TEXT.meta}>{label}</figcaption>
              {/* eslint-disable-next-line @next/next/no-img-element -- 화면에서 만든 data URL 이라 next/image 를 거칠 것이 없다 */}
              <img src={src} alt="" className="h-auto max-h-24 w-full object-contain object-left" />
            </figure>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1">
        <Choice on={edit.font === 'serif'} onClick={() => onChange({ font: 'serif' })}>명조</Choice>
        <Choice on={edit.font === 'sans'} onClick={() => onChange({ font: 'sans' })}>고딕</Choice>
        <span className="mx-1 h-4 w-px bg-slate-200" />
        <Btn size="sm" kind="quiet" disabled={edit.weight === WEIGHTS[0]}
          onClick={() => onChange({ weight: WEIGHTS[WEIGHTS.indexOf(edit.weight) - 1] })}>가늘게</Btn>
        <Btn size="sm" kind="quiet" disabled={edit.weight === WEIGHTS[WEIGHTS.length - 1]}
          onClick={() => onChange({ weight: WEIGHTS[WEIGHTS.indexOf(edit.weight) + 1] })}>굵게</Btn>
        <span className={`${TEXT.meta} tabular-nums`}>굵기 {WEIGHTS.indexOf(edit.weight) + 1}/{WEIGHTS.length}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        {ALIGN.map(([a, label]) => (
          <Choice key={a} on={edit.align === a} onClick={() => onChange({ align: a })}>{label}</Choice>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <Btn size="sm" kind="quiet" onClick={() => onChange({ scale: Math.max(0.5, edit.scale - 0.03) })}>작게</Btn>
        <Btn size="sm" kind="quiet" onClick={() => onChange({ scale: Math.min(2, edit.scale + 0.03) })}>크게</Btn>
        <span className={`${TEXT.meta} tabular-nums`}>{Math.round(edit.scale * 100)}%</span>
        <span className="mx-1 h-4 w-px bg-slate-200" />
        <Btn size="sm" kind="quiet" aria-label="왼쪽으로" onClick={() => nudge(-1, 0)}>←</Btn>
        <Btn size="sm" kind="quiet" aria-label="오른쪽으로" onClick={() => nudge(1, 0)}>→</Btn>
        <Btn size="sm" kind="quiet" aria-label="위로" onClick={() => nudge(0, -1)}>↑</Btn>
        <Btn size="sm" kind="quiet" aria-label="아래로" onClick={() => nudge(0, 1)}>↓</Btn>
      </div>
      <Err>{painted?.problem ?? null}</Err>
    </li>
  );
}

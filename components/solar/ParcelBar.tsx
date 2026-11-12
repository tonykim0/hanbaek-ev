'use client';

import { useState } from 'react';
import { Btn, Err, FIELD_BASE } from '@/components/ui';
import { joinParcels, lotLabel, MAX_PARCELS } from '@/lib/solar/parcels';
import type { Place } from '@/lib/solar/types';
import { TEXT } from './ui';

/**
 * 부지의 필지 — 불러온 현장 한 줄의 지번 자리(부지 검토의 결과 머리 · 제안서 생성의 「1 현장」).
 * 한 필지면 지번 그대로와 「필지 더하기」, 여럿이면 필지마다 칩(× 로 뺀다)과 「필지 더하기」(한백 2026-11-12 「복수의 부지에 대해서
 * 부지검토를 같이 해야 하는 경우도 있네 … 한 부지로 제안해야해」 — lib/solar/parcels).
 * 더하고 빼면 주소 칸 한 줄을 다시 지어 부지를 다시 불러온다 — 번지만 적으면(「12-3」) 앞 필지의 동 · 리를 잇는다.
 * 못 불러오면 그 까닭이 이 자리에 뜨고 불러온 부지는 그대로다(누른 자리 — 화면 규칙 9).
 *
 * @param onChange 새 주소 한 줄로 다시 불러온다 — 못 하면 그 까닭(한글)
 */
export default function ParcelBar({ place, busy, onChange }: { place: Place; busy: boolean; onChange: (q: string) => Promise<string | null> }) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [mine, setMine] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lots = place.parcels.map((p) => p.jibunAddress ?? p.roadAddress ?? '');
  const one = lots.length === 1;

  async function go(q: string) {
    if (busy) return;
    setError(null);
    setMine(true);
    const err = await onChange(q);
    setMine(false);
    if (err) setError(err);
    else {
      setAdding(false);
      setText('');
    }
  }
  const add = () => text.trim() && void go(`${joinParcels(lots)}, ${text.trim()}`);
  const cancel = () => {
    setAdding(false);
    setText('');
    setError(null);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {one ? (
        <span className={TEXT.label}>{lots[0]}</span>
      ) : (
        lots.map((a, i) => (
          <span key={`${a}-${i}`} className="inline-flex items-center gap-0.5 rounded-tag bg-slate-100 py-0.5 pl-2 pr-0.5 text-small font-bold text-slate-700">
            {lotLabel(a)}
            <button
              type="button"
              onClick={() => void go(joinParcels(lots.filter((_, j) => j !== i)))}
              disabled={busy}
              aria-label={`${lotLabel(a)} 빼기`}
              className="rounded px-1.5 text-slate-500 transition hover:text-red-700 disabled:text-slate-300"
            >
              ×
            </button>
          </span>
        ))
      )}
      {adding ? (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              // ↵ 는 늘 여기서 받는다(바깥 검색창의 form 이 다시 검토하지 않게) — 한글 조합 중의 ↵ 는 더하지 않는다
              if (e.key === 'Enter') {
                e.preventDefault();
                if (!e.nativeEvent.isComposing) add();
              } else if (e.key === 'Escape') cancel();
            }}
            placeholder="12-3 · 다른 주소"
            aria-label="더할 필지"
            className={`w-44 ${FIELD_BASE}`}
          />
          <Btn size="sm" onClick={add} disabled={busy || !text.trim()} busy={mine} busyLabel="불러오는 중…">
            더하기
          </Btn>
          <Btn kind="quiet" size="sm" onClick={cancel} disabled={mine}>
            취소
          </Btn>
        </span>
      ) : mine ? (
        <span className={TEXT.label}>불러오는 중…</span>
      ) : (
        <Btn kind="quiet" size="sm" onClick={() => setAdding(true)} disabled={busy || lots.length >= MAX_PARCELS}>
          {lots.length >= MAX_PARCELS ? `필지 ${MAX_PARCELS}개 — 더 묶을 수 없음` : '필지 더하기'}
        </Btn>
      )}
      <Err>{error}</Err>
    </div>
  );
}

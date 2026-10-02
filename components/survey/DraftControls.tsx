'use client';

/**
 * 실사보고서 화면의 임시 저장본 목록과 만들기·임시 저장 줄.
 *
 * 만들기·임시 저장 줄은 위에도 아래도 같은 것이 선다(한백 지시 2026-10-01 「임시저장 버튼은 위에도
 * 아래도 하나씩, 생성버튼과 함께」) — 거점이 여럿이면 화면이 길다. 저장 상태는 단추 옆 글자로 남는다 —
 * 잠깐 떴다 사라지게 두지 않는다(화면 규칙 9). 저장본은 클라우드(계정마다 여럿 — lib/survey/use-draft).
 */
import { useState } from 'react';
import { Btn, Confirm, Err, Note, Saved } from '@/components/ui';
import { stamp, type useSurveyDraft } from '@/lib/survey/use-draft';

type Draft = ReturnType<typeof useSurveyDraft<unknown>>;

/** 내 임시 저장본 — 이 서식의 것, 최근이 위. 지금 여는 것에는 표시가 붙는다 */
export function DraftList({ draft }: { draft: Pick<Draft, 'drafts' | 'id' | 'restore' | 'remove' | 'work' | 'dirty'> }) {
  const [drop, setDrop] = useState<{ id: string; title: string } | null>(null);
  if (draft.drafts.length === 0) return null;
  return (
    <Note tone="stage" className="flex flex-col gap-1.5">
      <span className="font-bold">임시 저장본 {draft.drafts.length}건</span>
      <ul className="flex flex-col divide-y divide-sky-100">
        {draft.drafts.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-2 py-1.5">
            <span className="min-w-0 flex-1">
              <b>{d.title || '(현장명 없음)'}</b>
              <span className="ml-2 text-small text-slate-500">{stamp(d.updatedAt)} · 사진 {d.photoCount}장</span>
              {d.id === draft.id && <span className="ml-2 text-tiny font-bold text-brand-700">지금 쓰는 중</span>}
            </span>
            {d.id !== draft.id && (
              <Btn
                size="sm"
                kind="side"
                disabled={draft.work !== null}
                // 불러오면 지금 화면이 통째로 바뀐다 — 저장 안 한 것이 있으면 나갈 때처럼 묻는다
                onClick={() => {
                  if (draft.dirty && !window.confirm('임시 저장하지 않은 내용이 있습니다. 불러오면 지금 화면의 내용이 바뀝니다 — 불러올까요?')) return;
                  void draft.restore(d.id);
                }}
              >
                불러오기
              </Btn>
            )}
            <Btn size="sm" kind="undo" disabled={draft.work !== null} onClick={() => setDrop({ id: d.id, title: d.title })}>지우기</Btn>
          </li>
        ))}
      </ul>
      <Confirm
        open={drop !== null}
        title="임시 저장본을 지울까요?"
        detail={`「${drop?.title || '(현장명 없음)'}」 — 저장한 값과 사진이 함께 지워지고 되돌릴 수 없습니다.`}
        confirmLabel="지우기"
        onConfirm={() => { if (drop) void draft.remove(drop.id); setDrop(null); }}
        onCancel={() => setDrop(null)}
      />
    </Note>
  );
}

export function SurveyActions({ draft, make, busy, canMake }: {
  draft: Pick<Draft, 'save' | 'work' | 'savedAt' | 'dirty' | 'error' | 'canSave'>;
  make: () => void;
  busy: string | null;
  /** 만들 수 없으면 그 이유 — 단추 이름에 적는다(화면 규칙 3) */
  canMake: true | string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Btn onClick={make} busy={busy !== null} busyLabel={busy ?? undefined} disabled={canMake !== true || draft.work !== null}>
        {canMake === true ? '실사보고서 만들기' : canMake}
      </Btn>
      <Btn kind="side" onClick={() => void draft.save()} busy={draft.work !== null} busyLabel={draft.work ?? undefined} disabled={busy !== null || !draft.canSave}>
        {draft.canSave ? '임시 저장' : '열람 전용 — 임시 저장 불가'}
      </Btn>
      {draft.savedAt && !draft.dirty && <Saved>임시 저장됨 · {stamp(draft.savedAt)}</Saved>}
      {draft.savedAt && draft.dirty && <span className="text-tiny font-bold text-amber-700">{stamp(draft.savedAt)} 저장 뒤 바뀐 것 있음</span>}
      <Err>{draft.error}</Err>
    </div>
  );
}

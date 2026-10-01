'use client';

/**
 * 실사보고서 화면의 만들기·임시 저장 줄 — 위에도 아래도 같은 줄이 선다(한백 지시 2026-10-01
 * 「임시저장 버튼은 위에도 아래도 하나씩, 생성버튼과 함께」). 거점이 여럿이면 화면이 길어서, 다 넣고
 * 맨 아래까지 내려가거나 쓰다 말고 맨 위로 올라가 저장하게 하지 않는다.
 *
 * 저장 상태는 단추 옆 글자로 남는다 — 잠깐 떴다 사라지게 두지 않는다(화면 규칙 9).
 */
import { Btn, Err, Note, Saved } from '@/components/ui';
import { stamp, type useSurveyDraft } from '@/lib/survey/use-draft';

type Draft = ReturnType<typeof useSurveyDraft<unknown>>;

/** 열 때 남아 있던 저장본 — 불러올지 버릴지 고를 때까지 위에 선다 */
export function DraftFound({ draft, what }: { draft: Pick<Draft, 'found' | 'restore' | 'discard'>; what?: string }) {
  if (!draft.found) return null;
  return (
    <Note tone="stage" className="flex flex-wrap items-center gap-2">
      <span className="min-w-0 flex-1">
        임시 저장본이 있습니다 — <b>{stamp(draft.found.savedAt)}</b>{what ? ` · ${what}` : ''}
      </span>
      <Btn size="sm" onClick={draft.restore}>불러오기</Btn>
      <Btn size="sm" kind="undo" onClick={() => void draft.discard()}>버리기</Btn>
    </Note>
  );
}

export function SurveyActions({ draft, make, busy, canMake }: {
  draft: Pick<Draft, 'save' | 'saving' | 'savedAt' | 'dirty' | 'error'>;
  make: () => void;
  busy: string | null;
  /** 만들 수 없으면 그 이유 — 단추 이름에 적는다(화면 규칙 3) */
  canMake: true | string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Btn onClick={make} busy={busy !== null} busyLabel={busy ?? undefined} disabled={canMake !== true}>
        {canMake === true ? '실사보고서 만들기' : canMake}
      </Btn>
      <Btn kind="side" onClick={() => void draft.save()} busy={draft.saving} busyLabel="저장 중…" disabled={busy !== null}>
        임시 저장
      </Btn>
      {draft.savedAt && !draft.dirty && <Saved>임시 저장됨 · {stamp(draft.savedAt)}</Saved>}
      {draft.savedAt && draft.dirty && <span className="text-tiny font-bold text-amber-700">{stamp(draft.savedAt)} 저장 뒤 바뀐 것 있음</span>}
      <Err>{draft.error}</Err>
    </div>
  );
}

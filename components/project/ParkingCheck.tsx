'use client';

/**
 * 건축물대장 대조 — 주차면과 주소 (한백 지시 2026-10-16 「계약단계에서 건축물대장에 대한 에이전트를 하나 더」).
 *   주차면: 건축물대장(K-apt·공문) = 사전현장컨설팅 결과서 = 설치신청서 · 열람용 아님
 *   주소:   설치신청서 주소가 도로명 주소 · 건축물대장 도로명주소와 같음
 *
 * 계약 탭 서류 묶음 밑에 선다 — 대조하는 것이 그 위의 서류 칸 셋이고, 그 밑이 「계약 확인 완료」다(막는 자리 바로 위).
 * 기설치 대조(PreInstallCheck)와 같은 꼴이다: 머리(상태·대조 시각·다시 대조) → 서류마다 읽은 값 → 짚을 것 → 넘기기.
 * 판정 말은 맞음 · 어긋남 · 확인 필요(못 읽음). 반려는 칸의 「반려」 하나다(열람용이면 건축물대장 칸의 반려가 사유를
 * 채워 연다 — IntakeTab).
 *
 * 접수 단계에서 저절로 돈다(lib/parking-run) · 한백은 여기서 다시 돌린다 · 결과는 협력사도 본다.
 * 필수다 — 짚을 것이 없거나 한백이 「확인하고 넘기기」를 눌러야 계약 확인이 열린다(parkingBlocker).
 */
import { useAction } from '@/lib/use-action';
import { stampOf } from '@/lib/date';
import {
  outdatedCheck, parkingIssueCount, sameParkingFiles, type ParkingCheck, type ParkingIssueKey, type ParkingRead,
} from '@/lib/parking-check';
import { Btn, Err, GroupHead, Tag, TEXT } from '@/components/ui';

const TONE = { ok: 'text-brand-700', diff: 'text-red-700', unknown: 'text-amber-700' } as const;

/** 한 서류의 주차면과 기준과의 판정 */
function Count({ value, basis }: { value: number | null; basis: number | null }) {
  if (value === null) return <b className={TONE.unknown}>못 읽음</b>;
  const verdict = basis === null ? null : value === basis ? 'ok' : 'diff';
  return (
    <span className="tabular-nums">
      <b className="whitespace-nowrap">{value}면</b>
      {verdict && <> <b className={TONE[verdict]}>{verdict === 'ok' ? '맞음' : '어긋남'}</b></>}
    </span>
  );
}

/** 어긋남(빨강) — 서류가 서로 다르거나 받을 수 없는 서류다. 나머지(못 읽음·빠짐)는 확인 필요(주황) */
const DIFF_KEYS: ParkingIssueKey[] = ['consult-diff', 'apply-diff', 'view-only', 'split', 'address-diff', 'apply-not-road'];

/**
 * 신청서 주소 줄 — 도로명인가 · 건축물대장과 같은가. 같으면 주소 한 번만 적는다(규칙 5), 다르면 건축물대장 것을 밑에 같이.
 * 주소를 견주기 전의 결과(버전 1)는 「—」다 — 머리의 「다시 대조」가 까닭을 말한다.
 */
function Address({ check }: { check: ParkingCheck }) {
  const a = check.address;
  if (!check.applyChecked) return <span className="text-slate-500">해당없음</span>;
  if (a === undefined) return <span className="text-slate-500">—</span>;
  if (!a?.apply) return <b className={TONE.unknown}>못 읽음</b>;
  return (
    <span className="break-keep">
      {a.apply}{' '}
      {a.road === false
        ? <b className={`whitespace-nowrap ${TONE.diff}`}>도로명 아님</b>
        : a.match === true ? <b className={`whitespace-nowrap ${TONE.ok}`}>맞음</b>
        : a.match === false ? <b className={`whitespace-nowrap ${TONE.diff}`}>어긋남</b>
        : <b className={`whitespace-nowrap ${TONE.unknown}`}>건축물대장 주소 못 읽음</b>}
      {a.match === false && a.register && (
        <span className={`block ${TEXT.meta}`}>건축물대장 {a.register}</span>
      )}
    </span>
  );
}

/** 건축물대장 줄 — 발급용·열람용과, 주차면이 없으면 받친 것(K-apt·공문) */
function Register({ check }: { check: ParkingCheck }) {
  const regs = check.reads.filter((r) => r.slot === 'bldgreg' && r.doc === '건축물대장');
  if (regs.length === 0) return <b className={TONE.diff}>없음</b>;
  const viewOnly = regs.some((r) => r.viewOnly === true);
  const regParking = regs.find((r) => r.parking !== null)?.parking ?? null;
  return (
    <span className="tabular-nums">
      {regParking !== null ? <b className="whitespace-nowrap">{regParking}면</b> : <b className={TONE.unknown}>주차면 없음</b>}
      {' · '}
      {viewOnly ? <b className={TONE.diff}>열람용</b> : <span className="text-slate-500">발급용</span>}
      {check.basis && check.basis.from !== '건축물대장' && (
        <> → <span className="whitespace-nowrap">{check.basis.from} <b>{check.basis.value}면</b></span></>
      )}
    </span>
  );
}

export function ParkingCheckBlock({
  projectId, check, currentFiles, canRun, step,
}: {
  projectId: string;
  check: ParkingCheck | null | undefined;
  /** 지금 세 칸(건축물대장·결과서·신청서)의 파일 주소 — 지난 대조와 다르면 「서류가 바뀜」 */
  currentFiles: string[];
  /** 대조를 돌릴 수 있는가 — 한백 관리자 */
  canRun: boolean;
  /** 서류 묶음 번호 다음 — 계약 탭의 걸음 번호 */
  step: number;
}) {
  const { busy, error, run } = useAction();
  const accepting = useAction();

  const stale = !!check && !sameParkingFiles(check.files, currentFiles);
  /* 견주는 것이 늘기 전의 결과(주소 없음) — 다시 돌려야 계약 확인이 열린다(parkingBlocker) */
  const outdated = !!check && !stale && outdatedCheck(check);
  const n = check ? parkingIssueCount(check) : 0;
  /* 넘긴 것은 그 결과의 일이다 — 서류가 바뀌면 넘긴 것도 같이 무효다(parkingBlocker) */
  const accepted = check && !stale ? check.accepted ?? null : null;
  const accept = (on: boolean) => accepting.run({
    url: `/api/projects/${projectId}/parking/check/accept`,
    body: { checkedAt: check?.checkedAt, accept: on },
    fail: on ? '넘기지 못했습니다.' : '확인을 취소하지 못했습니다.',
  });
  const basis = check?.basis?.value ?? null;
  /* 기준이 없으면 결과서가 신청서의 짝이다 — 셋이 다 같아야 하므로(lib/parking-check judgeParking) */
  const applyRef = basis ?? check?.consult ?? null;
  const reads: ParkingRead[] = check?.reads ?? [];

  return (
    <div className="flex flex-col gap-2.5">
      <GroupHead
        step={step}
        title="건축물대장 대조"
        meta={check ? `${stampOf(new Date(check.checkedAt))} 대조` : undefined}
      >
        {!check
          ? <Tag tone={canRun ? 'warn' : 'mute'}>대조 전</Tag>
          : stale ? <Tag tone="warn">서류가 바뀜 — 다시 대조</Tag>
          : outdated ? <Tag tone="warn">주소 확인 추가 — 다시 대조</Tag>
          : n === 0 ? <Tag tone="ok">맞음{basis !== null ? ` · ${basis}면` : ''}</Tag>
          : (
            <>
              <Tag tone={accepted ? 'mute' : 'warn'}>짚을 것 {n}</Tag>
              {accepted && <Tag tone="ok">확인함 · {accepted.by} {stampOf(new Date(accepted.at))}</Tag>}
            </>
          )}
        {canRun && (
          <span className="self-center">
            <Btn
              kind="side"
              size="sm"
              busy={busy}
              busyLabel="대조 중… (30초쯤)"
              disabled={currentFiles.length === 0}
              onClick={() => run({ url: `/api/projects/${projectId}/parking/check`, fail: '대조하지 못했습니다.' })}
            >
              {currentFiles.length === 0 ? '서류 없음 — 대조 불가' : check ? '다시 대조' : '대조'}
            </Btn>
          </span>
        )}
        <Err>{error}</Err>
      </GroupHead>

      {check && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          <dt className={TEXT.label}>건축물대장</dt>
          <dd className={TEXT.body}><Register check={check} /></dd>
          <dt className={TEXT.label}>사전현장컨설팅 결과서</dt>
          <dd className={TEXT.body}><Count value={check.consult} basis={basis} /></dd>
          <dt className={TEXT.label}>설치신청서</dt>
          <dd className={TEXT.body}>
            {/* 환경부 사업이 아니고 내지도 않았으면 견줄 것이 없다 — 「해당없음」(규칙 10) */}
            {check.applyChecked
              ? <Count value={check.apply} basis={applyRef} />
              : <span className="text-slate-500">해당없음</span>}
          </dd>
          <dt className={TEXT.label}>신청서 주소</dt>
          <dd className={TEXT.body}><Address check={check} /></dd>
          {check.unread.length > 0 && (
            <>
              <dt className={TEXT.label}>못 읽은 파일</dt>
              <dd className={`${TEXT.body} break-all text-amber-800`}>{check.unread.join(' · ')}</dd>
            </>
          )}
        </dl>
      )}

      {check && n > 0 && (
        <ul className="flex flex-col gap-1">
          {check.issues.map((i) => (
            /* 본문 글자(TEXT.body)는 색을 갖고 있어 판정 색을 덮는다 — 크기만 같이 쓴다 */
            <li key={i.key + i.text} className={`break-keep text-base font-bold ${
              DIFF_KEYS.includes(i.key) ? TONE.diff : TONE.unknown
            }`}>
              {i.text}
            </li>
          ))}
        </ul>
      )}

      {/* 어느 파일에서 무엇을 읽었는지 — 판독이 틀렸을 때 사람이 짚을 자리다. 평소엔 접어 둔다 */}
      {check && reads.length > 0 && (
        <details className={TEXT.meta}>
          <summary className="cursor-pointer select-none">읽은 문서 {reads.length}건</summary>
          <ul className="mt-1 flex flex-col gap-0.5">
            {reads.map((r, i) => (
              <li key={i} className="break-all">
                {r.file} — {r.doc}
                {r.viewOnly === true && ' · 열람용'}
                {r.parking !== null ? ` · ${r.parking}면` : ' · 주차면 없음'}
                {r.address && ` · ${r.address}`}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* 넘기는 자리는 결과 밑이다 — 남은 것이 없으면 이미 통과라 자리가 없고, 서류가 바뀐 결과는 넘길 수 없다 */}
      {check && canRun && !stale && !outdated && n > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {accepted ? (
            <Btn kind="quiet" size="sm" busy={accepting.busy} busyLabel="취소 중…" onClick={() => accept(false)}>
              확인 취소
            </Btn>
          ) : (
            <Btn kind="side" size="sm" busy={accepting.busy} busyLabel="넘기는 중…" onClick={() => accept(true)}>
              {`${n}건 확인하고 넘기기`}
            </Btn>
          )}
          <Err>{accepting.error}</Err>
        </div>
      )}
    </div>
  );
}

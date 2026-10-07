'use client';

/**
 * 기설치 조사의 두 번째 걸음 — 낸 서류(설치이력·증빙)와 그 둘의 대조 (한백 지시 2026-10-06·07).
 *
 * ★서류 두 칸이 이 걸음 안에 있다★ (UI 리뷰 2026-10-07 「뒤죽박죽에 보기 쉽지 않다」) — 대조가 판정하는 것이 이
 * 두 칸이라, 칸이 구역 맨 밑에 따로 있을 때는 결과를 읽다 무슨 파일을 봤는지 보려고 내려갔다 올라와야 했다.
 * 이제 머리(상태·대조 시각·다시 대조) → 두 칸 → 결과 순이다.
 *
 * ★결과는 짚을 것만 펼친다★ — 맞는 줄과 참고 줄은 접어 둔다(「맞음 N줄 · 참고 N줄 보기」). 다 맞으면 한 줄이다.
 * 판정 말은 넷이다: 맞음 · 어긋남 · 확인 필요 · 참고 — 자세한 까닭은 그 줄의 곁글이 말한다.
 * ★반려하는 문은 칸의 「반려」 하나다★ — 직인이 없으면 설치이력 칸의 반려가 「반려 — 직인 없음」으로 사유를 채워
 * 둔다(PreInstall). 여기에는 따로 보완요청 단추를 두지 않는다.
 *
 * 접수 단계에서 저절로 돈다(lib/preinstall-run) · 한백은 여기서 다시 돌린다 · 결과는 협력사도 본다.
 * 필수다 — 맞음이거나 한백이 「확인하고 넘기기」를 눌러야 계약 확인이 열린다(preCheckBlocker).
 */
import { useState, type ReactNode } from 'react';
import { useAction } from '@/lib/use-action';
import { stampOf } from '@/lib/date';
import {
  issueCount, missingSeals, reviewCount, sameFiles,
  type CheckLine, type LineVerdict, type PreInstallCheck,
} from '@/lib/preinstall-check';
import { Btn, Err, GroupHead, Tag, TEXT, Td, Th } from '@/components/ui';

type Group = '맞음' | '어긋남' | '확인 필요' | '참고';

/** 판정 말은 넷으로 묶는다 — 아홉 가지 까닭은 곁글로 */
const SHOW: Record<LineVerdict, { group: Group; detail: string | null }> = {
  ok: { group: '맞음', detail: null },
  diff: { group: '어긋남', detail: null },
  'no-row': { group: '어긋남', detail: '엑셀에 없는 행위신고' },
  'no-evidence': { group: '확인 필요', detail: '짝 증빙 없음' },
  'no-count': { group: '확인 필요', detail: '증빙에서 기수를 못 읽음' },
  review: { group: '확인 필요', detail: '설계도면 증빙 — 개별 검토' },
  exempt: { group: '참고', detail: '보조사업 설치분 · 증빙 면제' },
  current: { group: '참고', detail: '이번 설치 건의 신고' },
  extra: { group: '참고', detail: '받침 자료' },
};

const TONE: Record<Group, string> = {
  맞음: 'text-brand-700',
  어긋남: 'text-red-700',
  '확인 필요': 'text-amber-700',
  참고: 'text-slate-500',
};

function SheetCell({ line }: { line: CheckLine }) {
  const r = line.row;
  if (!r) return <span className="text-slate-500">—</span>;
  return (
    <span className="tabular-nums">
      <span className={TEXT.meta}>{r.row}행</span> {r.date ?? '일자 없음'} · {r.kind ?? '구분 없음'} · <b>{r.d ?? '—'}기</b>
    </span>
  );
}

function ActCell({ line }: { line: CheckLine }) {
  const a = line.act;
  if (!a) return <span className="text-slate-500">—</span>;
  const span = a.before !== null || a.after !== null ? `${a.before ?? '?'} → ${a.after ?? '?'}` : null;
  return (
    <span className="tabular-nums">
      <span className={`block break-all ${TEXT.meta}`}>{a.file}</span>
      {a.date ?? '일자 없음'}
      {span && <> · {span}</>}
      {line.actCount !== null && <> · <b>{line.actCount}기</b></>}
    </span>
  );
}

export function PreInstallCheckBlock({
  projectId, check, currentFiles, canRun, hasSheet, logRejected = false, docs, bundled = false,
}: {
  /**
   * 설치이력을 PDF 로도 냈다 — 자료를 한 묶음으로 다 냈으니 대조하지 않는다(한백 지시 2026-10-07, bundledAsPdf).
   * 대조 결과가 있으면 참고로 그대로 보이고, 계약 확인은 막지 않는다.
   */
  bundled?: boolean;
  projectId: string;
  check: PreInstallCheck | null | undefined;
  /** 지금 설치이력·증빙 칸의 파일 주소 — 지난 대조와 다르면 「서류가 바뀜」 */
  currentFiles: string[];
  /** 대조를 돌릴 수 있는가 — 한백 관리자 */
  canRun: boolean;
  /** 설치이력 칸에 파일이 있는가 — 없으면 대조할 것이 없다 */
  hasSheet: boolean;
  /** 설치이력 칸이 지금 반려(보완요청) 중인가 — 직인 줄에 「보완요청함」 */
  logRejected?: boolean;
  /** 이 걸음의 서류 두 칸(설치이력·증빙) — 머리 밑, 결과 위에 선다 */
  docs: ReactNode;
}) {
  const { busy, error, run } = useAction();
  const accepting = useAction();
  const [showAll, setShowAll] = useState(false);

  const stale = !!check && !sameFiles(check.files, currentFiles);
  const n = check ? issueCount(check) : 0;
  const m = check ? reviewCount(check) : 0;
  /* 넘긴 것은 그 결과의 일이다 — 서류가 바뀌면 넘긴 것도 같이 무효다(preCheckBlocker) */
  const accepted = check && !stale ? check.accepted ?? null : null;
  const accept = (on: boolean) => accepting.run({
    url: `/api/projects/${projectId}/preinstall/check/accept`,
    body: { checkedAt: check?.checkedAt, accept: on },
    fail: on ? '넘기지 못했습니다.' : '확인을 취소하지 못했습니다.',
  });

  const lines = check?.lines ?? [];
  const flagged = lines.filter((l) => SHOW[l.verdict].group === '어긋남' || SHOW[l.verdict].group === '확인 필요');
  const quiet = lines.filter((l) => !flagged.includes(l));
  const okCount = quiet.filter((l) => SHOW[l.verdict].group === '맞음').length;
  const refCount = quiet.length - okCount;
  const shown = showAll ? lines : flagged;

  return (
    <div className="flex flex-col gap-2.5">
      <GroupHead
        step={2}
        title="서류 · 대조"
        // 대조 시각은 상태 곁이다 — 단추 곁에 두면 단추 없는 사람(협력사·열람 전용)에게 시각만 떠 있었다
        meta={check ? `${stampOf(new Date(check.checkedAt))} 대조` : undefined}
      >
        {bundled
          ? <Tag tone="ok">PDF 로 냄 · 대조 면제</Tag>
          : !check
          /* 저절로 도는 것이라 누구를 기다린다고 적지 않는다 — 한백에게는 손으로 돌릴 단추가 곁에 선다 */
          ? <Tag tone={canRun ? 'warn' : 'mute'}>대조 전</Tag>
          : stale ? <Tag tone="warn">서류가 바뀜 — 다시 대조</Tag>
          : n === 0 && m === 0 ? <Tag tone="ok">맞음</Tag>
          : (
            <>
              {n > 0 && <Tag tone={accepted ? 'mute' : 'warn'}>짚을 것 {n}</Tag>}
              {/* 어긋남이 아니라 코드가 판정 못 하는 줄(설계도면 증빙) — 따로 센다 */}
              {m > 0 && <Tag tone={accepted ? 'mute' : 'warn'}>개별 검토 {m}</Tag>}
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
              disabled={!hasSheet}
              onClick={() => run({ url: `/api/projects/${projectId}/preinstall/check`, fail: '대조하지 못했습니다.' })}
            >
              {!hasSheet ? '설치이력 없음 — 대조 불가' : check ? '다시 대조' : '대조'}
            </Btn>
          </span>
        )}
        <Err>{error}</Err>
      </GroupHead>

      {docs}

      {check?.problem && <p className="text-small font-bold text-amber-800">{check.problem}</p>}

      {check && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          {check.standing && (
            <>
              <dt className={TEXT.label}>지금 서 있는 수</dt>
              <dd className={`${TEXT.body} tabular-nums`}>
                엑셀 <b>{check.standing.sheet}기</b> · 증빙 {check.standing.evidence === null ? '—' : <b>{check.standing.evidence}기</b>}
                {check.standing.from && <span className={TEXT.meta}> ({check.standing.from})</span>}
                {' '}
                <b className={check.standing.verdict === 'ok' ? TONE.맞음 : check.standing.verdict === 'diff' ? TONE.어긋남 : TONE['확인 필요']}>
                  {check.standing.verdict === 'ok' ? '맞음' : check.standing.verdict === 'diff' ? '어긋남' : '확인 필요 · 행위신고 없음'}
                </b>
              </dd>
            </>
          )}
          {check.sheet && check.sheet.final !== check.sheet.standing && (
            <>
              <dt className={TEXT.label}>최종 기설치 수량</dt>
              <dd className={`${TEXT.body} tabular-nums`}>엑셀 <b>{check.sheet.final}기</b> <span className={TEXT.meta}>(8년 전 임의 철거·교체분 포함)</span></dd>
            </>
          )}
          {check.seal && (
            <>
              <dt className={TEXT.label}>직인</dt>
              <dd className={TEXT.body}>
                아파트(설치 신청자) <Mark ok={check.seal.applicant} /> · 운영사(사업수행기관) <Mark ok={check.seal.operator} />
                {check.seal.oldForm && <span className={TEXT.meta}> (서명 칸 없는 옛 양식)</span>}
                {missingSeals(check.seal).length > 0 && logRejected && <span className={TEXT.meta}> · 보완요청함</span>}
              </dd>
            </>
          )}
          {/* 조사 결과는 3 걸음의 값이다 — 여기는 어긋날 때만 짚는다(같은 값을 두 번 두지 않는다, 규칙 5) */}
          {check.survey?.verdict === 'diff' && (
            <>
              <dt className={TEXT.label}>조사 결과</dt>
              <dd className={TEXT.body}>
                기설치 {check.survey.state} · 엑셀 최종 {check.sheet?.final ?? 0}기 <b className={TONE.어긋남}>어긋남</b>
              </dd>
            </>
          )}
          {check.sheet && check.sheet.badSplit.length > 0 && (
            <>
              <dt className={TEXT.label}>수량 검증</dt>
              <dd className={`${TEXT.body} font-bold text-red-700`}>
                엑셀 {check.sheet.badSplit.join(' · ')}행 — 철거·교체 기수(E+F+G)가 행위 기수(D)와 다름
              </dd>
            </>
          )}
          {check.unread.length > 0 && (
            <>
              <dt className={TEXT.label}>못 읽은 증빙</dt>
              <dd className={`${TEXT.body} break-all text-amber-800`}>{check.unread.join(' · ')}</dd>
            </>
          )}
        </dl>
      )}

      {check && lines.length > 0 && (
        <>
          {shown.length > 0 && (
            <div className="overflow-x-auto rounded-box border border-slate-200">
              <table className="w-full min-w-[620px]">
                <thead className={`bg-slate-50 ${TEXT.label}`}>
                  <tr>
                    {/* 여러 줄이 쌓이는 칸이라 왼쪽이다(화면 규칙 13 셋째) */}
                    <Th tight left className="py-2">엑셀</Th>
                    <Th tight left className="py-2">증빙</Th>
                    <Th tight left className="py-2">판정</Th>
                  </tr>
                </thead>
                <tbody className={TEXT.body}>
                  {shown.map((l, i) => {
                    const s = SHOW[l.verdict];
                    return (
                      <tr key={i} className="border-t border-slate-100">
                        <Td left><SheetCell line={l} /></Td>
                        <Td left><ActCell line={l} /></Td>
                        <Td left>
                          <b className={TONE[s.group]}>{s.group}</b>
                          {(l.why ?? s.detail) && <span className={`block ${TEXT.meta}`}>{l.why ?? s.detail}</span>}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {/* 접어 둔 줄 — 다 맞으면 이 한 줄이 결과의 전부다 */}
          {quiet.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {flagged.length === 0 && !showAll && (
                <span className={`${TEXT.body} font-bold ${TONE.맞음}`}>엑셀 {okCount}줄 모두 맞음</span>
              )}
              <Btn size="sm" kind="quiet" onClick={() => setShowAll((v) => !v)}>
                {showAll
                  ? '짚을 것만 보기'
                  : [okCount > 0 ? `맞음 ${okCount}줄` : null, refCount > 0 ? `참고 ${refCount}줄` : null].filter(Boolean).join(' · ') + ' 보기'}
              </Btn>
            </div>
          )}
        </>
      )}
      {check && !check.problem && lines.length === 0 && check.sheet && (
        <p className={TEXT.meta}>{check.sheet.none ? '엑셀: 이력 없음 · 증빙 0건' : '엑셀 0줄 · 증빙 0건'}</p>
      )}

      {/*
        ★넘기는 자리는 결과 밑이다★ — 줄을 다 읽고 나서 누르는 일이다(한백 지시 2026-10-07 「한백이 확인하고
        넘긴다」). 남은 것이 없으면 이미 통과라 자리가 없고, 서류가 바뀐 결과는 넘길 수 없다.
      */}
      {check && canRun && !stale && !bundled && n + m > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {accepted ? (
            <Btn kind="quiet" size="sm" busy={accepting.busy} busyLabel="취소 중…" onClick={() => accept(false)}>
              확인 취소
            </Btn>
          ) : (
            <Btn kind="side" size="sm" busy={accepting.busy} busyLabel="넘기는 중…" onClick={() => accept(true)}>
              {`${n + m}건 확인하고 넘기기`}
            </Btn>
          )}
          <Err>{accepting.error}</Err>
        </div>
      )}
    </div>
  );
}

function Mark({ ok }: { ok: boolean }) {
  return <b className={ok ? TONE.맞음 : TONE.어긋남}>{ok ? '있음' : '없음'}</b>;
}

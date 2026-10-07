'use client';

/**
 * 기설치 이력 엑셀 ↔ 증빙 대조 (한백 지시 2026-10-06) — 기설치 조사 구역 안의 한 덩이.
 *
 * 한백이 눌러 돌리고(판독 20~40초), 결과는 저장돼 협력사도 본다 — 어긋난 줄을 고쳐 다시 내는
 * 것이 협력사의 일이다. 판정은 lib/preinstall-check 가 하고 여기는 그린다.
 *
 * ★칸의 파일이 바뀌면 지난 결과를 믿지 않는다★ — 결과에 대조에 쓴 파일 주소가 남아 있어,
 * 지금 칸의 파일과 다르면 「서류가 바뀜」을 단다(결과는 그대로 보여준다 — 무엇이 틀렸었는지도 정보다).
 *
 * ★필수다★ (한백 지시 2026-10-07 「검증 필수」) — 보조사업 현장은 대조가 맞음이거나 한백이 결과를 보고
 * 「확인하고 넘기기」를 눌러야 계약 확인이 열린다(lib/preinstall-check preCheckBlocker). 그래서 자리를
 * 이력 조회 바로 밑으로 올렸고(조사의 두 번째 걸음), 안 했으면 협력사에게도 「한백 대조 전」으로 선다.
 */
import { useAction } from '@/lib/use-action';
import { stampOf } from '@/lib/date';
import {
  issueCount, missingSeals, reviewCount, sameFiles, sealFixReason,
  type CheckLine, type LineVerdict, type PreInstallCheck, type SealCheck,
} from '@/lib/preinstall-check';
import { Btn, Err, Tag, Td, Th } from '@/components/ui';

const VERDICT: Record<LineVerdict, { label: string; tone: string }> = {
  ok: { label: '맞음', tone: 'text-brand-700' },
  diff: { label: '어긋남', tone: 'text-red-700' },
  'no-evidence': { label: '증빙 없음', tone: 'text-amber-700' },
  'no-count': { label: '기수 못 읽음', tone: 'text-amber-700' },
  'no-row': { label: '엑셀에 없음', tone: 'text-red-700' },
  review: { label: '개별 검토 필요', tone: 'text-amber-700' },
  exempt: { label: '보조사업 · 증빙 면제', tone: 'text-slate-400' },
  current: { label: '이번 설치 건', tone: 'text-slate-400' },
  extra: { label: '받침 자료', tone: 'text-slate-400' },
};

function SheetCell({ line }: { line: CheckLine }) {
  const r = line.row;
  if (!r) return <span className="text-slate-300">—</span>;
  return (
    <span className="tabular-nums">
      <span className="text-slate-400">{r.row}행</span> {r.date ?? '일자 없음'} · {r.kind ?? '구분 없음'} · <b>{r.d ?? '—'}기</b>
    </span>
  );
}

function ActCell({ line }: { line: CheckLine }) {
  const a = line.act;
  if (!a) return <span className="text-slate-300">—</span>;
  const span = a.before !== null || a.after !== null ? `${a.before ?? '?'} → ${a.after ?? '?'}` : null;
  return (
    <span className="tabular-nums">
      <span className="break-all text-slate-500">{a.file}</span>
      <br />
      {a.date ?? '일자 없음'}
      {span && <> · {span}</>}
      {line.actCount !== null && <> · <b>{line.actCount}기</b></>}
    </span>
  );
}

export function PreInstallCheckBlock({
  projectId, check, currentFiles, canRun, hasSheet, logRejected = false,
}: {
  /** 설치이력 칸이 지금 반려(보완요청) 중인가 — 그러면 보완요청 단추 대신 「보완요청함」 */
  logRejected?: boolean;
  projectId: string;
  check: PreInstallCheck | null | undefined;
  /** 지금 설치이력·증빙 칸의 파일 주소 — 지난 대조와 다르면 「서류가 바뀜」 */
  currentFiles: string[];
  /** 대조를 돌릴 수 있는가 — 한백 관리자 */
  canRun: boolean;
  /** 설치이력 칸에 파일이 있는가 — 없으면 대조할 것이 없다 */
  hasSheet: boolean;
}) {
  const { busy, error, run } = useAction();
  const accepting = useAction();

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

  return (
    <div className="flex flex-col gap-2">
      {/* 머리는 바로 위 「이력 조회」와 같은 꼴이다 — 조사의 한 걸음이지 따로 선 구역이 아니다 */}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-tiny font-bold tracking-[0.04em] text-slate-500">엑셀 ↔ 증빙 대조</span>
        {!check
          /* 협력사는 돌릴 수 없다 — 누구를 기다리는지 적는다. 한백에게는 할 일이다 */
          ? <Tag tone={canRun ? 'warn' : 'mute'}>{canRun ? '대조 전' : '한백 대조 전'}</Tag>
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
      </div>
      {(check || canRun) && (
        <div className="flex flex-wrap items-center gap-2">
          {canRun && (
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
          )}
          {check && <span className="text-tiny tabular-nums text-slate-400">{stampOf(new Date(check.checkedAt))} 대조</span>}
          <Err>{error}</Err>
        </div>
      )}

      {check?.problem && <p className="text-small font-bold text-amber-800">{check.problem}</p>}

      {check && (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-small">
            {/* 줄 대조를 못 했어도(스캔본만 낸 현장) 직인은 본다 — 그래서 problem 과 상관없이 그린다 */}
            {check.seal && (
              <SealLine projectId={projectId} seal={check.seal} canAsk={canRun && !stale} asked={logRejected} />
            )}
            {check.standing && (
              <>
                <dt className="font-bold text-slate-500">지금 서 있는 수</dt>
                <dd className="tabular-nums">
                  엑셀 <b>{check.standing.sheet}기</b> · 증빙 {check.standing.evidence === null ? '—' : <b>{check.standing.evidence}기</b>}
                  {check.standing.from && <span className="text-slate-400"> ({check.standing.from})</span>}
                  {' '}
                  <span className={`font-black ${check.standing.verdict === 'ok' ? 'text-brand-700' : check.standing.verdict === 'diff' ? 'text-red-700' : 'text-amber-700'}`}>
                    {check.standing.verdict === 'ok' ? '맞음' : check.standing.verdict === 'diff' ? '어긋남' : '행위신고 없음'}
                  </span>
                </dd>
              </>
            )}
            {check.sheet && check.sheet.final !== check.sheet.standing && (
              <>
                <dt className="font-bold text-slate-500">최종 기설치 수량</dt>
                <dd className="tabular-nums">엑셀 <b>{check.sheet.final}기</b> <span className="text-slate-400">(8년 전 임의 철거·교체분 포함)</span></dd>
              </>
            )}
            {check.survey && (
              <>
                <dt className="font-bold text-slate-500">조사 결과</dt>
                <dd>
                  기설치 {check.survey.state} · 엑셀 최종 {check.sheet?.final ?? 0}기{' '}
                  <span className={`font-black ${check.survey.verdict === 'ok' ? 'text-brand-700' : 'text-red-700'}`}>
                    {check.survey.verdict === 'ok' ? '맞음' : '어긋남'}
                  </span>
                </dd>
              </>
            )}
            {check.sheet && check.sheet.badSplit.length > 0 && (
              <>
                <dt className="font-bold text-slate-500">수량 검증</dt>
                <dd className="font-bold text-red-700">
                  엑셀 {check.sheet.badSplit.join(' · ')}행 — 철거·교체 기수(E+F+G)가 행위 기수(D)와 다름
                </dd>
              </>
            )}
            {check.unread.length > 0 && (
              <>
                <dt className="font-bold text-slate-500">못 읽은 증빙</dt>
                <dd className="break-all text-amber-800">{check.unread.join(' · ')}</dd>
              </>
            )}
          </dl>

          {check.lines.length > 0 ? (
            <div className="overflow-x-auto rounded-box border border-slate-200">
              <table className="w-full min-w-[620px] text-small">
                <thead className="bg-slate-50 text-tiny font-bold tracking-[0.08em] text-slate-500">
                  <tr>
                    <Th tight className="py-2">엑셀</Th>
                    <Th tight className="py-2">증빙</Th>
                    <Th tight className="py-2">판정</Th>
                  </tr>
                </thead>
                <tbody>
                  {check.lines.map((l, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <Td><SheetCell line={l} /></Td>
                      <Td><ActCell line={l} /></Td>
                      <Td>
                        <span className={`font-black ${VERDICT[l.verdict].tone}`}>{VERDICT[l.verdict].label}</span>
                        {l.why && <span className="block text-tiny text-slate-500">{l.why}</span>}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : check.sheet && (
            <p className="text-small text-slate-500">
              {check.sheet.none ? '엑셀: 이력 없음 · 증빙 0건' : '엑셀 0줄 · 증빙 0건'}
            </p>
          )}

          {/*
            ★넘기는 자리는 결과 밑이다★ — 줄을 다 읽고 나서 누르는 일이다(한백 지시 2026-10-07 「한백이
            확인하고 넘긴다」). 남은 것이 없으면 이미 통과라 자리가 없고, 서류가 바뀐 결과는 넘길 수 없다 —
            다시 대조한 결과를 본다. 되돌리는 자리는 넘긴 자리 그대로다(화면 규칙 7).
          */}
          {canRun && !stale && n + m > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
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
        </>
      )}
    </div>
  );
}

/**
 * 기설치 없음 설치이력의 직인 (한백 지시 2026-10-07) — 빠졌으면 그 자리에서 보완요청한다.
 *
 * 보완요청은 설치이력 칸의 반려다 — 계약 탭의 반려와 같은 길(PATCH documents)이고, 사유는 빠진 직인을
 * 적어 채운다(sealFixReason). 되돌리는 자리도 그 칸의 반려 해제다. 서류가 바뀐 뒤의 지난 결과로는
 * 보완요청하지 않는다(canAsk) — 고쳐 올린 것을 다시 돌려보내게 된다.
 */
function SealLine({ projectId, seal, canAsk, asked }: { projectId: string; seal: SealCheck; canAsk: boolean; asked: boolean }) {
  const { busy, error, run } = useAction();
  const missing = missingSeals(seal);
  const mark = (ok: boolean) => <b className={ok ? 'text-brand-700' : 'text-red-700'}>{ok ? '있음' : '없음'}</b>;
  return (
    <>
      <dt className="font-bold text-slate-500">직인</dt>
      <dd className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span>
          아파트(설치 신청자) {mark(seal.applicant)} · 운영사(사업수행기관) {mark(seal.operator)}
          {seal.oldForm && <span className="text-slate-400"> (서명 칸 없는 옛 양식)</span>}
        </span>
        {missing.length > 0 && asked && <span className="text-tiny font-bold text-slate-500">보완요청함</span>}
        {missing.length > 0 && !asked && canAsk && (
          <span className="self-center">
            <Btn
              kind="warn"
              size="sm"
              busy={busy}
              busyLabel="보완요청 중…"
              onClick={() => run({
                url: `/api/projects/${projectId}/documents/legacylog`,
                method: 'PATCH',
                body: { status: 'rejected', reason: sealFixReason(seal) },
                fail: '보완요청하지 못했습니다.',
              })}
            >
              보완요청 — 직인 없음
            </Btn>
          </span>
        )}
        <Err>{error}</Err>
      </dd>
    </>
  );
}

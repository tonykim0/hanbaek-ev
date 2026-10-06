'use client';

/**
 * 기설치 이력 엑셀 ↔ 증빙 대조 (한백 지시 2026-10-06) — 기설치 조사 구역 안의 한 덩이.
 *
 * 한백이 눌러 돌리고(판독 20~40초), 결과는 저장돼 협력사도 본다 — 어긋난 줄을 고쳐 다시 내는
 * 것이 협력사의 일이다. 판정은 lib/preinstall-check 가 하고 여기는 그린다.
 *
 * ★칸의 파일이 바뀌면 지난 결과를 믿지 않는다★ — 결과에 대조에 쓴 파일 주소가 남아 있어,
 * 지금 칸의 파일과 다르면 「서류가 바뀜」을 단다(결과는 그대로 보여준다 — 무엇이 틀렸었는지도 정보다).
 */
import { useAction } from '@/lib/use-action';
import { stampOf } from '@/lib/date';
import { issueCount, type CheckLine, type LineVerdict, type PreInstallCheck } from '@/lib/preinstall-check';
import { Btn, Err, Tag, Td, Th } from '@/components/ui';

const VERDICT: Record<LineVerdict, { label: string; tone: string }> = {
  ok: { label: '맞음', tone: 'text-brand-700' },
  diff: { label: '어긋남', tone: 'text-red-700' },
  'no-evidence': { label: '증빙 없음', tone: 'text-amber-700' },
  'no-count': { label: '기수 못 읽음', tone: 'text-amber-700' },
  'no-row': { label: '엑셀에 없음', tone: 'text-red-700' },
  exempt: { label: '보조사업 · 증빙 면제', tone: 'text-slate-400' },
  current: { label: '이번 설치 건', tone: 'text-slate-400' },
  extra: { label: '받침 자료', tone: 'text-slate-400' },
};

const same = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');

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
  projectId, check, currentFiles, canRun, hasSheet,
}: {
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
  // 돌린 적도 없고 돌릴 수도 없으면 자리를 만들지 않는다 — 협력사에게 빈 덩이만 보인다
  if (!check && !canRun) return null;

  const stale = !!check && !same(check.files, currentFiles);
  const n = check ? issueCount(check) : 0;

  return (
    <div className="mt-4 border-t border-slate-100 pt-3">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1.5">
        <h3 className="text-small font-black text-slate-800">엑셀 ↔ 증빙 대조</h3>
        {check && (stale
          ? <Tag tone="warn">서류가 바뀜 — 다시 대조</Tag>
          : n > 0 ? <Tag tone="warn">짚을 것 {n}</Tag> : <Tag tone="ok">맞음</Tag>)}
        {check && <span className="text-tiny tabular-nums text-slate-400">{stampOf(new Date(check.checkedAt))} 대조</span>}
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
      </div>

      {check?.problem && <p className="mt-2 text-small font-bold text-amber-800">{check.problem}</p>}

      {check && !check.problem && (
        <>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-small">
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
            <div className="mt-2 overflow-x-auto rounded-box border border-slate-200">
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
          ) : (
            <p className="mt-2 text-small text-slate-500">
              {check.sheet?.none ? '엑셀: 이력 없음 · 증빙 0건' : '엑셀 0줄 · 증빙 0건'}
            </p>
          )}
        </>
      )}
    </div>
  );
}

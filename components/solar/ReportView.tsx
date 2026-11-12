'use client';

import { useMemo } from 'react';
import { Badge, BtnLink } from '@/components/ui';
import { AREA_PER_KW, LAYOUT, MODULE, TILT_DEG } from '@/lib/solar/assumptions';
import { withCapacity } from '@/lib/solar/capacity-checks';
import { areaLabel, estimateCapacity } from '@/lib/solar/estimate';
import type { Check, CheckStatus, Estimate, GridView, Level, Report, Verdict } from '@/lib/solar/types';
import { LEVEL_LABEL } from '@/lib/solar/verdict';
import { siteQueryOf, traceKeyOf } from '@/lib/solar/parcels';
import GridDetail from './GridDetail';
import ParcelBar from './ParcelBar';
import SiteMap from './SiteMap';
import { LEVEL_TONE, PANEL, StatusPill, TEXT } from './ui';
import { useGroundBoxes } from './useGroundBoxes';
import { useRoofPlan } from './useRoofPlan';

/** 근거 법령을 보이는 상태 — 통과한 항목에 법 조문을 달면 「문제 있는 곳」처럼 읽힌다 */
const FLAGGED = new Set<CheckStatus>(['conditional', 'hard', 'banned']);

/** 판정 밑 한 줄의 머리 — 판정을 정한 항목이 무엇을 뜻하나 */
const BECAUSE: Record<Level, string> = {
  ok: '',
  conditional: '확인할 것',
  hard: '미달',
  banned: '막는 것',
};

/**
 * 결과 — 판 셋을 위에서 아래로: ① 결과(장소 · 판정 · 용량 · 계산 가정) ② 지도(배치) ③ 검토 항목. 부지 검토만 한다 — 제안서는
 * 「제안서 생성」 화면에서 짓는다(한백 2026-11-08 「부지검토는 부지검토용으로만 제안서생성은 제안서 생성용으로만」). 결과 머리의 고리가 그리로 간다.
 * 답(판정과 용량)이 맨 위에 한 판으로 서고, 그 근거가 밑으로 간다. 같은 값은 한 자리에만 둔다 —
 * 용량은 결과 판, 계통 사정 문장은 검토 항목(판정 밑에는 항목 이름만).
 */
export default function ReportView({
  report,
  mapKey,
  canRegister = false,
  canPropose = false,
  busy = false,
  onParcels,
}: {
  report: Report;
  mapKey: string | null;
  canRegister?: boolean;
  /** 지붕형 결과에 「이 부지로 제안서 만들기」를 세우는가 — 한백의 눈(관리자 · 열람 전용). 사업자 자료라 협력사에게는 없다 */
  canPropose?: boolean;
  /** 다른 검토가 도는 중 — 필지 더하기 · 빼기를 막는다 */
  busy?: boolean;
  /** 필지를 더하고 빼서 다시 불러온다(ParcelBar) — 못 하면 그 까닭 */
  onParcels?: (q: string) => Promise<string | null>;
}) {
  // 지붕형은 지도에서 고른 지붕의 패널 장수가 용량이다 — 고를 때마다 용량·계통·허가·종합 판정을 다시 센다
  const plan = useRoofPlan(report.mode === 'roof' ? report.map : null);
  // 지상형은 지도에 그려 확정한 네모의 넓이가 용량이다 — 네모가 없으면 필지 면적으로 센다
  const ground = useGroundBoxes(report.mode === 'ground' && report.map ? report.map.point.lat : null);
  const byLayout = plan?.basis === 'layout';
  const boxCount = ground?.boxes.length ?? 0;
  const boxesArea = ground?.area ?? 0;
  const carport = ground?.use === 'carport';
  const boxPanels = ground?.count ?? 0;
  const byBoxes = boxCount > 0;
  const capacityKw = byLayout
    ? Math.round(plan.kw * 10) / 10
    : byBoxes
      ? (ground?.capacityKw ?? 0)
      : (report.estimate?.capacityKw ?? null);
  const estimate = useMemo(
    () =>
      byLayout
        ? estimateCapacity({
            capacityKw: capacityKw ?? 0,
            capacityNote: `지도 배치 — ${MODULE.watt}W 모듈(${MODULE.lengthM} × ${MODULE.widthM}m) ${plan.count.toLocaleString()}장, ${
              plan.style === 'flush'
                ? '지붕면 부착형'
                : `경사고정형 ${TILT_DEG.roof}° · 동지 ${12 - LAYOUT.shadeHours}~${12 + LAYOUT.shadeHours}시 그림자 간격 · ${LAYOUT.aisleEvery}장마다 통로 ${LAYOUT.aisleM}m`
            }, 지붕 가장자리 ${LAYOUT.setbackM}m · 채광창·설비는 모름`,
            usableArea: plan.area,
          })
        : byBoxes
          ? estimateCapacity({
              capacityKw: capacityKw ?? 0,
              capacityNote: carport
                ? `주차장 캐노피 — 설치면적 ${boxCount}곳(${Math.round(boxesArea).toLocaleString()}㎡)을 캐노피 지붕으로 보고 ${MODULE.watt}W 모듈 ${boxPanels.toLocaleString()}장을 빈틈없이(낮은 경사 한 면이라 줄 간격 없음) · 주차면 1면(2.5 × 5m)에 약 ${(((capacityKw ?? 0) / Math.max(boxesArea, 1)) * 12.5).toFixed(1)}kW`
                : `땅에 세움 — 설치면적 ${boxCount}곳 · 넓이 합 ${Math.round(boxesArea).toLocaleString()}㎡ · 땅 ${AREA_PER_KW.ground}㎡ 당 1kW`,
              usableArea: boxesArea,
            })
          : report.estimate,
    [byLayout, byBoxes, capacityKw, plan?.count, plan?.style, plan?.area, boxCount, boxesArea, carport, boxPanels, report],
  );
  const { checks, verdict, grid } = useMemo(
    () =>
      byLayout || byBoxes
        ? withCapacity(report, capacityKw, byBoxes ? { m2: boxesArea, basis: `설치면적 ${boxCount}곳` } : undefined)
        : report,
    [byLayout, byBoxes, capacityKw, boxesArea, boxCount, report],
  );
  const basis = byLayout
    ? `AI 지붕 배치 · 패널 ${plan.count.toLocaleString()}장`
    : byBoxes
      ? carport
        ? `주차장 캐노피 · 설치면적 ${boxCount}곳 · 패널 ${boxPanels.toLocaleString()}장`
        : `땅에 세움 · 설치면적 ${boxCount}곳 · ${Math.round(boxesArea).toLocaleString()}㎡`
      : report.mode === 'roof'
        ? '건축물대장 면적 기준'
        : '땅 면적 기준';
  /*
   * 건축물대장 면적으로 센 용량 — AI 지붕 배치가 용량을 정한 뒤에도 따로 세운다(한백 2026-11-04 「건축물대장 면적상
   * 가능용량도 따로 적어줘」). 배치 전에는 그 값이 곧 설치 가능 용량이라 두 번 적지 않는다(화면 규칙 5).
   */
  const register = byLayout && report.estimate ? report.estimate : null;

  return (
    <section className="mt-6 space-y-4">
      <Summary
        report={report}
        verdict={verdict}
        checks={checks}
        estimate={estimate}
        basis={basis}
        register={register}
        canRegister={canRegister}
        canPropose={canPropose && report.mode === 'roof'}
        busy={busy}
        onParcels={onParcels}
      />

      {/* 검토마다 새로 그린다 — 앞 결과의 도형이 남지 않게 */}
      {report.map && (
        <SiteMap
          key={report.checkedAt}
          data={report.map}
          appKey={mapKey}
          plan={plan}
          ground={ground}
          pnu={report.mode === 'roof' ? traceKeyOf(report.place.parcels.map((x) => x.pnu)) : null}
        />
      )}

      <div className={PANEL}>
        <h2 className={`border-b border-slate-100 px-5 py-3 ${TEXT.head}`}>검토 항목 {checks.length}개</h2>
        <ul className="divide-y divide-slate-100">
          {checks.map((c) => (
            <CheckRow key={c.key} check={c} grid={c.key === 'grid' ? grid : null} />
          ))}
        </ul>
      </div>
    </section>
  );
}

/** ① 결과 판 — 어디 · 되나 · 얼마나. 판정을 정한 항목은 이름만 적고 누르면 그 항목으로 간다 */
function Summary({
  report,
  verdict,
  checks,
  estimate,
  basis,
  register,
  canRegister,
  canPropose,
  busy,
  onParcels,
}: {
  report: Report;
  verdict: Verdict;
  checks: Check[];
  estimate: Estimate | null;
  basis: string;
  /** AI 지붕 배치로 용량을 정했을 때만 — 건축물대장 면적으로 센 용량(견줘 보는 값) */
  register: Estimate | null;
  canRegister: boolean;
  /** 「이 부지로 제안서 만들기」 — 지붕형 · 한백의 눈 */
  canPropose: boolean;
  busy: boolean;
  onParcels?: (q: string) => Promise<string | null>;
}) {
  const { place } = report;
  // 다음 화면으로 들고 가는 주소 — 여러 필지면 지번을 늘어놓은 한 줄(lib/solar/parcels — 받는 쪽이 다시 필지마다 나눈다)
  const address = siteQueryOf(place);
  const tone = LEVEL_TONE[verdict.level];
  // 자료를 못 받아 조건부가 된 판정은 「확인 못한 것」 — 사유가 다르다
  const head = verdict.level === 'conditional' && verdict.because.every((c) => c.status === 'unknown') ? '확인 못한 것' : BECAUSE[verdict.level];
  const judged = checks.filter((c) => c.status !== 'skip').length;

  return (
    <div className={`${PANEL} p-5`}>
      {/* 검색창이 둘이라(지붕형 · 지상형) 어느 쪽 검토인지 이름 앞에 단다 — 동글면 상태(누르지 않는다) */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <h2 className={`flex flex-wrap items-center gap-2 ${TEXT.place}`}>
          <Badge>{report.mode === 'roof' ? '지붕형' : '지상형'}</Badge>
          {place.buildingName ?? place.roadAddress ?? place.query}
        </h2>
        {/* 다음 걸음 — 검토한 부지를 그대로 상담 접수(현장관리) · 제안서 생성으로. 주소를 들고 간다 */}
        {(canRegister || canPropose) && (
          <div className="flex flex-wrap gap-2">
            {canRegister && (
              <BtnLink
                kind="side"
                size="sm"
                href={`/solar/sites/new?${new URLSearchParams({ address, name: place.buildingName ?? '', kind: report.mode })}`}
              >
                이 부지로 상담 접수
              </BtnLink>
            )}
            {canPropose && (
              <BtnLink kind="side" size="sm" href={`/solar/proposals?${new URLSearchParams({ q: address })}`}>
                이 부지로 제안서 만들기
              </BtnLink>
            )}
          </div>
        )}
      </div>
      {/* 도로명(대표 필지) · 지번 — 지번 자리는 필지를 더하고 빼는 자리다(여러 필지면 필지마다 칩) */}
      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
        {/* 도로명이 이미 제목이면(건물명 없음) 다시 적지 않는다(화면 규칙 5) */}
        {place.buildingName && place.roadAddress && <span className={TEXT.label}>{place.roadAddress} ·</span>}
        {onParcels ? (
          <ParcelBar place={place} busy={busy} onChange={onParcels} />
        ) : (
          <span className={TEXT.label}>{siteQueryOf({ ...place, roadAddress: null })}</span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-x-8 gap-y-4 border-t border-slate-100 pt-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2">
            <span className={`h-3 w-3 shrink-0 rounded-full ${tone.dot}`} />
            <span className={`text-h2 font-black ${tone.text}`}>{LEVEL_LABEL[verdict.level]}</span>
          </p>
          <p className={`mt-1 ${TEXT.body}`}>
            {verdict.because.length ? (
              <>
                {head} —{' '}
                {verdict.because.map((c, i) => (
                  <span key={c.key}>
                    {i > 0 && ' · '}
                    <a href={`#check-${c.key}`} className="font-semibold text-slate-900 underline decoration-slate-300 underline-offset-2 hover:decoration-slate-900">
                      {c.title}
                    </a>
                  </span>
                ))}
              </>
            ) : (
              `검토 항목 ${judged}개 모두 통과`
            )}
          </p>
        </div>
        {/*
         * 지붕형은 용량마다 그 용량을 낸 지붕 면적을 값 밑에 적는다(한백 2026-11-04 「건축물대장 면적 기준이랑 AI로 지붕찾기로
         * 했을 때 지붕면적도 같이」) — AI 배치면 고른 지붕의 넓이 합(지도에서 지붕을 빼고 넣으면 같이 바뀐다), 아니면
         * 건축물대장 건축면적. 지상형은 근거 줄이 넓이를 말한다.
         */}
        <dl className="flex flex-wrap gap-x-8 gap-y-3">
          <Num
            label="설치 가능 용량"
            value={estimate ? `${estimate.capacityKw.toLocaleString()} kW` : '—'}
            roofArea={report.mode === 'roof' && estimate ? estimate.usableArea : undefined}
            sub={estimate ? basis : undefined}
          />
          {/* 연 발전량은 걷었다(한백 2026-11-08 「부지검토랑 제안서 생성결과에 연 발전량은 필요없어」) — 견줘 보는 값이 곁에 선다 */}
          {register && (
            <Num
              label="건축물대장 면적 기준"
              value={`${register.capacityKw.toLocaleString()} kW`}
              roofArea={register.usableArea}
              sub={`건축면적 ${AREA_PER_KW.roof}㎡당 1kW`}
            />
          )}
        </dl>
      </div>

      {estimate && (
        <details className="mt-4 border-t border-slate-100 pt-3">
          <summary className={`cursor-pointer ${TEXT.label}`}>계산 가정</summary>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            {estimate.assumptions.map((a) => (
              <div key={a.label} className="contents">
                <dt className={TEXT.label}>{a.label}</dt>
                <dd className={TEXT.body}>{a.value}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </div>
  );
}

/** 큰 숫자 한 칸 — 이름 · 값 · (지붕형 용량이면) 그 지붕 면적 · 근거 한 줄 */
function Num({ label, value, roofArea, sub }: { label: string; value: string; roofArea?: number; sub?: string }) {
  return (
    <div>
      <dt className={TEXT.numLabel}>{label}</dt>
      <dd className={`mt-0.5 ${TEXT.num}`}>{value}</dd>
      {roofArea !== undefined && (
        <dd className={`mt-0.5 tabular-nums ${TEXT.body}`}>
          <span className={TEXT.label}>지붕 면적</span> <span className="font-semibold">{areaLabel(roofArea)}</span>
        </dd>
      )}
      {/* 밑 줄이 없는 칸도 자리를 지켜 두 숫자의 높이가 맞는다 */}
      <dd className={`${TEXT.meta} tabular-nums`}>{sub ?? ' '}</dd>
    </div>
  );
}

/** ③ 검토 항목 한 줄 — 이름 · 상태 · 결론 한 줄 · (걸렸으면) 근거 · 사실 */
function CheckRow({ check, grid }: { check: Check; grid: GridView | null }) {
  return (
    <li id={`check-${check.key}`} className="scroll-mt-4 px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className={TEXT.item}>{check.title}</h3>
          <p className={`mt-0.5 ${TEXT.body}`}>{check.summary}</p>
          {check.law && FLAGGED.has(check.status) && <p className={`mt-0.5 ${TEXT.meta}`}>근거 {check.law}</p>}
        </div>
        <StatusPill status={check.status} />
      </div>
      {grid && <GridDetail grid={grid} summary={check.summary} />}
      {check.facts && check.facts.length > 0 && (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5">
          {check.facts.map((f) => (
            <div key={f.label} className="contents">
              <dt className={TEXT.label}>{f.label}</dt>
              <dd className={TEXT.body}>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}

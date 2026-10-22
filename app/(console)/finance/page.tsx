import { redirect } from 'next/navigation';
import { thisMonth as seoulMonth } from '@/lib/date';
import { getRepository } from '@/lib/data';
import { allSlots } from '@/lib/data/db-slot';
import { getSessionUser, viewerOf } from '@/lib/auth/session';
import { isHanbaek } from '@/lib/roles';
import { safetyFeeApplies, safetyFeeDue, safetyFeeOpen } from '@/lib/settlement';
import { won, wonCompact } from '@/lib/format';
import YearTabs from '@/components/YearTabs';
import { Frame } from '@/components/settlement/parts';
import { Blank, PANEL, Tag, TEXT, Td, Th } from '@/components/ui';
import type { ReactNode } from 'react';

export const metadata = { title: '정산 현황 — 한백 전기차사업관리시스템' };

/**
 * 정산 현황 — 돈이 달마다 얼마 들어오고 얼마 나갔나.
 *
 * 수주 현황(/dashboard)이 대수를 세는 자리라면 이곳은 금액을 세는 자리다. 둘 다 「보는」
 * 화면이라 사이드바의 「현황」 묶음에 함께 있다 (한백 지시 2026-08-27).
 *
 * ★기준 날짜는 돈이 움직인 날이다.★ 계약일이나 접수월이 아니다 — 수금은 수금일,
 * 지급은 지급일로 센다. 그래서 8월에 접수한 현장의 기성이 11월에 들어오면 11월에 잡힌다.
 * 「이 달에 얼마 들어왔나」를 묻는 화면이라 그것이 맞다.
 *
 * ★한백 마진 칸은 걷었다★ (한백 지시 2026-10-22 「정산현황에서 한백 마진 없애고 UI를 다시 수정해봐」).
 * 이 화면은 받는 돈과 주는 돈 두 갈래만 세운다. 걷으면서 패스스루 제외 꼬리표도 같이 갔다(마진에서 빼는 표시였다). 단가 미지정·점검수수료 미기재는
 * 받을 돈 합계를 실제보다 적게 만드는 사실이라 기성 카드로 옮겼다.
 *
 * 협력사는 자기가 받는 쪽만 본다 — 기성은 저장소가 애초에 주지 않는다
 * (listSettlements 는 한백이 아니면 빈 목록이다). 화면에서 가리는 것이 아니다.
 *
 * 두 조회를 쓴다:
 *   listPayoutOverview — 지급 원장(월별)과 남은 계획(예정)을 한 번에
 *   listSettlements    — 기성 차수의 수금일·계획액 (한백만)
 */

/** 아직 확정하지 않은 지급 = 계획 + 조정 − 확정. 음수는 0 으로 본다(이미 다 나갔다). */
const restOf = (row: { plan: number; adjust: number; confirmed: number }) =>
  Math.max(0, row.plan + row.adjust - row.confirmed);

/*
 * 두 갈래의 색 — 카드의 막대와 월별 표의 막대·열 머리가 같은 것을 쓴다(한 곳에 둔다).
 * 수금 초록 · 지급 하늘. 둘은 색약 시험을 통과한 짝이다(dataviz 검사 — 정상 ΔE 20 · 적록 ΔE 20).
 * 하늘은 흰 바탕 대비가 3:1 아래라 막대만으로 값을 말하지 않는다 — 금액이 늘 옆에 적힌다.
 * ★글자는 색을 입지 않는다★ — 값은 검정, 갈래는 옆의 색 막대·점이 말한다.
 */
const IN = { fill: 'bg-brand-500', soft: 'bg-brand-300', track: 'bg-brand-100' };
const OUT = { fill: 'bg-sky-500', track: 'bg-sky-100' };

export default async function FinancePage({
  searchParams,
}: {
  searchParams: { year?: string };
}) {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/finance');

  const viewer = viewerOf(session);
  const repo = getRepository();
  const [allOverview, settlements] = await allSlots([
    () => repo.listPayoutOverview(viewer),
    () => repo.listSettlements(viewer),
  ] as const);
  /*
   * ★계약중단 현장은 지급 쪽에서도 뺀다★ (한백 지시 2026-09-30) — 기성 목록(listSettlements)은
   * 저장소가 이미 걸렀다. 한백에게는 그 목록이 곧 「센다」는 현장의 명단이라 그것으로 맞춘다 —
   * 받는 쪽만 빠지고 주는 쪽이 남으면 두 갈래가 서로 다른 현장을 센다.
   * 협력사는 기성 목록이 비어 있으므로(위 머리말) 거르지 않는다 — 다 사라진다.
   */
  const counted = new Set(settlements.map((s) => s.id));
  const overview = isHanbaek(session.role)
    ? {
      plans: allOverview.plans.filter((row) => counted.has(row.projectId)),
      history: allOverview.history.filter((row) => counted.has(row.projectId)),
    }
    : allOverview;

  const isAdmin = isHanbaek(session.role);
  const thisMonth = seoulMonth();
  const thisYear = thisMonth.slice(0, 4);

  // 수금·지급이 일어난 해만 고를 수 있다. 올해는 자료가 없어도 늘 넣는다(탭이 사라지지 않게).
  const collected = settlements.flatMap((s) => [
    /*
     * ★받은 돈은 실수금액이다★ — 협의로 계획과 다르게 받은 현장이 있다(익산 예다음아르띠에, migrations/0034).
     * 계획액으로 세면 아래 「수금 완료」(collectedTotal — 실수금액)와 이 표의 합이 그만큼 벌어진다.
     */
    ...s.steps
      .filter((step) => step.collectedAt && step.planAmount !== null)
      .map((step) => ({ at: step.collectedAt!, amount: step.collectedAmount ?? step.planAmount! })),
    /*
     * ★전기안전점검수수료 수금도 돈이 움직인 날이다★ (한백 2026-09-06). 안 세면 위
     * 「수금 완료」(collectedTotal)와 이 표의 합이 그만큼 벌어지고, 그 해에 움직인 돈이
     * 수수료뿐이면 연도 탭 자체가 생기지 않아 그 돈이 화면에서 사라진다.
     */
    ...(s.safetyFeeCollectedAt !== null && s.safetyFee !== null
      ? [{ at: s.safetyFeeCollectedAt, amount: s.safetyFee }]
      : []),
  ]);
  const paid = overview.history.map((row) => ({ at: row.paidAt, amount: row.amount }));
  const dataYears = [...new Set([...collected, ...paid].map((row) => row.at.slice(0, 4)))];
  const years = [...new Set([thisYear, ...dataYears])].sort().reverse();
  /*
   * 기본값은 자료가 있는 마지막 해다 — 올해로 잡으면 해가 바뀐 1월에 빈 화면이 열린다
   * (수주 현황과 같은 규칙).
   */
  const fallbackYear = [...dataYears].sort().reverse()[0] ?? thisYear;
  const year = searchParams.year && years.includes(searchParams.year)
    ? searchParams.year
    : fallbackYear;

  const sumIn = (rows: Array<{ at: string; amount: number }>, prefix: string) =>
    rows.filter((row) => row.at.startsWith(prefix)).reduce((sum, row) => sum + row.amount, 0);

  const months = Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, '0')}`;
    return {
      month,
      income: sumIn(collected, month),
      outgo: sumIn(paid, month),
      future: month > thisMonth,
      now: month === thisMonth,
    };
  });

  /*
   * 계획·잔여는 해로 자르지 않는다 — 계획에는 날짜가 없다(조건이 채워지면 열린다).
   * 그래서 위 카드(전체)와 아래 표(고른 해)는 서로 다른 범위다 — 카드는 해 탭을 따라 바뀌지 않는다.
   */
  const planIn = settlements.reduce((sum, s) => sum + s.planTotal, 0);
  const collectedAll = settlements.reduce((sum, s) => sum + s.collectedTotal, 0);
  /* 받을 수 있는 돈 — 조건이 찬 차수 + 아직 안 받은 전기안전점검수수료(트리거가 없다) */
  const openIn = settlements.reduce(
    (sum, s) => sum + s.steps
      .filter((step) => step.state === 'open' && step.planAmount !== null)
      .reduce((stepSum, step) => stepSum + step.planAmount!, 0)
      + safetyFeeOpen(s),
    0
  );
  /*
   * 조건 대기 — 아직 트리거가 안 찬 차수. 「총 − 수금 − 받을 수 있는」으로 빼서 구하지 않는다:
   * 수금은 실수금액이라 계획과 다르게 받은 현장이 있으면 그 차액이 대기로 새어 든다(감사 L13 과 같은 꼴).
   */
  const waitIn = settlements.reduce(
    (sum, s) => sum + s.steps
      .filter((step) => step.state === 'waiting' && step.planAmount !== null)
      .reduce((stepSum, step) => stepSum + step.planAmount!, 0),
    0
  );
  /* 청구액을 적어야 하는데 안 적은 현장 — 받을 돈 합계가 그만큼 실제보다 적다(단가 미지정과 같은 꼴) */
  const safetyFeeMissing = settlements.filter(
    (s) => safetyFeeApplies(s.cpo) && s.safetyFee === null && safetyFeeDue(s.status)
  ).length;
  /* 받을 돈이 실제보다 적게 나오는 현장 수 — 단가가 안 붙은 라인은 차수 금액이 없다 */
  const unpricedSites = settlements.filter((s) => s.unpricedLines > 0).length;

  const planOut = overview.plans.reduce((sum, row) => sum + row.plan + row.adjust, 0);
  const paidAll = overview.plans.reduce((sum, row) => sum + row.confirmed, 0);
  const restOut = overview.plans.reduce((sum, row) => sum + restOf(row), 0);

  if (collected.length === 0 && paid.length === 0 && overview.plans.length === 0) {
    return (
      <div>
        <PageHeader year={year} years={years} isAdmin={isAdmin} />
        <div className="mt-6">
          <Blank>정산 0건</Blank>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-7">
      <PageHeader year={year} years={years} isAdmin={isAdmin} />

      {/* 카드는 늘 두 칸 폭이다 — 협력사는 하나뿐이지만 넓게 늘이면 막대 길이가 한백 화면과 다른 물건이 된다 */}
      <div className="grid gap-5 lg:grid-cols-2">
        {isAdmin && (
          <Summary
            eyebrow="받는 돈"
            title="운영사 기성"
            total={{ label: '총 받아야 할 돈', value: planIn }}
            track={IN.track}
            /*
              ★합계가 실제보다 적다는 사실만 꼬리표로 남긴다★ (한백 2026-08-29) — 숫자를 믿고 판단하는 자리에서
              틀린 줄 모르는 숫자가 가장 위험하다. 세어진 것은 꼬리표다(화면 규칙 11).
            */
            side={(unpricedSites > 0 || safetyFeeMissing > 0) ? (
              <>
                {unpricedSites > 0 && <Tag tone="warn">단가 미지정 {unpricedSites}건</Tag>}
                {safetyFeeMissing > 0 && <Tag tone="warn">점검수수료 미기재 {safetyFeeMissing}건</Tag>}
              </>
            ) : undefined}
            parts={[
              { label: '수금 완료', value: collectedAll, fill: IN.fill },
              { label: '받을 수 있는 돈', value: openIn, fill: IN.soft },
              { label: '조건 대기', value: waitIn, fill: null },
            ]}
          />
        )}

        <Summary
          eyebrow={isAdmin ? '주는 돈' : '받는 돈'}
          title={isAdmin ? '협력사 지급' : '내 지급'}
          total={{ label: '계획', value: planOut }}
          track={OUT.track}
          parts={[
            { label: isAdmin ? '지급 완료' : '받은 돈', value: paidAll, fill: OUT.fill },
            { label: isAdmin ? '남은 지급' : '남은 예정', value: restOut, fill: null },
          ]}
        />
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className={TEXT.section}>{year}년 {isAdmin ? '수금 · 지급' : '받은 돈'}</h2>
          <span className={TEXT.meta}>돈이 움직인 날 기준 · 원</span>
        </div>
        <MonthTable rows={months} isAdmin={isAdmin} />
      </section>
    </div>
  );
}

function PageHeader({
  year,
  years,
  isAdmin,
}: {
  year: string;
  years: string[];
  isAdmin: boolean;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="mb-1 text-small font-bold text-brand-700">
          {isAdmin ? '수금 · 지급' : '내가 받는 돈'}
        </p>
        <h1 className="text-h1 font-black text-slate-900">정산 현황</h1>
      </div>
      <YearTabs years={years} value={year} hrefBase="/finance" />
    </header>
  );
}

type Part = {
  label: string;
  value: number;
  /** 막대 조각의 색 — null 이면 조각을 세우지 않는다(바닥이 그 몫이다) */
  fill: string | null;
};

/**
 * 한 갈래의 전모 — 합계 하나와 그것이 지금 어디까지 왔나.
 *
 * ★막대는 한 줄 비율이다★ — 앞에서부터 끝난 돈 · 받을 수 있는 돈을 잇고, 남은 자리(바닥)가 아직 조건이 안 찬
 * 돈이다. 바닥은 같은 색의 옅은 단계다(초록 위의 초록) — 회색 바닥은 「비었다」로 읽히지만 여기 바닥은 「아직」이다.
 * 조각 사이는 2px 띄운다 — 붙이면 두 초록이 한 덩어리로 읽힌다.
 * 비율의 분모는 조각의 합이다(총액이 아니다) — 수금은 실수금액이라 계획과 다르게 받은 현장이 있으면 둘이 갈린다.
 * 그 차이로 막대가 넘치거나 모자라지 않게 한다.
 *
 * 줄마다 막대와 같은 색 점을 단다 — 색만으로 갈래를 말하지 않는다(이름이 옆에 있다). 값은 검정이다.
 */
function Summary({
  eyebrow, title, total, track, parts, side,
}: {
  eyebrow: string;
  title: string;
  total: { label: string; value: number };
  track: string;
  parts: Part[];
  side?: ReactNode;
}) {
  const whole = parts.reduce((sum, p) => sum + Math.max(0, p.value), 0);
  const share = (v: number) => (whole > 0 ? (Math.max(0, v) / whole) * 100 : 0);
  const done = parts[0];
  return (
    <section className={`${PANEL} flex flex-col gap-4 p-5 sm:p-6`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div>
          <p className="mb-1 text-micro font-black tracking-[0.14em] text-brand-700">{eyebrow}</p>
          <h2 className={TEXT.section}>{title}</h2>
        </div>
        {side && <div className="flex flex-wrap items-center gap-1.5">{side}</div>}
      </div>

      <div>
        <p className={TEXT.label}>{total.label}</p>
        <p className="mt-0.5 flex items-baseline justify-between gap-3">
          <span className="text-h1 font-black tabular-nums text-slate-900">
            {won(total.value)}<span className="ml-1 text-small font-bold text-slate-500">원</span>
          </span>
          {whole > 0 && (
            <span className={`${TEXT.meta} tabular-nums`}>{done.label} {Math.round(share(done.value))}%</span>
          )}
        </p>
      </div>

      <div
        className={`flex h-2.5 gap-[2px] overflow-hidden rounded-full ${track}`}
        role="img"
        aria-label={parts.map((p) => `${p.label} ${won(p.value)}원`).join(', ')}
      >
        {parts.filter((p) => p.fill && p.value > 0).map((p) => (
          <span
            key={p.label}
            className={`h-full first:rounded-l-full ${p.fill}`}
            style={{ width: `${share(p.value)}%` }}
            title={`${p.label} ${wonCompact(p.value)}`}
          />
        ))}
      </div>

      <dl className="flex flex-col">
        {parts.map((p) => (
          <div key={p.label} className="flex items-baseline justify-between gap-3 border-t border-slate-100 py-2 first:border-0 first:pt-0">
            <dt className={`flex items-center gap-2 ${TEXT.label}`}>
              <i aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-[3px] ${p.fill ?? track}`} />
              {p.label}
            </dt>
            <dd className="text-h3 font-black tabular-nums text-slate-900">{won(p.value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * 달마다 한 줄 — 달 · 막대 · 금액. 열두 줄을 위아래로 훑어 크기를 견주는 자리다.
 *
 * 월별 지급표(/statements PayChart)와 같은 얼개다: 막대는 갈래마다 제 줄이고 둘 다 왼쪽에서 시작해 같은 자를
 * 쓴다(쌓지 않는다 — 뒤 조각은 시작점이 달마다 달라 달끼리 견줄 수 없다). 바닥은 깔지 않는다 — 빈 달이 죄다
 * 얼룩이 된다. 금액은 표의 칸이라 압축하지 않는다(won) — 대조가 일이다.
 *
 * 누적 열 둘은 걷었다(2026-10-22) — 마지막 줄의 누적이 곧 합계 줄이라 같은 값이 두 번이었고(화면 규칙 5), 일곱
 * 열이 좁은 화면에서 막대를 실오라기로 만들었다. 차액은 남긴다 — 그 달에 돈이 남았나 모자랐나는 이 표만 답한다.
 * 오지 않은 달은 자리만 지킨다 — 이미 잡힌 지급(지급일이 앞날인 배치)은 옅은 막대로 그린다(감사 M21).
 */
function MonthTable({
  rows,
  isAdmin,
}: {
  rows: Array<{ month: string; income: number; outgo: number; future: boolean; now: boolean }>;
  isAdmin: boolean;
}) {
  const max = Math.max(1, ...rows.map((row) => Math.max(row.income, row.outgo)));
  const yearIn = rows.reduce((sum, row) => sum + row.income, 0);
  const yearOut = rows.reduce((sum, row) => sum + row.outgo, 0);
  const amount = (v: number, row: { future: boolean }) =>
    v !== 0 ? won(v) : <span className="text-slate-300">{row.future ? '—' : '0'}</span>;

  return (
    <Frame min={isAdmin ? '640px' : '420px'}>
      <thead className="border-b border-slate-100 bg-slate-50 text-tiny font-bold tracking-[0.06em] text-slate-500">
        <tr>
          <Th className="w-16">달</Th>
          <Th className="w-[38%]"><span className="sr-only">크기</span></Th>
          {isAdmin && (
            <Th money>
              <span className="inline-flex items-center gap-1.5">
                <i aria-hidden className={`h-2 w-2 rounded-[2px] ${IN.fill}`} />수금
              </span>
            </Th>
          )}
          <Th money>
            <span className="inline-flex items-center gap-1.5">
              <i aria-hidden className={`h-2 w-2 rounded-[2px] ${OUT.fill}`} />{isAdmin ? '지급' : '받은 돈'}
            </span>
          </Th>
          {isAdmin && <Th money>차액</Th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map((row) => {
          const diff = row.income - row.outgo;
          const label = `${Number(row.month.slice(5))}월`;
          return (
            <tr key={row.month} className={row.now ? 'bg-brand-50/60' : ''}>
              <Td className={`font-bold ${row.now ? 'text-brand-800' : row.future ? 'text-slate-500' : 'text-slate-700'}`}>
                {label}
              </Td>
              <Td className="align-middle">
                <span
                  className="flex flex-col gap-[3px]"
                  title={`${row.month}${row.future ? ' · 예정' : ''} · ${isAdmin ? `수금 ${wonCompact(row.income)} · ` : ''}${isAdmin ? '지급' : '받은 돈'} ${wonCompact(row.outgo)}`}
                >
                  {isAdmin && <Bar value={row.income} max={max} fill={IN.fill} faint={row.future} />}
                  <Bar value={row.outgo} max={max} fill={OUT.fill} faint={row.future} />
                </span>
              </Td>
              {isAdmin && <Td money className="font-semibold text-slate-800">{amount(row.income, row)}</Td>}
              <Td money className="font-semibold text-slate-800">{amount(row.outgo, row)}</Td>
              {isAdmin && (
                <Td money className={`font-bold ${diff < 0 ? 'text-red-700' : 'text-slate-900'}`}>
                  {row.income || row.outgo ? won(diff) : <span className="text-slate-300">—</span>}
                </Td>
              )}
            </tr>
          );
        })}
      </tbody>
      <tfoot className="border-t border-slate-200 bg-slate-50">
        <tr className="font-black text-slate-900">
          <Td>합계</Td>
          <Td />
          {isAdmin && <Td money>{won(yearIn)}</Td>}
          <Td money>{won(yearOut)}</Td>
          {isAdmin && <Td money className={yearIn - yearOut < 0 ? 'text-red-700' : ''}>{won(yearIn - yearOut)}</Td>}
        </tr>
      </tfoot>
    </Frame>
  );
}

/** 칸 안의 막대 하나 — 0 이면 자리만 지킨다(높이는 남긴다 — 두 막대의 위아래 자리가 줄마다 같게) */
function Bar({ value, max, fill, faint }: { value: number; max: number; fill: string; faint: boolean }) {
  return (
    <span className="block h-[7px]">
      {value > 0 && (
        <span
          aria-hidden
          className={`block h-full rounded-full ${fill}${faint ? ' opacity-40' : ''}`}
          style={{ width: `${Math.max(1.5, (value / max) * 100)}%` }}
        />
      )}
    </span>
  );
}

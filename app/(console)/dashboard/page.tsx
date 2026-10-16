import { redirect } from 'next/navigation';
import Link from 'next/link';
import { thisMonth as seoulMonth } from '@/lib/date';
import { getRepository } from '@/lib/data';
import { getSessionUser, viewerOf } from '@/lib/auth/session';
import { isHanbaek } from '@/lib/roles';
import { ATTRS, EMPTY, optionsOf, type AttrKey } from '@/lib/project-filter';
import { businessYearsOf, inBusinessYear } from '@/lib/business-year';
import YearTabs from '@/components/YearTabs';
import ScrollEnd from '@/components/ScrollEnd';
import { Blank, PANEL, Tag } from '@/components/ui';
import { isPassThroughOrg, isPassThroughSite } from '@/lib/settlement';
import type { ProjectSummary } from '@/types/project';
import type { ReactNode } from 'react';

export const metadata = { title: '수주 현황 — 한백 전기차사업관리시스템' };

/**
 * 수주 현황의 숫자는 모두 계약 대수 기준이다.
 * (화면 이름이 「대시보드」였다 — 보여주는 것이 수주 대수뿐이라 2026-08-24 에 고쳤다.
 *  주소는 /dashboard 그대로다 — 링크가 이미 나가 있다.)
 * 현장 수만 세면 3대짜리 현장과 21대짜리 현장이 같은 무게로 보여 사업 규모를 왜곡한다.
 */
const qtyOf = (p: ProjectSummary) => p.lines.reduce((sum, line) => sum + line.qty, 0);

const BAR_COLORS = [
  '#3a7f4d', '#56a76c', '#83c597', '#0369a1', '#38bdf8', '#a78bfa',
];
const EMPTY_COLOR = '#cbd5e1';
const REST_COLOR = '#94a3b8';
const BREAKDOWN_MAX = 5;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: { year?: string };
}) {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/dashboard');

  const all = await getRepository().listProjects(viewerOf(session));
  // 업체별 쪼개기는 「전 현장을 보는 눈」의 것이다 — 열람 전용도 본다
  const isAdmin = isHanbaek(session.role);
  const thisMonth = seoulMonth();
  const thisYear = thisMonth.slice(0, 4);
  /*
   * 고를 수 있는 해에는 올해를 늘 넣는다 — 자료에 있는 해만 내면 첫 해에는 탭이 아예
   * 안 뜨고(고를 것이 하나뿐), 연도별로 볼 수 있는 화면인 줄 모른다.
   *
   * 다만 ★기본값은 자료가 있는 마지막 해★다. 올해로 잡으면 해가 바뀐 1월에 빈 화면이
   * 열린다 — 아직 접수가 없을 뿐인데 수주가 없어진 것처럼 보인다.
   */
  const dataYears = businessYearsOf(all);
  const years = [...new Set([thisYear, ...dataYears])].sort().reverse();
  const fallbackYear = dataYears[0] ?? thisYear;
  const year = searchParams.year && years.includes(searchParams.year) ? searchParams.year : fallbackYear;
  const projects = inBusinessYear(all, year);

  if (all.length === 0) {
    return (
      <div>
        <PageHeader year={year} years={years} period={`${Number(thisMonth.slice(5, 7))}월 기준`} />
        <div className="mt-6">
          <Blank>현장 0건</Blank>
        </div>
      </div>
    );
  }

  // 1~12월은 자리를 고정한다. 아직 오지 않은 달은 0이 아니라 future로 따로 표시한다.
  let accProjects = 0;
  let accQty = 0;
  let accPassQty = 0;
  const byMonth = Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, '0')}`;
    const list = projects.filter((p) => p.createdAt.startsWith(month));
    const qty = list.reduce((sum, p) => sum + qtyOf(p), 0);
    /*
     * ★패스스루 몫을 따로 센다★ (한백 지적 2026-09-23 「그래프에는 아직 패스스루가
     * 포함되어있어서 헷갈려」).
     *
     * 막대 하나에 섞여 있으면 「9월에 100대 수주」로 읽히는데, 그중 79대는 받은 것이 그대로
     * 내려가는 현장이다 — 깔리는 대수는 맞지만 우리 일로 남는 몫이 아니다. 빼지 않고
     * 쌓아 올린다: 총량도 사실이고 그 안의 몫도 사실이라, 둘 다 보여야 안 헷갈린다.
     */
    const passQty = list
      .filter((p) => isPassThroughSite(p))
      .reduce((sum, p) => sum + qtyOf(p), 0);
    accProjects += list.length;
    accQty += qty;
    accPassQty += passQty;
    return {
      month,
      label: `${index + 1}월`,
      projects: list.length,
      qty,
      passQty,
      accProjects,
      accQty,
      accPassQty,
      future: month > thisMonth,
      now: month === thisMonth,
    };
  });

  const dist = (key: AttrKey) => {
    const attr = ATTRS.find((candidate) => candidate.key === key)!;
    return optionsOf(projects, key)
      .map((value) => {
        const list = projects.filter((p) => attr.valuesOf(p).includes(value));
        const qtyIn = (only: ProjectSummary[]) =>
          key === 'term'
            ? only.reduce(
                (sum, p) =>
                  sum +
                  p.lines
                    .filter((line) => `${line.termYears}년` === value)
                    .reduce((lineSum, line) => lineSum + line.qty, 0),
                0
              )
            : only.reduce((sum, p) => sum + qtyOf(p), 0);
        const qty = qtyIn(list);
        /*
         * ★어느 묶음에서든 패스스루 몫을 따로 센다★ (한백 지적 2026-09-23 「운영사·수전방식·
         * 사업유형·계약연수 여기도 다 패스스루가 포함되어있잖아」).
         *
         * 업체 이름이 없는 묶음이라 꼬리표를 달 자리가 없다 — 대신 막대를 갈라 그 몫을
         * 회색으로 보여준다. 빼지 않는 이유는 월별 그래프와 같다: 깔리는 대수는 사실이다.
         */
        const passQty = qtyIn(list.filter((p) => isPassThroughSite(p)));
        /*
         * ★받은 것을 그대로 내려주는 업체는 그렇게 적는다★ (한백 지시 2026-09-23 「수주현황
         * 에서 패스스루는 구분해줘야될듯, 화두에너지솔루션은 전부 다 패스스루니까」).
         *
         * 대수에서 빼지 않는다 — 우리가 수주한 현장이 맞고, 실제로 그만큼 깔린다. 다만
         * 그 줄의 돈은 통째로 내려가므로 「같은 100대」가 아니다. 빼면 그 사실이 화면에서
         * 사라지고, 안 적으면 다른 업체와 같은 무게로 읽힌다 — 그래서 적는다.
         */
        const pass = (key === 'sales' || key === 'gc') && isPassThroughOrg(value);
        return { value, projects: list.length, qty, passQty, pass };
      })
      .filter((row) => row.qty > 0)
      /*
       * ★패스스루 업체는 맨 아래다★ (한백 지시 2026-09-23 「영업사 시공사에서 패스스루는
       * 맨 아래로 내려줘」). 대수로 줄을 세우면 고덕아이파크 79대 때문에 화두가 첫 줄에
       * 서는데, 이 목록을 보는 눈은 「우리가 어디서 얼마나 수주했나」라서 성질이 다른 줄이
       * 맨 위에 서면 읽는 순서가 어긋난다. 빼지는 않는다 — 아래에 그대로 둔다.
       */
      .sort((a, b) => Number(a.pass) - Number(b.pass) || b.qty - a.qty);
  };

  const period = year === thisYear ? `${Number(thisMonth.slice(5, 7))}월 기준` : '연간';

  return (
    <div className="flex flex-col gap-7">
      <PageHeader year={year} years={years} period={period} />

      {/*
        ★그래프 둘은 xl 부터 나란히 선다★ (2026-10-16 UI 손질) — lg(1024)에서 나란히 서면 칸이 좁아 최근 달(8~12월)이
        상자 안 가로 스크롤 뒤로 숨었다. grid-cols-1 은 minmax(0,1fr) 이다 — 없으면 한 줄 격자의 칸이 그래프의 최소 폭만큼
        늘어나 폰에서 페이지 전체가 옆으로 밀렸다.
      */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Panel
          title={`${year}년 월별 수주`}
          side={<span>그 달에 접수된 대수 · 건수 · 현장당 평균 · 회색은 패스스루</span>}
        >
          <MonthBars rows={byMonth} kind="month" />
        </Panel>

        <Panel
          title={`${year}년 누적 수주`}
          side={<span>1월부터 더한 대수 · 건수 · 현장당 평균 · 회색은 패스스루</span>}
        >
          <MonthBars rows={byMonth} kind="acc" />
        </Panel>
      </div>

      <section>
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <h2 className="text-h2 font-black text-slate-900">수주 구성</h2>
          <span className="text-tiny font-semibold text-slate-400">대수 기준 · 회색은 패스스루</span>
        </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
          {isAdmin && <Breakdown title="영업사" rows={dist('sales')} attr="sales" />}
          {/*
            ★시공사 묶음은 걷었다★ (한백 지시 2026-09-23 「수주 구성에서 시공사는 필요없어.
            어차피 영업사가 다 영업수주하는거라」). 이 화면이 답하는 물음은 「수주가 어디서
            왔나」이고, 그 답은 영업사다 — 시공사는 그 뒤에 붙는 일이라 같은 물음의 답이
            아니다. 시공사별로 보는 자리는 계약관리 표의 거르는 축이다.
          */}
          <Breakdown title="운영사" rows={dist('cpo')} attr="cpo" />
          <Breakdown title="수전방식" rows={dist('power')} attr="power" />
          <Breakdown title="사업유형" rows={dist('biz')} attr="biz" />
          <Breakdown title="계약연수" rows={dist('term')} attr="term" />
        </div>
      </section>
    </div>
  );
}

function PageHeader({ year, years, period }: { year: string; years: string[]; period: string }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {/* 연도는 옆 탭이 말한다 — 같은 값을 한 화면에 두 번 두지 않는다(화면 규칙 5) */}
        <p className="mb-1 text-small font-bold text-brand-700">{period}</p>
        <h1 className="text-h1 font-black text-slate-900">수주 현황</h1>
      </div>

      {/* 한 해의 보고서라 「전체」를 두지 않는다 — 월별·누적이 한 해 안에서만 뜻이 있다 */}
      <YearTabs years={years} value={year} hrefBase="/dashboard" />
    </header>
  );
}

function Panel({
  title,
  side,
  className = '',
  children,
}: {
  title: string;
  side?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`${PANEL} min-w-0 p-5 sm:p-6 ${className}`}>
      {/*
        ★제목은 접지 않는다★ — 옆 설명이 길어 좁은 폭에서 「2026년 월별 / 수주」로 접혔다. 설명이 제목 밑으로 내려간다.
        제목 위의 「수주」 작은 글씨는 걷었다 — 제목이 같은 말을 한다(규칙 5).
      */}
      <div className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="whitespace-nowrap text-h3 font-black text-slate-900">{title}</h2>
        {side && <div className="text-tiny font-semibold text-slate-400">{side}</div>}
      </div>
      {children}
    </section>
  );
}

/**
 * 현장당 설치기수 — 한 자리까지. 「3.5」·「4」처럼 군더더기 0 을 안 붙인다.
 *
 * 대수와 건수만 있으면 「많이 딴 달」과 「크게 딴 달」이 구별되지 않는다 (한백 2026-08-29) —
 * 10건 35대와 2건 35대는 같은 35대지만 다른 달이다.
 */
function avgQty(qty: number, projects: number): string {
  if (projects === 0) return '';
  return `${Math.round((qty / projects) * 10) / 10}대`;
}

function MonthBars({
  rows,
  kind,
}: {
  rows: Array<{
    month: string;
    label: string;
    projects: number;
    qty: number;
    passQty: number;
    accProjects: number;
    accQty: number;
    accPassQty: number;
    future: boolean;
    now: boolean;
  }>;
  kind: 'month' | 'acc';
}) {
  const height = 196;
  /* 막대가 자랄 수 있는 높이 — 꼭대기 숫자 자리를 뺀다. 막대와 눈금 줄이 같은 자를 쓴다 */
  const barArea = height - 30;
  const valueOf = (row: (typeof rows)[number]) => (kind === 'month' ? row.qty : row.accQty);
  /* 그중 받은 것을 그대로 내려주는 몫 — 막대 위쪽에 회색으로 쌓인다 */
  const passOf = (row: (typeof rows)[number]) => (kind === 'month' ? row.passQty : row.accPassQty);
  const projectCountOf = (row: (typeof rows)[number]) =>
    kind === 'month' ? row.projects : row.accProjects;
  /*
   * ★눈금 숫자가 제 줄에 서게★ — 꼭대기를 최댓값 그대로 두고 1/3·2/3 를 반올림해 적었더니, 최댓값이 4 면 「3·1」이
   * 2.7·1.3 높이의 줄에 붙었다. 꼭대기를 3 의 배수로 올리면 세 칸이 정수로 떨어진다.
   */
  const step = Math.max(1, Math.ceil(Math.max(...rows.map(valueOf), 1) / 3));
  const max = step * 3;
  const title = kind === 'month' ? '월별 수주' : '누적 수주';
  const fill = kind === 'month' ? 'bg-sky-400' : 'bg-brand-400';
  const fillNow = kind === 'month' ? 'bg-sky-700' : 'bg-brand-700';

  return (
    <ScrollEnd className="overflow-x-auto pb-1">
      <div
        role="img"
        aria-label={`${title} 대수: ${rows.map((row) => `${row.label} ${row.future ? '예정' : `${valueOf(row)}대`}`).join(', ')}`}
        className="min-w-[440px]"
      >
        <div className="relative" style={{ height }}>
          {/*
            눈금 줄은 막대와 같은 자로 선다 — 막대는 꼭대기 숫자 자리(30px)를 뺀 높이에서 재는데 줄은 상자 전체에 고루
            흩어져 있어, 4 짜리 막대가 「4」 줄보다 아래서 끝났다. 줄마다 그 값의 막대 높이에 둔다.
          */}
          <div aria-hidden className="absolute inset-0">
            {[0, step, step * 2, max].map((tick) => (
              <div
                key={tick}
                className="absolute inset-x-0 flex translate-y-1/2 items-center gap-3"
                style={{ bottom: `${(tick / max) * barArea}px` }}
              >
                <span className="w-7 text-right text-micro font-semibold tabular-nums text-slate-300">{tick}</span>
                <div className="flex-1 border-t border-slate-100" />
              </div>
            ))}
          </div>

          <div className="absolute inset-y-0 left-10 right-0 flex items-end gap-1">
            {rows.map((row) => {
              const value = valueOf(row);
              const pass = passOf(row);
              const projectCount = projectCountOf(row);
              return (
                <div key={row.month} className="flex h-full min-w-0 flex-1 flex-col justify-end">
                  {value > 0 && !row.future && (
                    <span className={`mb-1.5 text-center text-tiny font-black tabular-nums ${row.now ? 'text-brand-800' : 'text-slate-600'}`}>
                      {value}
                    </span>
                  )}
                  {/*
                    ★두 토막으로 쌓는다★ — 아래가 우리 몫, 위 회색이 패스스루다.
                    빼 버리면 실제로 깔리는 대수가 화면에서 사라지고, 합쳐 두면 「9월에
                    100대」가 전부 우리 일처럼 읽힌다. 쌓으면 둘 다 사실대로 보인다.
                  */}
                  {(() => {
                    /*
                      ★막대 안에 각자의 수를 적는다★ (한백 지시 2026-09-23 「회색이 패스스루
                      79라고 명시를 해줘 · 우리몫꺼랑 패스스루몫이랑 각각 bar 안에 명시」).
                      위의 큰 수는 총 대수이고, 그것이 어떻게 갈렸는지는 토막마다 적는다 —
                      색과 크기로 짐작하지 않게 한다.

                      ★얕은 토막도 숫자를 넣는다★ (한백 지시 2026-10-07 「폰트를 줄여서라도 넣어」 —
                      10월처럼 패스스루가 큰 달은 우리 몫 토막이 얕아 숫자가 빠졌다). 글자를 토막
                      높이에 맞춰 10px → 7px 까지 줄이고, 그래도 모자라는 토막은 9px 까지 세운다 —
                      토막 비율이 조금 어긋나지만 수는 적혀 있으니 숫자가 사라지는 것보다 낫다.
                    */
                    const SEG_MIN = 9;
                    // 아직 안 온 달은 막대가 없다 — 누적 그래프가 지금까지의 합을 연한 막대로 꽉 채워 앞날의 수주처럼 보였다
                    const barH = row.future ? 0 : Math.max(3, (value / max) * barArea);
                    const split = pass > 0 && !row.future;
                    const ours = value - pass;
                    const passH = split ? Math.max(SEG_MIN, (pass / Math.max(value, 1)) * barH) : 0;
                    const oursH = split
                      ? (ours > 0 ? Math.max(SEG_MIN, (ours / Math.max(value, 1)) * barH) : 0)
                      : barH;
                    const segFont = (h: number) => ({ fontSize: `${Math.max(7, Math.min(10, h - 2))}px`, lineHeight: 1 });
                    return (
                      <div
                        className="flex flex-col justify-end"
                        style={{ height: `${passH + oursH}px` }}
                        title={`${row.month} · ${projectCount}건 ${value}대${pass > 0 ? ` (우리 ${ours}대 · 패스스루 ${pass}대)` : ''}`}
                      >
                        {passH > 0 && (
                          <div
                            className="flex items-center justify-center rounded-t-[6px] bg-slate-300"
                            style={{ height: `${passH}px` }}
                          >
                            <span className="font-black tabular-nums text-slate-700" style={segFont(passH)}>{pass}</span>
                          </div>
                        )}
                        <div
                          style={{ height: `${oursH}px` }}
                          className={`flex items-center justify-center transition ${passH > 0 ? '' : 'rounded-t-[6px]'} ${
                            row.future
                              ? 'bg-slate-100'
                              : row.now
                                ? fillNow
                                : value > 0
                                  ? fill
                                  : 'bg-slate-200'
                          }`}
                        >
                          {split && ours > 0 && (
                            <span className="font-black tabular-nums text-white" style={segFont(oursH)}>
                              {ours}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        </div>

        <div className="ml-10 mt-2 flex gap-2 border-t border-slate-200 pt-2">
          {rows.map((row) => {
            const projectCount = projectCountOf(row);
            /*
             * 셋째 줄이 현장당 평균이다 (한백 2026-08-29). 「평균」이라는 말을 앞에 안 붙인다 —
             * 열두 칸이 한 화면에 서므로 칸 하나가 40px 남짓이고, 그 말까지 넣으면 넘친다.
             * 무엇인지는 머리(Panel side)가 한 번 적는다. 셀 것이 없는 달은 빈 자리로 두되
             * 줄은 지킨다 — 칸마다 줄 수가 다르면 축의 밑변이 들쭉날쭉해진다.
             */
            const avg = row.future ? '' : avgQty(valueOf(row), projectCount);
            return (
              <div key={row.month} className="min-w-0 flex-1 text-center">
                <p className={`text-tiny font-bold ${row.now ? 'text-brand-800' : row.future ? 'text-slate-300' : 'text-slate-500'}`}>
                  {row.label}
                </p>
                <p className={`mt-0.5 text-micro tabular-nums ${projectCount > 0 && !row.future ? 'text-slate-600' : 'text-slate-300'}`}>
                  {row.future ? '예정' : `${projectCount}건`}
                </p>
                <p className={`text-micro tabular-nums ${row.now ? 'font-bold text-brand-700' : 'text-slate-500'}`}>
                  {avg || '\u00A0'}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </ScrollEnd>
  );
}

function Breakdown({
  title,
  rows,
  attr,
}: {
  title: string;
  rows: Array<{ value: string; projects: number; qty: number; passQty: number; pass?: boolean }>;
  attr: AttrKey;
}) {
  if (rows.length === 0) return null;

  const total = rows.reduce((sum, row) => sum + row.qty, 0);
  /*
   * ★패스스루 줄은 「그 밖」에 접히지 않는다★ — 맨 아래로 내리면 상위 다섯에서 밀려
   * 이름이 사라진다. 아래에 두라는 것이지 감추라는 것이 아니다.
   */
  const ours = rows.filter((row) => !row.pass);
  const passes = rows.filter((row) => row.pass);
  const head = ours.slice(0, BREAKDOWN_MAX);
  const tail = ours.slice(BREAKDOWN_MAX);
  const shown: Array<{
    value: string; projects: number; qty: number; passQty: number; pass?: boolean; rest?: boolean;
  }> = [
    ...head,
    ...(tail.length
      ? [{
          value: `그 밖 ${tail.length}곳`,
          projects: tail.reduce((sum, row) => sum + row.projects, 0),
          qty: tail.reduce((sum, row) => sum + row.qty, 0),
          passQty: tail.reduce((sum, row) => sum + row.passQty, 0),
          rest: true,
        }]
      : []),
    ...passes,
  ];

  return (
    <section className={`${PANEL} p-5`}>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h3 className="text-h3 font-black text-slate-900">{title}</h3>
        <span className="text-tiny font-semibold tabular-nums text-slate-400">{total}대</span>
      </div>

      <ul className="flex flex-col gap-3.5 border-t border-slate-100 pt-4">
        {shown.map((row, index) => {
          const percent = Math.round((row.qty / total) * 100);
          const content = (
            <>
              <div className="mb-1.5 flex items-baseline gap-2">
                <span className="flex min-w-0 flex-1 items-center gap-1.5">
                  <span className="min-w-0 truncate text-small font-bold text-slate-700">{row.value}</span>
                  {/* 그 업체의 수주는 돈이 통째로 내려간다 — 같은 대수라도 무게가 다르다 */}
                  {row.pass && <Tag>패스스루</Tag>}
                </span>
                <span className="text-small font-black tabular-nums text-slate-900">{percent}%</span>
                {/*
                  ★접지 않는다★ (한백 지적 2026-10-16 「패스스루 위에 건이 개행되고 있어」) — 폭을 64px 로 박아 두어
                  「100대 · 12건」처럼 자릿수가 늘면 「건」이 다음 줄로 떨어졌다. 글은 한 줄로 서고, 폭은 세 자리 대수·두 자리
                  건수가 들어가게 잡아 둔다 — 줄마다 폭이 다르면 옆의 % 가 줄마다 다른 자리에 선다.
                */}
                <span className="w-[88px] shrink-0 whitespace-nowrap text-right text-tiny tabular-nums text-slate-400">
                  {row.qty}대 · {row.projects}건
                  {/* 그중 패스스루 몫 — 막대의 회색 토막과 같은 수다 */}
                  {row.passQty > 0 && (
                    <span className="block text-micro text-slate-400">패스스루 {row.passQty}</span>
                  )}
                </span>
              </div>
              {/* 막대도 가른다 — 앞이 우리 몫, 뒤 회색이 패스스루다(월별 그래프와 같은 규칙) */}
              <div className="flex h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full"
                  style={{
                    width: `${Math.max(percent, 2) * (1 - row.passQty / Math.max(row.qty, 1))}%`,
                    background: row.rest
                      ? REST_COLOR
                      : row.value === EMPTY
                        ? EMPTY_COLOR
                        : BAR_COLORS[index % BAR_COLORS.length],
                  }}
                />
                {row.passQty > 0 && (
                  <div
                    className="h-full bg-slate-300"
                    style={{ width: `${Math.max(percent, 2) * (row.passQty / Math.max(row.qty, 1))}%` }}
                  />
                )}
              </div>
            </>
          );

          return (
            <li key={row.value}>
              {row.rest ? (
                <div>{content}</div>
              ) : (
                <Link
                  href={`/projects?view=table&${attr}=${encodeURIComponent(row.value)}`}
                  className="block transition hover:opacity-75"
                >
                  {content}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

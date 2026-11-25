import { GRID_REGION } from './assumptions';
import type { GridResult } from './grid';
import { DEV_LAW, judgeDevPermit, judgeGrid, judgePermit } from './rules';
import type { Check, GridRow, GridView, Report } from './types';
import { judge } from './verdict';

/**
 * 용량에 따라 달라지는 판정 — 계통(여유 ≥ 용량)과 허가(3MW). 서버가 처음 한 번, 화면이 지붕을 고를 때마다 다시 부른다
 * (지붕을 빼고 넣으면 용량이 바뀌고, 그 용량으로 계통·허가·종합 판정이 같이 바뀌어야 한다).
 */

const SRC_KEPCO = { name: '한전 전력데이터 개방포털 · 분산전원연계 정보' };

/** 한전에 물었다가 실패한 사유(lib/solar/sources/kepco · http 의 SourceError 와 키 없음) — 「필지번호 없음」처럼 묻지도 않은 것과 가른다 */
const KEPCO_FAILED = /^\[한전\]/;
/** 그중 서버가 답하지 않은 것 — 시간 초과 · 연결 실패 */
const KEPCO_DOWN = /응답 없음|fetch failed/;

/** 예상 용량을 받을 여유가 있는 선로(용량을 모르면 여유가 조금이라도 있는 선로) */
export const enough = (r: GridRow, capacityKw: number | null) => r.spareKw !== null && r.spareKw >= Math.max(capacityKw ?? 1, 1);

/** 한 지번에 선로가 여럿 나오면 가장 여유 있는 선로로 본다(접속은 선로 하나에 한다) */
export function gridViewOf(result: Pick<GridResult, 'rows' | 'via'>, capacityKw: number | null, sido: string | null): GridView {
  const { rows, via } = result;
  let best: number | null = null;
  for (let i = 0; i < rows.length; i++) {
    const v = rows[i].spareKw;
    if (v !== null && (best === null || v > rows[best].spareKw!)) best = i;
  }
  return {
    rows,
    best,
    basis:
      via?.kind === 'neighbor'
        ? { kind: 'neighbor', address: via.address, distanceM: via.distanceM }
        : via?.kind === 'dong'
          ? { kind: 'dong', dong: via.dong }
          : rows.length
            ? { kind: 'own' }
            : { kind: 'none' },
    capacityKw,
    region: (sido && GRID_REGION[sido]) || null,
  };
}

/**
 * 계통 — 판정은 한 줄(Check), 단계별 막대·근거는 GridView 로 화면에 따로 넘긴다.
 * @param error 한전 자료를 못 받았을 때의 사유(그때 view 는 null)
 */
export function gridCheckOf(view: GridView | null, error: string | null, sido: string | null): Check {
  // 한전에 물었는데 답을 못 받았다 — 「자료 없음」(한전에 기록이 없다)으로 읽히면 안 된다. 2026-11-24~25 한전 개방포털이
  // 접속 자체를 받지 않아(운영 · 이 Mac 모두 연결 시간 초과) 부지 검토마다 「한전 여유용량 자료 없음」이 떴다
  if (!view && error && KEPCO_FAILED.test(error)) {
    const region = (sido && GRID_REGION[sido]) || null;
    return {
      key: 'grid',
      title: '계통 연계',
      // 지역 사정은 여유와 무관하게 「조건부」다(judgeGrid 와 같다) — 결론 줄은 못 받은 것을 말하고 사정은 사실 줄로
      status: region ? 'conditional' : 'unknown',
      summary: KEPCO_DOWN.test(error) ? '한전 서버 응답 없음 — 여유용량 못 받음' : '한전 조회 실패 — 여유용량 못 받음',
      facts: [{ label: '한전 자료', value: error }, ...(region ? [{ label: '지역 사정', value: region }] : [])],
      source: SRC_KEPCO,
    };
  }
  const rows = view?.rows ?? [];
  const best = view?.best ?? null;
  const capacityKw = view?.capacityKw ?? null;
  let j = judgeGrid(best === null ? null : rows[best], capacityKw, sido);
  // 읍면동 자료는 그 번지가 어느 선로에 붙는지 모른다 — 여유가 있어 보여도 「적합」을 주지 않고, 동네 선로 중
  // 몇 개가 받을 수 있는지를 말한다(충주 영덕리: 7개 중 여유 0 이 3개 — 가장 여유 있는 하나만 보이면 낙관이 된다)
  if (view?.basis.kind === 'dong' && j.level === 'ok' && best !== null) {
    const n = rows.length;
    const k = rows.filter((r) => enough(r, capacityKw)).length;
    const dong = view.basis.dong;
    j = {
      level: 'conditional',
      why:
        n === 1
          ? `${dong} 선로 기준 여유 ${rows[best].spareKw!.toLocaleString()}kW — 이 번지가 붙을 선로는 한전 확인`
          : `${dong} 선로 ${n}개 중 ${k === n ? '모두' : `${k}개만`} 여유 — 이 번지가 붙을 선로는 한전 확인`,
    };
  }
  return {
    key: 'grid',
    title: '계통 연계',
    status: j.level,
    summary: view && rows.length === 0 ? '한전 기록 없음 — 이 번지·둘레 150m·같은 동 모두' : j.why,
    facts: error ? [{ label: '한전 자료', value: error }] : [],
    source: SRC_KEPCO,
  };
}

export function permitCheckOf(capacityKw: number | null, sido: string | null): Check | null {
  const p = judgePermit(capacityKw, sido);
  return p ? { key: 'permit', title: '발전사업 허가', status: p.level, summary: p.why } : null;
}

/** 지상형 개발 인허가 — 개발행위허가 규모 · 소규모 환경영향평가 · 재해영향평가. 면적은 그린 네모가 있으면 그것, 없으면 필지 */
export function devCheckOf(zones: string[], areaM2: number | null, basis: string): Check {
  const j = judgeDevPermit(zones, areaM2, basis);
  return { key: 'dev', title: '개발 인허가', status: j.level, summary: j.why, facts: j.facts, law: DEV_LAW };
}

/**
 * 고른 지붕 · 그린 네모의 용량으로 판정을 다시 — 계통·발전사업 허가 칸(과 지상형은 개발 인허가 칸)만 바꾸고 나머지는 그대로.
 * 한전 자료를 못 받은 계통 칸(view 없음)은 용량과 무관해서 그대로 둔다.
 * @param area 지상형에서 그린 네모 — 개발 면적을 필지 대신 이것으로 본다
 */
export function withCapacity(
  report: Report,
  capacityKw: number | null,
  area?: { m2: number; basis: string },
): Pick<Report, 'checks' | 'verdict' | 'grid'> {
  const sido = report.inputs.sido;
  const grid = report.grid ? { ...report.grid, capacityKw } : null;
  const permit = permitCheckOf(capacityKw, sido);
  const checks = report.checks.flatMap((c) => {
    if (c.key === 'grid') return grid ? [gridCheckOf(grid, null, sido)] : [c];
    if (c.key === 'permit') return permit ? [permit] : [];
    if (c.key === 'dev' && area) return [devCheckOf(report.inputs.zones, area.m2, area.basis)];
    return [c];
  });
  if (permit && !checks.some((c) => c.key === 'permit')) checks.push(permit);
  return { checks, verdict: judge(checks), grid };
}

/**
 * 현장 표의 최근 완료 — 날짜가 적힌 일 중 공정 순서상 가장 뒤의 일과 그 날(한백 2026-11-11 「계약관리 시공관리 표에 진행단계도
 * 표시해줘」 → 「단계 안의 세부 진행」 · 같은 날 이름을 「단계 · 최근 완료」로 — 단계는 지금 서 있는 보드 칸, 최근 완료는 끝낸 일).
 *
 * 일의 차례에서 가장 뒤의 적힌 일인지(적은 날이 가장 늦은 일이 아니다), 칸의 판정(✓ · 해당없음)과 같은지,
 * 줄 세우기 · 필터 · 엑셀이 같은 값을 보는지 본다.
 */
import { describe, expect, it } from 'vitest';
import { ATTR_BY_KEY, EMPTY, optionsOf, passesAttrs } from '@/lib/project-filter';
import {
  DEFAULT_HIDDEN, labelOf, LAST_DONE_STEPS, lastDoneOf, restoreHidden, sortProjects, TABLE_ORDER, tableSheet,
} from '@/lib/project-table';
import type { ProjectSummary } from '@/types/project';

type Milestones = ProjectSummary['milestones'];

const NO_DATES: Milestones = {
  envApprovalDate: null, cpoApprovalDate: null, notifyDate: null, notifyDone: false, notifySkipped: false,
  chargerOrderDate: null, chargerRecvDate: null, chargerDone: false, startDate: null,
  installDoneDate: null, installConfirmed: false, openDate: null, openDone: false, completionSubmitAt: null,
  notifyCertDate: null, preStartSubmitDate: null, foundationDate: null, chargerInstallDate: null,
  elecApplyDate: null, safetyCheckDate: null, kepcoLineDate: null, meterDate: null, useInspectApplyDate: null,
};

function site(over: Partial<Omit<ProjectSummary, 'milestones'>> = {}, dates: Partial<Milestones> = {}): ProjectSummary {
  return {
    id: 'p1', mgmtNo: 'HB-2026-041', name: '속초 ES아뜨리움', addr: '강원 속초시', cpo: '플러그링크',
    salesOrg: '에코일렉', gcOrg: '에코일렉', bldgType: null, bizType: '환경부', powerType: '한전불입', envQueueNo: '2026-595',
    createdAt: '2026-01-20', lines: [{ termYears: 7, qty: 9 }], stage: 'construction', status: '착공', holdState: null,
    court: '시공사', stalledDays: 0, rejectedAt: null, submittedAt: null, priced: true, rejectedDocs: 0,
    rejectedEmptyDocs: 0, docsFilled: true, submitted: true, fixAsked: false, entryOk: [], nextStep: null,
    ...over,
    milestones: { ...NO_DATES, ...dates },
  } as ProjectSummary;
}

describe('최근 완료 — 일의 차례에서 가장 뒤의 적힌 일', () => {
  it('아무것도 안 적혔으면 없다 — 표는 「—」', () => {
    expect(lastDoneOf(site())).toBeNull();
  });

  it('착공 단계 안에서 어디까지 — 기초 · 배관/배선 뒤 충전기 · 캐노피 설치', () => {
    const p = site({}, {
      envApprovalDate: '2026-02-18', startDate: '2026-10-20', foundationDate: '2026-10-24', chargerInstallDate: '2026-11-03',
    });
    expect(lastDoneOf(p)).toEqual({ key: 'chargerInstall', step: '충전기·캐노피 설치', date: '2026-11-03' });
  });

  it('★적은 날이 가장 늦은 일이 아니다★ — 충전기를 받은 뒤에 행위신고 완료를 적어도 진행은 충전기 수령', () => {
    const p = site({}, { chargerRecvDate: '2026-11-01', notifyCertDate: '2026-11-05' });
    expect(lastDoneOf(p)?.step).toBe('충전기 수령');
    expect(lastDoneOf(p)?.date).toBe('2026-11-01');
  });

  it('날짜 없이 완료(✓)만 찍힌 옛 칸도 지난 일이다 — 날은 없다', () => {
    const p = site({}, { startDate: '2026-05-02', installConfirmed: true });
    expect(lastDoneOf(p)).toEqual({ key: 'install', step: '설치완료', date: null });
  });

  it('해당없음 칸은 건너뛴다 — 자체투자에 승인일이 적혀 있어도 그 칸은 「해당없음」이다', () => {
    expect(lastDoneOf(site({ bizType: '자체투자' }, { envApprovalDate: '2026-03-01' }))).toBeNull();
    // 모자분리는 외선공사 · 계량기가 없다 — 사용검사 신청이 그 뒤의 일
    const p = site({ powerType: '모자분리' }, { safetyCheckDate: '2026-11-02', useInspectApplyDate: '2026-11-07' });
    expect(lastDoneOf(p)?.step).toBe('사용검사 신청');
  });

  it('일 이름 — 열 이름이 일 이름이 아닌 둘만 따로(환경부 승인 · 준공서류 제출)', () => {
    expect(lastDoneOf(site({}, { envApprovalDate: '2026-02-18' }))?.step).toBe('환경부 승인');
    expect(lastDoneOf(site({}, { completionSubmitAt: '2026-06-30' }))?.step).toBe('준공서류 제출');
    expect(LAST_DONE_STEPS[0]).toBe('환경부 승인');
    expect(LAST_DONE_STEPS.at(-1)).toBe('준공서류 제출');
    expect(LAST_DONE_STEPS).toContain(labelOf('chargerInstall'));
  });
});

describe('표 · 필터 · 엑셀이 같은 값을 본다', () => {
  const none = site({ id: 'a', name: '가 · 아직' });
  const approved = site({ id: 'b', name: '나 · 승인' }, { envApprovalDate: '2026-02-18' });
  const startLate = site({ id: 'c', name: '다 · 착공 늦게' }, { startDate: '2026-10-20' });
  const startEarly = site({ id: 'd', name: '라 · 착공 먼저' }, { startDate: '2026-09-01' });
  const installed = site({ id: 'e', name: '마 · 설치완료' }, { installDoneDate: '2026-11-08' });
  const all = [installed, startLate, none, startEarly, approved];

  it('최근 완료로 줄 세우면 일의 차례 · 같은 일이면 먼저 한 현장이 앞 · 아무것도 없으면 맨 앞', () => {
    expect(sortProjects(all, 'lastDone', false).map((p) => p.id)).toEqual(['a', 'b', 'd', 'c', 'e']);
    expect(sortProjects(all, 'lastDone', true).map((p) => p.id)).toEqual(['e', 'c', 'd', 'b', 'a']);
  });

  it('필터 값은 일 이름 · 차례는 일의 차례 · 안 적힌 현장은 (없음)이 끝', () => {
    expect(ATTR_BY_KEY.get('lastDone')?.valuesOf(installed)).toEqual(['설치완료']);
    expect(ATTR_BY_KEY.get('lastDone')?.valuesOf(none)).toEqual([EMPTY]);
    expect(optionsOf(all, 'lastDone')).toEqual(['환경부 승인', '착공', '설치완료', EMPTY]);
    const picked = all.filter((p) => passesAttrs(p, { lastDone: ['착공'] })).map((p) => p.id);
    expect(picked.sort()).toEqual(['c', 'd']);
  });

  it('단계 필터도 보드 칸의 차례 — 가나다(개통 · 계약 · … · 행위신고)가 아니다', () => {
    const stages = [
      site({ id: '1', status: '개통 및 통신확인' }), site({ id: '2', status: '행위신고' }),
      site({ id: '3', stage: 'intake', status: '계약완료', submitted: true }), site({ id: '4', status: '착공' }),
    ];
    const order = optionsOf(stages, 'col');
    expect(order.indexOf('행위신고')).toBeLessThan(order.indexOf('착공'));
    expect(order.indexOf('착공')).toBeLessThan(order.indexOf('개통 및 통신확인'));
    expect(order[0]).toBe('계약검토');
  });

  it('엑셀은 둘로 가른다 — 최근 완료(일 이름) · 최근 완료일(진짜 날짜)', () => {
    const t = tableSheet([startLate, none], new Set(), 'construction');
    const at = t.columns.findIndex((c) => c.header === '최근 완료');
    expect(t.columns[at + 1].header).toBe('최근 완료일');
    expect(t.rows[0].slice(at, at + 2)).toEqual(['착공', { date: '2026-10-20' }]);
    expect(t.rows[1].slice(at, at + 2)).toEqual([null, null]);
    // 열을 끄면 둘 다 빠진다
    const off = tableSheet([startLate], new Set(['lastDone']), 'construction');
    expect(off.columns.some((c) => c.header.startsWith('최근 완료'))).toBe(false);
  });
});

describe('열 — 단계 바로 뒤 · 두 페이지 다 기본으로 선다', () => {
  it('단계 바로 뒤에 선다', () => {
    expect(TABLE_ORDER.indexOf('lastDone')).toBe(TABLE_ORDER.indexOf('stage') + 1);
  });

  it('계약관리 · 시공관리 모두 기본으로 켜진다 — 그 전에 「열」을 골라 둔 사람에게도', () => {
    for (const tab of ['intake', 'construction'] as const) {
      expect(DEFAULT_HIDDEN[tab]).not.toContain('lastDone');
      // 이 열이 생기기 전의 저장(seen 에 없음) — 숨긴 열로 읽히지 않는다
      const before = { hidden: ['qty'], seen: ['stage', 'qty', 'term'] };
      expect(restoreHidden(before, DEFAULT_HIDDEN[tab]).has('lastDone')).toBe(false);
    }
  });
});

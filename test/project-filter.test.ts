/**
 * 현장 표의 필터 — 날짜 열마다의 있음 · 없음 · 해당없음 (한백 2026-11-10 「필터를 걸고 해당 필터 값이 있는지 없는지
 * 해당없음인지 구분해서 또 한 번 보고싶어」).
 *
 * 판정이 표의 칸 · 엑셀과 같은 정의(lib/project-table DATE_COLS)를 보는지, 다른 필터와 겹쳐 좁혀지는지,
 * 열을 숨기면 풀 축을 찾는지 본다.
 */
import { describe, expect, it } from 'vitest';
import {
  ATTR_BY_KEY, ATTRS, countActive, optionsOf, panelAttrKeys, passesAttrs, restStartOf, type AttrFilters,
} from '@/lib/project-filter';
import {
  DATE_COLS, DATE_KEYS, filterAttrOf, labelOf, MILESTONE_KEYS, PICKABLE, presenceOf, tableSheet, type MilestoneKey,
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

const valueOf = (key: MilestoneKey, p: ProjectSummary) => ATTR_BY_KEY.get(key)!.valuesOf(p);

describe('날짜 축 — 날짜 열마다 하나', () => {
  it('날짜 열이 다 축이 된다 · 이름은 열 머리글과 같다', () => {
    expect(DATE_KEYS).toEqual([...MILESTONE_KEYS]);
    for (const key of DATE_KEYS) {
      expect(ATTR_BY_KEY.get(key)?.label, key).toBe(labelOf(key));
    }
    expect(ATTR_BY_KEY.get('start')?.label).toBe('착공');
    expect(ATTR_BY_KEY.get('envApproval')?.label).toBe('환경부 승인일');
  });

  it('축 이름이 겹치지 않는다 — 주소 · 저장분의 열쇠라 겹치면 한 축이 다른 축을 덮는다', () => {
    const keys = ATTRS.map((a) => a.key);
    expect(new Set(keys).size).toBe(keys.length);
    // 주소에 같이 실리는 다른 값과도 겹치지 않는다(components/ProjectsView)
    for (const taken of ['view', 'q', 'flag', 'year']) expect(keys).not.toContain(taken);
  });

  it('날짜가 있으면 있음과 그 달 · 없으면 없음', () => {
    // 그 달로도 거른다(2026-11-11 「일정에 대해서도 필터를 걸 수 있을까?」) — 접수월과 같은 이름
    expect(valueOf('start', site({}, { startDate: '2026-04-02' }))).toEqual(['있음', '26년 4월']);
    expect(valueOf('start', site())).toEqual(['없음']);
    expect(valueOf('completion', site({}, { completionSubmitAt: '2026-06-30' }))).toEqual(['있음', '26년 6월']);
  });

  it('★날짜 없이 완료(✓)만 찍힌 칸은 있음★ — 칸에 ✓ 가 보이고 엑셀에는 「완료」로 나간다', () => {
    const p = site({}, { installConfirmed: true });
    expect(valueOf('install', p)).toEqual(['있음']);
    const t = tableSheet([p], new Set(), 'construction');
    expect(t.rows[0][t.columns.findIndex((c) => c.header === '설치완료일')]).toBe('완료');
  });

  it('해당없음은 칸의 「해당없음」 그대로 — 자체투자 승인일 · 신고 대상 아님 · 기설치 연동 충전기 · 모자분리 한전 일', () => {
    expect(valueOf('envApproval', site({ bizType: '자체투자' }))).toEqual(['해당없음']);
    // 날짜가 남아 있어도 규칙상 없는 칸이면 해당없음 — 칸도 그렇게 그린다
    expect(valueOf('notify', site({}, { notifySkipped: true, notifyDate: '2026-03-01' }))).toEqual(['해당없음']);
    expect(valueOf('notifyCert', site({}, { notifySkipped: true }))).toEqual(['해당없음']);
    expect(valueOf('chargerOrder', site({ bizType: '기설치 연동' }))).toEqual(['해당없음']);
    expect(valueOf('chargerRecv', site({ bizType: '기설치 연동' }))).toEqual(['해당없음']);
    expect(valueOf('kepcoLine', site({ powerType: '모자분리' }))).toEqual(['해당없음']);
    expect(valueOf('meter', site({ powerType: '모자분리' }))).toEqual(['해당없음']);
    // 겸용 · 미지정은 한전 일이 남는다 — 해당없음이 아니다
    expect(valueOf('meter', site({ powerType: '한전불입+모자분리' }))).toEqual(['없음']);
    expect(valueOf('meter', site({ powerType: null }))).toEqual(['없음']);
  });

  it('★엑셀 칸과 같은 판정★ — 해당없음 칸은 해당없음, 빈 칸은 없음, 나머지는 있음', () => {
    const all = new Set<never>();
    const sites = [
      site({ bizType: '자체투자', powerType: '모자분리' }, { startDate: '2026-04-02', openDone: true }),
      site({ bizType: '기설치 연동' }, { notifySkipped: true, envApprovalDate: '2026-02-18' }),
      site({}, { chargerOrderDate: '2026-03-11', chargerDone: true, meterDate: '2026-05-20' }),
    ];
    const t = tableSheet(sites, all, 'construction');
    sites.forEach((p, i) => {
      for (const key of DATE_KEYS) {
        // 엑셀 머리는 날짜 칸의 온 이름이다(DATE_COLS name)
        const cell = t.rows[i][t.columns.findIndex((c) => c.header === DATE_COLS[key]!.name)];
        const want = cell === '해당없음' ? '해당없음' : cell === null ? '없음' : '있음';
        expect(presenceOf(key, p), `${i} ${key}`).toBe(want);
      }
    });
  });
});

describe('고르는 값의 차례', () => {
  it('있음 · 없음 · 해당없음 — 가나다(없음 · 있음 · 해당없음)가 아니다', () => {
    const sites = [
      site({ bizType: '자체투자' }),
      site({}, { envApprovalDate: '2026-02-18' }),
      site(),
    ];
    // 있음 · 없음 · 해당없음 뒤에 달이 온다
    expect(optionsOf(sites, 'envApproval')).toEqual(['있음', '없음', '해당없음', '26년 2월']);
    expect(optionsOf(sites, 'queue')).toEqual(['있음', '해당없음']);
    expect(optionsOf([...sites, site({ envQueueNo: null })], 'queue')).toEqual(['있음', '없음', '해당없음']);
  });

  it('자료에 있는 값만 — 걸어도 0건이 되는 값은 목록에 없다', () => {
    expect(optionsOf([site()], 'start')).toEqual(['없음']);
  });

  it('다른 축의 차례는 그대로 — 가나다, (없음)은 끝', () => {
    expect(optionsOf([site({ cpo: '에버온' }), site({ cpo: '나이스인프라' })], 'cpo')).toEqual(['나이스인프라', '에버온']);
    expect(optionsOf([site({ gcOrg: null }), site({ gcOrg: '대광이브이' })], 'gc')).toEqual(['대광이브이', '(없음)']);
  });
});

describe('날짜 열을 달로 거른다 — 일정 필터', () => {
  const sep = site({ id: 'sep' }, { startDate: '2026-09-30' });
  const oct1 = site({ id: 'oct1' }, { startDate: '2026-10-01' });
  const oct2 = site({ id: 'oct2' }, { startDate: '2026-10-31' });
  const feb = site({ id: 'feb' }, { startDate: '2026-02-03' });
  const last = site({ id: 'last' }, { startDate: '2025-12-15' });
  const none = site({ id: 'none' });
  const checked = site({ id: 'checked' }, { installConfirmed: true });
  const all = [oct2, none, sep, feb, oct1, last, checked];
  const pass = (f: AttrFilters) => all.filter((p) => passesAttrs(p, f)).map((p) => p.id).sort();

  it('달은 있음 · 없음 뒤에 해와 달의 차례로 — 「26년 2월」이 「26년 10월」 앞, 지난해가 맨 앞', () => {
    expect(optionsOf(all, 'start')).toEqual(['있음', '없음', '25년 12월', '26년 2월', '26년 9월', '26년 10월']);
  });

  it('한 달을 고르면 그 달에 적힌 현장만 — 달의 첫날 · 끝날도 그 달', () => {
    expect(pass({ start: ['26년 10월'] })).toEqual(['oct1', 'oct2']);
    expect(pass({ start: ['26년 9월', '26년 10월'] })).toEqual(['oct1', 'oct2', 'sep']);
  });

  it('있음은 달과 상관없이 다 — 날짜 없이 완료(✓)만 찍힌 칸은 달이 없어 있음에만 선다', () => {
    expect(pass({ start: ['있음'] })).toEqual(['feb', 'last', 'oct1', 'oct2', 'sep']);
    expect(valueOf('install', checked)).toEqual(['있음']);
    expect(optionsOf([checked], 'install')).toEqual(['있음']);
  });

  it('달 + 없음 — 「10월에 착공했거나 아직 착공일이 없는 현장」', () => {
    expect(pass({ start: ['26년 10월', '없음'] })).toEqual(['checked', 'none', 'oct1', 'oct2']);
  });

  it('머리글 판의 가는 선은 달이 시작하는 자리 — 달이 없으면 없다', () => {
    expect(restStartOf('start', optionsOf(all, 'start'))).toBe(2);
    expect(restStartOf('start', ['있음', '없음'])).toBe(-1);
    expect(restStartOf('cpo', ['나이스인프라', '에버온'])).toBe(-1);
  });
});

describe('겹쳐 좁히기', () => {
  const a = site({ id: 'a', cpo: '나이스인프라' }, { startDate: '2026-04-02' });
  const b = site({ id: 'b', cpo: '나이스인프라' });
  const c = site({ id: 'c', cpo: '나이스인프라', bizType: '자체투자' });
  const d = site({ id: 'd', cpo: '에버온' });
  const pick = (filters: AttrFilters) => [a, b, c, d].filter((p) => passesAttrs(p, filters)).map((p) => p.id);

  it('운영사로 좁힌 뒤 착공일 없음 — 축끼리는 그리고', () => {
    expect(pick({ cpo: ['나이스인프라'], start: ['없음'] })).toEqual(['b', 'c']);
    expect(pick({ cpo: ['나이스인프라'], envApproval: ['해당없음'] })).toEqual(['c']);
  });

  it('한 축 안의 값끼리는 또는 — 없음 + 해당없음', () => {
    expect(pick({ cpo: ['나이스인프라'], envApproval: ['없음', '해당없음'] })).toEqual(['a', 'b', 'c']);
  });

  it('날짜 축도 「필터 N」에 세고, 걸려 있으면 판에 선다 — 걸린 조건은 푸는 자리가 보여야 한다', () => {
    const filters: AttrFilters = { cpo: ['나이스인프라'], start: ['없음'] };
    expect(countActive(filters)).toBe(2);
    expect(panelAttrKeys(filters)).toContain('start');
    expect(panelAttrKeys({})).not.toContain('start');
  });
});

describe('열 → 축 — 열을 숨기면 그 축의 필터를 푼다', () => {
  it('날짜 열은 제 이름의 축 · 다른 열은 정해 둔 축 · 거르지 않는 열은 없음', () => {
    for (const key of DATE_KEYS) expect(filterAttrOf(key)).toBe(key);
    expect(filterAttrOf('cpo')).toBe('cpo');
    expect(filterAttrOf('powerIn')).toBe('power');
    expect(filterAttrOf('created')).toBe('month');
    expect(filterAttrOf('qty')).toBeUndefined();
  });

  it('열이 가리키는 축은 다 있다', () => {
    for (const c of PICKABLE) {
      const attr = filterAttrOf(c.key);
      if (attr) expect(ATTR_BY_KEY.has(attr), c.key).toBe(true);
    }
  });
});

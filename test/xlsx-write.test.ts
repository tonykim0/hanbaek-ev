/**
 * 표 → 엑셀(xlsx) — 시공관리·계약관리 표의 「엑셀 받기」가 쓴다.
 *
 * 화면 시험이 아니라 꾸러미 속 XML 을 본다: 엑셀이 여는 데 필요한 것(꾸러미 여섯 · 이름 규칙)과 받는 사람이
 * 바로 쓰는 것(날짜가 진짜 날짜 · 머리 고정 · 자동 필터 · 글자 탈출)이 들어 있는지.
 */
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { buildXlsx, colName, excelDate, sheetNameOf } from '@/lib/xlsx-write';
import { tableSheet, DEFAULT_HIDDEN, LEGACY_KEYS, restoreHidden, type ColKey } from '@/lib/project-table';
import type { ProjectSummary } from '@/types/project';

async function partsOf(bytes: Uint8Array) {
  const zip = await JSZip.loadAsync(bytes);
  const read = (p: string) => zip.file(p)?.async('string') ?? Promise.resolve(null);
  return {
    names: Object.keys(zip.files).sort(),
    sheet: (await read('xl/worksheets/sheet1.xml')) ?? '',
    workbook: (await read('xl/workbook.xml')) ?? '',
  };
}

describe('엑셀 칸 주소·날짜', () => {
  it('열 이름 — 26 을 넘으면 두 글자', () => {
    expect([1, 2, 26, 27, 52, 53, 702, 703].map(colName)).toEqual(['A', 'B', 'Z', 'AA', 'AZ', 'BA', 'ZZ', 'AAA']);
  });

  it('날짜 일련번호는 1899-12-30 이 0 이다(엑셀 1900 체계)', () => {
    expect(excelDate('2026-01-01')).toBe(46023);
    expect(excelDate('2026-11-05')).toBe(46331);
    expect(excelDate('2026-11')).toBeNull();
  });

  it('시트 이름 — 엑셀이 거절하는 글자를 걷고 31자로', () => {
    expect(sheetNameOf('시공관리')).toBe('시공관리');
    expect(sheetNameOf('a/b:c*d?')).toBe('a b c d');
    expect(sheetNameOf('')).toBe('Sheet1');
    expect(sheetNameOf('가'.repeat(40))).toHaveLength(31);
  });
});

describe('buildXlsx', () => {
  it('엑셀이 여는 꾸러미 여섯이 다 있다', async () => {
    const { names } = await partsOf(await buildXlsx({ name: 'T', columns: [{ header: 'A' }], rows: [] }));
    expect(names.filter((n) => !n.endsWith('/'))).toEqual([
      '[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml',
      'xl/workbook.xml', 'xl/worksheets/sheet1.xml',
    ]);
  });

  it('★날짜는 진짜 날짜★ · 숫자는 숫자 · 빈 칸은 안 쓴다 · 머리 고정 · 자동 필터', async () => {
    const { sheet, workbook } = await partsOf(await buildXlsx({
      name: '시공관리',
      columns: [{ header: '현장명' }, { header: '대수' }, { header: '착공일' }],
      rows: [['속초 A&B <동>', 9, { date: '2026-11-05' }], ['신안', 7, null]],
    }));
    expect(sheet).toContain('<c r="C2" s="2"><v>46331</v></c>');            // 날짜 스타일 + 일련번호
    expect(sheet).toContain('<c r="B2"><v>9</v></c>');
    expect(sheet).toContain('속초 A&amp;B &lt;동&gt;');                     // 탈출
    expect(sheet).not.toContain('r="C3"');                                    // 빈 칸은 칸 자체가 없다
    expect(sheet).toContain('state="frozen"');
    expect(sheet).toContain('<autoFilter ref="A1:C3"/>');
    expect(workbook).toContain("'시공관리'!$A$1:$C$3");
  });

  it('날짜 모양이 아닌 날짜 값은 버리지 않고 글자로 둔다', async () => {
    const { sheet } = await partsOf(await buildXlsx({ name: 'T', columns: [{ header: 'D' }], rows: [[{ date: '언젠가' }]] }));
    expect(sheet).toContain('<t>언젠가</t>');
  });
});

function site(over: Partial<ProjectSummary> = {}): ProjectSummary {
  return {
    id: 'p1', mgmtNo: 'HB-2026-041', name: '속초 ES아뜨리움', addr: '강원 속초시', cpo: '플러그링크',
    salesOrg: '에코일렉', gcOrg: '에코일렉', bldgType: null, bizType: '환경부', powerType: null, envQueueNo: '2026-595',
    createdAt: '2026-01-20', lines: [{ termYears: 7, qty: 9 }], stage: 'construction', status: '착공', holdState: null,
    court: '시공사', stalledDays: 0, rejectedAt: null, submittedAt: null, priced: true, rejectedDocs: 0,
    rejectedEmptyDocs: 0, docsFilled: true, submitted: true, fixAsked: false, entryOk: [], nextStep: null,
    milestones: {
      envApprovalDate: '2026-02-18', cpoApprovalDate: null, notifyDate: null, notifyDone: false, notifySkipped: true,
      chargerOrderDate: '2026-03-11', chargerRecvDate: '2026-03-25', chargerDone: true, startDate: null,
      installDoneDate: null, installConfirmed: true, openDate: null, openDone: false, completionSubmitAt: null,
      notifyCertDate: null, preStartSubmitDate: '2026-04-01', foundationDate: null, chargerInstallDate: null,
      elecApplyDate: '2026-05-02', safetyCheckDate: null, kepcoLineDate: null, meterDate: null, useInspectApplyDate: null,
    },
    ...over,
  } as ProjectSummary;
}

describe('tableSheet — 화면에서 보는 그대로', () => {
  const hidden = new Set<ColKey>(DEFAULT_HIDDEN.construction);

  it('현장은 이름·번호·주소 셋으로 가르고, 켜 둔 열만 표의 차례로', () => {
    const { columns } = tableSheet([site()], hidden, 'construction');
    expect(columns.map((c) => c.header)).toEqual([
      '현장명', '관리번호', '주소', '단계', '대수', '계약연수', '운영사', '전력인입', '영업사', '시공사',
      '환경부 승인일', '행위신고 신청일', '행위신고 완료일', '충전기 발주일', '충전기 수령일',
      '착공서류 제출일', '착공일', '기초 및 배관/배선일', '충전기 및 캐노피 설치일', '설치완료일',
      '전기사용신청일', '사용전점검/검사일', '한전 외선공사일', '계량기 부설일', '지자체 사용검사 신청일',
      '개통완료일', '준공서류 제출일',
    ]);
  });

  it('값은 화면의 칸과 같은 판정 — 해당없음 · 날짜 · 날짜 없는 완료 · 빈 칸', () => {
    const { rows } = tableSheet([site()], hidden, 'construction');
    expect(rows[0]).toEqual([
      '속초 ES아뜨리움', 'HB-2026-041', '강원 속초시', '착공', 9, '7년', '플러그링크', null, '에코일렉', '에코일렉',
      { date: '2026-02-18' }, '해당없음', '해당없음', { date: '2026-03-11' }, { date: '2026-03-25' },
      { date: '2026-04-01' }, null, null, null, '완료',
      { date: '2026-05-02' }, null, null, null, null,
      null, null,
    ]);
  });

  it('자체투자의 승인일·대기번호, 기설치 연동의 충전기 칸은 해당없음', () => {
    const none = new Set<ColKey>();
    const self = tableSheet([site({ bizType: '자체투자' })], none, 'construction');
    const at = (h: string) => self.columns.findIndex((c) => c.header === h);
    expect(self.rows[0][at('환경부 승인일')]).toBe('해당없음');
    expect(self.rows[0][at('환경부 대기번호')]).toBe('해당없음');
    const link = tableSheet([site({ bizType: '기설치 연동' })], none, 'construction');
    expect(link.rows[0][at('충전기 발주일')]).toBe('해당없음');
    expect(link.rows[0][at('충전기 수령일')]).toBe('해당없음');
  });

  it('모자분리는 한전 외선공사 · 계량기 부설이 해당없음 — 한전불입·겸용·미지정은 칸이 선다', () => {
    const none = new Set<ColKey>();
    const cellAt = (p: ProjectSummary, h: string) => {
      const t = tableSheet([p], none, 'construction');
      return t.rows[0][t.columns.findIndex((c) => c.header === h)];
    };
    expect(cellAt(site({ powerType: '모자분리' }), '한전 외선공사일')).toBe('해당없음');
    expect(cellAt(site({ powerType: '모자분리' }), '계량기 부설일')).toBe('해당없음');
    expect(cellAt(site({ powerType: '한전불입' }), '한전 외선공사일')).toBeNull();
    expect(cellAt(site({ powerType: '한전불입+모자분리' }), '계량기 부설일')).toBeNull();
    expect(cellAt(site({ powerType: null }), '계량기 부설일')).toBeNull();
  });

  it('전력인입은 현장의 수전방식 값 그대로 — 겸용은 겸용', () => {
    const none = new Set<ColKey>();
    const cellAt = (p: ProjectSummary) => {
      const t = tableSheet([p], none, 'construction');
      return t.rows[0][t.columns.findIndex((c) => c.header === '전력인입')];
    };
    expect(cellAt(site({ powerType: '모자분리' }))).toBe('모자분리');
    expect(cellAt(site({ powerType: '한전불입+모자분리' }))).toBe('한전불입+모자분리');
    expect(cellAt(site({ powerType: null }))).toBeNull();
  });

  it('시공관리에서는 맞물리는 칸을 보드와 같은 이름으로', () => {
    const p = site({ status: '운영사 계약서 제출' });
    const stage = (tab: 'intake' | 'construction') => tableSheet([p], hidden, tab).rows[0][3];
    expect(stage('construction')).toBe('환경부 승인 대기');
    expect(stage('intake')).toBe('운영사 계약서 제출');
  });
});

describe('restoreHidden — 저장한 뒤에 생긴 열은 페이지 기본을 따른다', () => {
  const NEW = ['notifyCert', 'preStart', 'foundation', 'chargerInstall', 'elecApply', 'safetyCheck', 'kepcoLine', 'meter', 'useInspectApply'];

  it('★옛 저장(배열)★ — 계약관리에서 열을 골라 둔 사람에게 새 시공 날짜 열이 서지 않는다', () => {
    const hidden = restoreHidden(['queue', 'envApproval'], DEFAULT_HIDDEN.intake);
    expect([...hidden].sort()).toEqual(['envApproval', 'queue', ...NEW].sort());
  });

  it('옛 저장 · 시공관리 — 새 날짜 열은 기본이 켜짐이라 그대로 선다', () => {
    const hidden = restoreHidden(['queue', 'biz'], DEFAULT_HIDDEN.construction);
    expect([...hidden].sort()).toEqual(['biz', 'queue']);
  });

  it('새 저장 — 그때 있던 열(seen)의 고르기는 그대로, 사람이 켠 새 열도 켜진 채', () => {
    const seen = [...LEGACY_KEYS, ...NEW];
    const hidden = restoreHidden({ hidden: ['queue'], seen }, DEFAULT_HIDDEN.intake);
    expect([...hidden]).toEqual(['queue']);
  });

  it('★전력인입★ — 시공관리에서 숨김이 기본이던 때의 저장(옛 열 이름 power)이 있어도 이제 선다', () => {
    const v2 = restoreHidden({ hidden: ['queue', 'biz', 'bldg', 'power', 'created'], seen: [...LEGACY_KEYS, ...NEW] }, DEFAULT_HIDDEN.construction);
    expect(v2.has('powerIn')).toBe(false);
    expect([...v2].sort()).toEqual(['bldg', 'biz', 'created', 'queue'].sort());
    const old = restoreHidden(['queue', 'power'], DEFAULT_HIDDEN.construction);
    expect(old.has('powerIn')).toBe(false);
    // 그 뒤에 사람이 다시 끈 것은 그대로 꺼져 있다
    const after = restoreHidden({ hidden: ['powerIn'], seen: [...LEGACY_KEYS, ...NEW, 'powerIn'] }, DEFAULT_HIDDEN.construction);
    expect(after.has('powerIn')).toBe(true);
  });

  it('모르는 열 이름 · 깨진 값은 버린다', () => {
    expect([...restoreHidden(['nope', 3], [])]).toEqual([]);
    expect([...restoreHidden({ hidden: 'x' }, [])]).toEqual([]);
  });
});

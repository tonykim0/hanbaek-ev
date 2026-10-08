/**
 * 기설치 엑셀 ↔ 증빙 대조의 판정 — 판독이 읽어 온 숫자를 받아 코드가 가른다.
 *
 * 금천효성1차(충북 청주)가 실제 모양이다: 엑셀 세 줄(2018 신규 4 · 2021 신규 4 · 2025 신규 8 = 16기)과
 * 행위신고증명서 세 장(0→4 · 4→8 · 8→16).
 */
import { describe, expect, it } from 'vitest';
import type { LegacyRow, LegacySheet } from '@/lib/legacy-sheet';
import {
  bundledAsPdf, checkedFilesOf, compareLegacy, issueCount, preCheckBlocker, missingSeals, reviewCount, SEAL_FIX_REASON, sealOf,
  subsidyIdOf, subsidyOnly, type EvidenceAct, type PreInstallCheck, type SheetScan,
} from '@/lib/preinstall-check';

const row = (r: number, date: string, d: number, kind = '신규 설치', evidence: string | null = null, note: string | null = null): LegacyRow =>
  ({ row: r, date, kind, d, e: null, f: null, g: null, evidence, note });
const sheetOf = (rows: LegacyRow[], standing: number, final = standing, sign: LegacySheet['sign'] = null): LegacySheet =>
  ({ rows, standing, final, badSplit: [], none: rows.length === 0, sign });
const act = (date: string, before: number | null, after: number | null, extra: Partial<EvidenceAct> = {}): EvidenceAct => ({
  file: `행위신고증명서(${date.slice(0, 4)}).pdf`, doc: '행위신고', title: '행위신고증명서', date,
  number: null, kind: '신규 설치', before, after, count: null, ...extra,
});

const 금천효성 = sheetOf([
  row(10, '2018-09-28', 4, '신규 설치', '1. 신규 설치_행위신고증명서(2018-09-28, 신고번호 2018-공동주택과-행위신고(증축)-4호)'),
  row(11, '2021-12-16', 4),
  row(12, '2025-11-21', 8),
], 16);
const 증명서 = [act('2018-09-28', 0, 4), act('2021-12-16', 4, 8), act('2025-11-21', 8, 16)];
const ctx = { survey: { state: '있음' as const, checked: true }, since: '2026-09-11' };

const whole = (r: ReturnType<typeof compareLegacy>): PreInstallCheck =>
  ({ checkedAt: '', files: [], sheetFile: null, sheet: { standing: 0, final: 0, badSplit: [], none: false }, unread: [], problem: null, ...r });

describe('엑셀 줄 ↔ 증빙', () => {
  it('금천효성1차 — 세 줄 다 맞고, 지금 16기도 마지막 신고의 행위 후와 같다', () => {
    const r = compareLegacy(금천효성, 증명서, ctx);
    expect(r.lines.map((l) => [l.row?.row, l.verdict, l.actCount])).toEqual([[10, 'ok', 4], [11, 'ok', 4], [12, 'ok', 8]]);
    expect(r.standing).toEqual({ sheet: 16, evidence: 16, from: '2025-11-21 신고의 행위 후', verdict: 'ok' });
    expect(issueCount(whole(r))).toBe(0);
  });

  it('★기수가 다르면 어긋남★ — 엑셀 2021 줄을 5기로 적은 경우', () => {
    const bad = sheetOf([금천효성.rows[0], { ...금천효성.rows[1], d: 5 }, 금천효성.rows[2]], 17);
    const r = compareLegacy(bad, 증명서, ctx);
    expect(r.lines[1]).toMatchObject({ verdict: 'diff', why: '기수 — 엑셀 5기 · 증빙 4기' });
    expect(r.standing?.verdict).toBe('diff');
    expect(issueCount(whole(r))).toBe(2);
  });

  it('신고번호가 J열에 있으면 날짜가 달라도 짝을 짓고, 날짜 어긋남을 말한다', () => {
    const acts = [act('2018-10-01', 0, 4, { number: '제2018-공동주택과-행위신고(증축)-4 호' }), ...증명서.slice(1)];
    const r = compareLegacy(금천효성, acts, ctx);
    expect(r.lines[0]).toMatchObject({ verdict: 'diff', why: '일자 — 엑셀 2018-09-28 · 증빙 2018-10-01' });
  });

  it('증빙이 없는 줄 — 보조사업 설치분(비고에 사업연도·대기번호)은 면제, 아니면 짚는다', () => {
    const s = sheetOf([row(8, '2020-03-01', 2, '신규 설치', null, '보조사업으로 설치한 충전시설(2020년 1111번)'), row(9, '2022-05-01', 3)], 5);
    const r = compareLegacy(s, [], { ...ctx, survey: { state: '있음', checked: false } });
    expect(r.lines.map((l) => l.verdict)).toEqual(['exempt', 'no-evidence']);
    expect(r.standing?.verdict).toBe('unknown');
    expect(r.survey).toBeNull();
  });

  it('행위신고가 있는데 엑셀에 그 줄이 없으면 짚는다 — 필증·계약서는 받침 자료라 짚지 않는다', () => {
    const extra = [...증명서, act('2023-04-02', 8, 8, { doc: '행위신고', kind: '교체 설치', count: 2 }),
      act('2019-01-05', null, null, { doc: '필증', count: 4 })];
    const r = compareLegacy(금천효성, extra, ctx);
    const loose = r.lines.filter((l) => !l.row);
    expect(loose.map((l) => l.verdict)).toEqual(['no-row', 'extra']);
  });

  it('★이번 설치 건의 신고★(접수일 뒤)는 이력이 아니다 — 그 행위 전 수가 기설치다', () => {
    const acts = [...증명서, act('2026-09-20', 16, 21)];
    const r = compareLegacy(금천효성, acts, ctx);
    expect(r.lines.at(-1)?.verdict).toBe('current');
    expect(r.standing).toMatchObject({ evidence: 16, from: '2026-09-20 신고의 행위 전', verdict: 'ok' });
  });

  it('★설계도면이 증빙인 줄은 「개별 검토 필요」★ — 증빙 없음으로 짚지 않고 따로 센다 (한백 2026-10-06)', () => {
    // 경기 수원 장안구 우성테크노파크의 실제 줄 — 준공 때 설치, 날짜는 사용승인일이라 도면과 짝이 안 맞는다
    const s = sheetOf([
      row(8, '2009-06-30', 2, '신규 설치', '준공 도면 (준공 시 설치했던 위치)'),
      row(9, '2012-01-01', 50, '신규 설치', '1. 신규 설치_설계도면'),
      row(10, '2015-01-01', 3, '신규 설치', null, '준공 당시 건설사 설치'),
    ], 55);
    const drawing = act('2008-11-02', null, null, { doc: '도면', file: '설계도면.pdf', title: '지하주차장 평면도', kind: null });
    const r = compareLegacy(s, [drawing], { ...ctx, survey: { state: '있음', checked: true } });
    expect(r.lines.map((l) => [l.row?.row, l.verdict, l.act?.file ?? null])).toEqual([
      [8, 'review', '설계도면.pdf'],   // 증빙 칸의 도면을 그 줄에 붙인다
      [9, 'review', null],             // 도면은 하나뿐 — 두 번째 줄에는 「도면을 찾지 못함」
      [10, 'review', null],
    ]);
    expect(r.lines[1].why).toMatch(/도면을 찾지 못함/);
    const c = whole(r);
    expect(issueCount(c)).toBe(0);
    expect(reviewCount(c)).toBe(3);
  });

  it('도면 줄이 아닌데 증빙이 없으면 여전히 「증빙 없음」 — 「준공 이후」는 준공 시 설치가 아니다', () => {
    const s = sheetOf([row(8, '2020-03-01', 4, '신규 설치', '준공 이후 추가 설치')], 4);
    expect(compareLegacy(s, [], ctx).lines[0].verdict).toBe('no-evidence');
  });

  it('기수를 못 읽은 증빙은 「못 읽음」 — 맞다고 하지 않는다', () => {
    const acts = [act('2018-09-28', null, null), ...증명서.slice(1)];
    expect(compareLegacy(금천효성, acts, ctx).lines[0].verdict).toBe('no-count');
  });
});

describe('콘솔의 조사 결과 ↔ 엑셀', () => {
  it('★조사 「없음」인데 엑셀이 16기★ — 설치이력을 올리면 조사함으로 굳는 현장(금천효성1차)', () => {
    const r = compareLegacy(금천효성, 증명서, { ...ctx, survey: { state: '없음', checked: true } });
    expect(r.survey).toEqual({ state: '없음', verdict: 'diff' });
  });
  it('조사 표시가 없으면 견주지 않는다', () => {
    expect(compareLegacy(금천효성, 증명서, { ...ctx, survey: { state: '없음', checked: false } }).survey).toBeNull();
  });
  it('기설치는 최종 수량(H)으로 본다 — 지금은 0기여도 8년 전에 임의로 걷은 것이 있으면 있음', () => {
    const s = sheetOf([row(8, '2015-01-01', 4), { ...row(9, '2018-01-01', 4, '철거'), f: 4 }], 0, 4);
    expect(compareLegacy(s, [], { ...ctx, survey: { state: '있음', checked: true } }).survey?.verdict).toBe('ok');
  });
});

/*
 * ★기설치가 없으면 운영사·아파트 직인이 둘 다 있어야 한다★ (한백 2026-10-07).
 * 모양은 실제 파일에서 왔다 — 「현엔 기설치이력없음_날인본.xlsx」(둘 다) · 「(양식)…미존재 (2).xlsx」(나이스만) ·
 * 경주국태그린빌 첫 스캔본(아파트만 — 보완요청됐다) · 옛 양식(서명 칸 없음).
 */
describe('기설치 없음 설치이력의 직인', () => {
  const side = (name: string | null, seal: boolean) => ({ name, seal });
  const scan = (file: string, applicant: boolean | null, operator: boolean | null, total: number | null = 0, form = true): SheetScan =>
    ({ file, form, applicant: { name: null, seal: applicant }, operator: { name: null, seal: operator }, total });
  const none = (sign: LegacySheet['sign']) => sheetOf([], 0, 0, sign);

  it('엑셀에 도장 그림이 둘 다 있으면 맞음', () => {
    const s = sealOf(none({ applicant: side('세경1차아파트관리사무소', true), operator: side('현대엔지니어링 주식회사', true) }), [], '날인본.xlsx');
    expect(s).toEqual({ applicant: true, operator: true, from: ['날인본.xlsx'], oldForm: false });
  });

  it('아파트 직인이 없으면 짚는다 — 보완요청 사유는 한 줄이다(한백 지시 2026-10-08)', () => {
    const s = sealOf(none({ applicant: side(null, false), operator: side('NICE인프라(주)', true) }), [], '미존재 (2).xlsx')!;
    expect(s.applicant).toBe(false);
    expect(missingSeals(s)).toEqual(['아파트(설치 신청자)']);
    expect(SEAL_FIX_REASON).toBe('기설치 없음 설치이력에 직인이 없습니다.');
    expect(issueCount({ ...whole({ lines: [], standing: null, survey: null }), seal: s })).toBe(1);
  });

  it('★엑셀은 이름만, 도장은 스캔본에★ — 어느 한 곳에 있으면 있는 것이다', () => {
    const s = sealOf(none({ applicant: side('하엘에스페이스 관리위원회', false), operator: side('주식회사 플러그링크', false) }),
      [scan('날인본.pdf', true, true)], '이력.xlsx');
    expect(s).toMatchObject({ applicant: true, operator: true, from: ['이력.xlsx', '날인본.pdf'] });
  });

  it('스캔본만 낸 현장 — 경주국태그린빌 첫 판(아파트만)은 운영사 직인 없음', () => {
    const s = sealOf(null, [scan('국태그린빌.pdf', true, false)], null)!;
    expect(s).toMatchObject({ applicant: true, operator: false });
    expect(missingSeals(s)).toEqual(['운영사(사업수행기관)']);
  });

  it('서명 칸 없는 옛 양식뿐이면 둘 다 없음', () => {
    const s = sealOf(none(null), [], '옛양식.xlsx')!;
    expect(s).toMatchObject({ applicant: false, operator: false, oldForm: true });
  });

  it('기설치가 있으면 직인을 보지 않는다 — 증빙이 수량을 받친다', () => {
    expect(sealOf(금천효성, [], '이력.xlsx')).toBeNull();
    // 양식 예시 줄을 지우지 않고 0기로 둔 엑셀(경주국태그린빌 보완판)은 「없음」이다
    expect(sealOf(sheetOf([row(8, '2012-01-01', 0), row(9, '2019-01-01', 0, '교체 설치')], 0), [], 'x.xlsx')).not.toBeNull();
  });

  it('엑셀이 없고 스캔본의 합계가 0 보다 크거나 안 보이면 보지 않는다 — 모르는 것을 보완요청하지 않는다', () => {
    expect(sealOf(null, [scan('미리샘.pdf', null, null, 17, false)], null)).toBeNull();
    expect(sealOf(null, [scan('흐림.pdf', true, false, null)], null)).toBeNull();
  });

  it('기설치 없는 현장의 「지금 서 있는 수」는 행위신고가 없어도 맞음이다', () => {
    expect(compareLegacy(none(null), [], ctx).standing?.verdict).toBe('ok');
  });
});

describe('계약 확인을 막는 대조 — 검증 필수 (한백 지시 2026-10-07)', () => {
  const files = ['https://x/log.xlsx', 'https://x/ev.pdf'];
  const base: PreInstallCheck = {
    checkedAt: '2026-10-07T01:00:00.000Z', files, sheetFile: 'log.xlsx',
    sheet: { standing: 0, final: 0, badSplit: [], none: true }, lines: [], standing: null, survey: null,
    unread: [], problem: null,
  };
  const gate = (check: PreInstallCheck | null, currentFiles = files, needed = true) =>
    preCheckBlocker({ needed, check, currentFiles });

  it('보조사업이 아니거나 이관 현장이면 보지 않는다', () => {
    expect(gate(null, files, false)).toBeNull();
  });

  it('대조를 안 했으면 막는다', () => {
    expect(gate(null)).toBe('기설치 대조 전');
  });

  it('남은 것이 없으면 통과 — 파일 순서는 상관없다', () => {
    expect(gate(base, [...files].reverse())).toBeNull();
  });

  it('대조 뒤 칸의 파일이 바뀌면 막는다 — 넘긴 것도 같이 무효다', () => {
    const accepted = { ...base, problem: '시험', accepted: { by: '한백', at: '2026-10-07T02:00:00.000Z' } };
    expect(gate(base, [...files, 'https://x/ev2.pdf'])).toBe('기설치 서류 바뀜 — 다시 대조');
    expect(gate(accepted, [files[0]])).toBe('기설치 서류 바뀜 — 다시 대조');
  });

  it('짚을 것·개별 검토가 남으면 그 수를 적어 막고, 한백이 넘기면 통과', () => {
    const left: PreInstallCheck = {
      ...base,
      lines: [
        { verdict: 'diff', row: null, act: null, actCount: null, why: null },
        { verdict: 'review', row: null, act: null, actCount: null, why: null },
      ],
    };
    expect(gate(left)).toBe('기설치 대조 2건 미확인');
    expect(gate({ ...left, accepted: { by: '한백', at: '2026-10-07T02:00:00.000Z' } })).toBeNull();
  });

  it('★설치이력을 PDF 로도 냈으면 대조하지 않는다★ — 대조 전이어도·남은 것이 있어도 막지 않는다 (한백 2026-10-07)', () => {
    const docs = (names: string[]) => [{ kind: 'legacylog', files: names.map((name) => ({ name })) }];
    expect(bundledAsPdf(docs(['설치이력.xlsx', '설치이력_날인본.pdf']))).toBe(true);
    expect(bundledAsPdf(docs(['세경1차_기설치이력없음_날인본.PDF']))).toBe(true);
    expect(bundledAsPdf(docs(['설치이력.xlsx']))).toBe(false);
    // 증빙 칸의 PDF 는 셈하지 않는다 — 설치이력 칸에 낸 것만이 「한 묶음으로 다 냄」이다
    expect(bundledAsPdf([{ kind: 'legacyev', files: [{ name: '행위신고증명서.pdf' }] }])).toBe(false);

    const left: PreInstallCheck = { ...base, lines: [{ verdict: 'diff', row: null, act: null, actCount: null, why: null }] };
    expect(preCheckBlocker({ needed: true, check: null, currentFiles: files, bundled: true })).toBeNull();
    expect(preCheckBlocker({ needed: true, check: left, currentFiles: files, bundled: true })).toBeNull();
  });

  it('지금 파일은 설치이력·증빙 두 칸만 본다', () => {
    expect(checkedFilesOf([
      { kind: 'contract', files: [{ url: 'https://x/c.pdf' }] },
      { kind: 'legacyev', files: [{ url: 'https://x/ev.pdf' }] },
      { kind: 'legacylog', files: [{ url: 'https://x/log.xlsx' }] },
    ])).toEqual(['https://x/log.xlsx', 'https://x/ev.pdf']);
  });
});

describe('★순수 보조사업 이력 — 사업연도·대기번호가 있으면 검수하지 않는다★ (한백 지시 2026-10-08)', () => {
  it('실제 엑셀의 적은 모양을 읽는다', () => {
    const cases: [string, { year: number; no: number } | null][] = [
      ['사업연도: 2023년, 대기번호: 5710', { year: 2023, no: 5710 }],
      ['사업연도 2025 대기번호 1829 플러그링크 9기', { year: 2025, no: 1829 }],
      ['사업연도 : 2021 대기번호 : 373', { year: 2021, no: 373 }],
      ['2022 보조금 사업 대기번호2914', { year: 2022, no: 2914 }],
      ['2022.09_대기번호2914', { year: 2022, no: 2914 }],
      ['대기번호 2022년 252번 이력 추', { year: 2022, no: 252 }],
      ['대기번호 1704 2023년 보조금 사업', { year: 2023, no: 1704 }],
      ['사업연도 2018, 대기번호 170 2기, 대기번호 171 2기 · 완속충전기', { year: 2018, no: 170 }],
      ['사업연도 2019년 · 대기번호 4995 · 공사완료 2019-08-09', { year: 2019, no: 4995 }],
      ['보조사업으로 설치한 충전시설(2024년 1111번)', { year: 2024, no: 1111 }],
      ['보조금 신청번호 2024-1111', { year: 2024, no: 1111 }],
    ];
    for (const [text, want] of cases) expect(subsidyIdOf(text), text).toEqual(want);
  });

  it('사업연도나 대기번호가 빠지면 보조사업 표기가 아니다', () => {
    for (const text of [
      '완속보조금', '환경부 보조금 이력 존재', '사업연도 2021년 대기번호 한국전기차충전서비스',
      '대기번호 2014', '세움터 접수번호 2022-4210000-0063363[2022-07-08]호', '2024년 2번 교체', '공사완료 2023-02-21', null,
    ]) expect(subsidyIdOf(text), String(text)).toBeNull();
  });

  it('모든 줄이 보조사업이어야 순수 보조사업 이력이다 — 한 줄이라도 자부담이면 평소대로 대조한다', () => {
    const pure = sheetOf([
      row(8, '2019-11-01', 4, '신규 설치', '사업연도: 2019년, 대기번호: 16932'),
      row(9, '2022-11-01', 3, '신규 설치', null, '2022년 보조사업 대기번호 777'),
    ], 7);
    expect(subsidyOnly(pure)).toBe(true);
    expect(subsidyOnly(sheetOf([...pure.rows, row(10, '2024-05-01', 1)], 8))).toBe(false);
    expect(subsidyOnly(sheetOf([row(8, '2020-01-01', 2, '신규 설치', '완속보조금')], 2))).toBe(false);
    expect(subsidyOnly(sheetOf([], 0))).toBe(false);
  });

  it('줄은 읽은 번호를 곁글로 단 면제 — 지금 서 있는 수는 견줄 증빙이 없어 짚지 않는다', () => {
    const s = sheetOf([row(8, '2019-11-01', 4, '신규 설치', '사업연도: 2019년, 대기번호: 16932')], 4);
    const r = compareLegacy(s, [], ctx);
    expect(r.lines).toMatchObject([{ verdict: 'exempt', why: '보조사업 2019년 16932번 · 증빙 면제' }]);
    expect(r.standing).toBeNull();
    expect(issueCount(whole(r))).toBe(0);
  });

  it('보조라고만 적고 번호가 없으면 그 까닭으로 짚는다', () => {
    const r = compareLegacy(sheetOf([row(8, '2020-01-01', 2, '신규 설치', '완속보조금')], 2), [], ctx);
    expect(r.lines[0]).toMatchObject({ verdict: 'no-evidence', why: '보조사업 표기에 사업연도·대기번호가 없어 면제 불가' });
  });

  it('계약 확인을 막지 않는다 — 조사 결과가 어긋나도 검수 대상이 아니다. 서류가 바뀌면 다시 대조', () => {
    const files = ['a.xlsx'];
    const check: PreInstallCheck = {
      ...whole({ lines: [], standing: null, survey: { state: '없음', verdict: 'diff' } }), files, subsidyOnly: true,
    };
    expect(preCheckBlocker({ needed: true, check, currentFiles: files })).toBeNull();
    expect(preCheckBlocker({ needed: true, check, currentFiles: [...files, 'b.pdf'] })).toBe('기설치 서류 바뀜 — 다시 대조');
  });
});


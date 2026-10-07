/**
 * 기설치 엑셀 ↔ 증빙 대조의 판정 — 판독이 읽어 온 숫자를 받아 코드가 가른다.
 *
 * 금천효성1차(충북 청주)가 실제 모양이다: 엑셀 세 줄(2018 신규 4 · 2021 신규 4 · 2025 신규 8 = 16기)과
 * 행위신고증명서 세 장(0→4 · 4→8 · 8→16).
 */
import { describe, expect, it } from 'vitest';
import type { LegacyRow, LegacySheet } from '@/lib/legacy-sheet';
import { compareLegacy, issueCount, reviewCount, type EvidenceAct, type PreInstallCheck } from '@/lib/preinstall-check';

const row = (r: number, date: string, d: number, kind = '신규 설치', evidence: string | null = null, note: string | null = null): LegacyRow =>
  ({ row: r, date, kind, d, e: null, f: null, g: null, evidence, note });
const sheetOf = (rows: LegacyRow[], standing: number, final = standing): LegacySheet =>
  ({ rows, standing, final, badSplit: [], none: rows.length === 0 });
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

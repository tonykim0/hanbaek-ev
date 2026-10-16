/**
 * 주차면 대조의 판정 — 건축물대장(K-apt·공문) = 사전현장컨설팅 결과서 = 설치신청서 · 열람용 아님 (한백 지시 2026-10-16).
 * 현장 이름은 판정을 짠 실제 서류다(~/Downloads 의 계약 서류 묶음).
 */
import { describe, expect, it } from 'vitest';
import {
  judgeParking, parkingBlocker, viewOnlyNow, type ParkingCheck, type ParkingRead,
} from '@/lib/parking-check';
import { parkingReadsOf } from '@/lib/parking-read';

const read = (over: Partial<ParkingRead>): ParkingRead => ({
  file: 'a.pdf', slot: 'bldgreg', doc: '건축물대장', viewOnly: false, parking: null, ...over,
});
const all = { bldgreg: true, consult: true, apply: true };
const keys = (r: ReturnType<typeof judgeParking>) => r.issues.map((i) => i.key);

describe('주차면 대조 — 판정', () => {
  it('영신그린빌 — 건축물대장 249 · 결과서 249 · 신청서 249, 발급용이면 맞음', () => {
    const r = judgeParking([
      read({ parking: 249 }),
      read({ file: 'c.pdf', slot: 'consult', doc: '결과서', viewOnly: null, parking: 249 }),
      read({ file: 'p.pdf', slot: 'apply', doc: '신청서', viewOnly: null, parking: 249 }),
    ], { applyRequired: true, filed: all });
    expect(r).toMatchObject({ basis: { value: 249, from: '건축물대장' }, consult: 249, apply: 249, applyChecked: true, issues: [] });
  });

  it('광혜원원림 — 건축물대장에 주차면이 없으면 같은 칸(한 파일)의 K-apt 가 기준이다', () => {
    const r = judgeParking([
      read({ file: '건축물대장+kapt.pdf', parking: null }),
      read({ file: '건축물대장+kapt.pdf', doc: 'K-apt', viewOnly: null, parking: 90 }),
      read({ file: 'c.pdf', slot: 'consult', doc: '결과서', viewOnly: null, parking: 90 }),
    ], { applyRequired: false, filed: { bldgreg: true, consult: true, apply: false } });
    expect(r.basis).toEqual({ value: 90, from: 'K-apt' });
    expect(r.issues).toEqual([]);
    expect(r.applyChecked).toBe(false);
  });

  it('새한그린파크 — 열람용 건축물대장은 주차면이 맞아도 짚는다', () => {
    const r = judgeParking([
      read({ viewOnly: true, parking: null }),
      read({ doc: 'K-apt', viewOnly: null, parking: 198 }),
      read({ file: 'c.pdf', slot: 'consult', doc: '결과서', viewOnly: null, parking: 198 }),
      read({ file: 'p.pdf', slot: 'apply', doc: '신청서', viewOnly: null, parking: 198 }),
    ], { applyRequired: true, filed: all });
    expect(keys(r)).toEqual(['view-only']);
    expect(r.basis?.value).toBe(198);
  });

  it('건축물대장에 주차면이 없고 K-apt·공문도 없으면 받칠 것을 달라고 한다', () => {
    const r = judgeParking([
      read({ parking: null }),
      read({ file: 'c.pdf', slot: 'consult', doc: '결과서', viewOnly: null, parking: 120 }),
    ], { applyRequired: false, filed: { bldgreg: true, consult: true, apply: false } });
    expect(keys(r)).toEqual(['no-basis']);
    expect(r.basis).toBeNull();
  });

  it('건축물대장에 주차면이 있으면 K-apt 가 달라도 기준은 건축물대장이다', () => {
    const r = judgeParking([
      read({ parking: 249 }),
      read({ doc: 'K-apt', viewOnly: null, parking: 250 }),
      read({ file: 'c.pdf', slot: 'consult', doc: '결과서', viewOnly: null, parking: 249 }),
    ], { applyRequired: false, filed: { bldgreg: true, consult: true, apply: false } });
    expect(r.basis).toEqual({ value: 249, from: '건축물대장' });
    expect(r.issues).toEqual([]);
  });

  it('결과서·신청서가 기준과 다르면 어긋남 — 기준이 없으면 둘끼리라도 견준다', () => {
    const diff = judgeParking([
      read({ parking: 249 }),
      read({ file: 'c.pdf', slot: 'consult', doc: '결과서', viewOnly: null, parking: 248 }),
      read({ file: 'p.pdf', slot: 'apply', doc: '신청서', viewOnly: null, parking: 250 }),
    ], { applyRequired: true, filed: all });
    expect(diff.issues.map((i) => i.text)).toEqual([
      '결과서 248면 ≠ 건축물대장 249면', '설치신청서 250면 ≠ 건축물대장 249면',
    ]);
    const noBasis = judgeParking([
      read({ parking: null }),
      read({ file: 'c.pdf', slot: 'consult', doc: '결과서', viewOnly: null, parking: 120 }),
      read({ file: 'p.pdf', slot: 'apply', doc: '신청서', viewOnly: null, parking: 121 }),
    ], { applyRequired: true, filed: all });
    expect(keys(noBasis)).toEqual(['no-basis', 'apply-diff']);
    expect(noBasis.issues[1].text).toBe('설치신청서 121면 ≠ 결과서 120면');
  });

  it('장마다 다르면 기준을 세우지 않는다 · 건축물대장이 없으면 짚는다 · 빠진 서류와 못 읽은 서류를 가른다', () => {
    expect(keys(judgeParking([read({ parking: 249 }), read({ file: 'b.pdf', parking: 250 })], {
      applyRequired: false, filed: { bldgreg: true, consult: false, apply: false },
    }))).toEqual(['split', 'no-consult']);
    const onlyKapt = judgeParking([read({ doc: 'K-apt', viewOnly: null, parking: 90 })], {
      applyRequired: true, filed: { bldgreg: true, consult: true, apply: false },
    });
    expect(onlyKapt.issues.map((i) => i.text)).toEqual([
      '건축물대장 칸에서 건축물대장을 찾지 못했습니다',
      '사전현장컨설팅 결과서에서 주차면을 읽지 못했습니다',
      '설치신청서가 없습니다',
    ]);
  });

  it('환경부 사업이 아니어도 신청서를 냈으면 견준다', () => {
    const r = judgeParking([
      read({ parking: 30 }),
      read({ file: 'c.pdf', slot: 'consult', doc: '결과서', viewOnly: null, parking: 30 }),
      read({ file: 'p.pdf', slot: 'apply', doc: '신청서', viewOnly: null, parking: 31 }),
    ], { applyRequired: false, filed: all });
    expect(r.applyChecked).toBe(true);
    expect(keys(r)).toEqual(['apply-diff']);
  });
});

describe('주차면 대조 — 계약 확인의 조건', () => {
  const base: ParkingCheck = {
    checkedAt: '2026-10-16T01:00:00.000Z', files: ['a', 'b'], reads: [], basis: null,
    consult: null, apply: null, applyChecked: false, issues: [], unread: [],
  };
  const flagged = { ...base, issues: [{ key: 'view-only' as const, text: '열람용' }] };
  it('대조 전 · 서류 바뀜 · 짚을 것 남음은 막고, 넘겼거나 맞으면 연다 · 이관 현장은 보지 않는다', () => {
    expect(parkingBlocker({ needed: true, check: null, currentFiles: ['a'] })).toBe('주차면 대조 전');
    expect(parkingBlocker({ needed: true, check: base, currentFiles: ['a'] })).toBe('주차면 서류 바뀜 — 다시 대조');
    expect(parkingBlocker({ needed: true, check: flagged, currentFiles: ['b', 'a'] })).toBe('주차면 대조 1건 미확인');
    expect(parkingBlocker({ needed: true, check: { ...flagged, accepted: { by: '한백', at: 'x' } }, currentFiles: ['a', 'b'] })).toBeNull();
    expect(parkingBlocker({ needed: true, check: base, currentFiles: ['a', 'b'] })).toBeNull();
    expect(parkingBlocker({ needed: false, check: null, currentFiles: [] })).toBeNull();
  });
  it('열람용 반려 제안은 지금 서류로 돈 결과일 때만', () => {
    expect(viewOnlyNow(flagged, ['a', 'b'])).toBe(true);
    expect(viewOnlyNow(flagged, ['a', 'c'])).toBe(false);
    expect(viewOnlyNow(base, ['a', 'b'])).toBe(false);
  });
});

describe('주차면 판독의 답 다듬기', () => {
  const files = [
    { name: '광혜원_건축물대장+kapt.pdf', slot: 'bldgreg' as const },
    { name: '결과서.pdf', slot: 'consult' as const },
  ];
  it('이름은 보낸 것 중 하나로 · 종류는 정해진 것 중 하나로 · 열람용은 건축물대장만 · 「249면」은 숫자로', () => {
    expect(parkingReadsOf({ docs: [
      { originalName: '광혜원_건축물대장+kapt.pdf', doc: '건축물대장', viewOnly: false, parking: null },
      { originalName: '광혜원_건축물대장+kapt.pdf', doc: 'K-apt', viewOnly: true, parking: '90' },
      { originalName: '결과서', doc: '결과서', parking: '249면' },
      { originalName: '모르는.pdf', doc: '건축물대장', parking: 1 },
      { originalName: '결과서.pdf', doc: '등기부', parking: 0 },
    ] }, files)).toEqual([
      { file: '광혜원_건축물대장+kapt.pdf', slot: 'bldgreg', doc: '건축물대장', viewOnly: false, parking: null },
      { file: '광혜원_건축물대장+kapt.pdf', slot: 'bldgreg', doc: 'K-apt', viewOnly: null, parking: 90 },
      { file: '결과서.pdf', slot: 'consult', doc: '결과서', viewOnly: null, parking: 249 },
      { file: '결과서.pdf', slot: 'consult', doc: '기타', viewOnly: null, parking: null },
    ]);
    expect(parkingReadsOf(null, files)).toEqual([]);
  });
});

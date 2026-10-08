/** 서류에서 읽어 현장 정보에 넣는 값 — 대표자·계약일 (한백 지시 2026-10-08, lib/fact-read) */
import { describe, expect, it } from 'vitest';
import { contractDateOfFiles, contractDateReadOf, dayOf, isDay, repNameOf, repNameReadOf } from '@/lib/fact-read';

describe('대표자', () => {
  it('이름만 남긴다 — 직함·「(인)」·이름표를 걷는다', () => {
    expect(repNameOf('김대원')).toBe('김대원');
    expect(repNameOf('회장 김철수 (인)')).toBe('김철수');
    expect(repNameOf('대표자 성명: 이화행')).toBe('이화행');
    expect(repNameOf('  ')).toBeNull();
    expect(repNameOf(null)).toBeNull();
  });
  it('이름 끝의 「인」은 남긴다 — 괄호 친 것만 걷는다', () => {
    expect(repNameOf('김수인')).toBe('김수인');
  });
  it('판독의 답에서', () => {
    expect(repNameReadOf({ repName: '서갑진' })).toBe('서갑진');
    expect(repNameReadOf({ repName: null })).toBeNull();
    expect(repNameReadOf(null)).toBeNull();
  });
});

describe('계약일', () => {
  it('판독이 주는 모양을 YYYY-MM-DD 로', () => {
    expect(dayOf('20260609')).toBe('2026-06-09');
    expect(dayOf('2026-06-09')).toBe('2026-06-09');
    expect(dayOf('2026년 6월 9일')).toBe('2026-06-09');
    expect(dayOf('2026.6.9')).toBe('2026-06-09');
  });
  it('달력에 없는 날·엉뚱한 해·글자는 버린다', () => {
    expect(dayOf('2026-02-30')).toBeNull();
    expect(dayOf('19990101')).toBeNull();
    expect(dayOf('2090-01-01')).toBeNull();
    expect(dayOf('년 월 일')).toBeNull();
    expect(dayOf(null)).toBeNull();
    expect(isDay('2026-13-01')).toBe(false);
    expect(isDay('2024-02-29')).toBe(true);
  });
  it('접수 판독의 서류 목록에서 — 계약서가 여럿이면 가장 최근이 이번 계약이다', () => {
    expect(contractDateOfFiles([
      { category: '계약서', date: '20190312' },
      { category: '회의록', date: '20260701' },
      { category: '계약서', date: '20260609' },
      { category: '계약서', date: null },
    ])).toBe('2026-06-09');
    expect(contractDateOfFiles([{ category: '합의서', date: '20260609' }])).toBeNull();
    expect(contractDateOfFiles(undefined)).toBeNull();
  });
  it('판독의 답에서', () => {
    expect(contractDateReadOf({ contractDate: '2026-07-29' })).toBe('2026-07-29');
    expect(contractDateReadOf({ contractDate: null })).toBeNull();
  });
});

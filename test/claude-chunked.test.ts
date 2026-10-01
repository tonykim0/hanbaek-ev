import { describe, expect, it, vi } from 'vitest';

// 판독 SDK 를 싣지 않는다 — 합치는 셈만 본다
vi.mock('@/lib/claude', () => ({ classifyAndExtract: vi.fn() }));

import { mergeChunkResults, type Part } from '@/lib/claude-chunked';
import { toInstallLoc } from '@/lib/intake-auto';
import type { ExtractedMetadata } from '@/types/intake';

const meta = (over: Partial<ExtractedMetadata>): ExtractedMetadata => ({
  현장명: '', 주소: null, 우편번호: null, CPO: [], 계약대수: null, 계약기간: null, 총주차면수: null,
  건축물유형: null, 전력인입: null, 소재지: null, 사업구분: null, 현장담당자: null, 현장연락처: null,
  현장이메일: null, 설치위치: null, 비고: null, files: [], confidence: {},
  ...over,
});

const part = (name: string, origin: string, offset: number, pages: number, total: number): [string, Part] => [
  name,
  { file: { name, buffer: Buffer.alloc(0), hash: name, mimeType: 'application/pdf' }, origin, offset, pages, total },
];

describe('나눠 읽은 판독 합치기', () => {
  it('조각의 쪽 번호를 원본으로 되돌리고, 이어지는 같은 종류는 하나로 합친다', () => {
    const parts = new Map([
      part('큰__조각1.pdf', '큰.pdf', 0, 3, 6),
      part('큰__조각2.pdf', '큰.pdf', 3, 3, 6),
    ]);
    const merged = mergeChunkResults([
      meta({ 현장명: '가', files: [
        { originalName: '큰__조각1.pdf', category: '실사보고서', date: '', pages: [1] },
        { originalName: '큰__조각1.pdf', category: '사진대지', date: '', pages: [2, 3] },
      ] }),
      meta({ files: [{ originalName: '큰__조각2.pdf', category: '사진대지', date: '', pages: [1, 2, 3] }] }),
    ], parts);
    expect(merged.files).toEqual([
      { originalName: '큰.pdf', category: '실사보고서', date: '', pages: [1] },
      { originalName: '큰.pdf', category: '사진대지', date: '', pages: [2, 3, 4, 5, 6] },
    ]);
  });

  it('판독에서 빠진 쪽은 바로 앞 쪽의 서류에 붙인다 — 올라간 서류에서 쪽이 사라지면 안 된다', () => {
    // 2쪽이 혼자 한도를 넘어 조각에서 빠졌다
    const parts = new Map([
      part('큰__조각1.pdf', '큰.pdf', 0, 1, 4),
      part('큰__조각3.pdf', '큰.pdf', 2, 2, 4),
    ]);
    const merged = mergeChunkResults([
      meta({ files: [
        { originalName: '큰__조각1.pdf', category: '사진대지', date: '', pages: [1] },
        { originalName: '큰__조각3.pdf', category: '견적서', date: '', pages: [1, 2] },
      ] }),
    ], parts);
    const pages = merged.files.flatMap((f) => f.pages ?? []).sort((a, b) => a - b);
    expect(pages).toEqual([1, 2, 3, 4]);
    expect(merged.files.find((f) => f.category === '사진대지')?.pages).toEqual([1, 2]);
  });

  it('현장 값은 앞 묶음이 먼저, 빈 값만 뒤 묶음으로 채운다 · 운영사는 합집합', () => {
    const merged = mergeChunkResults([
      meta({ 현장명: '가', 주소: null, CPO: ['플러그링크'] }),
      meta({ 현장명: '나', 주소: '서울', CPO: ['플러그링크', 'SK일렉링크'] }),
    ], new Map());
    expect(merged.현장명).toBe('가');
    expect(merged.주소).toBe('서울');
    expect(merged.CPO).toEqual(['플러그링크', 'SK일렉링크']);
  });

  it('잘리지 않은 파일은 판독이 나눈 그대로 둔다', () => {
    const merged = mergeChunkResults([
      meta({ files: [
        { originalName: '작은.pdf', category: '견적서', date: '', pages: [1] },
        { originalName: '작은.pdf', category: '견적서', date: '', pages: [2] },
      ] }),
    ], new Map());
    expect(merged.files).toHaveLength(2);
  });
});

describe('설치위치 읽기', () => {
  it.each([
    ['실내', '실내'], ['실외', '실외'], ['실내·실외', '실내·실외'], ['실내, 실외', '실내·실외'],
    ['지하 1층', '실내'], ['노상', '실외'], [null, null], ['모름', null],
  ])('%s → %s', (raw, want) => {
    expect(toInstallLoc(raw)).toBe(want);
  });
});

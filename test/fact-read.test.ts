/** 서류에서 읽어 현장 정보에 넣는 값 — 대표자·계약일 (한백 지시 2026-10-08, lib/fact-read) */
import { describe, expect, it } from 'vitest';
import {
  addrOf, applyReadOf, contractDateOfFiles, contractDateReadOf, contractReadOf, dayOf, isDay, mailOf, parkOf, repNameOf,
  repNameReadOf, staleFacts, telOf,
} from '@/lib/fact-read';

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

describe('주소·주차면·연락처 (계약서·설치신청서, 2026-10-29)', () => {
  it('계약서의 답 — 계약일과 부지제공자 칸', () => {
    expect(contractReadOf({
      contractDate: '2026-05-14', addr: '전북특별자치도 익산시 선화로23길 52', mgr: '관리소장', tel: '063-842-3396', mail: 'bocomo@naver.com',
    })).toEqual({
      contractDate: '2026-05-14', addr: '전북특별자치도 익산시 선화로23길 52', mgr: '관리소장', tel: '063-842-3396', mail: 'bocomo@naver.com',
    });
    // 못 읽은 칸은 빠진다 — 빈 칸을 null 로 덮지 않게
    expect(contractReadOf({ contractDate: null, addr: null, mgr: ' ', tel: '없음', mail: '-' })).toEqual({});
    expect(contractReadOf(null)).toEqual({});
  });
  it('설치신청서의 답', () => {
    expect(applyReadOf({ addr: '도로명 주소 : 서울특별시 도봉구 해동로 32', parkTotal: '310면', tel: '02-998-3536' }))
      .toEqual({ addr: '서울특별시 도봉구 해동로 32', parkTotal: 310, tel: '02-998-3536' });
  });
  it('주소 — 시·군·구가 없는 짧은 글은 주소가 아니다', () => {
    expect(addrOf('경상북도 구미시 형곡로 14길 11')).toBe('경상북도 구미시 형곡로 14길 11');
    expect(addrOf('형곡로 14길 11')).toBeNull();
    expect(addrOf('')).toBeNull();
  });
  it('연락처·이메일·주차면 — 모양이 아니면 버린다', () => {
    expect(telOf('054-443-9135')).toBe('054-443-9135');
    expect(telOf('1234')).toBeNull();
    expect(mailOf('bkkim @awon.co.kr')).toBe('bkkim@awon.co.kr');
    expect(mailOf('관리소장')).toBeNull();
    expect(parkOf(60)).toBe(60);
    expect(parkOf('1,204 면')).toBe(1204);
    expect(parkOf(0)).toBeNull();
    expect(parkOf('많음')).toBeNull();
  });
});

describe('빠진 장이 넣었던 값 걷기', () => {
  const gone = [{ facts: { contractDate: '2026-10-21', addr: '경상북도 구미시 형곡로 14길 11', parkTotal: 60 }, name: { from: '효성로즈타운', to: '경북 구미 효성로즈타운' } }];
  it('아직 그 값 그대로인 칸만 — 사람이 고친 칸은 둔다', () => {
    expect(staleFacts(gone, {
      name: '경북 구미 효성로즈타운', contractDate: '2026-10-14', addr: '경상북도 구미시 형곡로 14길 11', parkTotal: 60,
    })).toEqual({ clear: ['addr', 'parkTotal'], name: '효성로즈타운' });
  });
  it('현장명은 지역을 붙인 그 이름일 때만 되돌린다', () => {
    expect(staleFacts(gone, { name: '구미 효성로즈타운아파트', contractDate: null, addr: null, parkTotal: null }))
      .toEqual({ clear: [], name: null });
  });
});

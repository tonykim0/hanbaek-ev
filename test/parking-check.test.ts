/**
 * 건축물대장 대조의 판정 — 주차면: 건축물대장(K-apt·공문) = 사전현장컨설팅 결과서 = 설치신청서 · 열람용 아님 /
 * 주소: 설치신청서가 도로명 주소이고 건축물대장 도로명주소와 같음 (한백 지시 2026-10-16) /
 * 발급일: 건축물대장이 계약접수일로부터 3개월 안에 발급한 것 (2026-10-30).
 * 현장 이름은 판정을 짠 실제 서류다(~/Downloads 의 계약 서류 묶음).
 */
import { describe, expect, it } from 'vitest';
import {
  isRoadAddress, judgeParking, PARKING_CHECK_VERSION, parkingBlocker, registerRejectOf, roadKeyOf, VIEW_ONLY_REASON,
  type ParkingCheck, type ParkingRead,
} from '@/lib/parking-check';
import { parkingReadsOf } from '@/lib/parking-read';
import { nameOfAnswer, shownName } from '@/lib/check-kit';

/*
 * 주소는 기본으로 같은 도로명을, 발급일은 계약접수일 안쪽 날을 단다 — 주차면 시험이 주소·발급일 판정에 걸리지 않게
 * (주소·발급일은 아래 묶음이 따로 본다)
 */
const RECEIVED = '2026-10-16';
const read = (over: Partial<ParkingRead>): ParkingRead => ({
  file: 'a.pdf', slot: 'bldgreg', doc: '건축물대장', viewOnly: false, parking: null,
  address: '전라남도 광양시 광양읍 예구1길 8', issued: '2026-10-02', ...over,
});
const all = { bldgreg: true, consult: true, apply: true };
const keys = (r: ReturnType<typeof judgeParking>) => r.issues.map((i) => i.key);

describe('건축물대장 대조 — 주차면', () => {
  it('영신그린빌 — 건축물대장 249 · 결과서 249 · 신청서 249, 발급용이면 맞음', () => {
    const r = judgeParking([
      read({ parking: 249 }),
      read({ file: 'c.pdf', slot: 'consult', doc: '결과서', viewOnly: null, parking: 249 }),
      read({ file: 'p.pdf', slot: 'apply', doc: '신청서', viewOnly: null, parking: 249 }),
    ], { applyRequired: true, filed: all, receivedOn: RECEIVED });
    expect(r).toMatchObject({ basis: { value: 249, from: '건축물대장' }, consult: 249, apply: 249, applyChecked: true, issues: [] });
  });

  it('광혜원원림 — 건축물대장에 주차면이 없으면 같은 칸(한 파일)의 K-apt 가 기준이다', () => {
    const r = judgeParking([
      read({ file: '건축물대장+kapt.pdf', parking: null }),
      read({ file: '건축물대장+kapt.pdf', doc: 'K-apt', viewOnly: null, parking: 90 }),
      read({ file: 'c.pdf', slot: 'consult', doc: '결과서', viewOnly: null, parking: 90 }),
    ], { applyRequired: false, filed: { bldgreg: true, consult: true, apply: false }, receivedOn: RECEIVED });
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
    ], { applyRequired: true, filed: all, receivedOn: RECEIVED });
    expect(keys(r)).toEqual(['view-only']);
    expect(r.basis?.value).toBe(198);
  });

  it('건축물대장에 주차면이 없고 K-apt·공문도 없으면 받칠 것을 달라고 한다', () => {
    const r = judgeParking([
      read({ parking: null }),
      read({ file: 'c.pdf', slot: 'consult', doc: '결과서', viewOnly: null, parking: 120 }),
    ], { applyRequired: false, filed: { bldgreg: true, consult: true, apply: false }, receivedOn: RECEIVED });
    expect(keys(r)).toEqual(['no-basis']);
    expect(r.basis).toBeNull();
  });

  it('건축물대장에 주차면이 있으면 K-apt 가 달라도 기준은 건축물대장이다', () => {
    const r = judgeParking([
      read({ parking: 249 }),
      read({ doc: 'K-apt', viewOnly: null, parking: 250 }),
      read({ file: 'c.pdf', slot: 'consult', doc: '결과서', viewOnly: null, parking: 249 }),
    ], { applyRequired: false, filed: { bldgreg: true, consult: true, apply: false }, receivedOn: RECEIVED });
    expect(r.basis).toEqual({ value: 249, from: '건축물대장' });
    expect(r.issues).toEqual([]);
  });

  it('결과서·신청서가 기준과 다르면 어긋남 — 기준이 없으면 둘끼리라도 견준다', () => {
    const diff = judgeParking([
      read({ parking: 249 }),
      read({ file: 'c.pdf', slot: 'consult', doc: '결과서', viewOnly: null, parking: 248 }),
      read({ file: 'p.pdf', slot: 'apply', doc: '신청서', viewOnly: null, parking: 250 }),
    ], { applyRequired: true, filed: all, receivedOn: RECEIVED });
    expect(diff.issues.map((i) => i.text)).toEqual([
      '결과서 248면 ≠ 건축물대장 249면', '설치신청서 250면 ≠ 건축물대장 249면',
    ]);
    const noBasis = judgeParking([
      read({ parking: null }),
      read({ file: 'c.pdf', slot: 'consult', doc: '결과서', viewOnly: null, parking: 120 }),
      read({ file: 'p.pdf', slot: 'apply', doc: '신청서', viewOnly: null, parking: 121 }),
    ], { applyRequired: true, filed: all, receivedOn: RECEIVED });
    expect(keys(noBasis)).toEqual(['no-basis', 'apply-diff']);
    expect(noBasis.issues[1].text).toBe('설치신청서 121면 ≠ 결과서 120면');
  });

  it('장마다 다르면 기준을 세우지 않는다 · 건축물대장이 없으면 짚는다 · 빠진 서류와 못 읽은 서류를 가른다', () => {
    expect(keys(judgeParking([read({ parking: 249 }), read({ file: 'b.pdf', parking: 250 })], {
      applyRequired: false, filed: { bldgreg: true, consult: false, apply: false }, receivedOn: RECEIVED,
    }))).toEqual(['split', 'no-consult']);
    const onlyKapt = judgeParking([read({ doc: 'K-apt', viewOnly: null, parking: 90 })], {
      applyRequired: true, filed: { bldgreg: true, consult: true, apply: false }, receivedOn: RECEIVED,
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
    ], { applyRequired: false, filed: all, receivedOn: RECEIVED });
    expect(r.applyChecked).toBe(true);
    expect(keys(r)).toEqual(['apply-diff']);
  });
});

describe('건축물대장 대조 — 계약 확인의 조건', () => {
  const base: ParkingCheck = {
    checkedAt: '2026-10-16T01:00:00.000Z', files: ['a', 'b'], reads: [], basis: null,
    consult: null, apply: null, applyChecked: false, issued: null, issues: [], unread: [], version: PARKING_CHECK_VERSION,
  };
  const flagged = { ...base, issues: [{ key: 'view-only' as const, text: '열람용' }] };
  const accepted = { by: '한백', at: 'x' };
  const block = (check: ParkingCheck | null, currentFiles = ['a', 'b'], receivedOn = RECEIVED) =>
    parkingBlocker({ needed: true, check, currentFiles, receivedOn });

  it('대조 전 · 서류 바뀜 · 짚을 것 남음은 막고, 넘겼거나 맞으면 연다 · 이관 현장은 보지 않는다', () => {
    expect(block(null, ['a'])).toBe('건축물대장 대조 전');
    expect(block(base, ['a'])).toBe('건축물대장 대조 서류 바뀜 — 다시 대조');
    expect(block(flagged, ['b', 'a'])).toBe('건축물대장 대조 1건 미확인');
    expect(block({ ...flagged, accepted })).toBeNull();
    expect(block(base)).toBeNull();
    expect(parkingBlocker({ needed: false, check: null, currentFiles: [], receivedOn: RECEIVED })).toBeNull();
  });

  it('견주는 것이 늘기 전의 결과는 맞음이어도, 넘겼어도 다시 대조 — 안 본 것을 단추에 적는다', () => {
    expect(block({ ...base, version: undefined })).toBe('건축물대장 다시 대조 — 주소·발급일 확인 추가');
    expect(block({ ...flagged, version: 1, accepted })).toBe('건축물대장 다시 대조 — 주소·발급일 확인 추가');
    expect(block({ ...base, version: 2 })).toBe('건축물대장 다시 대조 — 발급일 확인 추가');
    expect(block({ ...flagged, version: 2, accepted })).toBe('건축물대장 다시 대조 — 발급일 확인 추가');
  });

  it('발급일을 견준 뒤 계약접수일을 고치면 다시 대조 — 넘긴 것도 그 날짜로 본 것이다 · 견준 발급일이 없으면 상관없다', () => {
    const judged = { ...base, issued: { receivedOn: RECEIVED, from: '2026-07-16', oldest: '2026-10-02', ok: true } };
    expect(block(judged)).toBeNull();
    expect(block(judged, ['a', 'b'], '2026-10-20')).toBe('건축물대장 다시 대조 — 계약접수일 바뀜');
    expect(block({ ...judged, issues: flagged.issues, accepted }, ['a', 'b'], '2026-10-20'))
      .toBe('건축물대장 다시 대조 — 계약접수일 바뀜');
    expect(block(base, ['a', 'b'], '2026-10-20')).toBeNull();
  });

  it('건축물대장 칸의 반려 사유 — 열람용이 먼저 · 발급일이 오래됐으면 받을 날을 적는다 · 지금 서류·지금 계약접수일로 돈 결과만', () => {
    expect(registerRejectOf(flagged, ['a', 'b'], RECEIVED)).toEqual({ label: '열람용', reason: VIEW_ONLY_REASON });
    expect(registerRejectOf(flagged, ['a', 'c'], RECEIVED)).toBeNull();
    expect(registerRejectOf(base, ['a', 'b'], RECEIVED)).toBeNull();
    expect(registerRejectOf(null, ['a', 'b'], RECEIVED)).toBeNull();

    const old: ParkingCheck = {
      ...base,
      issued: { receivedOn: '2026-10-01', from: '2026-07-01', oldest: '2026-06-15', ok: false },
      issues: [{ key: 'issued-old', text: '…' }],
    };
    expect(registerRejectOf(old, ['a', 'b'], '2026-10-01')).toEqual({
      label: '발급일 3개월 넘음',
      reason: '건축물대장 발급일(2026-06-15)이 계약접수일(2026-10-01)로부터 3개월이 넘었습니다 — '
        + '2026-07-01 이후에 발급한 건축물대장으로 다시 올려주세요.',
    });
    expect(registerRejectOf(old, ['a', 'b'], '2026-09-10')).toBeNull();
  });
});

describe('건축물대장 대조 — 발급일(계약접수일로부터 3개월 안)', () => {
  const consult = read({ file: 'c.pdf', slot: 'consult', doc: '결과서', viewOnly: null, parking: 249 });
  const apply = read({ file: 'p.pdf', slot: 'apply', doc: '신청서', viewOnly: null, parking: 249 });
  const judge = (regs: Partial<ParkingRead>[], receivedOn: string) =>
    judgeParking([...regs.map((r, i) => read({ file: `r${i}.pdf`, parking: 249, ...r })), consult, apply], {
      applyRequired: true, filed: all, receivedOn,
    });

  it('계약접수일의 3개월 전 같은 날까지 받는다 — 하루라도 이르면 짚는다', () => {
    expect(judge([{ issued: '2026-07-30' }], '2026-10-30')).toMatchObject({
      issued: { receivedOn: '2026-10-30', from: '2026-07-30', oldest: '2026-07-30', ok: true }, issues: [],
    });
    const late = judge([{ issued: '2026-07-29' }], '2026-10-30');
    expect(late.issued).toMatchObject({ oldest: '2026-07-29', ok: false });
    expect(late.issues).toEqual([{
      key: 'issued-old', text: '건축물대장 발급일 2026-07-29 — 계약접수일(2026-10-30)로부터 3개월이 넘었습니다',
    }]);
  });

  it('달 끝 — 5월 31일 접수는 2월 28일 발급까지 받는다(3월로 넘치지 않는다)', () => {
    expect(judge([{ issued: '2026-02-28' }], '2026-05-31').issues).toEqual([]);
    expect(judge([{ issued: '2026-02-27' }], '2026-05-31').issues.map((i) => i.key)).toEqual(['issued-old']);
  });

  it('개봉두산 — 2025년 발급분은 2026년 접수에 짚는다 · 계약접수일 뒤에 새로 뗀 것은 맞다', () => {
    expect(judge([{ issued: '2025-06-11' }], '2026-10-01').issues.map((i) => i.key)).toEqual(['issued-old']);
    expect(judge([{ issued: '2026-10-29' }], '2026-07-01').issues).toEqual([]);
  });

  it('장마다 따로 뗐으면 가장 이른 장이 정한다 · 발급일 없는 장(뒤쪽만 떼어 온 파일)은 다른 장이 읽혔으면 짚지 않는다', () => {
    expect(judge([{ issued: '2026-09-03' }, { issued: '2026-06-19' }], '2026-10-01').issued)
      .toMatchObject({ oldest: '2026-06-19', ok: false });
    expect(judge([{ issued: '2026-09-03' }, { issued: null }], '2026-10-01').issues).toEqual([]);
  });

  it('발급일을 하나도 못 읽으면 확인 필요로 짚는다', () => {
    const r = judge([{ issued: null }], '2026-10-01');
    expect(r.issued).toEqual({ receivedOn: '2026-10-01', from: '2026-07-01', oldest: null, ok: null });
    expect(r.issues).toEqual([{ key: 'no-issued', text: '건축물대장에서 발급일을 읽지 못했습니다' }]);
  });

  it('열람용은 열람용으로만 짚는다(찍힌 「발급일」은 출력한 날이다) · 발급용이 같이 있으면 그것으로 가른다 · 건축물대장이 없으면 견줄 것이 없다', () => {
    const viewOnly = judge([{ viewOnly: true, issued: '2025-11-25' }], '2026-10-01');
    expect(viewOnly.issues.map((i) => i.key)).toEqual(['view-only']);
    expect(viewOnly.issued).toBeNull();
    expect(judge([{ viewOnly: true, issued: null }, { issued: '2026-09-01' }], '2026-10-01').issued)
      .toMatchObject({ oldest: '2026-09-01', ok: true });
    expect(judge([], '2026-10-01').issued).toBeNull();
  });
});

describe('주차면 판독의 답 다듬기', () => {
  const files = [
    { name: '광혜원_건축물대장+kapt.pdf', slot: 'bldgreg' as const },
    { name: '결과서.pdf', slot: 'consult' as const },
  ];
  it('이름은 보낸 것 중 하나로 · 종류는 정해진 것 중 하나로 · 열람용·발급일은 건축물대장만 · 「249면」은 숫자로', () => {
    expect(parkingReadsOf({ docs: [
      {
        originalName: '광혜원_건축물대장+kapt.pdf', doc: '건축물대장', viewOnly: false, parking: null,
        address: ' 충청북도 진천군 광혜원면 화랑6길 13 ', otherAddresses: ['충청북도 진천군 광혜원면 화랑6길 15', '', 3],
        issued: '2026년 10월 7일',
      },
      {
        originalName: '광혜원_건축물대장+kapt.pdf', doc: 'K-apt', viewOnly: true, parking: '90', address: '광혜원리 418-2',
        issued: '2026-10-07',
      },
      { originalName: '결과서', doc: '결과서', parking: '249면', address: '광양읍 예구1길 8' },
      { originalName: '모르는.pdf', doc: '건축물대장', parking: 1 },
      { originalName: '결과서.pdf', doc: '등기부', parking: 0 },
    ] }, files)).toEqual([
      {
        file: '광혜원_건축물대장+kapt.pdf', slot: 'bldgreg', doc: '건축물대장', viewOnly: false, parking: null,
        address: '충청북도 진천군 광혜원면 화랑6길 13', otherAddresses: ['충청북도 진천군 광혜원면 화랑6길 15'], issued: '2026-10-07',
      },
      // 주소는 건축물대장·신청서만 — K-apt·결과서의 주소는 버린다. 발급일은 건축물대장만
      {
        file: '광혜원_건축물대장+kapt.pdf', slot: 'bldgreg', doc: 'K-apt', viewOnly: null, parking: 90,
        address: null, otherAddresses: [], issued: null,
      },
      { file: '결과서.pdf', slot: 'consult', doc: '결과서', viewOnly: null, parking: 249, address: null, otherAddresses: [], issued: null },
      { file: '결과서.pdf', slot: 'consult', doc: '기타', viewOnly: null, parking: null, address: null, otherAddresses: [], issued: null },
    ]);
    expect(parkingReadsOf(null, files)).toEqual([]);
  });

  /*
   * 창동서울가든 2026-10-21 — 맥에서 올린 이름은 자모로 풀린 꼴(NFD)이고 판독은 붙은 꼴(NFC)로 답한다. 글자 그대로 견줘
   * 건축물대장·결과서가 「못 읽은 파일」로 버려지고 콘솔이 만든 신청서(NFC)만 남았다.
   */
  it('자모로 풀린 이름(NFD)도 판독이 붙은 꼴로 답한 것과 같은 파일이다 — 되짚는 이름은 저장된 그대로', () => {
    const nfd = [
      { name: '서울가든아파트 건축물대장.pdf'.normalize('NFD'), slot: 'bldgreg' as const },
      { name: '사전현장컨설팅결과서_창동서울가든_아파트.pdf'.normalize('NFD'), slot: 'consult' as const },
      { name: '설치신청서.pdf', slot: 'apply' as const },
    ];
    const reads = parkingReadsOf({ docs: [
      { originalName: '서울가든아파트 건축물대장.pdf', doc: '건축물대장', viewOnly: false, parking: 310 },
      { originalName: '사전현장컨설팅결과서_창동서울가든_아파트', doc: '결과서', parking: 310 },
      { originalName: '설치신청서.pdf', doc: '신청서', parking: 310 },
    ] }, nfd);
    expect(reads.map((r) => [r.file, r.slot])).toEqual(nfd.map((f) => [f.name, f.slot]));
  });
});

describe('판독이 답한 이름 되짚기', () => {
  const names = ['서울가든아파트 건축물대장.pdf'.normalize('NFD'), '결과서.pdf'];
  it('NFC·NFD 를 가리지 않고 · 띄어쓰기를 빼고 · 확장자를 뗀 답도 · 모르는 이름과 빈 답은 null', () => {
    expect(nameOfAnswer(names, '서울가든아파트 건축물대장.pdf')).toBe(names[0]);
    expect(nameOfAnswer(names, '서울가든아파트건축물대장.pdf')).toBe(names[0]);
    expect(nameOfAnswer(names, '결과서')).toBe('결과서.pdf');
    expect(nameOfAnswer(names, '등기부.pdf')).toBeNull();
    expect(nameOfAnswer(names, null)).toBeNull();
    expect(nameOfAnswer(names, '  ')).toBeNull();
  });
  it('판독에게는 붙은 꼴로 보인다', () => {
    expect(shownName(names[0])).toBe('서울가든아파트 건축물대장.pdf'.normalize('NFC'));
  });
});

describe('건축물대장 대조 — 신청서 주소', () => {
  it('도로명 주소의 열쇠는 「도로명 + 건물번호」 — 시·도 이름·읍면·참고항목·건물 이름이 달라도 같다', () => {
    expect(roadKeyOf('전남광주통합특별시 광양시 광양읍 예구1길 8')).toBe('예구1길 8');
    expect(roadKeyOf('전라남도 광양시 예구1길 8, 영신그린빌')).toBe('예구1길 8');
    expect(roadKeyOf('전북특별자치도 전주시 완산구 영경1길 20(중화산동2가)')).toBe('영경1길 20');
    expect(roadKeyOf('경기도 부천시 원미구 길주로411번길 20 (춘의동)')).toBe('길주로411번길 20');
    expect(roadKeyOf('충청북도 청주시 흥덕구 대농로 47-2')).toBe('대농로 47-2');
    expect(roadKeyOf('서울특별시 중구 세종대로 지하 2')).toBe('세종대로 2');
    expect(roadKeyOf('광양읍 예구1길8')).toBe('예구1길 8');
  });
  it('지번 주소는 도로명이 아니다', () => {
    for (const a of ['충청북도 진천군 광혜원면 광혜원리 418-2', '충청북도 청주시 흥덕구 복대동 288-126',
      '전북특별자치도 전주시 완산구 중화산동2가 232', '경기도 부천시 원미구 춘의동 73-1']) {
      expect(isRoadAddress(a), a).toBe(false);
    }
    expect(isRoadAddress(null)).toBe(false);
  });

  const reg = (address: string | null, otherAddresses: string[] = []) =>
    read({ parking: 249, address, otherAddresses });
  const consult = read({ file: 'c.pdf', slot: 'consult', doc: '결과서', viewOnly: null, parking: 249 });
  const apply = (address: string | null) =>
    read({ file: 'p.pdf', slot: 'apply', doc: '신청서', viewOnly: null, parking: 249, address });
  const judge = (reads: ParkingRead[]) => judgeParking(reads, { applyRequired: true, filed: all, receivedOn: RECEIVED });

  it('영신그린빌 — 신청서와 건축물대장의 도로명주소가 같으면 맞음(시·도 이름이 달라도)', () => {
    const r = judge([reg('전라남도 광양시 광양읍 예구1길 8'), consult, apply('전남광주통합특별시 광양시 광양읍 예구1길 8')]);
    expect(r.address).toEqual({
      apply: '전남광주통합특별시 광양시 광양읍 예구1길 8', register: '전라남도 광양시 광양읍 예구1길 8', road: true, match: true,
    });
    expect(r.issues).toEqual([]);
  });
  it('광혜원원림 — 동별 도로명주소(화랑6길 15)와 같아도 맞음', () => {
    const r = judge([reg('충청북도 진천군 광혜원면 화랑6길 13', ['충청북도 진천군 광혜원면 화랑6길 15']), consult,
      apply('충청북도 진천군 광혜원면 화랑6길 15')]);
    expect(r.address?.match).toBe(true);
    expect(r.issues).toEqual([]);
  });
  it('신청서가 지번 주소면 짚는다 — 건축물대장과 견주지도 않는다', () => {
    const r = judge([reg('충청북도 진천군 광혜원면 화랑6길 13'), consult, apply('충청북도 진천군 광혜원면 광혜원리 418-2')]);
    expect(r.issues.map((i) => i.text)).toEqual(['설치신청서 주소가 도로명 주소가 아닙니다 — 「충청북도 진천군 광혜원면 광혜원리 418-2」']);
    expect(r.address).toMatchObject({ road: false, match: null });
  });
  it('도로명이 다르면 어긋남 · 신청서 주소를 못 읽으면 · 건축물대장 도로명주소를 못 읽으면 짚는다', () => {
    expect(judge([reg('전라남도 광양시 광양읍 예구1길 8'), consult, apply('전라남도 광양시 광양읍 예구1길 10')])
      .issues.map((i) => i.key)).toEqual(['address-diff']);
    expect(judge([reg('전라남도 광양시 광양읍 예구1길 8'), consult, apply(null)]).issues.map((i) => i.key))
      .toEqual(['no-apply-address']);
    expect(judge([reg(null), consult, apply('전라남도 광양시 광양읍 예구1길 8')]).issues.map((i) => i.key))
      .toEqual(['no-register-address']);
  });
  it('신청서를 견주지 않는 현장은 주소도 보지 않는다 · 신청서가 아예 없으면 「없습니다」 한 번만', () => {
    const noApplyFiled = { bldgreg: true, consult: true, apply: false };
    expect(judgeParking([reg('예구1길 8'), consult], { applyRequired: false, filed: noApplyFiled, receivedOn: RECEIVED }).address)
      .toBeNull();
    const noApply = judgeParking([reg('예구1길 8'), consult], { applyRequired: true, filed: noApplyFiled, receivedOn: RECEIVED });
    expect(noApply.issues.map((i) => i.key)).toEqual(['no-apply']);
  });
});

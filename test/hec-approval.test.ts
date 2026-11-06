/**
 * 현대엔지니어링 설치승인서 검증 (lib/hec-approval · 한백 2026-11-06 「파일이 설치승인서가 맞는지도 검증해주는 단계가 필요할듯」).
 * 슬라이드 XML 은 실제 양식의 모양(제목 문단 + 「주요 현장 정보」 표)을 줄여 지었다 — 이름 · 주소는 지어낸 것이다.
 * 실제 파일 142개로 돌린 결과는 lib/hec-approval 머리말에 있다.
 */
import { describe, expect, it } from 'vitest';
import {
  approvalReadOf, hasApprovalTitle, judgeApproval, readApprovalSlide, readApprovalSlides, readApprovalText, type ApprovalRead,
} from '@/lib/hec-approval';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const para = (t: string) => `<a:p><a:r><a:rPr lang="ko-KR"/><a:t>${esc(t)}</a:t></a:r></a:p>`;
const cell = (t: string) => `<a:tc><a:txBody><a:bodyPr/>${t ? para(t) : '<a:p><a:endParaRPr/></a:p>'}</a:txBody><a:tcPr/></a:tc>`;
const table = (rows: string[][]) => `<a:tbl>${rows.map((r) => `<a:tr h="1">${r.map(cell).join('')}</a:tr>`).join('')}</a:tbl>`;

/** 양식 첫 장 — 표 맨 위 줄의 완속 · 급속 기수, 아래 시공정보 표(지상 · 지하 기수), 현장 정보 표 */
function approvalSlide(o: { name: string; addr: string; slow: string; fast?: string; title?: string }): string {
  return `<p:sld><p:cSld><p:spTree>
    <p:sp><p:txBody>${para(o.title ?? '전기차 충전기 설치 신청·승인서')}${para('EVC사업팀')}</p:txBody></p:sp>
    <p:graphicFrame>${table([
      ['충전기 종류', '설치 기수', '주차면수 비중', '계약 기간', '충전 단가'],
      ['완속', o.slow, '%', '7년', '290원'],
      ['급속', o.fast ?? '-', '-', '-', '-'],
    ])}</p:graphicFrame>
    <p:graphicFrame>${table([['신규', '교체'], ['지상', '지하'], ['4기', '3기'], ['-기', '-']])}</p:graphicFrame>
    <p:graphicFrame>${table([['주용도', 'APT'], ['현장명', o.name, '주소(상세)', o.addr]])}</p:graphicFrame>
  </p:spTree></p:cSld></p:sld>`;
}
const photoSlide = `<p:sld><p:cSld><p:spTree><p:sp><p:txBody>${para('첨부 : 현장사진')}</p:txBody></p:sp></p:spTree></p:cSld></p:sld>`;

const SITE = { name: '광주 남구 한백신학교', addr: '광주광역시 남구 제중로 77', qty: 4 };
const read = (o: Partial<ApprovalRead>): ApprovalRead =>
  ({ form: true, name: '한백신학교', addr: '광주광역시 남구 제중로 77', qty: 4, blank: false, text: null, ...o });

describe('양식 쪽 읽기 (readApprovalSlide · readApprovalSlides)', () => {
  it('표의 이름 칸 다음 칸이 값이다 — 기수는 맨 위 표의 완속 + 급속(아래 지상 · 지하 기수는 안 본다)', () => {
    const r = readApprovalSlide(approvalSlide({ name: '한백신학교', addr: '광주광역시 남구 제중로 77', slow: '4기' }));
    expect(r).toMatchObject({ form: true, name: '한백신학교', addr: '광주광역시 남구 제중로 77', qty: 4, blank: false });
    expect(readApprovalSlide(approvalSlide({ name: '가', addr: '나', slow: '3기', fast: '1기' })).qty).toBe(4);
  });

  it('상가 현장들은 「기」 없이 숫자만 적었다 — 그것도 읽는다', () => {
    expect(readApprovalSlide(approvalSlide({ name: '한백 상가', addr: '경기도 시흥시 한백길 19', slow: '2' })).qty).toBe(2);
  });

  it('빈 양식(현장명 없음 · 「00기」)', () => {
    expect(readApprovalSlide(approvalSlide({ name: '', addr: '', slow: '00기' })).blank).toBe(true);
    expect(readApprovalSlide(approvalSlide({ name: '한백신학교', addr: '광주광역시 남구 제중로 77', slow: '00기' })).blank).toBe(true);
  });

  it('제목이 있는 장을 찾는다 — 사진 장이 앞에 있어도 · 어느 장에도 없으면 양식 아님 · 글자가 없으면 못 읽음', () => {
    const slide = approvalSlide({ name: '한백신학교', addr: '광주광역시 남구 제중로 77', slow: '4기' });
    expect(readApprovalSlides([photoSlide, slide])).toMatchObject({ form: true, name: '한백신학교' });
    expect(readApprovalSlides([photoSlide]).form).toBe(false);
    expect(readApprovalSlides(['<p:sld><p:cSld><p:spTree/></p:cSld></p:sld>']).form).toBeNull();
  });

  it('제목의 여러 꼴 — 가운뎃점(pptx) · 「•」(PDF 로 내보낸 글자층) · 띄어쓰기 · 가운뎃점 없음', () => {
    expect(hasApprovalTitle('전기차 충전기 설치 신청·승인서')).toBe(true);
    expect(hasApprovalTitle('전기차 충전기 설치 신청 • 승인서')).toBe(true);
    expect(hasApprovalTitle('25년도 전기차 충전기 설치신청승인서')).toBe(true);
    expect(hasApprovalTitle('전기차 충전기 설치 승낙서')).toBe(false);
  });

  it('워드 · 한글 · 엑셀은 제목만 본다', () => {
    expect(readApprovalText('설치 승낙서\n아래 장소에 충전기 설치를 승낙합니다').form).toBe(false);
    expect(readApprovalText('').form).toBeNull();
  });
});

describe('판독의 답 (approvalReadOf)', () => {
  it('양식이 아니면 나머지를 버린다 · 못 읽으면 null', () => {
    expect(approvalReadOf({ form: false, name: '엉뚱' })).toMatchObject({ form: false, name: null });
    expect(approvalReadOf({ form: null }).form).toBeNull();
    expect(approvalReadOf('엉뚱한 답').form).toBeNull();
  });

  it('칸 글자를 기수로 · 「00기」는 빈 양식', () => {
    expect(approvalReadOf({ form: true, name: '한백신학교', addr: '주소', slow: '4기', fast: '-' })).toMatchObject({ qty: 4, blank: false });
    expect(approvalReadOf({ form: true, name: null, addr: null, slow: '00기', fast: null }).blank).toBe(true);
  });
});

describe('그 현장과 견주기 (judgeApproval)', () => {
  it('맞으면 빈 목록', () => {
    expect(judgeApproval(read({}), SITE)).toEqual([]);
  });

  it('① 양식이 아니다 · ② 빈 양식 — 막는다 / 못 읽음 — 확인 필요', () => {
    expect(judgeApproval(read({ form: false }), SITE)).toEqual([expect.objectContaining({ level: 'block', why: expect.stringContaining('양식이 아닙니다') })]);
    expect(judgeApproval(read({ blank: true }), SITE)).toEqual([expect.objectContaining({ level: 'block', why: expect.stringContaining('빈 양식') })]);
    expect(judgeApproval(read({ form: null }), SITE)).toEqual([expect.objectContaining({ level: 'warn' })]);
  });

  it('③ 주소는 도로명 열쇠로 — 띄어쓰기가 달라도 같은 곳 · 이름이 달라도 주소가 같으면 이 현장', () => {
    const site = { name: '경북 포항 한백아파트', addr: '경상북도 포항시 북구 한백로88번길 8', qty: 3 };
    expect(judgeApproval(read({ name: '포항 시영한백아파트', addr: '경상북도 포항시 북구 한백로 88번길 8(장성동)', qty: 3 }), site)).toEqual([]);
    expect(judgeApproval(read({ name: '라온705', addr: '경기도 용인시 기흥구 한백로 134-24', qty: 4 }),
      { name: '경기 용인 한백에이치엠(스윙쉐프)', addr: '경기도 용인시 기흥구 한백로 134-24', qty: 4 })).toEqual([]);
  });

  it('③ 둘 다 도로명이고 다르며 이름도 다르면 다른 현장 — 막는다(번호 앞머리가 같아도 다르다)', () => {
    const other = judgeApproval(read({ name: '한백타운', addr: '부산광역시 영도구 한백로 700번길 19' }), SITE);
    expect(other).toEqual([expect.objectContaining({ level: 'block', why: expect.stringContaining('다른 현장') })]);
    expect(other[0].why).toContain('콘솔 주소 「광주광역시 남구 제중로 77」');
    expect(judgeApproval(read({ name: '한백타운', addr: '광주광역시 남구 제중로 771' }), SITE)[0]?.level).toBe('block');
  });

  it('③ 주소가 달라도 이름이 같으면 이 현장 — 콘솔 이름 앞의 지역은 붙어 있다', () => {
    expect(judgeApproval(read({ addr: '광주광역시 남구 제중로 79' }), SITE)).toEqual([]);
  });

  it('③ 한쪽이 지번이면 가리지 못한다 — 확인 필요(지번끼리 같으면 이 현장)', () => {
    const site = { name: '경북 구미 한백타운', addr: '경상북도 구미시 상모동 76-1', qty: 8 };
    expect(judgeApproval(read({ name: '우방타운2단지', addr: '경상북도 구미시 상모동 76-1', qty: 8 }), site)).toEqual([]);
    expect(judgeApproval(read({ name: '우방타운2단지', addr: '경북 구미시 상모동 77', qty: 8 }), site))
      .toEqual([expect.objectContaining({ level: 'warn', why: expect.stringContaining('가리지 못했습니다') })]);
  });

  it('④ 기수가 다르면 확인 필요 — 막지 않는다 · 콘솔 기수가 0 이면 견주지 않는다', () => {
    expect(judgeApproval(read({ qty: 3 }), SITE)).toEqual([{ level: 'warn', why: '기수가 다릅니다 — 승인서 3기 · 콘솔 4기' }]);
    expect(judgeApproval(read({ qty: 3 }), { ...SITE, qty: 0 })).toEqual([]);
    expect(judgeApproval(read({ qty: null }), SITE)).toEqual([]);
  });

  it('pptx 는 글자 전부에서도 콘솔 주소를 찾는다 — 표의 주소 칸이 줄을 나눠도', () => {
    const slide = approvalSlide({ name: '한백신학교', addr: '광주광역시 남구\n제중로 77', slow: '4기' });
    expect(judgeApproval(readApprovalSlide(slide), SITE)).toEqual([]);
  });
});

/**
 * 플러그링크 패스스루 집행 글 (lib/agit/passthru · passthru-read) — 한백 2026-11-28.
 * ★값은 다 지어낸 것이다★ — 공개 저장소라 실제 거래처 · 금액 · 계좌를 적지 않는다(모양만 한백사업내역리스트 그대로).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import {
  agitPassthruBundleOf, agitPassthruPostOf, excelDayOf, latestPassthruRound, ledgerInDateOf, passthruDayOf, passthruReadOf, passthruRemindDue,
  passthruRemindKey, passthruRemindPlan, purchaseRoundOf, type AgitPassthruInput, type Cell, type PassthruBook, type SheetRow,
} from '@/lib/agit/passthru';
import { passthruBookOf, passthruSheetBrief } from '@/lib/agit/passthru-read';
import { sheetText } from '@/lib/agents/file-text';
import {
  AGIT_CC, AGIT_PASSTHRU_KIND, AGIT_POST_KINDS, AGIT_URGENT_TAG, agitKindOf, agitPostedSay, agitPostName, agitTemplateOf, agitTitleOf,
  isPayoutKind,
} from '@/lib/agit/post';
import { agitEditorDocOf, CC_MARK, IMG_MARK } from '@/lib/agit/editor-doc';
import { purchaseXlsx } from '@/lib/agit/purchase-xlsx';

const TEMPLATE = new Uint8Array(readFileSync('lib/agit/purchase-template.xlsx'));
/** 2026-11-27 (금) — 엑셀의 날 수 */
const NOV27 = 46353;
const row = (r: number, c: Record<string, Cell>): SheetRow => ({ r, c });

/** 지어낸 한백사업내역리스트 — 97차(지난 차) · 98차(이번 차: 가나전기 둘 · 한백 하나 · 다라이브이 하나) */
const BOOK: PassthruBook = {
  purchase: [
    row(1, { B: '매입내역' }),
    row(2, { B: '차수', C: '거래처', D: '구분', E: '공급가', F: '부가세', G: '합계금액', H: '은행', I: '계좌', J: '예금주', L: '지급일' }),
    row(5, { B: 'HB97차', C: '가나전기', D: '준공', E: 700_000, F: 70_000, G: 770_000, H: '가상은행', I: '000-00-0001', J: '가나전기', L: 46323 }),
    row(6, { B: 'HB97차 지급액', E: 700_000, F: 70_000, G: 770_000 }),
    row(10, { B: 'HB98차', C: '가나전기', D: '준공', E: 1_000_000, F: 100_000, G: 1_100_000, H: '가상은행', I: '000-11-2222', J: '가나전기', L: NOV27 }),
    row(11, { B: 'HB98차_1', C: '㈜한백', D: '준공', E: 500_000, F: 50_000, G: 550_000, H: '가상은행', I: '999-99-9999', J: '한백', L: NOV27 }),
    /* 계좌가 빈 줄 — 같은 거래처의 다른 줄에서 빌린다(10월 HB30차_2 가 그랬다) */
    row(12, { B: 'HB98차_2', C: '가나전기', D: '하자보수비', E: 200_000, F: 20_000, G: 220_000, L: NOV27 }),
    /* 부가세에 떠도는 소수 자리 — 원 단위로 */
    row(13, { B: 'HB98차_3', C: '다라이브이', D: '추가공사비', E: 300_000, F: 30_000.4, G: 330_000, H: '나라은행', I: '111-222-333333', J: '다라이브이', L: NOV27 }),
    row(14, { B: 'HB98차 지급액', E: 2_000_000, F: 200_000, G: 2_200_000 }),
  ],
  epc: [
    row(1, { A: 'EPC사업내역리스트' }),
    row(3, { A: '해당년도', B: '해당월', D: '차수', E: '하도급사', Y: '잔금 세금계산서', AB: '금회기성', AC: '금회 기성' }),
    row(5, { A: '2026', B: '10월', D: '97차', Y: 800_000, AB: 700_000 }),
    row(6, { A: '2026', B: '11월', D: '98차', Y: 1_500_000, AB: 1_200_000 }),
    row(7, { A: '2026년', B: 11, D: '98차_1', Y: 900_000, AB: 800_000 }),
  ],
  /* 총괄 — 표 셋이 나란히(매출내역 B~ · 수금내역 P~ · 매입내역 X~). 수금내역의 「구분」은 「수금일자」 왼쪽에서 가장 가까운 것이다 —
     매출내역의 「구분」(B · C)에 같은 차가 다른 줄로 서 있어도 그것을 보지 않는다 */
  ledger: [
    row(2, { B: '1) HB기준 매출내역', P: '2) HB기준 수금내역', X: '3) HB기준 매입내역' }),
    row(4, { B: '구분', C: '구분', I: '계산서 발행', P: '구분', Q: '거래처', R: '수금일자', X: '구분' }),
    row(6, { B: 'HB98', I: 46340, P: 'HB97', Q: '플러그링크', R: 46322 }),
    row(7, { B: 'HB97', P: 'HB98', Q: '플러그링크', R: 46352 }),
    /* 같은 차의 정산 줄 — 입금 예정일이 아니다 */
    row(8, { P: 'HB98_1', Q: '플러그링크', R: 46356 }),
  ],
};
const SHEET = { url: 'https://x.private.blob.vercel-storage.com/agent-files/settlement/a/sheet.xlsx', name: '한백사업내역리스트.xlsx' };
const INV = { url: 'https://x.private.blob.vercel-storage.com/agent-files/settlement/b/inv.pdf', name: '가나전기 세금계산서.pdf' };
const INV2 = { url: 'https://x.private.blob.vercel-storage.com/agent-files/settlement/c/inv.pdf', name: '가나전기 세금계산서.pdf' };

const inputOf = (over: Partial<AgitPassthruInput> = {}): AgitPassthruInput => {
  const r = passthruReadOf(BOOK);
  return { round: r.round, month: r.month, receive: r.receive, inDate: null, rows: r.rows, sheet: SHEET, attach: [], ...over };
};

describe('엑셀 읽기 — 매입내역 · EPC사업내역리스트', () => {
  it('차수 · 날', () => {
    expect(purchaseRoundOf('HB31차')).toBe(31);
    expect(purchaseRoundOf('HB31차_2')).toBe(31);
    expect(purchaseRoundOf('HB31차 지급액')).toBeNull();
    expect(purchaseRoundOf('31차')).toBeNull();
    expect(excelDayOf(NOV27)).toBe('2026-11-27');
    expect(excelDayOf('2026.11.27')).toBe('2026-11-27');
    expect(excelDayOf('')).toBeNull();
    expect(latestPassthruRound(BOOK)).toBe(98);
  });

  it('가장 큰 차 — 받을 돈은 EPC 잔금 합 · 내려줄 줄은 한백 빼고 · 계좌 빈 줄은 같은 거래처에서 빌린다', () => {
    const r = passthruReadOf(BOOK);
    expect(r.round).toBe(98);
    expect(r.month).toBe('2026-11');
    expect(r.receive).toBe(2_400_000);
    expect(r.payDate).toBe('2026-11-27');
    expect(r.own).toEqual({ supply: 500_000, rows: 1 });
    expect(r.rows).toEqual([
      { label: 'HB98차_준공', org: '가나전기', what: '준공', supply: 1_000_000, vat: 100_000, bank: '가상은행', account: '000-11-2222', holder: '가나전기' },
      { label: 'HB98차_하자보수비', org: '가나전기', what: '하자보수비', supply: 200_000, vat: 20_000, bank: '가상은행', account: '000-11-2222', holder: '가나전기' },
      { label: 'HB98차_추가공사비', org: '다라이브이', what: '추가공사비', supply: 300_000, vat: 30_000, bank: '나라은행', account: '111-222-333333', holder: '다라이브이' },
    ]);
    expect(r.notes).toEqual(['가나전기 하자보수비(매입내역 12행)에 계좌가 없어 같은 거래처의 HB98차 줄(10행) 계좌를 썼습니다.']);
    /* 입금 예정일 — 총괄 수금내역의 HB98 줄 「수금일자」(정산 줄 HB98_1 · 매출내역의 HB98 줄이 아니다) */
    expect(r.inDate).toBe('2026-11-26');
  });

  it('지난 차를 고를 수 있다', () => {
    const r = passthruReadOf(BOOK, 97);
    expect(r).toMatchObject({
      round: 97, month: '2026-10', receive: 800_000, payDate: '2026-10-28', inDate: '2026-10-27', own: { supply: 0, rows: 0 },
    });
  });

  it('입금 예정일 — 총괄 시트 · 머리 · 그 차의 줄 · 날이 없으면 null(짓기는 막지 않는다)', () => {
    const head = row(4, { P: '구분', R: '수금일자' });
    expect(ledgerInDateOf(undefined, 98)).toBeNull();
    expect(ledgerInDateOf([row(4, { A: '구분', B: '거래처' }), row(7, { A: 'HB98', B: 46352 })], 98)).toBeNull();
    expect(ledgerInDateOf([row(4, { R: '수금일자', S: '구분' }), row(7, { R: 46352, S: 'HB98' })], 98)).toBeNull();
    expect(ledgerInDateOf([head, row(7, { P: 'HB98' })], 98)).toBeNull();
    expect(ledgerInDateOf([head, row(7, { P: 'HB98', R: '미정' })], 98)).toBeNull();
    expect(ledgerInDateOf([head, row(7, { P: 'HB98차', R: 46352 })], 98)).toBe('2026-11-26');
    expect(ledgerInDateOf([head, row(7, { P: 'HB 98', R: '2026.11.26' })], 98)).toBe('2026-11-26');
    expect(ledgerInDateOf([head, row(7, { P: 'HB98', R: 46352 })], 9)).toBeNull();
    expect(passthruReadOf({ purchase: BOOK.purchase, epc: BOOK.epc }).inDate).toBeNull();
  });

  it('막지 않고 짚는다 — EPC 금회기성 합이 매입내역 합과 다름 · 빌릴 계좌도 없음', () => {
    const book: PassthruBook = {
      purchase: [
        ...BOOK.purchase.filter((x) => x.r !== 13),
        row(13, { B: 'HB98차_3', C: '마바설비', D: '추가공사비', E: 300_000, F: 30_000, G: 330_000, L: NOV27 }),
      ],
      epc: BOOK.epc.map((x) => (x.r === 7 ? row(7, { ...x.c, AB: 700_000 }) : x)),
    };
    const r = passthruReadOf(book);
    expect(r.rows[2]).toMatchObject({ org: '마바설비', bank: null, account: null, holder: null });
    expect(r.notes).toContain('마바설비 추가공사비(매입내역 13행)에 계좌가 없습니다 — 엑셀의 은행 · 계좌가 「-」로 빕니다.');
    expect(r.notes).toContain('EPC사업내역리스트 98차 금회기성 합(1,900,000원)이 매입내역 HB98차 합(2,000,000원)과 다릅니다 — 엑셀을 한 번 봐 주세요.');
  });

  it('틀리면 짓지 않는다 — 없는 차 · 소계와 다름 · 금액 셈 · 지급일 둘 · 한백 줄만 · 받을 돈 없음 · 머리가 바뀜', () => {
    const swap = (r: number, c: Record<string, Cell> | null): PassthruBook => ({
      ...BOOK, purchase: BOOK.purchase.flatMap((x) => (x.r === r ? (c ? [row(r, c)] : []) : [x])),
    });
    expect(() => passthruReadOf(BOOK, 50)).toThrow('매입내역에 HB50차 줄이 없습니다');
    expect(() => passthruReadOf(swap(14, { B: 'HB98차 지급액', E: 1_999_000 }))).toThrow('「HB98차 지급액」(1,999,000원)과 HB98차 줄의 합(2,000,000원)이 다릅니다');
    expect(() => passthruReadOf(swap(13, { ...BOOK.purchase.find((x) => x.r === 13)!.c, G: 331_000 }))).toThrow('매입내역 13행(다라이브이)의 금액이 맞지 않습니다');
    expect(() => passthruReadOf(swap(13, { ...BOOK.purchase.find((x) => x.r === 13)!.c, L: NOV27 + 1 }))).toThrow('지급일이 다릅니다(2026-11-27 · 2026-11-28)');
    const onlyOwn: PassthruBook = {
      ...BOOK,
      purchase: [...BOOK.purchase.filter((x) => ![10, 12, 13, 14].includes(x.r))],
    };
    expect(() => passthruReadOf(onlyOwn)).toThrow('하도급사 줄이 없습니다(한백 줄만 있다)');
    const noEpc: PassthruBook = { ...BOOK, epc: BOOK.epc.filter((x) => x.r < 6) };
    expect(() => passthruReadOf(noEpc)).toThrow('EPC사업내역리스트에 98차 줄이 없습니다');
    const badHead: PassthruBook = { ...BOOK, purchase: BOOK.purchase.map((x) => (x.r === 2 ? row(2, { ...x.c, F: '세액' }) : x)) };
    expect(() => passthruReadOf(badHead)).toThrow('머리(공급가 · 부가세 · 합계금액)를 찾지 못했습니다');
    const noGross: PassthruBook = { ...BOOK, epc: BOOK.epc.map((x) => (x.r === 3 ? row(3, { ...x.c, AB: '기성', AC: '기성' }) : x)) };
    expect(() => passthruReadOf(noGross)).toThrow('머리에 금회기성 칸이 없습니다');
  });

  it('입금 예정일 · 지급 요청일 — YYYY-MM-DD 만', () => {
    expect(passthruDayOf(' 2026-11-26 ', '입금 예정일')).toBe('2026-11-26');
    expect(passthruDayOf('', '입금 예정일')).toBeNull();
    expect(passthruDayOf(undefined, '입금 예정일')).toBeNull();
    expect(() => passthruDayOf('11월 26일', '입금 예정일')).toThrow('입금 예정일은 YYYY-MM-DD 로 줍니다.');
  });
});

describe('xlsx 바이트 → 시트들(passthru-read)', () => {
  /** 지어낸 작은 엑셀 — 공유 글자(서식이 갈린 글 · 읽는 법 표시 포함) · 칸 안 글자 · 수식 칸의 저장값 · 시트 차례가 이름과 다름 · 총괄의 수금일자 */
  async function workbook(): Promise<Uint8Array> {
    const zip = new JSZip();
    zip.file('xl/workbook.xml', '<workbook xmlns:r="r"><sheets>'
      + '<sheet name="통합" sheetId="1" r:id="rId1"/><sheet name="EPC사업내역리스트" sheetId="2" r:id="rId2"/>'
      + '<sheet name=" 매입내역" sheetId="3" r:id="rId3"/><sheet name="매출수금매입내역_총괄" sheetId="4" r:id="rId4"/></sheets></workbook>');
    zip.file('xl/_rels/workbook.xml.rels', '<Relationships>'
      + '<Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/>'
      + '<Relationship Id="rId3" Target="/xl/worksheets/sheet3.xml"/><Relationship Id="rId4" Target="worksheets/sheet4.xml"/></Relationships>');
    const strings = ['차수', '거래처', '구분', '공급가', '부가세', '합계금액', 'HB98차', '가나전기', '준공', '가상은행', '000-11-2222',
      '해당년도', '해당월', '잔금 세금계산서', '금회기성', '98차', '11월', 'HB98차 지급액', '하도급사', '수금일자', 'HB98'];
    zip.file('xl/sharedStrings.xml', `<sst>${strings.map((s) => (s === '가나전기'
      ? '<si><r><t>가나</t></r><r><rPr/><t>전기</t></r><rPh><t>カナ</t></rPh></si>'
      : `<si><t>${s}</t></si>`)).join('')}</sst>`);
    const s = (ref: string, i: number) => `<c r="${ref}" t="s"><v>${i}</v></c>`;
    const n = (ref: string, v: number, f?: string) => `<c r="${ref}">${f ? `<f>${f}</f>` : ''}<v>${v}</v></c>`;
    zip.file('xl/worksheets/sheet1.xml', '<worksheet><sheetData/></worksheet>');
    zip.file('xl/worksheets/sheet2.xml', '<worksheet><sheetData>'
      + `<row r="3">${s('A3', 11)}${s('B3', 12)}${s('D3', 0)}${s('E3', 18)}${s('Y3', 13)}${s('AB3', 14)}</row>`
      + `<row r="6" hidden="1">${n('A6', 2026)}${s('B6', 16)}${s('D6', 15)}${n('Y6', 1_500_000, 'X6*0.3')}${n('AB6', 1_000_000)}</row>`
      + '</sheetData></worksheet>');
    zip.file('xl/worksheets/sheet3.xml', '<worksheet><sheetData>'
      + `<row r="2">${s('B2', 0)}${s('C2', 1)}${s('D2', 2)}${s('E2', 3)}${s('F2', 4)}${s('G2', 5)}</row>`
      + `<row r="10">${s('B10', 6)}${s('C10', 7)}${s('D10', 8)}${n('E10', 1_000_000)}${n('F10', 100_000)}${n('G10', 1_100_000, 'E10+F10')}`
      + `${s('H10', 9)}<c r="I10" t="inlineStr"><is><t>000-11-2222</t></is></c><c r="J10" t="str"><f>C10</f><v>가나전기</v></c>${n('L10', NOV27)}</row>`
      + `<row r="11">${s('B11', 17)}${n('E11', 1_000_000)}</row>`
      + '</sheetData></worksheet>');
    zip.file('xl/worksheets/sheet4.xml', '<worksheet><sheetData>'
      + `<row r="4">${s('B4', 2)}${s('P4', 2)}${s('Q4', 1)}${s('R4', 19)}</row>`
      + `<row r="7">${s('P7', 20)}${n('R7', NOV27 - 1)}</row>`
      + '</sheetData></worksheet>');
    return zip.generateAsync({ type: 'uint8array' });
  }
  /** 같은 엑셀에서 시트 목록만 바꾼다 — 그 시트가 없는 엑셀 */
  async function without(...names: string[]): Promise<Uint8Array> {
    const zip = await JSZip.loadAsync(await workbook());
    const book = await zip.file('xl/workbook.xml')!.async('string');
    zip.file('xl/workbook.xml', names.reduce((xml, name) => xml.replace(new RegExp(`<sheet name="\\s*${name}"[^>]*/>`), ''), book));
    return zip.generateAsync({ type: 'uint8array' });
  }

  it('이름으로 시트를 찾고 칸을 읽는다 — 읽고 나면 passthruReadOf 가 그대로 받는다', async () => {
    const book = await passthruBookOf(await workbook());
    expect(book.purchase.find((r) => r.r === 10)?.c).toEqual({
      B: 'HB98차', C: '가나전기', D: '준공', E: 1_000_000, F: 100_000, G: 1_100_000, H: '가상은행', I: '000-11-2222', J: '가나전기', L: NOV27,
    });
    expect(book.epc.find((r) => r.r === 6)?.c.Y).toBe(1_500_000);
    expect(book.ledger?.find((r) => r.r === 7)?.c).toEqual({ P: 'HB98', R: NOV27 - 1 });
    const r = passthruReadOf(book);
    expect(r).toMatchObject({ round: 98, month: '2026-11', receive: 1_500_000, payDate: '2026-11-27', inDate: '2026-11-26' });
    expect(r.rows).toHaveLength(1);
  });

  it('총괄 시트가 없어도 읽는다 — 입금 예정일만 빈다', async () => {
    const book = await passthruBookOf(await without('매출수금매입내역_총괄'));
    expect(book.ledger).toBeUndefined();
    expect(passthruReadOf(book)).toMatchObject({ round: 98, receive: 1_500_000, inDate: null });
  });

  it('xlsx 가 아니거나 시트가 없으면 사람 말로', async () => {
    await expect(passthruBookOf(new Uint8Array([1, 2, 3]))).rejects.toThrow('엑셀(xlsx)로 열리지 않습니다');
    await expect(passthruBookOf(await without('EPC사업내역리스트'))).rejects.toThrow('엑셀에 「EPC사업내역리스트」 시트가 없습니다');
    await expect(passthruBookOf(await without('매입내역'))).rejects.toThrow('엑셀에 「매입내역」 시트가 없습니다');
  });

  it('대화에는 요약만 — 시트 이름 · 지금 차의 숫자 · 입금 예정일 · read_file. 다른 엑셀은 통째로(file-text sheetText)', async () => {
    const bytes = await workbook();
    const brief = await passthruSheetBrief(bytes);
    expect(brief).not.toBeNull();
    expect(brief!.split('\n')).toEqual([
      expect.stringMatching(/^한백사업내역리스트 엑셀\(시트 통합 · EPC사업내역리스트 · 매입내역 · 매출수금매입내역_총괄\) — .*read_file 로 전체를 연다\.$/),
      '콘솔이 읽은 지금 차(매입내역의 가장 큰 차): HB98차 · 2026년 11월',
      '플러그링크 → 한백(부가세 전): 1,500,000원 · 입금 예정 2026-11-26',
      '한백 → 하도급사 1건(부가세 전 1,000,000원 · 포함 1,100,000원) · 지급일 2026-11-27: 가나전기 준공 1,000,000원',
    ]);
    /* 대화에 싣는 글자(요약) · read_file 의 글자(통째) */
    expect(await sheetText(Buffer.from(bytes))).toBe(brief);
    const full = await sheetText(Buffer.from(bytes), true);
    expect(full).toMatch(/## 시트 「\s*매입내역」/);
    expect(full).toContain('## 시트 「매출수금매입내역_총괄」');
    /* 지금 차를 못 읽으면 그 까닭을 요약에 — 매입내역의 머리가 바뀜 */
    const zip = await JSZip.loadAsync(bytes);
    const sheet3 = await zip.file('xl/worksheets/sheet3.xml')!.async('string');
    zip.file('xl/worksheets/sheet3.xml', sheet3.replace(/<row r="2">[\s\S]*?<\/row>/, ''));
    const broken = await passthruSheetBrief(await zip.generateAsync({ type: 'uint8array' }));
    expect(broken!.split('\n')[1]).toBe('콘솔이 지금 차(매입내역의 가장 큰 차)를 읽지 못했다 — 매입내역 시트의 머리(공급가 · 부가세 · 합계금액)를 찾지 못했습니다 — 엑셀 모양이 바뀌었습니다.');
    /* 한백사업내역리스트가 아니면 null — 통째로 싣는다 */
    const other = await without('매입내역');
    expect(await passthruSheetBrief(other)).toBeNull();
    expect(await sheetText(Buffer.from(other))).toContain('## 시트 「EPC사업내역리스트」');
    expect(await passthruSheetBrief(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe('글 — 한백의 26년 10월 글(HB30차)의 뼈대', () => {
  it('긴급구매요청 · 지급 요청일 · 배경 · 받을 돈 · 줄 돈 · 청구금액 · 캡처 · 긴급사유 · 피해 · cc 재무팀', () => {
    const post = agitPassthruPostOf('2026-11-27', inputOf({ inDate: '2026-11-26' }));
    expect(post).toMatchObject({ payDate: '2026-11-27', kind: AGIT_PASSTHRU_KIND, total: 1_500_000, batches: 3, blocked: null });
    expect(post.title).toBe('플러그링크 마더EPC HB98차 (패스스루) 집행');
    expect(post.urgent).toBe('플러그링크와 합의된 지급일에 지급하기 위함');
    expect(post.text.split('\n')).toEqual([
      `# [긴급] 플러그링크 2026년 11월 패스스루 집행 ${AGIT_URGENT_TAG}`,
      '> *지급 요청일: [긴급] 2026. 11. 27 (금요일)*',
      '# 1. 배경',
      '- 공사명 : 플러그링크 마더EPC HB98차 (패스스루) 집행',
      '# 2. 2026년 11월 패스스루 (부가세 전)',
      '> *(플러그링크 → 한백)*',
      '> *- 2026년 11월 26일 목요일 입금 예정*',
      '> *- 총 2,400,000원*',
      '>',
      '> *(한백 → 하도급사)*',
      '> *- 2026년 11월 27일 금요일 지급 필요*',
      '> *- 총 1,500,000원*',
      '## 청구금액:',
      '*부가세 전 1,500,000원*',
      '*부가세 포함 1,650,000원*',
      expect.stringMatching(/^!\[.+\]\(.+\)$/),
      '# *4. 긴급사유 기재*',
      '> 플러그링크와 합의된 지급일에 지급하기 위함',
      '# *5. 미지급시 예상되는 피해 및 영향*',
      '> 플러그링크와 합의된 지급일에 지급하기 위함',
      `cc ${AGIT_CC}`,
    ]);
  });

  it('입금 예정일을 모르면 「미정」 · 지어내지 않는다', () => {
    expect(agitPassthruPostOf('2026-11-27', inputOf()).text).toContain('> *- 입금 예정일 미정*');
  });

  it('구분 · 이름 · 제목 · 올렸다는 말 · 글양식', () => {
    const post = agitPassthruPostOf('2026-11-27', inputOf());
    expect(AGIT_POST_KINDS).toContain(AGIT_PASSTHRU_KIND);
    expect(agitKindOf('패스스루')).toBe(AGIT_PASSTHRU_KIND);
    expect(isPayoutKind(AGIT_PASSTHRU_KIND)).toBe(false);
    expect(agitPostName({ payDate: '2026-11-27', kind: AGIT_PASSTHRU_KIND })).toBe('11월 27일 패스스루');
    expect(agitTitleOf(post.text)).toBe('플러그링크 마더EPC HB98차 (패스스루) 집행');
    expect(agitTemplateOf(post.urgent)).toBe(agitTemplateOf('긴급'));
    expect(agitPostedSay({ ...post }, '한백 관리자')).toBe(
      '11월 27일 패스스루 열린구매 긴급 글을 아지트에 올렸습니다 — 지급 3건 · 공급가액 1,500,000원 (승인 한백 관리자).\n'
        + '플러그링크 마더EPC HB98차 (패스스루) 집행'
    );
  });

  it('쓰는 칸 HTML — 10월 글처럼 h1 다섯 · h2 하나 · 상자 넷(둘째 상자 안 빈 줄) · 그림 자리 · cc 멘션 자리', () => {
    const doc = agitEditorDocOf(agitPassthruPostOf('2026-11-27', inputOf()).text);
    expect(doc.image).toBe(true);
    expect(doc.cc).toBe('team.finance');
    expect(doc.html.match(/<h1>/g)).toHaveLength(5);
    expect(doc.html.match(/<h2>/g)).toHaveLength(1);
    expect(doc.html.match(/<blockquote>/g)).toHaveLength(4);
    expect(doc.html).toContain('<h1><strong>4. 긴급사유 기재</strong></h1>');
    expect(doc.html).toContain('<p><strong>(플러그링크 → 한백)</strong></p>');
    expect(doc.html).toContain('<p></p><p><strong>(한백 → 하도급사)</strong></p>');
    expect(doc.html).toContain(`<p>${IMG_MARK}</p><h1><strong>4. 긴급사유 기재</strong></h1>`);
    expect(doc.html.endsWith(`<p>cc ${CC_MARK}</p>`)).toBe(true);
  });
});

describe('첨부 — 10월 zip 그대로(엑셀 · 증빙, 폴더 없이)', () => {
  it('이름 · 엑셀 줄(세액은 매입내역 값 · 계좌 없는 줄은 「-」) · 증빙 이름이 겹치면 (2)', async () => {
    const book: PassthruBook = {
      ...BOOK,
      purchase: [...BOOK.purchase.filter((x) => x.r !== 13), row(13, { B: 'HB98차_3', C: '마바설비', D: '추가공사비', E: 300_000, F: 30_000, G: 330_000, L: NOV27 })],
    };
    const r = passthruReadOf(book);
    const input = { ...inputOf(), rows: r.rows, attach: [INV, INV2] };
    const plan = agitPassthruBundleOf('2026-11-27', input, '2026-11-25');
    expect(plan.zipName).toBe('HB98차 (패스스루)_26년 11월.zip');
    expect(plan.xlsxName).toBe('플러그링크 Mother EPC 26년 11월 하도급 지급요청_261127.xlsx');
    expect(plan.imageName).toBe('플러그링크 Mother EPC 26년 11월 하도급 지급요청_261127.png');
    expect(plan.attach.map((f) => f.name)).toEqual(['가나전기 세금계산서.pdf', '가나전기 세금계산서 (2).pdf']);
    expect(plan.sheet).toMatchObject({
      subject: '2026년 플러그링크 마더EPC 26년 11월 하도급 집행', content: '플러그링크 마더EPC 26년 11월 지급요청', year: 2026, month: 11, madeOn: '2026-11-25',
    });
    expect(plan.sheet.rows.map((x) => [x.content, x.org, x.supply, x.vat, x.fixedVat, x.bank, x.account])).toEqual([
      ['HB98차_준공', '가나전기', 1_000_000, 100_000, true, '가상은행', '000-11-2222'],
      ['HB98차_하자보수비', '가나전기', 200_000, 20_000, true, '가상은행', '000-11-2222'],
      ['HB98차_추가공사비', '마바설비', 300_000, 30_000, true, '-', '-'],
    ]);

    const xlsx = await JSZip.loadAsync(await purchaseXlsx(plan.sheet, TEMPLATE));
    const sheet = await xlsx.file('xl/worksheets/sheet1.xml')!.async('string');
    const cell = (ref: string) => new RegExp(`<c r="${ref}"[^>]*?(?:/>|>[\\s\\S]*?</c>)`).exec(sheet)?.[0] ?? '';
    expect(cell('M5')).toContain('<v>11</v>');
    expect(cell('D6')).toContain('2026년 플러그링크 마더EPC 26년 11월 하도급 집행');
    expect(cell('G8')).toContain('<v>100000</v>');
    expect(cell('G8')).not.toContain('<f>');
    expect(cell('G11')).toContain('<f>SUM(G8:G10)</f><v>150000</v>');
  });
});

describe('매월 25일 상신 알림 (한백 2026-11-28 「알림 시점은 매월 25일 필요」)', () => {
  it('25일부터 그 달 끝까지 — 25일이 쉬는 날이면 앞 영업일', () => {
    expect(passthruRemindDue('2026-11-24')).toBeNull();
    expect(passthruRemindDue('2026-11-25')).toEqual({ month: '2026-11', remindOn: '2026-11-25' });
    expect(passthruRemindDue('2026-11-30')).toEqual({ month: '2026-11', remindOn: '2026-11-25' });
    expect(passthruRemindDue('2026-12-01')).toBeNull();
    /* 26년 10월 25일은 일요일 → 23일(금) · 12월 25일은 성탄절 → 24일(목) */
    expect(passthruRemindDue('2026-10-22')).toBeNull();
    expect(passthruRemindDue('2026-10-23')).toEqual({ month: '2026-10', remindOn: '2026-10-23' });
    expect(passthruRemindDue('2026-12-24')).toEqual({ month: '2026-12', remindOn: '2026-12-24' });
  });

  it('할 일 · 대화 · 알림 — 그날과 늦은 날 · 열쇠는 달마다 하나', () => {
    const due = passthruRemindDue('2026-11-25')!;
    const plan = passthruRemindPlan(due, '2026-11-25');
    expect(plan.key).toBe(passthruRemindKey('2026-11'));
    expect(plan.key).toBe('pluglink-passthru:2026-11');
    expect(plan.task).toMatchObject({ title: '패스스루 집행 상신 — 26년 11월', due: '2026-11-25' });
    expect(plan.say.split('\n')[0]).toBe('26년 11월 플러그링크 패스스루 집행 상신 — 오늘이 알림 날입니다(매월 25일).');
    expect(plan.say).toContain('「매출수금매입내역_총괄」 시트의 「수금일자」');
    expect(plan.alarm.title).toBe('패스스루 집행 상신 — 26년 11월');
    const late = passthruRemindPlan(due, '2026-11-27');
    expect(late.say.split('\n')[0]).toContain('알림 날(');
    expect(late.say.split('\n')[0]).toContain('지났습니다');
    expect(late.key).toBe(plan.key);
  });
});

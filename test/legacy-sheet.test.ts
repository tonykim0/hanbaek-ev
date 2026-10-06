/**
 * 기설치 설치이력 엑셀 읽기 — 판독이 아니라 코드라 시험으로 묶는다.
 *
 * 양식 파일은 저장소에 있는 것을 그대로 읽는다(예시 세 줄이 들어 있다). 협력사가 줄을 끼워
 * 머리 줄이 내려간 모양은 jszip 으로 지어 읽힌다 — 충북 청주 금천효성1차가 그 모양이었다.
 */
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { dateOf, readLegacySheet } from '@/lib/legacy-sheet';

const TEMPLATE = 'public/notices/files/legacy-charger-history-template.xlsx';

/** 시트 하나짜리 xlsx — 글자는 인라인으로, 숫자는 그대로 */
async function xlsx(rows: Record<number, Record<string, string | number>>): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('xl/workbook.xml',
    '<workbook xmlns:r="r"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>');
  zip.file('xl/_rels/workbook.xml.rels',
    '<Relationships><Relationship Id="rId1" Type="ws" Target="worksheets/sheet1.xml"/></Relationships>');
  const body = Object.entries(rows).map(([r, cols]) => `<row r="${r}">${Object.entries(cols).map(([c, v]) =>
    typeof v === 'number'
      ? `<c r="${c}${r}"><v>${v}</v></c>`
      : `<c r="${c}${r}" t="inlineStr"><is><t>${v.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</t></is></c>`).join('')}</row>`).join('');
  zip.file('xl/worksheets/sheet1.xml', `<worksheet><sheetData>${body}</sheetData></worksheet>`);
  return zip.generateAsync({ type: 'nodebuffer' });
}

const HEAD = {
  A: '연번', B: '행위 일자', C: '구분', D: '행위 기수\n(D)', E: '(내구연한 8년 이후)\n철거·교체 기수\n(E)',
  F: '(내구연한 8년 이전)\n임의 철거·교체 기수\n(F)', G: '(내구연한 8년 이전)\n불가피한 철거·교체 기수\n(G)',
  H: '최종 기설치 수량\n(H=D+F)', I: '수량 검증', K: '비고',
};

describe('설치이력 엑셀 읽기', () => {
  it('양식의 예시 세 줄 — 신규 50 · 교체 20(임의 20) · 철거 30 → 지금 20기 · 최종 40기', async () => {
    const s = await readLegacySheet(readFileSync(TEMPLATE));
    expect(s.rows.map((r) => [r.row, r.date, r.kind, r.d])).toEqual([
      [8, '2012-01-01', '신규 설치', 50],
      [9, '2019-01-01', '교체 설치', 20],
      [10, '2020-02-01', '철거', 30],
    ]);
    expect(s.standing).toBe(20);
    expect(s.final).toBe(40);
    expect(s.badSplit).toEqual([]);
  });

  it('★머리 줄이 내려가 있어도 글자로 찾는다★ — 금천효성1차(서명 칸을 끼워 7행)', async () => {
    const buf = await xlsx({
      5: { A: '(설치 신청자)\n신청자명 :' },
      7: HEAD,
      8: { J: '증빙 자료명' },
      9: { A: '전체' },
      10: { A: 1, B: 43371, C: '신규 설치', D: 4, J: '1. 신규 설치_행위신고증명서(2018-09-28)' },
      11: { A: 2, B: 44546, C: '신규 설치', D: 4 },
      12: { A: 3, B: 45982, C: '신규 설치', D: 8 },
      13: { I: 'TRUE' },
    });
    const s = await readLegacySheet(buf);
    expect(s.rows.map((r) => [r.row, r.date, r.d])).toEqual([
      [10, '2018-09-28', 4], [11, '2021-12-16', 4], [12, '2025-11-21', 8],
    ]);
    expect(s.rows[0].evidence).toBe('1. 신규 설치_행위신고증명서(2018-09-28)');
    expect(s.standing).toBe(16);
    expect(s.final).toBe(16);
  });

  it('교체·철거의 갈래(E+F+G)가 D 와 다르면 그 줄을 짚는다 — 양식 I열 FALSE', async () => {
    const buf = await xlsx({
      5: HEAD, 7: { A: '전체' },
      8: { B: '2019-01-01', C: '교체 설치', D: 20, F: 15 },
      9: { B: '2020.02.01', C: '철거', D: 5, E: 5 },
    });
    const s = await readLegacySheet(buf);
    expect(s.badSplit).toEqual([8]);
    expect(s.rows[1].date).toBe('2020-02-01');
  });

  it('「이력 없음」 엑셀 — 행 없이 전체 줄 비고에만 적는다', async () => {
    const s = await readLegacySheet(await xlsx({
      5: HEAD, 7: { A: '전체', K: '준공 이후 충전시설 설치 및 철거 이력 없음' },
    }));
    expect(s.rows).toEqual([]);
    expect(s.none).toBe(true);
    expect(s.standing).toBe(0);
  });

  it('양식이 아니면 이유를 말하고 멈춘다', async () => {
    await expect(readLegacySheet(await xlsx({ 1: { A: '견적서' } }))).rejects.toThrow(/행위 일자/);
  });

  it('날짜 — 엑셀 일련번호 · 글자 둘 다', () => {
    expect(dateOf(43371)).toBe('2018-09-28');
    expect(dateOf('2021. 12. 16')).toBe('2021-12-16');
    expect(dateOf('2025년 11월 21일')).toBe('2025-11-21');
    expect(dateOf('모름')).toBeNull();
  });
});

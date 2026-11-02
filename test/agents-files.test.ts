/**
 * 담당에게 넘긴 파일 — 이름 · 읽는 법(lib/agents/files)과 글자 뽑기(lib/agents/file-text).
 *
 * 엑셀 · 워드 · 한글(hwpx)은 압축 안의 XML 이다 — 시험은 그 모양을 jszip 으로 직접 지어 넣는다(실제 파일의 뼈대만).
 * 공유 문자열 · 빈 칸 건너뛰기 · 시트 이름 · 문단 · 탭이 에이전트에게 그대로 가는지 본다.
 */
import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { agentFileName, agentFileRead, sizeLabel } from '@/lib/agents/files';
import { decodeText, docxText, hwpxText, xlsxText } from '@/lib/agents/file-text';
import { mondayOf, weekName, weekRange } from '@/lib/agents/weeks';

async function zip(files: Record<string, string>): Promise<Buffer> {
  const z = new JSZip();
  for (const [path, body] of Object.entries(files)) z.file(path, body);
  return Buffer.from(await z.generateAsync({ type: 'uint8array' }));
}

describe('파일 이름 · 읽는 법', () => {
  it('경로 구분자 · 제어문자 · 앞의 점을 지우고, 맥의 분리된 자모를 붙인다', () => {
    expect(agentFileName('견적/서\\1.pdf')).toBe('견적_서_1.pdf');
    expect(agentFileName('..숨김.txt')).toBe('숨김.txt');
    expect(agentFileName('단가표.xlsx'.normalize('NFD'))).toBe('단가표.xlsx');
    expect(agentFileName('   ')).toBe('파일');
    const long = `${'가'.repeat(200)}.pdf`;
    expect(agentFileName(long)).toHaveLength(120);
    expect(agentFileName(long).endsWith('.pdf')).toBe(true);
  });

  it('PDF · 그림은 주소로, 엑셀 · 워드 · 한글(hwpx) · 글은 글자로, 옛 한글 · 옛 엑셀은 이름만', () => {
    expect(agentFileRead('계약서.PDF')).toBe('pdf');
    expect(agentFileRead('현장.jpeg')).toBe('image');
    expect(agentFileRead('사진.heic')).toBe('none');
    expect(agentFileRead('단가.xlsx')).toBe('sheet');
    expect(agentFileRead('단가.xls')).toBe('none');
    expect(agentFileRead('공문.docx')).toBe('word');
    expect(agentFileRead('공문.hwpx')).toBe('hwpx');
    expect(agentFileRead('공문.hwp')).toBe('none');
    expect(agentFileRead('목록.csv')).toBe('text');
  });

  it('크기는 읽는 말로', () => {
    expect(sizeLabel(17_400)).toBe('17KB');
    expect(sizeLabel(3 * 1024 * 1024 + 200_000)).toBe('3.2MB');
    expect(sizeLabel(12)).toBe('12B');
  });
});

describe('글자 뽑기', () => {
  it('엑셀 — 시트마다 탭으로 가른 줄, 공유 문자열 · 숫자 · 글 칸을 읽고 빈 칸은 자리를 지킨다', async () => {
    const buf = await zip({
      'xl/workbook.xml': '<workbook><sheets><sheet name="이력 &amp; 증빙" sheetId="1" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/sharedStrings.xml': '<sst><si><t>연번</t></si><si><r><t>행위</t></r><r><t> 일자</t></r></si></sst>',
      'xl/worksheets/sheet1.xml': '<worksheet><sheetData>'
        + '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>'
        + '<row r="2"><c r="A2"><v>1</v></c><c r="B2" t="inlineStr"><is><t>신규</t></is></c><c r="C2" t="str"><v>2026-11-02</v></c></row>'
        + '<row r="3"><c r="A3"/></row>'
        + '</sheetData></worksheet>',
    });
    expect(await xlsxText(buf)).toBe('## 시트 「이력 & 증빙」 (2줄)\n연번\t\t행위 일자\n1\t신규\t2026-11-02');
  });

  it('워드 — 문단은 줄, 탭은 탭', async () => {
    const buf = await zip({
      'word/document.xml': '<w:document><w:body><w:p><w:r><w:t>지급 요청</w:t></w:r></w:p>'
        + '<w:p><w:r><w:t>금액</w:t></w:r><w:r><w:tab/><w:t>1,200,000원 &lt;부가세 별도&gt;</w:t></w:r></w:p></w:body></w:document>',
    });
    expect(await docxText(buf)).toBe('지급 요청\n금액\t1,200,000원 <부가세 별도>');
  });

  it('한글(hwpx) — 구역 순서대로 문단', async () => {
    const buf = await zip({
      'Contents/section1.xml': '<hs:sec><hp:p><hp:run><hp:t>둘째 구역</hp:t></hp:run></hp:p></hs:sec>',
      'Contents/section0.xml': '<hs:sec><hp:p><hp:run><hp:t>공문 제목</hp:t></hp:run></hp:p><hp:p><hp:run><hp:t>본문</hp:t></hp:run></hp:p></hs:sec>',
    });
    expect(await hwpxText(buf)).toBe('공문 제목\n본문\n\n둘째 구역');
  });

  it('글 파일 — UTF-8 이 깨지면 EUC-KR(한글 엑셀이 내보낸 CSV)', () => {
    expect(decodeText(Buffer.from('﻿현장,대수\n은계,4', 'utf8'))).toBe('현장,대수\n은계,4');
    const eucKr = Buffer.from([0xc7, 0xf6, 0xc0, 0xe5]); // 「현장」
    expect(decodeText(eucKr)).toBe('현장');
  });
});

describe('주간 기록의 달력', () => {
  it('주는 월요일에 시작한다 — 일요일은 그 앞 월요일의 주', () => {
    expect(mondayOf('2026-11-02')).toBe('2026-11-02'); // 월
    expect(mondayOf('2026-11-08')).toBe('2026-11-02'); // 일
    expect(mondayOf('2026-11-09')).toBe('2026-11-09');
  });

  it('이번 주 · 지난주는 말로, 그 앞은 날짜로 — 해가 다르면 해를 붙인다', () => {
    expect(weekName('2026-11-02', '2026-11-04')).toBe('이번 주');
    expect(weekName('2026-10-26', '2026-11-04')).toBe('지난주');
    expect(weekName('2026-10-19', '2026-11-04')).toBe('10.19 – 10.25');
    expect(weekRange('2025-12-29', '2026-01-02')).toBe('2025.12.29 – 2026.01.04');
  });
});

/**
 * 구매요청간소화 엑셀의 틀을 짓는다 — 한백이 열린구매에 올려 온 엑셀(바탕화면 「영업수수료 지급내역」의 「구매요청간소화_…(…내역).xlsx」)에서
 * 값만 걷어 lib/agit/purchase-template.xlsx 로 둔다. (한백 2026-11-08 「엑셀양식이 바뀐거같네? 기존에 쓰던 엑셀 양식을 그대로 활용해줘」)
 *
 *   npx tsx scripts/agit-purchase-template.ts "<원본 xlsx>"
 *
 * 모양(글꼴 · 테두리 · 채움 · 열 폭 · 줄 높이 · 합친 칸 · 수식 · 고르는 칸 · 조건부 서식)은 그대로 두고 ★값만 걷는다★ — 저장소가 공개라서다:
 *  · 지급 줄(8~13행)의 값 · 수식을 비운다(8행은 칸 모양만 남겨 줄의 본으로 쓴다 · 9~13행은 지운다). 공사명(D6)도 비운다.
 *  · 「거래처정보」 시트의 거래처 · 계좌 · 예금주 · 연락처 줄을 지운다(머리 줄과 3행의 칸 모양만 남긴다).
 *  · 바깥 파일 연결(externalLinks — 다른 회사 양식 · 한백의 내려받기 폴더 경로가 들어 있었다) · 깨진 이름 정의 394개 · calcChain 을 걷는다.
 *  · 공유 글자표(sharedStrings — 지운 계좌도 여기 남는다)를 없애고 남은 글자는 칸 안에 둔다(inlineStr · 서식 있는 글은 그대로).
 *  · 만든 이 · 고친 이를 「한백」으로.
 *  · 17행부터의 빈 줄과 그 줄의 조건부 서식을 걷는다(모양이 없는 빈칸이다).
 *  · 저장한 사람의 폴더 경로(workbook 의 x15ac:absPath)를 걷는다.
 * 다 걷은 뒤 지운 값(계좌 · 이름 · 경로)이 어디에도 남지 않았는지 보고, 남았으면 쓰지 않고 멈춘다.
 * 칸 자리 — 채우는 쪽(lib/agit/purchase-xlsx)이 기대는 자리를 여기서도 확인한다(머리 7행 · 본 8행 · 소계 14행 · 특기 사항 15~16행).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import JSZip from 'jszip';

const OUT = resolve(__dirname, '../lib/agit/purchase-template.xlsx');
const SHEET = 'xl/worksheets/sheet1.xml';
const PARTNERS = 'xl/worksheets/sheet2.xml';

const rowsOf = (xml: string) => [...xml.matchAll(/<row [^>]*?r="(\d+)"[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g)]
  .map((m) => ({ r: Number(m[1]), xml: m[0] }));

/** 공유 글자 칸(t="s") → 칸 안의 글자(inlineStr) — <si> 속을 그대로 옮겨 서식 있는 글도 남긴다 */
const inlineAll = (xml: string, shared: string[]) =>
  xml.replace(/<c ([^>]*?)t="s"([^>]*)><v>(\d+)<\/v><\/c>/g, (_, a: string, b: string, i: string) =>
    `<c ${a}t="inlineStr"${b}><is>${shared[Number(i)]}</is></c>`);

/** 칸의 값 · 수식을 걷고 모양(s)만 남긴다 */
const bare = (rowXml: string) => rowXml
  .replace(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>[\s\S]*?<\/c>)/g, (_, ref: string, attrs: string) => {
    const s = /\ss="(\d+)"/.exec(attrs)?.[1];
    return `<c r="${ref}"${s ? ` s="${s}"` : ''}/>`;
  });

function replaceRows(xml: string, keep: (r: number) => 'keep' | 'bare' | 'drop', tweak?: (r: number, row: string) => string) {
  return xml.replace(/<sheetData>([\s\S]*)<\/sheetData>/, (_, body: string) => {
    const out = rowsOf(body).flatMap(({ r, xml: row }) => {
      const how = keep(r);
      if (how === 'drop') return [];
      const next = how === 'bare' ? bare(row) : row;
      return [tweak ? tweak(r, next) : next];
    });
    return `<sheetData>${out.join('')}</sheetData>`;
  });
}

async function main() {
  const src = process.argv[2];
  if (!src) throw new Error('원본 xlsx 경로를 주세요.');
  const zip = await JSZip.loadAsync(readFileSync(src));
  const text = async (p: string) => (await zip.file(p)?.async('string')) ?? '';

  const ss = await text('xl/sharedStrings.xml');
  const shared = [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => m[1]);

  /* ── 구매(일반) ── */
  let sheet = inlineAll(await text(SHEET), shared);
  const cellText = (ref: string) => {
    const m = new RegExp(`<c r="${ref}"[^>]*>([\\s\\S]*?)</c>`).exec(sheet);
    return m ? m[1].replace(/<[^>]+>/g, '') : '';
  };
  for (const [ref, want] of [['C5', '구분'], ['C6', '공사명'], ['C7', 'No.'], ['D7', '내 용'], ['C14', '소 계'], ['C15', '특기 사항']] as const) {
    if (!cellText(ref).includes(want)) throw new Error(`양식의 칸 자리가 다르다 — ${ref} 에 「${want}」가 없다(${cellText(ref)})`);
  }
  sheet = replaceRows(sheet, (r) => (r === 8 ? 'bare' : r >= 9 && r <= 13 ? 'drop' : r > 16 ? 'drop' : 'keep'), (r, row) =>
    /* 공사명은 채울 때 적는다 */
    r === 6 ? row.replace(/<c r="D6"([^>]*?)(?:\/>|>[\s\S]*?<\/c>)/, (_, a: string) => `<c r="D6"${a.replace(/\st="\w+"/, '')}/>`) : row);
  /* 수식의 미리 셈한 값 — 소계(F14:H14)와 =NOW()(M6)는 채울 때 다시 적는다 */
  sheet = sheet.replace(/(<c r="(?:F14|G14|H14|M6)"[^>]*>)(<f[^>]*>[^<]*<\/f>)<v>[^<]*<\/v>/g, '$1$2');
  if (/<c r="(?:F14|G14|H14|M6)"[^>]*><f[^>]*>[^<]*<\/f><v>/.test(sheet)) throw new Error('소계 · NOW() 의 미리 셈한 값이 남았다');
  sheet = sheet.replace(/<dimension ref="[^"]+"\/>/, '<dimension ref="A1:Z16"/>');
  /* 17행 밑과 13행(지운 줄)의 조건부 서식 — 8~12행(입금처 색)만 남긴다 */
  sheet = sheet.replace(/<conditionalFormatting sqref="(H20|M13)">[\s\S]*?<\/conditionalFormatting>/g, '');
  if (!/<conditionalFormatting sqref="M8:M12">/.test(sheet)) throw new Error('입금처 조건부 서식(M8:M12)이 없다');

  /* ── 거래처정보 — 머리(2행)와 3행의 칸 모양만 ── */
  let partners = inlineAll(await text(PARTNERS), shared);
  const pattern = '<row r="3" spans="2:6"><c r="B3" s="49"/><c r="C3" s="49"/><c r="D3" s="50"/><c r="E3" s="49"/><c r="F3" s="50"/></row>';
  partners = replaceRows(partners, (r) => (r === 2 ? 'keep' : 'drop'));
  partners = partners.replace('</sheetData>', `${pattern}</sheetData>`).replace(/<dimension ref="[^"]+"\/>/, '<dimension ref="A2:F3"/>');
  if (!/거래처[\s\S]*은행[\s\S]*계좌번호[\s\S]*예금주명[\s\S]*연락처/.test(partners)) throw new Error('거래처정보 머리 줄이 다르다');

  /* ── 묶음 ── */
  let workbook = await text('xl/workbook.xml');
  workbook = workbook
    /* 저장한 사람의 폴더 경로(x15ac:absPath) */
    .replace(/<mc:AlternateContent[^>]*><mc:Choice[^>]*><x15ac:absPath [^>]*\/><\/mc:Choice><\/mc:AlternateContent>/, '')
    .replace(/<externalReferences>[\s\S]*?<\/externalReferences>/, '')
    .replace(/<definedNames>[\s\S]*?<\/definedNames>/, '')
    .replace(/<calcPr ([^>]*?)\/>/, (_, a: string) => `<calcPr ${a.replace(/\sfullCalcOnLoad="\w+"/, '')} fullCalcOnLoad="1"/>`);
  const rels = (await text('xl/_rels/workbook.xml.rels'))
    .replace(/<Relationship [^>]*Type="[^"]*\/(?:externalLink|sharedStrings|calcChain)"[^>]*\/>/g, '');
  const types = (await text('[Content_Types].xml'))
    .replace(/<Override PartName="\/xl\/(?:externalLinks\/[^"]+|sharedStrings\.xml|calcChain\.xml)"[^>]*\/>/g, '');
  const core = (await text('docProps/core.xml'))
    .replace(/<dc:creator>[^<]*<\/dc:creator>/, '<dc:creator>한백</dc:creator>')
    .replace(/<cp:lastModifiedBy>[^<]*<\/cp:lastModifiedBy>/, '<cp:lastModifiedBy>한백</cp:lastModifiedBy>');

  const out = new JSZip();
  const drop = (p: string) => /^xl\/externalLinks\//.test(p) || p === 'xl/sharedStrings.xml' || p === 'xl/calcChain.xml';
  const replaced: Record<string, string> = {
    [SHEET]: sheet, [PARTNERS]: partners, 'xl/workbook.xml': workbook, 'xl/_rels/workbook.xml.rels': rels,
    '[Content_Types].xml': types, 'docProps/core.xml': core,
  };
  for (const [p, f] of Object.entries(zip.files)) {
    if (f.dir || drop(p)) continue;
    out.file(p, replaced[p] ?? (await f.async('uint8array')));
  }

  /* ── 지운 값이 남지 않았는가 — 남은 칸에 쓰인 글자 말고는 원본의 공유 글자가 하나도 없어야 한다 ── */
  const all = (await Promise.all(Object.values(out.files).filter((f) => !f.dir).map((f) => f.async('string')))).join('\n');
  const plain = (si: string) => si.replace(/<rPh[\s\S]*?<\/rPh>/g, '').replace(/<[^>]+>/g, '');
  const kept = new Set([...sheet.matchAll(/<is>([\s\S]*?)<\/is>/g), ...partners.matchAll(/<is>([\s\S]*?)<\/is>/g)].map((m) => plain(m[1])));
  const leaked = shared.map(plain).filter((t) => t.trim().length >= 2 && !kept.has(t) && ![...kept].some((k) => k.includes(t)) && all.includes(t));
  /* 계좌 · 전화 꼴과 파일 경로 — 판 GUID({…}) · 만든 날(2022-03-03T…)은 그 꼴이 아니니 빼고 본다 */
  const scan = all.replace(/\{[0-9A-Fa-f-]{36}\}/g, '').replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, '');
  const pathy = /file:\/\/\/|Users\/|Downloads|[A-Z]:\/|\d{2,6}-\d{2,6}-\d{2,8}|01[016789]-?\d{3,4}-?\d{4}/.exec(scan);
  if (leaked.length || pathy) {
    throw new Error(`지운 값이 남았다 — ${leaked.length}개${pathy ? ` · 「${pathy[0].slice(0, 3)}…」꼴` : ''}. 틀을 쓰지 않는다.`);
  }
  writeFileSync(OUT, await out.generateAsync({ type: 'uint8array', compression: 'DEFLATE' }));
  console.log('틀', OUT, '· 남은 글자', kept.size, '· 걷은 공유 글자', shared.length - kept.size);
}

main().catch((e) => { console.error(String(e)); process.exit(1); });

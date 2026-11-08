/**
 * 구매요청간소화 엑셀의 캡처 — 지난 글은 본문 「구매 내역」 밑에 넣었고 파일로도 올렸다(웹훅은 그림을 못 넣어 첨부로). [순수 — HTML 만 짓는다]
 * (한백 2026-11-08 「중간에 엑셀파일 스크린샷 찍은것도 파일로 올려야해」 → 「엑셀양식이 바뀐거같네? 기존에 쓰던 엑셀 양식을 그대로 활용해줘」)
 *
 * ★채운 엑셀 그대로 그린다★ — 칸 모양(글꼴 크기 · 굵기 · 색 · 채움 · 테두리 · 맞춤 · 줄임 · 숫자 꼴)과 열 폭 · 줄 높이 · 합친 칸을 엑셀
 * (styles.xml · theme · sheet1.xml)에서 읽어 HTML 표로 옮기고, 서버 브라우저가 찍는다(lib/agit/statement-pdf). 첫 판은 같은 모형을 따로
 * 그려 엑셀과 모양이 갈렸다 — 이제 그림의 정본은 엑셀 하나다.
 * 찍는 자리는 지난 캡처(26년 9월 2차 글 본문)와 같다 — 구분 줄(5행)부터 소계 줄까지, C~N 열.
 * 글꼴: 맑은 고딕 · 굴림 · Noto Sans CJK 는 서버(리눅스)에 없어 콘솔과 같은 Pretendard(CDN)로 그린다 — 크기 · 굵기 · 색은 엑셀 값 그대로.
 * 엑셀의 「셀에 맞춤(shrinkToFit)」은 그림을 찍기 전에 글자를 줄여 칸에 맞춘다(아래 SHRINK 스크립트).
 */
import JSZip from 'jszip';

const FIRST_ROW = 5;
const FIRST_COL = 'C';
const LAST_COL = 'N';
/** 엑셀 열 폭 단위 → 화면 점(기본 글꼴의 숫자 폭 7점 — 100% 배율) */
const MDW = 7;
const PT = 4 / 3;

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unxml = (s: string): string => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d))).replace(/&amp;/g, '&');
/** 속성 값 — 꼬리표 통째로든 속성만 떼어 낸 글이든(첫 속성 앞에 빈칸이 없어도) */
const attr = (tag: string, k: string): string | undefined => new RegExp(`(?:^|\\s)${k}="([^"]*)"`).exec(tag)?.[1];

const colNum = (c: string): number => [...c].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
const colName = (n: number): string => (n > 26 ? colName(Math.floor((n - 1) / 26)) : '') + String.fromCharCode(65 + ((n - 1) % 26));

/* ── 색 ── */
function themePalette(theme: string): string[] {
  const scheme = /<a:clrScheme[\s\S]*?<\/a:clrScheme>/.exec(theme)?.[0] ?? '';
  const pick = (n: string) => {
    const m = new RegExp(`<a:${n}>([\\s\\S]*?)</a:${n}>`).exec(scheme)?.[1] ?? '';
    return /srgbClr val="([0-9A-Fa-f]{6})"/.exec(m)?.[1] ?? /lastClr="([0-9A-Fa-f]{6})"/.exec(m)?.[1] ?? '000000';
  };
  const [dk1, lt1, dk2, lt2, ...rest] = ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'].map(pick);
  /* 엑셀의 theme 번호는 앞의 두 쌍을 바꿔 센다 — 0 바탕(lt1) · 1 글자(dk1) */
  return [lt1, dk1, lt2, dk2, ...rest];
}

/** 엑셀의 tint — HSL 밝기를 옮긴다 */
function tinted(hex: string, tint: number): string {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  let l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  l = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint;
  const hue = (p: number, q: number, t: number) => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    return u < 1 / 6 ? p + (q - p) * 6 * u : u < 1 / 2 ? q : u < 2 / 3 ? p + (q - p) * (2 / 3 - u) * 6 : p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const rgb = s === 0 ? [l, l, l] : [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)];
  return rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');
}

function colorOf(tag: string | undefined, palette: string[], fallback: string | null): string | null {
  if (!tag) return fallback;
  if (attr(tag, 'auto') === '1') return '#000000';
  const rgb = attr(tag, 'rgb');
  if (rgb) return `#${rgb.slice(-6).toLowerCase()}`;
  const theme = attr(tag, 'theme');
  if (theme !== undefined) {
    const base = palette[Number(theme)] ?? '000000';
    const tint = Number(attr(tag, 'tint') ?? 0);
    return `#${(tint ? tinted(base, tint) : base).toLowerCase()}`;
  }
  const indexed = attr(tag, 'indexed');
  if (indexed === '8' || indexed === '64') return '#000000';
  if (indexed === '9' || indexed === '65') return '#ffffff';
  return fallback;
}

/* ── 칸 모양 ── */
interface Side { css: string; weight: number }
interface Look {
  font: { size: number; bold: boolean; italic: boolean; underline: boolean; color: string };
  fill: string | null;
  border: { left: Side | null; right: Side | null; top: Side | null; bottom: Side | null };
  h: string | null;
  v: string | null;
  wrap: boolean;
  shrink: boolean;
  format: string;
}

const BORDER: Record<string, [string, number]> = {
  hair: ['1px dotted', 1], thin: ['1px solid', 2], dotted: ['1px dotted', 1], dashed: ['1px dashed', 2], dashDot: ['1px dashed', 2],
  dashDotDot: ['1px dashed', 2], medium: ['2px solid', 3], mediumDashed: ['2px dashed', 3], mediumDashDot: ['2px dashed', 3],
  mediumDashDotDot: ['2px dashed', 3], slantDashDot: ['2px dashed', 3], thick: ['3px solid', 4], double: ['3px double', 4],
};

const BUILTIN_FORMATS: Record<string, string> = {
  0: 'General', 1: '0', 2: '0.00', 3: '#,##0', 4: '#,##0.00', 9: '0%', 10: '0.00%', 14: 'yyyy-mm-dd', 49: '@',
};

function looksOf(styles: string, palette: string[]): Look[] {
  const sec = (name: string) => new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`).exec(styles)?.[1] ?? '';
  const fonts = [...sec('fonts').matchAll(/<font(?:\s[^>]*)?>([\s\S]*?)<\/font>|<font\s*\/>/g)].map((m) => m[1] ?? '');
  const fills = [...sec('fills').matchAll(/<fill>([\s\S]*?)<\/fill>|<fill\s*\/>/g)].map((m) => m[1] ?? '');
  const borders = [...sec('borders').matchAll(/<border(?:\s[^>]*)?>([\s\S]*?)<\/border>|<border(?:\s[^>]*)?\/>/g)].map((m) => m[1] ?? '');
  const formats = new Map([...styles.matchAll(/<numFmt numFmtId="(\d+)" formatCode="([^"]*)"/g)].map((m) => [m[1], unxml(m[2])]));
  return [...sec('cellXfs').matchAll(/<xf ([^>]*?)(?:\/>|>([\s\S]*?)<\/xf>)/g)].map((m) => {
    const a = m[1];
    const inner = m[2] ?? '';
    const f = fonts[Number(attr(a, 'fontId') ?? 0)] ?? '';
    const fill = fills[Number(attr(a, 'fillId') ?? 0)] ?? '';
    const b = borders[Number(attr(a, 'borderId') ?? 0)] ?? '';
    const al = /<alignment ([^>]*)\/>/.exec(inner)?.[1] ?? '';
    const side = (name: string): Side | null => {
      const t = new RegExp(`<${name} style="(\\w+)"\\s*(?:/>|>([\\s\\S]*?)</${name}>)`).exec(b);
      if (!t) return null;
      const [css, weight] = BORDER[t[1]] ?? ['1px solid', 2];
      return { css: `${css} ${colorOf(/<color [^>]*\/>/.exec(t[2] ?? '')?.[0], palette, '#000000')}`, weight };
    };
    const pattern = /patternType="(\w+)"/.exec(fill)?.[1];
    const id = attr(a, 'numFmtId') ?? '0';
    return {
      font: {
        size: Number(/<sz val="([\d.]+)"/.exec(f)?.[1] ?? 11),
        bold: /<b\s*\/>|<b val="(?:1|true)"\s*\/>/.test(f),
        italic: /<i\s*\/>|<i val="(?:1|true)"\s*\/>/.test(f),
        underline: /<u(?:\s[^>]*)?\/>/.test(f),
        color: colorOf(/<color [^>]*\/>/.exec(f)?.[0], palette, '#000000') ?? '#000000',
      },
      fill: pattern && pattern !== 'none' ? colorOf(/<fgColor [^>]*\/>/.exec(fill)?.[0], palette, null) : null,
      border: { left: side('left'), right: side('right'), top: side('top'), bottom: side('bottom') },
      h: attr(al, 'horizontal') ?? null,
      v: attr(al, 'vertical') ?? null,
      wrap: attr(al, 'wrapText') === '1',
      shrink: attr(al, 'shrinkToFit') === '1',
      format: formats.get(id) ?? BUILTIN_FORMATS[id] ?? 'General',
    };
  });
}

/* ── 숫자 꼴 — 이 양식에 나오는 것(일반 · #,##0 · 회계 꼴 · 「General"月"」 · yyyy-mm-dd · @) ── */
function splitSections(code: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (ch === '"') quoted = !quoted;
    if (ch === '\\' && !quoted) { cur += ch + (code[i + 1] ?? ''); i++; continue; }
    if (ch === ';' && !quoted) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  return [...out, cur];
}

const general = (n: number): string => (Number.isInteger(n) ? String(n) : String(Number(n.toPrecision(10))));

function dateOf(serial: number, section: string): string {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000);
  const parts: Record<string, string> = {
    yyyy: String(d.getUTCFullYear()), yy: String(d.getUTCFullYear()).slice(2),
    mm: String(d.getUTCMonth() + 1).padStart(2, '0'), m: String(d.getUTCMonth() + 1),
    dd: String(d.getUTCDate()).padStart(2, '0'), d: String(d.getUTCDate()),
  };
  return section.replace(/\\(.)/g, '$1').replace(/"([^"]*)"/g, '$1').replace(/yyyy|yy|mm|m|dd|d/g, (t) => parts[t] ?? t);
}

/** 숫자 하나를 꼴 한 칸(section)으로 — fill 은 「* 」(칸을 채우는 반복 글자)가 있었는가: 있으면 엑셀은 숫자를 오른쪽 끝에 붙인다 */
function formatSection(section: string, n: number): { text: string; fill: boolean } {
  if (/[yd]/i.test(section.replace(/"[^"]*"/g, '')) && !/[#0]/.test(section)) return { text: dateOf(n, section), fill: false };
  let text = '';
  let fill = false;
  let i = 0;
  while (i < section.length) {
    const ch = section[i];
    if (ch === '"') { const j = section.indexOf('"', i + 1); text += section.slice(i + 1, j < 0 ? undefined : j); i = j < 0 ? section.length : j + 1; continue; }
    if (ch === '\\') { text += section[i + 1] ?? ''; i += 2; continue; }
    if (ch === '_') { text += ' '; i += 2; continue; }
    if (ch === '*') { fill = true; i += 2; continue; }
    if (ch === '@') { i++; continue; }
    if (section.startsWith('General', i)) { text += general(n); i += 7; continue; }
    const run = /^[#0,.]+/.exec(section.slice(i))?.[0];
    if (run && /[#0]/.test(run)) {
      const decimals = (run.split('.')[1] ?? '').replace(/[^0#]/g, '').length;
      text += n.toLocaleString('en-US', {
        minimumFractionDigits: (run.split('.')[1] ?? '').replace(/[^0]/g, '').length,
        maximumFractionDigits: decimals,
        useGrouping: run.includes(','),
      });
      i += run.length;
      continue;
    }
    text += ch;
    i++;
  }
  return { text, fill };
}

export function formatNumber(n: number, code: string): { text: string; fill: boolean } {
  if (code === 'General' || code === '') return { text: general(n), fill: false };
  const sections = splitSections(code);
  if (n < 0) return sections[1] !== undefined ? formatSection(sections[1], -n) : prefixMinus(formatSection(sections[0], -n));
  if (n === 0 && sections[2] !== undefined) return formatSection(sections[2], 0);
  return formatSection(sections[0], n);
}
const prefixMinus = (r: { text: string; fill: boolean }) => ({ ...r, text: `-${r.text}` });

/* ── 표 ── */
interface Cell { look: Look; text: string; numeric: boolean; fill: boolean }

function cellsOf(sheet: string, looks: Look[]): Map<string, Cell> {
  const out = new Map<string, Cell>();
  for (const m of sheet.matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const [, ref, a, inner = ''] = m;
    const look = looks[Number(attr(a, 's') ?? 0)] ?? looks[0];
    const t = attr(a, 't');
    let text = '';
    let numeric = false;
    let fill = false;
    if (t === 'inlineStr') {
      text = unxml([...inner.replace(/<rPh[\s\S]*?<\/rPh>/g, '').matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(''));
    } else {
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      if (v !== undefined) {
        if (t === 'str' || t === 'e') text = unxml(v);
        else if (t === 'b') text = v === '1' ? 'TRUE' : 'FALSE';
        else {
          const shown = formatNumber(Number(v), look.format);
          text = shown.text;
          fill = shown.fill;
          numeric = true;
        }
      }
    }
    out.set(ref, { look, text, numeric, fill });
  }
  return out;
}

/*
 * 「셀에 맞춤」 — 글자가 칸보다 길면 칸에 들 때까지 글자를 줄인다. 글꼴(CDN)이 오기 전에 한 번, 온 뒤에 다시(엑셀 크기에서 새로 줄인다) —
 * 찍는 쪽(statement-pdf)이 document.fonts.ready 를 기다리는 동안 이 두 번째가 먼저 돈다(같은 약속에 먼저 걸었다).
 */
const SHRINK = `<script>
  const shrink = () => {
    for (const box of document.querySelectorAll('[data-shrink]')) {
      let size = parseFloat(box.dataset.shrink);
      box.style.fontSize = size + 'px';
      while (box.scrollWidth > box.clientWidth + 0.5 && size > 5) { size -= 0.25; box.style.fontSize = size + 'px'; }
    }
  };
  shrink();
  document.fonts.ready.then(shrink);
</script>`;

/** 채운 구매요청간소화 엑셀(purchaseXlsx 의 결과) → 캡처할 HTML. 표의 id 는 sheet */
export async function purchaseHtml(xlsx: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(xlsx);
  const read = async (p: string) => (await zip.file(p)?.async('string')) ?? '';
  const [styles, theme, sheet] = await Promise.all([read('xl/styles.xml'), read('xl/theme/theme1.xml'), read('xl/worksheets/sheet1.xml')]);
  const looks = looksOf(styles, themePalette(theme));
  const cells = cellsOf(sheet, looks);

  /* 찍는 줄 — 구분(5행)부터 소계 줄까지 */
  const footRow = [...cells.entries()].find(([ref, c]) => ref.startsWith(`${FIRST_COL}`) && /^[A-Z]+\d+$/.test(ref)
    && c.text.replace(/\s/g, '') === '소계')?.[0];
  if (!footRow) throw new Error('엑셀에서 소계 줄을 찾지 못했습니다.');
  const lastRow = Number(footRow.replace(/[A-Z]+/, ''));
  const c1 = colNum(FIRST_COL);
  const c2 = colNum(LAST_COL);

  const defaultHeight = Number(attr(/<sheetFormatPr [^>]*>/.exec(sheet)?.[0] ?? '', 'defaultRowHeight') ?? 15);
  const defaultWidth = Number(attr(/<sheetFormatPr [^>]*>/.exec(sheet)?.[0] ?? '', 'defaultColWidth') ?? 8.43);
  const heights = new Map([...sheet.matchAll(/<row [^>]*?r="(\d+)"[^>]*>/g)].map((m) => [Number(m[1]), Number(attr(m[0], 'ht') ?? defaultHeight)]));
  const widths = new Map<number, number>();
  for (const m of sheet.matchAll(/<col [^>]*\/>/g)) {
    for (let c = Number(attr(m[0], 'min')); c <= Number(attr(m[0], 'max')); c++) widths.set(c, attr(m[0], 'hidden') === '1' ? 0 : Number(attr(m[0], 'width')));
  }
  const px = (w: number) => Math.trunc(((256 * w + Math.trunc(128 / MDW)) / 256) * MDW);

  /* 합친 칸 — 왼쪽 위 칸이 그리고 나머지는 빠진다 */
  const merges = [...sheet.matchAll(/<mergeCell ref="([A-Z]+)(\d+):([A-Z]+)(\d+)"\/>/g)].map((m) => ({
    c1: colNum(m[1]), r1: Number(m[2]), c2: colNum(m[3]), r2: Number(m[4]),
  }));
  const mergeAt = (c: number, r: number) => merges.find((g) => c >= g.c1 && c <= g.c2 && r >= g.r1 && r <= g.r2);

  const blank: Cell = { look: looks[0], text: '', numeric: false, fill: false };
  const cellAt = (c: number, r: number) => cells.get(`${colName(c)}${r}`) ?? blank;
  const sideCss = (s: Side | null) => (s ? s.css : 'none');

  const rows: string[] = [];
  for (let r = FIRST_ROW; r <= lastRow; r++) {
    const tds: string[] = [];
    for (let c = c1; c <= c2; c++) {
      const g = mergeAt(c, r);
      if (g && (g.c1 !== c || g.r1 !== r)) continue;
      const cell = cellAt(c, r);
      const { look } = cell;
      /* 합친 칸의 테두리는 가장자리 칸의 것 */
      const right = g ? cellAt(Math.min(g.c2, c2), r).look.border.right : look.border.right;
      const bottom = g ? cellAt(c, Math.min(g.r2, lastRow)).look.border.bottom : look.border.bottom;
      const span = g ? `${Math.min(g.c2, c2) > c ? ` colspan="${Math.min(g.c2, c2) - c + 1}"` : ''}${Math.min(g.r2, lastRow) > r ? ` rowspan="${Math.min(g.r2, lastRow) - r + 1}"` : ''}` : '';
      const align = cell.fill ? 'right' : look.h === 'center' || look.h === 'centerContinuous' ? 'center'
        : look.h === 'right' ? 'right' : look.h === 'left' ? 'left' : cell.numeric ? 'right' : 'left';
      const valign = look.v === 'center' ? 'middle' : look.v === 'top' ? 'top' : 'bottom';
      const font = `font-size:${(look.font.size * PT).toFixed(2)}px;${look.font.bold ? 'font-weight:700;' : ''}${look.font.italic ? 'font-style:italic;' : ''}${look.font.underline ? 'text-decoration:underline;' : ''}color:${look.font.color};`;
      const td = `border-left:${sideCss(look.border.left)};border-top:${sideCss(look.border.top)};border-right:${sideCss(right)};border-bottom:${sideCss(bottom)};`
        + `${look.fill ? `background:${look.fill};` : ''}text-align:${align};vertical-align:${valign};`;
      const text = look.wrap ? cell.text : cell.text.replace(/\s*\n\s*/g, ' ');
      const size = (look.font.size * PT).toFixed(2);
      const box = `<div class="${look.wrap ? 'w' : 'n'}"${look.shrink && !look.wrap ? ` data-shrink="${size}"` : ''} style="${font}">${esc(text)}</div>`;
      tds.push(`<td${span} style="${td}">${box}</td>`);
    }
    rows.push(`<tr style="height:${((heights.get(r) ?? defaultHeight) * PT).toFixed(2)}px">${tds.join('')}</tr>`);
  }
  const cols = Array.from({ length: c2 - c1 + 1 }, (_, i) => px(widths.get(c1 + i) ?? defaultWidth));
  const width = cols.reduce((s, w) => s + w, 0);

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/pretendard@1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700&display=block">
<style>
  /* 한자(틀의 「4月」 · 「해당 청구 月」)는 Pretendard 에 없고 서버(리눅스)에는 받칠 글꼴도 없다 — Noto Sans KR 이 받친다(쓰는 글자만 받는다) */
  body { margin: 0; padding: 16px; background: #fff; font-family: 'Pretendard Variable', Pretendard, 'Noto Sans KR', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; }
  table { border-collapse: collapse; table-layout: fixed; }
  td { padding: 0 3px; overflow: hidden; }
  .n { white-space: pre; overflow: hidden; line-height: 1.25; }
  .w { white-space: pre-wrap; word-break: keep-all; overflow-wrap: anywhere; line-height: 1.25; }
</style></head><body>
<table id="sheet" style="width:${width}px"><colgroup>${cols.map((w) => `<col style="width:${w}px">`).join('')}</colgroup>
${rows.join('\n')}
</table>
${SHRINK}
</body></html>`;
}

/**
 * 기설치 충전기 설치이력 엑셀을 읽는다 — ★판독 없이 코드로★.
 *
 * 양식은 한백이 배포한 것 하나다(public/notices/files/legacy-charger-history-template.xlsx):
 * 「행위 일자」 머리 줄 아래 「전체」 줄이 있고, 그 아래로 행위마다 한 줄씩 —
 * B 행위 일자 · C 구분(신규 설치 · 교체 설치 · 철거) · D 행위 기수 · E·F·G 철거·교체의 갈래 ·
 * H 최종 기설치 수량(=D+F) · I 수량 검증 · J 증빙 자료명 · K 비고.
 *
 * 협력사가 위에 서명 칸 같은 줄을 끼워 넣어 머리 줄이 내려가 있는 일이 있어서(충북 청주
 * 금천효성1차는 5행이 아니라 7행) 자리를 못 박지 않고 머리 글자로 찾는다. 수식의 캐시 값은
 * 믿지 않는다 — 엑셀이 아닌 도구로 저장하면 비어 있다. 합계는 여기서 다시 센다.
 */
import JSZip from 'jszip';

export interface LegacyRow {
  /** 엑셀의 행 번호 — 사람이 그 줄을 찾아갈 자리 */
  row: number;
  /** YYYY-MM-DD — 못 읽으면 null */
  date: string | null;
  /** 신규 설치 · 교체 설치 · 철거 (적힌 그대로) */
  kind: string | null;
  d: number | null;
  e: number | null;
  f: number | null;
  g: number | null;
  /** J 증빙 자료명 */
  evidence: string | null;
  /** K 비고 — 보조사업 행은 여기에 사업연도·대기번호를 적는다 */
  note: string | null;
}

export interface LegacySheet {
  rows: LegacyRow[];
  /** 지금 서 있는 수 — 신규 설치 − 철거 (양식 「전체」 줄의 D 와 같은 셈) */
  standing: number;
  /** 최종 기설치 수량 — standing + F (양식 H) */
  final: number;
  /** 교체·철거인데 E+F+G 가 D 와 다른 줄 (양식 I열 FALSE) */
  badSplit: number[];
  /** 「이력 없음」으로 적은 엑셀 — 행 없이 비고에만 적는다 */
  none: boolean;
  /**
   * 서명 칸 — 「(설치 신청자)」(아파트)와 「(사업수행기관)」(운영사). null 이면 서명 칸이 없는 옛 양식이다
   * (260826 양식부터 있다). 직인은 그 칸 위에 박힌 그림으로 본다(날인본 엑셀이 그렇게 온다).
   */
  sign: SheetSign | null;
}

export interface SignSide {
  /** 신청자명·사업자명 칸에 적힌 이름 — 비었으면 null */
  name: string | null;
  /** 그 칸 위에 도장 그림이 있는가 */
  seal: boolean;
}
export interface SheetSign {
  applicant: SignSide;
  operator: SignSide;
}

interface Range { c1: number; c2: number; r1: number; r2: number }

/** 머리 글자 → 열. 못 찾으면 양식의 자리(B~K)로 둔다 */
const HEADS: { key: keyof Omit<LegacyRow, 'row'> | 'no' | 'h'; test: RegExp; fallback: number }[] = [
  { key: 'no', test: /^연번$/, fallback: 1 },
  { key: 'date', test: /^행위일자/, fallback: 2 },
  { key: 'kind', test: /^구분$/, fallback: 3 },
  { key: 'd', test: /^행위기수/, fallback: 4 },
  { key: 'e', test: /8년이후/, fallback: 5 },
  { key: 'f', test: /임의/, fallback: 6 },
  { key: 'g', test: /불가피/, fallback: 7 },
  { key: 'h', test: /최종기설치/, fallback: 8 },
  { key: 'evidence', test: /증빙자료/, fallback: 10 },
  { key: 'note', test: /^비고$/, fallback: 11 },
];

const flat = (s: string) => s.normalize('NFC').replace(/\s+/g, '');

const unxml = (s: string) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&amp;/g, '&');

/** <si>·<is> 안의 글자를 이어 붙인다 — 서식이 섞인 글(run)은 <t> 가 여럿이다 */
const textOf = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unxml(m[1])).join('');

export function colIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A';
  return [...letters].reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0);
}

type Cell = string | number | boolean | null;

/** 「A5:E5」 → 범위 */
function rangeOf(ref: string): Range | null {
  const m = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(ref);
  if (!m) return null;
  const c1 = colIndex(m[1]); const r1 = Number(m[2]);
  return { c1, r1, c2: m[3] ? colIndex(m[3]) : c1, r2: m[4] ? Number(m[4]) : r1 };
}

/** rels 의 Target(상대 경로)을 zip 안의 경로로 — 「../drawings/drawing1.xml」 from xl/worksheets/ */
function resolve(fromDir: string, target: string): string {
  if (target.startsWith('/')) return target.slice(1);
  const parts = fromDir.split('/').filter(Boolean);
  for (const seg of target.split('/')) {
    if (seg === '..') parts.pop();
    else if (seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

/**
 * 시트에 박힌 그림의 가운데 칸(1부터) — 도장이 어느 서명 칸 위에 있는지 보는 데 쓴다.
 * 시작 칸이 아니라 가운데로 본다: 도장이 칸 경계를 걸쳐 박히는 일이 있다.
 */
async function picturesOf(zip: JSZip, sheetPath: string, sheet: string): Promise<{ col: number; row: number }[]> {
  const rid = /<drawing\b[^>]*r:id="([^"]+)"/.exec(sheet)?.[1];
  if (!rid) return [];
  const dir = sheetPath.replace(/\/[^/]+$/, '');
  const relsXml = await zip.file(`${dir}/_rels/${sheetPath.split('/').pop()}.rels`)?.async('string');
  const target = relsXml && (new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`).exec(relsXml)?.[1]
    ?? new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rid}"`).exec(relsXml)?.[1]);
  if (!target) return [];
  const drawing = await zip.file(resolve(dir, target))?.async('string');
  if (!drawing) return [];
  const at = (blk: string | undefined) => {
    if (!blk) return null;
    const col = /<xdr:col>(\d+)<\/xdr:col>/.exec(blk)?.[1];
    const row = /<xdr:row>(\d+)<\/xdr:row>/.exec(blk)?.[1];
    return col && row ? { col: Number(col) + 1, row: Number(row) + 1 } : null;
  };
  const out: { col: number; row: number }[] = [];
  for (const m of drawing.matchAll(/<xdr:(twoCellAnchor|oneCellAnchor)\b[\s\S]*?<\/xdr:\1>/g)) {
    if (!/<xdr:pic>/.test(m[0])) continue;
    const from = at(/<xdr:from>([\s\S]*?)<\/xdr:from>/.exec(m[0])?.[1]);
    const to = at(/<xdr:to>([\s\S]*?)<\/xdr:to>/.exec(m[0])?.[1]) ?? from;
    if (from && to) out.push({ col: (from.col + to.col) / 2, row: (from.row + to.row) / 2 });
  }
  return out;
}

async function readCells(buf: Buffer): Promise<{
  cells: Map<number, Map<number, Cell>>; date1904: boolean; merges: Range[]; pictures: { col: number; row: number }[];
}> {
  const zip = await JSZip.loadAsync(buf);
  const read = (p: string) => zip.file(p)?.async('string') ?? Promise.resolve(null);

  const workbook = (await read('xl/workbook.xml')) ?? '';
  const date1904 = /date1904="(1|true)"/.test(workbook);
  // 첫 시트 — 통합문서의 시트 순서를 따른다(파일 이름 sheet1 이 첫 시트라는 보장이 없다)
  const firstRid = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(workbook)?.[1];
  const rels = (await read('xl/_rels/workbook.xml.rels')) ?? '';
  const target = firstRid
    ? new RegExp(`<Relationship\\b[^>]*Id="${firstRid}"[^>]*Target="([^"]+)"`).exec(rels)?.[1]
      ?? new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${firstRid}"`).exec(rels)?.[1]
    : undefined;
  const named = target ? `xl/${target.replace(/^\/?xl\//, '').replace(/^\//, '')}` : null;
  const namedXml = named ? await read(named) : null;
  const sheetPath = namedXml ? named! : 'xl/worksheets/sheet1.xml';
  const sheet = namedXml ?? (await read(sheetPath));
  if (!sheet) throw new Error('엑셀에서 시트를 찾지 못했습니다.');

  const sharedXml = (await read('xl/sharedStrings.xml')) ?? '';
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));

  const cells = new Map<number, Map<number, Cell>>();
  for (const m of sheet.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attrs = m[1];
    const ref = /\br="([A-Z]+)(\d+)"/.exec(attrs);
    if (!ref) continue;
    const inner = m[2] ?? '';
    const t = /\bt="([^"]+)"/.exec(attrs)?.[1];
    const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
    let value: Cell = null;
    if (t === 's') value = v !== undefined ? shared[Number(v)] ?? null : null;
    else if (t === 'inlineStr') value = textOf(inner);
    else if (t === 'str') value = v !== undefined ? unxml(v) : null;
    else if (t === 'b') value = v === '1';
    else if (v !== undefined && v !== '') value = Number(v);
    if (value === null || value === '') continue;
    const row = Number(ref[2]);
    const col = colIndex(ref[1]);
    if (!cells.has(row)) cells.set(row, new Map());
    cells.get(row)!.set(col, value);
  }
  const merges = [...sheet.matchAll(/<mergeCell\b[^>]*ref="([^"]+)"/g)]
    .map((m) => rangeOf(m[1])).filter((r): r is Range => r !== null);
  return { cells, date1904, merges, pictures: await picturesOf(zip, sheetPath, sheet) };
}

/**
 * 서명 칸을 찾고, 그 칸 위에 도장 그림이 있는지 본다.
 *
 * 칸의 범위는 병합 셀이다(양식: 신청자 A5:E5 · 사업수행기관 F5:H5). 병합이 없으면 두 칸 사이를
 * 나눠 쓴다. 도장은 칸 글자 줄보다 아래로 늘어지는 일이 있어 아래로 두 줄까지 본다.
 */
function signOf(
  cells: Map<number, Map<number, Cell>>, merges: Range[], pictures: { col: number; row: number }[]
): SheetSign | null {
  const find = (re: RegExp) => {
    for (const [r, m] of cells) for (const [c, v] of m) if (typeof v === 'string' && re.test(flat(v))) return { r, c, text: v };
    return null;
  };
  const app = find(/\(설치신청자\)/);
  const op = find(/\(사업수행기관\)/);
  if (!app && !op) return null;

  const span = (at: { r: number; c: number }, other: { c: number } | null): Range =>
    merges.find((g) => at.r >= g.r1 && at.r <= g.r2 && at.c >= g.c1 && at.c <= g.c2)
      ?? { r1: at.r, r2: at.r, c1: at.c, c2: other && other.c > at.c ? other.c - 1 : at.c + 4 };
  const nameAfter = (text: string, label: RegExp) => {
    const m = label.exec(text.normalize('NFC'));
    const v = m?.[1]?.trim();
    return v ? v : null;
  };
  const side = (at: { r: number; c: number; text: string } | null, other: { c: number } | null, label: RegExp): SignSide => {
    if (!at) return { name: null, seal: false };
    const g = span(at, other);
    return {
      name: nameAfter(at.text, label),
      seal: pictures.some((p) => p.col >= g.c1 - 0.5 && p.col <= g.c2 + 0.5 && p.row >= g.r1 - 0.5 && p.row <= g.r2 + 2),
    };
  };
  return {
    // 콜론 뒤는 같은 줄만 — 비어 있으면 다음 줄 「대표자 성명」을 이름으로 잡는다
    applicant: side(app, op, /신청자명[ \t]*[:：][ \t]*([^\r\n]*)/),
    operator: side(op, app, /사업자명[ \t]*[:：][ \t]*([^\r\n]*)/),
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 엑셀 날짜(일련번호)나 글자로 적은 날짜를 YYYY-MM-DD 로 */
export function dateOf(v: Cell, date1904 = false): string | null {
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
    const base = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
    const d = new Date(base + Math.round(v) * 86_400_000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  if (typeof v === 'string') {
    const m = /(\d{4})\s*[.\-/년]\s*(\d{1,2})\s*[.\-/월]\s*(\d{1,2})/.exec(v);
    if (m) return `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`;
  }
  return null;
}

const numOf = (v: Cell): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const m = /-?\d+(?:\.\d+)?/.exec(v.replace(/,/g, ''));
    return m ? Number(m[0]) : null;
  }
  return null;
};

const strOf = (v: Cell): string | null => (v === null || typeof v === 'boolean' ? null : String(v).trim() || null);

export async function readLegacySheet(buf: Buffer): Promise<LegacySheet> {
  const { cells, date1904, merges, pictures } = await readCells(buf);
  const rowNums = [...cells.keys()].sort((a, b) => a - b);

  // 칸 글자가 「행위 일자」 그 자체인 줄 — 위쪽 유의 사항 글에도 「[B열]: 행위 일자」가 있다
  const headRow = rowNums.find((r) => [...cells.get(r)!.values()].some((v) => typeof v === 'string' && /^행위일자(\(.*\))?$/.test(flat(v))));
  if (headRow === undefined) throw new Error('설치이력 양식이 아닙니다 — 「행위 일자」 머리 줄을 찾지 못했습니다.');

  // 증빙 자료명은 머리 줄 바로 아래에 따로 있다(양식 J6) — 두 줄을 같이 본다
  const col: Record<string, number> = {};
  for (const h of HEADS) {
    for (const r of [headRow, headRow + 1]) {
      for (const [c, v] of cells.get(r) ?? []) {
        if (col[h.key] === undefined && typeof v === 'string' && h.test.test(flat(v))) col[h.key] = c;
      }
    }
    col[h.key] ??= h.fallback;
  }

  const get = (r: number, key: string) => cells.get(r)?.get(col[key]) ?? null;
  const totalRow = rowNums.find((r) => r > headRow && flat(String(get(r, 'no') ?? '')) === '전체');
  const start = totalRow ?? headRow + 1;

  const rows: LegacyRow[] = [];
  for (const r of rowNums) {
    if (r <= start) continue;
    const kind = strOf(get(r, 'kind'));
    const d = numOf(get(r, 'd'));
    const date = dateOf(get(r, 'date'), date1904);
    // I열 수식만 깔린 빈 줄은 건너뛴다 — 구분·기수·일자 중 하나라도 있어야 행위다
    if (!kind && d === null && !date) continue;
    rows.push({
      row: r, date, kind, d,
      e: numOf(get(r, 'e')), f: numOf(get(r, 'f')), g: numOf(get(r, 'g')),
      evidence: strOf(get(r, 'evidence')),
      note: strOf(get(r, 'note')),
    });
  }

  const sum = (pick: (x: LegacyRow) => number | null, when: (x: LegacyRow) => boolean = () => true) =>
    rows.filter(when).reduce((n, x) => n + (pick(x) ?? 0), 0);
  const isNew = (x: LegacyRow) => /신규/.test(flat(x.kind ?? ''));
  const isGone = (x: LegacyRow) => /철거/.test(flat(x.kind ?? '')) && !/교체/.test(flat(x.kind ?? ''));
  const standing = sum((x) => x.d, isNew) - sum((x) => x.d, isGone);

  // 머리 줄 위는 양식의 유의 사항이라 「이력」 글자가 많다 — 그 아래만 본다
  const allText = rowNums.filter((r) => r > headRow)
    .flatMap((r) => [...cells.get(r)!.values()])
    .filter((v): v is string => typeof v === 'string');
  return {
    rows,
    standing,
    final: standing + sum((x) => x.f),
    badSplit: rows
      .filter((x) => !isNew(x) && x.d !== null && x.d !== (x.e ?? 0) + (x.f ?? 0) + (x.g ?? 0))
      .map((x) => x.row),
    none: rows.length === 0 && allText.some((t) => /이력(이)?없음/.test(flat(t))),
    sign: signOf(cells, merges, pictures),
  };
}

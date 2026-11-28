/**
 * 한백사업내역리스트 엑셀을 칸으로 읽는다 — 패스스루 집행 글(lib/agit/passthru)의 재료. [서버 · 시험 — 바이트만 받는다]
 * (한백 2026-11-28 「차수와 지급품목은 … 한백사업내역리스트 … 지급해야할 건수들은 매입내역에 있고 우리가 받아야할건 … 총 매출(원도급사기준)
 *  노랑색 하이라이트되어있는 부분이야」)
 *
 * ★판독(AI)을 부르지 않는다 — 코드가 칸을 읽는다★: 금액 · 계좌가 엑셀에 칸으로 있어 옮겨 적을 일이 없다. 세 시트를 읽는다 — 「매입내역」(차수별
 * 지급 줄)과 「EPC사업내역리스트」(현장별 기성 · 세금계산서)는 꼭 있어야 하고, 「매출수금매입내역_총괄」은 입금 예정일(수금일자)만 본다 — 없거나
 * 못 읽어도 짓는다(입금 예정일 미정). 행이 숨겨져 있어도(필터) 읽는다 — 차수로 고르지 필터로 고르지 않는다.
 * 수식 칸은 엑셀이 저장해 둔 값을 읽는다(다시 셈하지 않는다). xlsx 만 받는다 — 옛 엑셀(.xls)은 칸 구조가 달라 읽지 못한다.
 *
 * 정산 담당 대화에는 이 엑셀을 통째로 싣지 않고 요약만 싣는다(passthruSheetBrief → lib/agents/file-text) — 통째면 6만 자(≈ 9만 토큰)다.
 */
import JSZip from 'jszip';
import { passthruBriefOf, passthruReadOf, type Cell, type PassthruBook, type PassthruRead, type SheetRow } from './passthru';

/** 읽는 시트 — 이름으로 찾는다(차례는 바뀔 수 있다) */
export const PASSTHRU_SHEETS = { purchase: '매입내역', epc: 'EPC사업내역리스트', ledger: '매출수금매입내역_총괄' } as const;

const unxml = (s: string): string => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
  .replace(/&#x([0-9a-f]+);/gi, (_, n: string) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, '&');
/** 글 조각들(<t>) — 서식이 갈린 글(<r><t>…</t></r>)도 이어 붙인다. 읽는 법 표시(<rPh>)는 뺀다 */
const textsOf = (xml: string): string => unxml([...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t(?:\s[^>]*)?>([^<]*)<\/t>/g)]
  .map((m) => m[1]).join(''));

/** 시트 하나 — 행마다 열 글자 → 값 */
function rowsOf(xml: string, shared: readonly string[]): SheetRow[] {
  const out: SheetRow[] = [];
  for (const [, r, body] of xml.matchAll(/<row\b[^>]*?\br="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
    const c: Record<string, Cell> = {};
    for (const [, col, attrs, inner = ''] of body.matchAll(/<c\b[^>]*?\br="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
      if (type === 'inlineStr') {
        c[col] = textsOf(inner);
        continue;
      }
      const v = /<v>([^<]*)<\/v>/.exec(inner)?.[1];
      if (v === undefined) continue;
      if (type === 's') c[col] = shared[Number(v)] ?? '';
      else if (type === 'str' || type === 'e') c[col] = unxml(v);
      else if (type === 'b') c[col] = v === '1' ? 'TRUE' : 'FALSE';
      else {
        const n = Number(v);
        c[col] = Number.isFinite(n) ? n : unxml(v);
      }
    }
    out.push({ r: Number(r), c });
  }
  return out;
}

/** 열린 xlsx — 시트 이름(차례대로)과 이름으로 시트 읽기 */
interface OpenBook {
  names: string[];
  /** 그 이름의 시트 — 없으면 null */
  sheet(name: string): Promise<SheetRow[] | null>;
}

/** xlsx 바이트를 연다 — xlsx 가 아니면 사람 말로 던진다 */
async function openBook(bytes: Uint8Array): Promise<OpenBook> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch {
    throw new Error('엑셀(xlsx)로 열리지 않습니다 — 한백사업내역리스트를 xlsx 로 넘겨 주세요.');
  }
  const book = await zip.file('xl/workbook.xml')?.async('string');
  const rels = await zip.file('xl/_rels/workbook.xml.rels')?.async('string');
  if (!book || !rels) throw new Error('엑셀(xlsx)로 열리지 않습니다 — 한백사업내역리스트를 xlsx 로 넘겨 주세요.');
  /* 공유 글자는 시트를 처음 읽을 때 — 이름만 보고 돌아가는 엑셀(요약 대상이 아닌 것)은 풀지 않는다 */
  let shared: string[] | null = null;
  const sharedOf = async (): Promise<string[]> => {
    if (shared) return shared;
    const xml = (await zip.file('xl/sharedStrings.xml')?.async('string')) ?? '';
    shared = [...xml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textsOf(m[1]));
    return shared;
  };
  const tags = [...book.matchAll(/<sheet\b[^>]*>/g)].map((m) => m[0]);
  const nameOf = (tag: string): string => unxml(/\bname="([^"]*)"/.exec(tag)?.[1] ?? '').trim();
  return {
    names: tags.map(nameOf),
    async sheet(name) {
      const tag = tags.find((t) => nameOf(t) === name);
      const rid = tag ? /\br:id="([^"]+)"/.exec(tag)?.[1] : undefined;
      const rel = rid ? [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((t) => new RegExp(`\\bId="${rid}"`).test(t)) : undefined;
      const target = rel ? /\bTarget="([^"]+)"/.exec(rel)?.[1] : undefined;
      if (!target) return null;
      const path = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
      const xml = await zip.file(path)?.async('string');
      if (!xml) throw new Error(`엑셀의 「${name}」 시트를 읽지 못했습니다.`);
      return rowsOf(xml, await sharedOf());
    },
  };
}

/** 열린 엑셀 → 시트들. 매입내역 · EPC사업내역리스트가 없으면 던지고, 총괄은 없거나 못 읽어도 빈다(입금 예정일 미정) */
async function bookOf(open: OpenBook): Promise<PassthruBook> {
  const must = async (name: string): Promise<SheetRow[]> => {
    const rows = await open.sheet(name);
    if (!rows) throw new Error(`엑셀에 「${name}」 시트가 없습니다 — 한백사업내역리스트가 맞는지 봐 주세요.`);
    return rows;
  };
  const purchase = await must(PASSTHRU_SHEETS.purchase);
  const epc = await must(PASSTHRU_SHEETS.epc);
  const ledger = await open.sheet(PASSTHRU_SHEETS.ledger).catch(() => null);
  return ledger ? { purchase, epc, ledger } : { purchase, epc };
}

/** xlsx 바이트 → 시트들. 꼭 있어야 할 시트가 없거나 xlsx 가 아니면 사람 말로 던진다 */
export async function passthruBookOf(bytes: Uint8Array): Promise<PassthruBook> {
  return bookOf(await openBook(bytes));
}

/**
 * 정산 담당 대화에 실을 이 엑셀의 요약(lib/agents/file-text) — 한백사업내역리스트가 아니면(매입내역 · EPC사업내역리스트 두 시트가 없으면) null 이라
 * 다른 엑셀은 평소대로 통째로 싣는다. 한백사업내역리스트인데 지금 차를 못 읽으면 그 까닭을 요약에 적는다(담당이 한백에게 말한다).
 */
export async function passthruSheetBrief(bytes: Uint8Array): Promise<string | null> {
  const open = await openBook(bytes).catch(() => null);
  if (!open || !open.names.includes(PASSTHRU_SHEETS.purchase) || !open.names.includes(PASSTHRU_SHEETS.epc)) return null;
  let read: PassthruRead | Error;
  try {
    read = passthruReadOf(await bookOf(open));
  } catch (e) {
    read = e instanceof Error ? e : new Error(String(e));
  }
  return passthruBriefOf(open.names, read);
}

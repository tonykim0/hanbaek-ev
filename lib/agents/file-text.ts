/**
 * 넘긴 파일에서 글자를 뽑는다 (서버 전용) — PDF · 그림은 Claude 가 주소로 바로 읽고, 나머지 중 읽을 수 있는 것만 여기서
 * 글자로 바꿔 에이전트에게 준다(lib/agents/files agentFileRead).
 *
 * 엑셀(.xlsx) · 워드(.docx) · 한글(.hwpx)은 압축 안의 XML 이라 jszip 으로 연다(저장소의 다른 서식 도구와 같은 방식 —
 * lib/legacy-sheet). 서식은 버리고 값만 남긴다: 엑셀은 시트마다 탭으로 가른 줄, 워드·한글은 문단. 옛 한글(.hwp) · 옛 엑셀
 * (.xls)은 바이너리라 읽지 않는다 — 이름만 넘긴다.
 *
 * 읽지 못해도 던지지 않는다 — 파일 하나 때문에 답이 막히면 안 된다. null 이면 에이전트는 이름만 안다.
 */
import JSZip from 'jszip';
import { agentFileRead } from './files';
import type { AgentFile, AgentMessage } from '@/types/agents';
import { readBlob } from '@/lib/blob/server';

/** 한 파일에서 넘기는 글자 상한 — 넘으면 자르고 잘랐다고 적는다 */
const TEXT_CAP = 60_000;
/** 엑셀 한 시트에서 읽는 줄 상한 */
const ROW_CAP = 3000;
/** 받아 오는 파일 크기 상한 — 이보다 크면 글자 뽑기를 건너뛴다 */
const FETCH_CAP = 25 * 1024 * 1024;

const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function unescapeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITY[e.toLowerCase()] ?? _;
  });
}

const stripTags = (xml: string) => unescapeXml(xml.replace(/<[^>]+>/g, ''));

function clipText(s: string): string {
  const t = s.replace(/\n{3,}/g, '\n\n').trim();
  return t.length > TEXT_CAP ? `${t.slice(0, TEXT_CAP)}\n…(이하 ${t.length - TEXT_CAP}자 생략)` : t;
}

/** 글 파일 — UTF-8 로 읽고, 깨지면 EUC-KR(한글 엑셀이 내보낸 CSV 가 흔히 그렇다) */
export function decodeText(buf: Buffer): string {
  const utf8 = buf.toString('utf8');
  if (!utf8.includes('�')) return utf8.replace(/^﻿/, '');
  try {
    return new TextDecoder('euc-kr').decode(buf);
  } catch {
    return utf8;
  }
}

/** 'B12' → 1 (열 번호, 0부터) */
function colOf(ref: string): number {
  const letters = ref.match(/^[A-Z]+/)?.[0] ?? 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export async function xlsxText(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const read = (path: string) => zip.file(path)?.async('string') ?? Promise.resolve('');
  const [book, rels, sharedXml] = await Promise.all([
    read('xl/workbook.xml'), read('xl/_rels/workbook.xml.rels'), read('xl/sharedStrings.xml'),
  ]);
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) =>
    [...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => unescapeXml(t[1])).join(''));
  const targets = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [
    m[0].match(/\bId="([^"]+)"/)?.[1] ?? '', m[0].match(/\bTarget="([^"]+)"/)?.[1] ?? '',
  ]));
  const out: string[] = [];
  for (const m of book.matchAll(/<sheet\b[^>]*>/g)) {
    const name = unescapeXml(m[0].match(/\bname="([^"]*)"/)?.[1] ?? '');
    const rid = m[0].match(/\br:id="([^"]+)"/)?.[1] ?? '';
    const target = (targets.get(rid) ?? '').replace(/^\/?xl\//, '').replace(/^\//, '');
    const xml = target ? await read(`xl/${target}`) : '';
    const rows: string[] = [];
    for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      if (rows.length >= ROW_CAP) {
        rows.push('…(이하 줄 생략)');
        break;
      }
      const cells: string[] = [];
      for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1];
        const inner = c[2] ?? '';
        const ref = attrs.match(/\br="([A-Z]+)\d+"/)?.[1];
        const type = attrs.match(/\bt="([^"]+)"/)?.[1];
        const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
        let value = '';
        if (type === 's' && v !== undefined) value = shared[Number(v)] ?? '';
        else if (type === 'inlineStr') value = stripTags(inner.match(/<is>([\s\S]*?)<\/is>/)?.[1] ?? '');
        else if (v !== undefined) value = unescapeXml(v);
        if (!value) continue;
        const at = ref ? colOf(ref) : cells.length;
        while (cells.length < at) cells.push('');
        cells[at] = value.replace(/[\t\r\n]+/g, ' ');
      }
      if (cells.some((x) => x)) rows.push(cells.join('\t'));
    }
    out.push(`## 시트 「${name}」 (${rows.length}줄)`, ...rows, '');
  }
  return clipText(out.join('\n'));
}

export async function docxText(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const xml = (await zip.file('word/document.xml')?.async('string')) ?? '';
  return clipText(stripTags(xml.replace(/<w:tab\/>/g, '\t').replace(/<w:br\/>/g, '\n').replace(/<\/w:p>/g, '\n')));
}

export async function hwpxText(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const sections = Object.keys(zip.files)
    .filter((p) => /^Contents\/section\d+\.xml$/i.test(p))
    .sort((a, b) => Number(a.match(/\d+/)?.[0] ?? 0) - Number(b.match(/\d+/)?.[0] ?? 0));
  const parts: string[] = [];
  for (const p of sections) {
    const xml = (await zip.file(p)?.async('string')) ?? '';
    parts.push(stripTags(xml.replace(/<hp:tab\/>/g, '\t').replace(/<hp:lineBreak\/>/g, '\n').replace(/<\/hp:p>/g, '\n')));
  }
  return clipText(parts.join('\n'));
}

/** 한 파일의 글자 — 읽을 형식이 아니거나 못 받으면 null */
export async function fileText(file: Pick<AgentFile, 'name' | 'url' | 'size'>): Promise<string | null> {
  const how = agentFileRead(file.name);
  if (how !== 'text' && how !== 'sheet' && how !== 'word' && how !== 'hwpx') return null;
  if (file.size > FETCH_CAP) return null;
  try {
    const buf = await readBlob(file.url); // 비공개 저장소 — SDK 로 읽는다(lib/blob/server)
    if (how === 'text') return clipText(decodeText(buf));
    if (how === 'sheet') return await xlsxText(buf);
    if (how === 'word') return await docxText(buf);
    return await hwpxText(buf);
  } catch (e) {
    console.error('[agent] 파일 글자 뽑기 실패', file.name, e);
    return null;
  }
}

/** 대화에 붙은 파일 중 글자로 넘길 것을 한꺼번에 — 파일 id → 글자(못 읽으면 넣지 않는다) */
export async function fileTextsOf(history: AgentMessage[]): Promise<Map<string, string>> {
  const files = history.flatMap((m) => m.files);
  const texts = await Promise.all(files.map(async (f) => [f.id, await fileText(f)] as const));
  return new Map(texts.filter((x): x is readonly [string, string] => x[1] !== null));
}

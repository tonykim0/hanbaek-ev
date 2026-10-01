/**
 * 판독 한 번에 못 싣는 큰 묶음을 ★나눠 읽고 합친다★ (서버 전용).
 *
 * ★왜 필요한가★ 판독 요청 하나는 32MB 가 한도이고 base64 로 실으면 1.33배가 되므로
 * 원본 기준 20MB 씩만 보낸다. 그전에는 ZIP 안 PDF 합계가 20MB 를 넘으면 접수를 통째로
 * 거절했다 — 2026-10-01 에 32MB·42MB 묶음 둘이 그렇게 막혔고, 그 거절 문구는 화면
 * 맨 아래에 떠서 접수하는 사람은 「스캔 중」 뒤에 아무 일도 없는 것으로 봤다
 * (한백 지시 「그냥 50메가 이상 파일 받게 해」).
 *
 * ★나누는 법★ 파일은 통째로 묶음에 담는다(한 묶음 20MB 까지). 한 파일이 혼자 20MB 를
 * 넘으면 쪽 단위로 잘라 조각을 따로 담는다 — 이름에 조각 표지를 붙이고, 판독이 돌려준
 * 쪽 번호에 조각의 시작 쪽을 더해 원본 파일의 쪽으로 되돌린다. 그래서 뒤 단계
 * (buildUploadItems 의 쪽대로 자르기)는 나눠 읽은 줄 모른다.
 *
 * ★합치는 법★ 서류 목록(files)은 이어 붙인다. 현장 값(현장명·주소·대수…)은 묶음 순서대로
 * 처음 나온 값을 쓴다 — 계약서가 든 묶음이 보통 앞이고(ZIP 안 순서), 값이 갈리면 사람이
 * 접수 화면에서 본다. 운영사는 합집합, 확신도는 큰 쪽.
 */
import { PDFDocument } from 'pdf-lib';
import type { ClassifiedFileInfo, ExtractedMetadata } from '@/types/intake';
import { classifyAndExtract } from './claude';
import type { NormalizedFile } from './files';

/** 한 번의 판독에 싣는 원본 크기 — base64(1.33배)로 32MB 요청 한도 아래에 선다 */
export const READ_BUDGET_BYTES = 20 * 1024 * 1024;
/**
 * 여기를 넘으면 받지 않는다 — 판독 호출이 열 번을 넘어 접수 시간(라우트 300초)을 넘긴다.
 * 이만큼 큰 묶음은 거의 언제나 해상도를 안 줄인 스캔이라 줄여 달라고 하는 편이 맞다.
 */
export const READ_MAX_TOTAL_BYTES = 160 * 1024 * 1024;
/** 동시에 도는 판독 수 — 한꺼번에 두드리면 과부하(529)로 되레 늦다 */
const CONCURRENCY = 3;

/** 큰 파일에서 잘라 낸 조각 — 판독 결과를 원본으로 되돌릴 때 쓴다 */
export interface Part {
  file: NormalizedFile;
  /** 원본 파일 이름 */
  origin: string;
  /** 이 조각의 첫 쪽이 원본에서 몇 쪽 뒤인가 (0부터) */
  offset: number;
  pages: number;
  /** 원본의 전체 쪽수 — 판독에서 빠진 쪽을 채울 때 쓴다(cover) */
  total: number;
}

const mb = (n: number) => Math.round(n / 1024 / 1024);

/** 크기 때문에 거절할 때의 말 — 접수 화면이 ZIP 놓는 자리 바로 밑에 띄운다 */
export function tooLargeMessage(totalBytes: number): string {
  return `PDF 합계가 ${mb(totalBytes)}MB 라 읽을 수 없습니다(최대 ${mb(READ_MAX_TOTAL_BYTES)}MB). `
    + '스캔 해상도를 낮춰(200dpi·흑백 권장) 파일을 줄이거나 ZIP 을 나눠 올려 주세요.';
}

/** 혼자 한도를 넘는 PDF 를 쪽 단위 조각으로 — 조각마다 한도 아래가 되게 줄여 가며 자른다 */
async function splitByBudget(file: NormalizedFile): Promise<Part[]> {
  const src = await PDFDocument.load(file.buffer, { ignoreEncryption: true });
  const total = src.getPageCount();
  const parts: Part[] = [];
  let start = 0;
  let seq = 1;
  while (start < total) {
    // 쪽당 평균 크기로 첫 어림을 잡고, 넘으면 줄인다
    let take = Math.max(1, Math.floor((total - start) * (READ_BUDGET_BYTES / file.buffer.length) * 0.9));
    take = Math.min(take, total - start);
    for (;;) {
      const doc = await PDFDocument.create();
      const pages = await doc.copyPages(src, Array.from({ length: take }, (_, i) => start + i));
      for (const p of pages) doc.addPage(p);
      const bytes = Buffer.from(await doc.save());
      if (bytes.length <= READ_BUDGET_BYTES || take === 1) {
        /*
         * 한 쪽이 혼자 한도를 넘으면 그 쪽은 읽지 않는다 — 보내면 요청 전체가 실패한다.
         * 조각이 빠진 쪽은 판독 결과가 없어 기타로 떨어지고, 원본 파일은 그대로 올라간다.
         */
        if (bytes.length <= READ_BUDGET_BYTES) {
          const stem = file.name.replace(/\.pdf$/i, '');
          parts.push({
            file: { ...file, name: `${stem}__조각${seq}.pdf`, buffer: bytes },
            origin: file.name,
            offset: start,
            pages: take,
            total,
          });
        } else {
          console.warn(`[intake] ${file.name} ${start + 1}쪽이 혼자 ${mb(bytes.length)}MB — 판독에서 뺍니다`);
        }
        start += take;
        seq += 1;
        break;
      }
      take = Math.max(1, Math.floor(take * (READ_BUDGET_BYTES / bytes.length) * 0.9));
    }
  }
  return parts;
}

/** 판독 단위(묶음)를 만든다 — 작은 파일은 채워 담고, 큰 파일은 조각으로 */
async function packBins(pdfs: NormalizedFile[]): Promise<{ bins: NormalizedFile[][]; parts: Map<string, Part> }> {
  const parts = new Map<string, Part>();
  const units: NormalizedFile[] = [];
  for (const f of pdfs) {
    if (f.buffer.length <= READ_BUDGET_BYTES) {
      units.push(f);
      continue;
    }
    for (const part of await splitByBudget(f)) {
      parts.set(part.file.name.normalize('NFC'), part);
      units.push(part.file);
    }
  }
  // ZIP 안 순서를 지킨다 — 앞 묶음의 현장 값이 먼저다(머리말)
  const bins: NormalizedFile[][] = [];
  let cur: NormalizedFile[] = [];
  let size = 0;
  for (const u of units) {
    if (cur.length > 0 && size + u.buffer.length > READ_BUDGET_BYTES) {
      bins.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(u);
    size += u.buffer.length;
  }
  if (cur.length > 0) bins.push(cur);
  return { bins, parts };
}

/** 조각 이름·쪽을 원본으로 되돌린다 */
function restore(info: ClassifiedFileInfo, parts: Map<string, Part>): ClassifiedFileInfo {
  const part = parts.get(info.originalName.normalize('NFC'));
  if (!part) return info;
  const pages = info.pages && info.pages.length > 0
    ? info.pages.filter((p) => p >= 1 && p <= part.pages)
    : Array.from({ length: part.pages }, (_, i) => i + 1);
  return { ...info, originalName: part.origin, pages: pages.map((p) => p + part.offset) };
}

export function mergeChunkResults(results: ExtractedMetadata[], parts: Map<string, Part>): ExtractedMetadata {
  const [first, ...rest] = results;
  const out: ExtractedMetadata = { ...first, files: [], confidence: { ...(first.confidence ?? {}) } };
  const scalar = out as unknown as Record<string, unknown>;
  for (const r of rest) {
    for (const [k, v] of Object.entries(r)) {
      if (k === 'files' || k === 'confidence' || k === 'CPO') continue;
      if ((scalar[k] === null || scalar[k] === undefined || scalar[k] === '') && v !== null && v !== '') {
        scalar[k] = v;
      }
    }
    out.CPO = [...new Set([...(out.CPO ?? []), ...(r.CPO ?? [])])];
    for (const [k, c] of Object.entries(r.confidence ?? {})) {
      out.confidence[k] = Math.max(out.confidence[k] ?? 0, c);
    }
  }
  out.files = coalesce(
    cover(results.flatMap((r) => (r.files ?? []).map((f) => restore(f, parts))), parts),
    parts
  );
  return out;
}

/**
 * ★잘린 파일에서 이어지는 같은 종류는 하나로★ — 조각마다 따로 읽었으니 사진대지 한 권이
 * 조각 수만큼 갈려 나온다(76MB 실사자료보고서가 사진대지 8조각이 됐다, 2026-10-01 실측).
 * 그대로면 서류 칸에 여덟 장으로 올라간다. 쪽이 이어지고 종류가 같으면 합친다 —
 * 잃는 쪽은 없고, 진짜 두 서류였어도 한 파일에 다 들어 있다. 잘리지 않은 파일은 판독이
 * 나눈 그대로 둔다.
 */
function coalesce(files: ClassifiedFileInfo[], parts: Map<string, Part>): ClassifiedFileInfo[] {
  const chunked = new Set([...parts.values()].map((p) => p.origin));
  const out: ClassifiedFileInfo[] = [];
  for (const f of files) {
    const prev = out[out.length - 1];
    const pages = f.pages ?? [];
    const prevPages = prev?.pages ?? [];
    if (
      prev && chunked.has(f.originalName) && prev.originalName === f.originalName
      && prev.category === f.category && pages.length > 0 && prevPages.length > 0
      && Math.min(...pages) === Math.max(...prevPages) + 1
    ) {
      prev.pages = [...prevPages, ...pages];
      continue;
    }
    out.push(f);
  }
  return out;
}

/**
 * ★판독에서 빠진 쪽도 파일에 남긴다★ — 한 쪽이 혼자 한도를 넘어 못 보낸 쪽(사진 한 장이
 * 27MB 인 실사보고서가 실제로 왔다, 2026-10-01)이나 판독이 쪽 번호를 빠뜨린 쪽은 어느
 * 항목에도 없다. 뒤 단계가 항목의 쪽대로 자르므로 그대로 두면 그 쪽이 ★올라간 서류에서
 * 사라진다★. 바로 앞 쪽을 가진 항목에 붙인다(앞이 없으면 첫 항목) — 사진대지의 다음 장은
 * 대개 같은 서류다.
 */
function cover(files: ClassifiedFileInfo[], parts: Map<string, Part>): ClassifiedFileInfo[] {
  const totals = new Map<string, number>();
  for (const part of parts.values()) {
    totals.set(part.origin, Math.max(totals.get(part.origin) ?? 0, part.offset + part.pages, part.total));
  }
  for (const [origin, total] of totals) {
    const mine = files.filter((f) => f.originalName === origin);
    if (mine.length === 0) continue;
    const owner = new Map<number, ClassifiedFileInfo>();
    for (const f of mine) for (const p of f.pages ?? []) owner.set(p, f);
    for (let p = 1; p <= total; p += 1) {
      if (owner.has(p)) continue;
      let host: ClassifiedFileInfo | undefined;
      for (let q = p - 1; q >= 1 && !host; q -= 1) host = owner.get(q);
      host ??= mine[0];
      host.pages = [...(host.pages ?? []), p].sort((a, b) => a - b);
      owner.set(p, host);
    }
  }
  return files;
}

/**
 * classifyAndExtract 와 같은 결과를 돌려준다 — 한도 안이면 그대로 한 번 부른다.
 * 한도를 넘으면 나눠 부르고 합친다. 합계가 READ_MAX_TOTAL_BYTES 를 넘으면 던진다
 * (부르는 쪽이 그 말을 그대로 화면에 낸다).
 */
export async function classifyInChunks(
  pdfs: NormalizedFile[],
  onChunk?: (done: number, total: number) => void
): Promise<ExtractedMetadata> {
  const total = pdfs.reduce((n, f) => n + f.buffer.length, 0);
  if (total > READ_MAX_TOTAL_BYTES) throw new Error(tooLargeMessage(total));
  if (total <= READ_BUDGET_BYTES) return classifyAndExtract(pdfs);

  const { bins, parts } = await packBins(pdfs);
  console.info(`[intake] PDF ${mb(total)}MB 를 ${bins.length}번에 나눠 읽습니다`);
  const results: Array<ExtractedMetadata | null> = new Array(bins.length).fill(null);
  let done = 0;
  for (let i = 0; i < bins.length; i += CONCURRENCY) {
    await Promise.all(bins.slice(i, i + CONCURRENCY).map(async (bin, k) => {
      /*
       * 한 묶음이 실패해도 나머지는 살린다 — classifyAndExtract 가 이미 세 번 시도했다.
       * 그 묶음의 서류는 판독 결과가 없어 기타로 떨어지고, 파일은 그대로 올라간다.
       */
      try {
        results[i + k] = await classifyAndExtract(bin);
      } catch (err) {
        console.warn(`[intake] ${i + k + 1}/${bins.length}번째 묶음 판독 실패:`, err);
      }
      done += 1;
      onChunk?.(done, bins.length);
    }));
  }
  const ok = results.filter((r): r is ExtractedMetadata => r !== null);
  if (ok.length === 0) throw new Error('나눠 읽은 묶음을 하나도 읽지 못했습니다.');
  return mergeChunkResults(ok, parts);
}

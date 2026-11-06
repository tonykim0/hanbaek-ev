/**
 * 현대엔지니어링 설치승인서를 읽어 그 현장과 견준다 (서버 전용) — 판정은 lib/hec-approval(순수), 여기는 파일을 받아 읽는 일이다.
 * 메일 초안을 쓸 때(lib/site-mail-run siteLetterOf) 붙일 파일마다 부른다. 한백 2026-11-06 「파일이 설치승인서가 맞는지도
 * 검증해주는 단계가 필요할듯」.
 *
 * ★파워포인트는 코드가 읽는다★ — 설치승인서는 거의 다 pptx 다(이 Mac 의 실제 파일 142개 · 운영 칸도 같다). 슬라이드 XML 의 표에서
 * 칸을 꺼내므로 판독 값이 들지 않고 1초도 안 걸린다. ★PDF · 사진만 판독에 보낸다★(Haiku — vision-ask 'hec-approval', 한 장 1~2센트)
 * — 컨설팅결과서와 한 파일로 묶여 오는 일이 있어 앞 MAX_PAGES 쪽까지 보낸다. 워드 · 한글 · 엑셀은 글자로 제목만 본다. 그 밖(옛 .ppt ·
 * .hwp …)은 못 읽은 것이다 — 막지 않고 「확인 필요」.
 *
 * 읽다 실패해도 던지지 않는다 — 검증 때문에 메일이 막히면 안 된다. 실패는 「확인 필요 — 파일을 읽지 못했습니다」로 남는다.
 */
import JSZip from 'jszip';
import { askPdfJson, preparePdfs } from '@/lib/vision-ask';
import { splitPdf } from '@/lib/pdf-split';
import { docxText, hwpxText, xlsxText } from '@/lib/agents/file-text';
import {
  APPROVAL_PROMPT, approvalReadOf, judgeApproval, readApprovalSlides, readApprovalText, type ApprovalRead, type ApprovalSite,
} from './hec-approval';
import type { DocCheck } from './site-mail';

const TAG = 'hec-approval';
/** 판독에 보내는 쪽 수 — 묶음 PDF(컨설팅결과서 · 체크리스트 · 승인서 · 사진대지)에서 승인서는 대개 앞쪽이다 */
const MAX_PAGES = 20;
/** 받는 파일 크기 상한 — 넘으면 읽지 않는다(설치승인서는 사진이 들어 수 MB 다) */
const FETCH_CAP = 40 * 1024 * 1024;

const UNREAD: ApprovalRead = { form: null, name: null, addr: null, qty: null, blank: false, text: null };

/** 슬라이드 차례대로 — slide2.xml 이 slide10.xml 앞 */
async function pptxSlides(buf: Buffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files)
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => Number(/(\d+)\.xml$/.exec(a)?.[1]) - Number(/(\d+)\.xml$/.exec(b)?.[1]));
  return Promise.all(names.map((n) => zip.file(n)!.async('string')));
}

/** 파일 한 장을 읽는다 — 형식마다 길이 다르다 */
export async function readApprovalFile(file: { name: string; buffer: Buffer }): Promise<ApprovalRead> {
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'pptx') return readApprovalSlides(await pptxSlides(file.buffer));
  if (ext === 'docx') return readApprovalText(await docxText(file.buffer));
  if (ext === 'hwpx') return readApprovalText(await hwpxText(file.buffer));
  if (ext === 'xlsx') return readApprovalText(await xlsxText(file.buffer));
  if (!['pdf', 'jpg', 'jpeg', 'png', 'heic', 'heif', 'webp'].includes(ext)) return UNREAD;
  const head = ext === 'pdf'
    ? { ...file, buffer: await splitPdf(file.buffer, Array.from({ length: MAX_PAGES }, (_, i) => i + 1)) }
    : file;
  const { batches } = await preparePdfs([head], TAG);
  if (batches.length === 0) return UNREAD;
  return approvalReadOf(await askPdfJson(batches[0], APPROVAL_PROMPT, TAG));
}

/** 칸의 파일 한 장을 받아 읽고 그 현장과 견준다 — 맞으면 빈 목록 */
export async function checkApprovalFile(file: { name: string; url: string }, site: ApprovalSite): Promise<DocCheck[]> {
  try {
    const res = await fetch(file.url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`파일을 받지 못했습니다 (${res.status})`);
    const size = Number(res.headers.get('content-length') ?? 0);
    if (size > FETCH_CAP) return [{ level: 'warn', why: '파일이 커서 읽지 않았습니다 — 열어 보고 승인해 주세요' }];
    const read = await readApprovalFile({ name: file.name, buffer: Buffer.from(await res.arrayBuffer()) });
    return judgeApproval(read, site);
  } catch (err) {
    console.warn(`[${TAG}] ${file.name} 읽기 실패`, err instanceof Error ? err.message : err);
    return [{ level: 'warn', why: '파일을 읽지 못했습니다 — 열어 보고 승인해 주세요' }];
  }
}

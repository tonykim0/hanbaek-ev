/**
 * 현대엔지니어링 설치승인서를 읽어 그 현장과 견준다 (서버 전용) — 판정은 lib/hec-approval(순수), 여기는 파일을 받아 읽는 일이다.
 * 메일 초안을 쓸 때(lib/site-mail-run siteLetterOf) 붙일 파일마다 부른다. 한백 2026-11-06 「파일이 설치승인서가 맞는지도
 * 검증해주는 단계가 필요할듯」.
 *
 * ★파워포인트는 코드가 읽는다★ — 설치승인서는 거의 다 pptx 다(이 Mac 의 실제 파일 142개 · 운영 칸도 같다). 슬라이드 XML 의 표에서
 * 칸을 꺼내므로 판독 값이 들지 않고 1초도 안 걸린다. ★PDF · 사진만 판독에 보낸다★(Haiku — vision-ask 'hec-approval', 한 장
 * 2~4초 · 1센트 미만. 이 Mac 의 실제 승인서 PDF 13개를 다 양식으로 읽었고(컨설팅결과서 · 사진대지와 묶인 6개 포함) 형식승인서는
 * 「양식 아님」이었다) — 컨설팅결과서와 한 파일로 묶여 오는 일이 있어 앞 MAX_PAGES 쪽까지 보낸다. 워드 · 한글 · 엑셀은 글자로 제목만 본다. 그 밖(옛 .ppt ·
 * .hwp …)은 못 읽은 것이다 — 막지 않고 「확인 필요」.
 *
 * 읽다 실패해도 던지지 않는다 — 검증 때문에 메일이 막히면 안 된다. 실패는 「확인 필요 — 파일을 읽지 못했습니다」로 남는다.
 */
import JSZip from 'jszip';
import { askPdfJson } from '@/lib/vision-ask';
import { imageFileToPdf, type NormalizedFile } from '@/lib/files';
import { splitPdf } from '@/lib/pdf-split';
import { docxText, hwpxText, xlsxText } from '@/lib/agents/file-text';
import {
  APPROVAL_PROMPT, approvalReadOf, judgeApproval, readApprovalSlides, readApprovalText, type ApprovalRead, type ApprovalSite,
} from './hec-approval';
import type { DocCheck } from './site-mail';
import { headBlob, readBlob } from '@/lib/blob/server';

const TAG = 'hec-approval';
/** 판독에 보내는 쪽 수 — 묶음 PDF(컨설팅결과서 · 체크리스트 · 승인서 · 사진대지)에서 승인서는 대개 앞쪽이다 */
const MAX_PAGES = 20;
/** 받는 파일 크기 상한 — 넘으면 읽지 않는다(설치승인서는 사진이 들어 수 MB 다) */
const FETCH_CAP = 40 * 1024 * 1024;
/** 판독에 한 번에 보내는 PDF 상한 — 요청 한도(32MB)에 base64 팽창을 감안한 값(lib/vision-ask 와 같다) */
const SEND_CAP = 18 * 1024 * 1024;

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
  /*
   * 방향 바로잡기(lib/pdf-orient — 쪽마다 판독에 묻는다)는 하지 않는다 — 승인서 PDF 는 pptx 를 내보낸 것이라 바로 서 있고, 한 장을
   * 보는 데 쪽 수만큼 판독을 더 부를 까닭이 없다. 판독은 눕힌 쪽의 표도 읽는다.
   */
  const pdf: NormalizedFile | null = ext === 'pdf'
    ? { name: file.name, buffer: await splitPdf(file.buffer, Array.from({ length: MAX_PAGES }, (_, i) => i + 1)), hash: '', mimeType: 'application/pdf' }
    : await imageFileToPdf(file.name, file.buffer).catch(() => null);
  if (!pdf || pdf.buffer.length > SEND_CAP) return UNREAD;
  return approvalReadOf(await askPdfJson([pdf], APPROVAL_PROMPT, TAG));
}

/** 칸의 파일 한 장을 받아 읽고 그 현장과 견준다 — 맞으면 빈 목록 */
export async function checkApprovalFile(file: { name: string; url: string }, site: ApprovalSite): Promise<DocCheck[]> {
  try {
    // 비공개 저장소 — 크기를 먼저 보고 SDK 로 읽는다(lib/blob/server)
    const info = await headBlob(file.url);
    if (!info) throw new Error('파일을 받지 못했습니다 (저장소에 없음)');
    if (info.size > FETCH_CAP) return [{ level: 'warn', why: '파일이 커서 읽지 않았습니다 — 열어 보고 승인해 주세요' }];
    const read = await readApprovalFile({ name: file.name, buffer: await readBlob(file.url) });
    return judgeApproval(read, site);
  } catch (err) {
    console.warn(`[${TAG}] ${file.name} 읽기 실패`, err instanceof Error ? err.message : err);
    return [{ level: 'warn', why: '파일을 읽지 못했습니다 — 열어 보고 승인해 주세요' }];
  }
}

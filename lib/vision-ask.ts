/**
 * 서류를 판독에 보내 JSON 하나를 받는다 — 기설치 대조(lib/legacy-evidence)와 운영사 직인 읽기(lib/cpo-seal)가 같이 쓴다.
 * [서버 전용]
 *
 * ★거절이면 다른 모델로 다시 읽는다★ — 거꾸로 스캔된 계약서를 바로 세워 보냈더니 기본 모델이 거절(stop_reason:
 * refusal)한 일이 있었다(lib/claude.ts, 2026-10-06). 같은 모델에 되풀이하면 또 거절한다.
 * JSON 이 없으면 같은 것을 세 번까지 다시 묻는다. 사진은 PDF 로 바꾸고, 거꾸로 스캔된 쪽은 바로 세운다(접수와 같은 길).
 */
import Anthropic from '@anthropic-ai/sdk';
import { imageFileToPdf, type NormalizedFile } from './files';
import { uprightPdfFiles } from './pdf-orient';
import { logLlmCall } from './llm-usage';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/** 숫자·도장을 읽는 일이라 가장 정확한 모델 — 사진 글자 읽기(lib/survey/read-plate)와 같다 */
const MODEL = 'claude-opus-5-5';
const REFUSAL_FALLBACK_MODEL = 'claude-sonnet-5';
const CALL_TIMEOUT_MS = 150_000;
/** 한 번에 보낼 PDF 총량 — 요청 한도(32MB)에 base64 팽창(1.33배)을 감안한 값 */
const BYTES_BUDGET = 18 * 1024 * 1024;

/** 판독에 보낸다 — tag 는 로그에서 묶어 볼 이름(「preinstall-check」·「cpo-seal」) */
export async function askPdfJson(batch: NormalizedFile[], text: string, tag: string): Promise<unknown> {
  const content: Anthropic.ContentBlockParam[] = [
    ...batch.map((f) => ({
      type: 'document' as const,
      source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: f.buffer.toString('base64') },
    })),
    { type: 'text', text },
  ];
  let model = MODEL;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const started = Date.now();
    const message = await anthropic.messages.create(
      { model, max_tokens: 4096, messages: [{ role: 'user', content }] },
      { timeout: CALL_TIMEOUT_MS }
    );
    logLlmCall({ route: tag, model, ms: Date.now() - started, usage: message.usage });
    if (message.stop_reason === 'refusal') {
      if (model === REFUSAL_FALLBACK_MODEL) throw new Error('판독이 거절되었습니다.');
      console.warn(`[${tag}] ${model} 이 거절 — ${REFUSAL_FALLBACK_MODEL} 로 다시 읽는다`);
      model = REFUSAL_FALLBACK_MODEL;
      continue;
    }
    const answer = message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    const json = /\{[\s\S]*\}/.exec(answer)?.[0];
    if (json) {
      try { return JSON.parse(json); } catch { /* 다시 묻는다 */ }
    }
    console.warn(`[${tag}] 답에서 JSON 을 못 찾음(${attempt}/3) · stop=${message.stop_reason}`);
  }
  throw new Error('판독의 답을 읽지 못했습니다.');
}

/**
 * 판독에 보낼 묶음으로 만든다 — 사진은 PDF 로 바꾸고, 거꾸로 스캔된 쪽은 바로 세운다.
 * 못 읽는 파일(형식이 다르거나 한 번에 못 담는 것)은 unread 로 — 조용히 빠지지 않게.
 */
export async function preparePdfs(
  files: { name: string; buffer: Buffer }[], tag: string
): Promise<{ batches: NormalizedFile[][]; unread: string[] }> {
  const unread: string[] = [];
  const pdfs: NormalizedFile[] = [];
  for (const f of files) {
    if (/\.pdf$/i.test(f.name)) {
      pdfs.push({ name: f.name, buffer: f.buffer, hash: '', mimeType: 'application/pdf' });
      continue;
    }
    const pdf = await imageFileToPdf(f.name, f.buffer).catch(() => null);
    if (pdf) pdfs.push(pdf);
    else unread.push(f.name);
  }
  if (pdfs.length === 0) return { batches: [], unread };

  const upright = await uprightPdfFiles(pdfs, tag);

  // 한 번에 못 담으면 나눠 읽는다 — 한 파일이 그것만으로 넘치면 못 읽은 것으로 둔다
  const batches: NormalizedFile[][] = [];
  let cur: NormalizedFile[] = [];
  let bytes = 0;
  for (const f of upright) {
    if (f.buffer.length > BYTES_BUDGET) { unread.push(f.name); continue; }
    if (bytes + f.buffer.length > BYTES_BUDGET && cur.length > 0) { batches.push(cur); cur = []; bytes = 0; }
    cur.push(f);
    bytes += f.buffer.length;
  }
  if (cur.length > 0) batches.push(cur);
  return { batches, unread };
}

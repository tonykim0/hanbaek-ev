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

/**
 * 판독마다의 모델 — tag 로 고른다. 없으면 가장 정확한 모델(사진 글자 읽기 lib/survey/read-plate 와 같다).
 * ★바꾸기 전에 실제 서류로 견준다★ — scripts/eval-vision-models.ts 가 같은 서류를 모델마다 읽혀 답을 맞춰 본다
 * (2026-11-04 비용 검토 — 이 자리가 판독비의 대부분이었다).
 */
export interface VisionPick { model: string; effort?: 'low' | 'medium' | 'high' }
const DEFAULT_PICK: VisionPick = { model: 'claude-opus-5-5' };
/*
 * 2026-11-04 실제 서류 견주기(같은 서류 · Opus 5.5 가 기준 · 어긋난 것은 사람이 서류를 열어 가렸다):
 *   consult-dup   결과서 「6. 중복설치」 — Haiku 12/12 같음
 *   apply-facts   설치신청서 주소·주차면·연락처 — Haiku 11/12 (다른 하나는 주소의 괄호 앞 띄어쓰기)
 *   contract-date 계약서 계약일·부지제공자 칸 — Haiku 11/12 (같은 띄어쓰기 · Sonnet 5.5 는 이메일 hometax 를 hometek 로)
 * 그대로 Opus 인 것: rep-name(흐린 스캔의 대표자 이름을 Haiku 가 한 번 달리 읽었다 · 두 쪽이라 값도 작다) ·
 * preinstall-check(증빙의 날짜·기수·종류를 Sonnet·Haiku 가 5건 중 3건에서 빠뜨렸다 — 엑셀 줄과 짝짓는 열쇠다).
 */
/*
 * parking-check 건축물대장·결과서·신청서의 주차면·주소·발급일 — 두 차례 32묶음에서 결과(주차면·주소·발급일·짚을 것)가 Haiku 31/32 ·
 *               Sonnet 5.5 28/32 같음. 다른 하나는 대장 두 개가 한 파일에 묶인 문래역(15-1 총괄 154 · 15-2 201동 94)을 한 번
 *               하나로 읽은 것(세 번 중 두 번은 맞았다 · Opus 는 세 번 다). 판독비의 절반이 넘던 자리다.
 * cpo-seal      운영사 직인 — Haiku 24/24 같음(있음 · 없음 · 서명 칸 못 찾음 모두). 강도 high 는 하나를 「있음」으로 잘못 봐 기본 그대로.
 * 둘 다 한백의 손 판독은 CAREFUL_PICK(Opus)이다.
 */
const HAIKU: VisionPick = { model: 'claude-haiku-5-5' };
const PICK_BY_TAG: Record<string, VisionPick> = {
  'parking-check': HAIKU,
  'cpo-seal': HAIKU,
  'consult-dup': HAIKU,
  'apply-facts': HAIKU,
  'contract-date': HAIKU,
};
export const visionPickOf = (tag: string): VisionPick => PICK_BY_TAG[tag] ?? DEFAULT_PICK;
/**
 * 한백이 손으로 다시 돌리는 판독 — 「다시 대조」·「직인 다시 읽기」. 저절로 도는 판독이 잘못 읽었다고 볼 때 누르는 단추라 가장 정확한
 * 모델로 읽는다(드물다 — 건축물대장 대조는 10월 마지막 주 127번 중 110번이 자동이었다).
 */
export const CAREFUL_PICK: VisionPick = DEFAULT_PICK;
/** 설치된 SDK(0.52)가 output_config 의 타입을 모르므로 요청 타입을 넓혀 보낸다(lib/claude-import 와 같은 방식) */
type CreateWithEffort = Anthropic.MessageCreateParamsNonStreaming & { output_config?: { effort: string } };
const REFUSAL_FALLBACK_MODEL = 'claude-sonnet-5';
const CALL_TIMEOUT_MS = 150_000;
/** 한 번에 보낼 PDF 총량 — 요청 한도(32MB)에 base64 팽창(1.33배)을 감안한 값 */
const BYTES_BUDGET = 18 * 1024 * 1024;

/** 판독에 보낸다 — tag 는 로그에서 묶어 볼 이름(「preinstall-check」·「cpo-seal」)이자 모델을 고르는 열쇠. pick 은 견주는 시험만 넘긴다 */
export async function askPdfJson(
  batch: NormalizedFile[], text: string, tag: string, pick: VisionPick = visionPickOf(tag)
): Promise<unknown> {
  const content: Anthropic.ContentBlockParam[] = [
    ...batch.map((f) => ({
      type: 'document' as const,
      source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: f.buffer.toString('base64') },
    })),
    { type: 'text', text },
  ];
  let model = pick.model;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const started = Date.now();
    const params: CreateWithEffort = {
      model, max_tokens: 4096, messages: [{ role: 'user', content }],
      // 강도는 고른 모델에만 — 거절 뒤 대체 모델은 제 기본값으로
      ...(pick.effort && model === pick.model ? { output_config: { effort: pick.effort } } : {}),
    };
    const message = await anthropic.messages.create(params, { timeout: CALL_TIMEOUT_MS });
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

/**
 * Anthropic API 클라이언트.
 * Claude Sonnet 4.6 PDF vision으로 계약서 분류 + 메타데이터 추출.
 *
 * 서버 사이드 전용.
 */
import Anthropic from '@anthropic-ai/sdk';
import { buildExtractionPrompt } from './prompts';
import type { ExtractedMetadata } from '@/types/intake';
import type { NormalizedFile } from './files';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const MODEL = 'claude-sonnet-4-6';
/**
 * ★거절(stop_reason: refusal)이면 이 모델로 다시 읽는다★ (2026-10-06, 일곡금호.zip).
 *
 * 거꾸로 스캔된 계약서 8쪽을 회전 정규화(lib/pdf-orient)로 바로 세워 보냈더니 MODEL 이
 * ★매번 거절★했다 — 출력 0 토큰, 블록 없음. 계약서 본문에 문제될 것이 없는 오판이다.
 * 실측: 바로 선 PDF × MODEL = 거절 3/3 · 거꾸로 된 원본 × MODEL = 정상 · 바로 선 PDF ×
 * 이 모델 = 정상(현장명·주소·대수 그대로). 그전에는 거절을 「JSON 을 못 찾음」으로 읽고
 * 같은 요청을 세 번 되풀이한 뒤 「자동 분류 실패」로 떨어졌다 — 거절은 출력 전에 나므로
 * 재시도 문구를 바꿔도 소용없다. 모델을 바꿔야 한다.
 *
 * ★거절일 때만 넘어간다★ — 판독 품질은 모델마다 다르고(반복 검증 없이 기본 모델을 바꾸지
 * 않는다), 지금 거절되는 문서는 어차피 통째로 실패하던 것이라 이 길이 무엇도 나쁘게 만들지
 * 않는다. 원본(거꾸로)으로 되돌려 읽는 길도 됐지만 고르지 않았다 — 판독 모델에게 눕거나
 * 뒤집힌 쪽을 보내지 않으려고 회전 정규화를 둔 것이다(90°·270° 는 방향을 반대로 읽었다).
 */
const REFUSAL_FALLBACK_MODEL = 'claude-sonnet-5';
/** 개별 Claude 호출 타임아웃 */
const CALL_TIMEOUT_MS = 50_000;
/** 최대 시도 횟수 */
const MAX_ATTEMPTS = 3;
/** 경과시간이 이 값 미만일 때만 재시도 (라우트 maxDuration=180s 예산 보호) */
const RETRY_ELAPSED_BUDGET_MS = 120_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 재시도에 덧붙이는 말 — 앞선 시도가 JSON 아닌 것(또는 아무것도)을 돌려줬을 때다 */
const RETRY_NUDGE =
  '앞선 답에서 JSON 을 찾지 못했습니다. 설명·사과·머리말 없이 ★JSON 객체 하나만★ 출력하세요. '
  + '읽을 수 없는 문서가 있으면 그 항목을 null 로 두고, 그래도 전체 JSON 구조는 그대로 내세요.';

/**
 * PDF 파일 목록을 Claude에 전달하고 분류 + 메타데이터를 추출합니다.
 * 모든 PDF를 단일 API 호출로 처리 (multi-document vision).
 *
 * 일시적 실패(응답 지연·과부하·JSON 파싱 실패)에 대비해 시간 예산 내에서 1회 재시도한다.
 * 재시도까지 실패하면 throw → 호출부에서 metadata=null 로 폴백.
 */
export async function classifyAndExtract(
  pdfs: NormalizedFile[]
): Promise<ExtractedMetadata> {
  // 방어적으로 PDF만 전송 (Claude vision은 xlsx/pptx 등을 처리하지 못함)
  const pdfOnly = pdfs.filter((p) => p.mimeType === 'application/pdf');
  const content = [
    ...pdfOnly.map((pdf) => ({
      type: 'document' as const,
      source: {
        type: 'base64' as const,
        media_type: 'application/pdf' as const,
        data: pdf.buffer.toString('base64'),
      },
    })),
    {
      type: 'text' as const,
      text: buildExtractionPrompt(pdfOnly.map((p) => p.name)),
    },
  ];

  const startedAt = Date.now();
  let lastError: unknown;
  /** 거절을 받으면 바뀐다 — 그 뒤 시도는 REFUSAL_FALLBACK_MODEL 로 간다 */
  let model: string = MODEL;
  const sent = () =>
    `PDF ${pdfOnly.length}개 ${mb(pdfOnly.reduce((n, p) => n + p.buffer.length, 0))}MB `
    + `[${pdfOnly.map((p) => `${p.name} ${mb(p.buffer.length)}MB`).join(' · ')}]`;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      /*
       * ★두 번째부터는 다르게 묻는다★ (2026-10-06) — 똑같은 요청을 세 번 보내면 세 번
       * 같은 답이 온다. 프로덕션에서 실제로 그랬다: 응답이 빈 채로 와 3/3 이 똑같이 깨졌다.
       * 재시도가 뜻을 가지려면 무언가 달라야 한다 — 「JSON 만」을 한 번 더 못 박는다.
       */
      const ask = attempt === 1 ? content : [...content, { type: 'text' as const, text: RETRY_NUDGE }];
      const message = await anthropic.messages.create(
        {
          model,
          // 파일이 많은 통합 PDF는 files 배열이 커서 4096으로는 JSON이 잘릴 수 있음
          max_tokens: 8192,
          messages: [{ role: 'user', content: ask }],
        },
        { timeout: CALL_TIMEOUT_MS }
      );
      if (message.stop_reason === 'refusal') {
        lastError = new Error(`${model} 이 판독을 거절했습니다(stop_reason: refusal).`);
        if (model !== REFUSAL_FALLBACK_MODEL) {
          // 기다릴 이유가 없다 — 같은 모델에 다시 보내면 또 거절한다(실측 3/3)
          console.warn(`[claude] ${model} 이 판독을 거절 — ${REFUSAL_FALLBACK_MODEL} 로 다시 읽는다 · 보낸 것: ${sent()}`);
          model = REFUSAL_FALLBACK_MODEL;
          continue;
        }
        console.warn(`[claude] ${model} 도 거절 · 보낸 것: ${sent()}`);
        break;
      }
      return parseMetadata(message);
    } catch (err) {
      lastError = err;
      /*
       * ★무엇을 보냈는지 같이 남긴다★ (2026-10-06) — 프로덕션에서 응답이 빈 채로 와
       * 세 번 다 실패한 일이 있었는데(한백 접수 ZIP), 로그에 「앞부분: 」만 찍혀 있어
       * 왜 비었는지 알 길이 없었다. 모델·프롬프트·PDF 한 장짜리 호출은 전부 멀쩡했으므로
       * 범인은 ★그 묶음의 규모나 내용★이다 — 그렇다면 그 규모가 로그에 있어야 한다.
       */
      console.warn(`[claude] 추출 시도 ${attempt}/${MAX_ATTEMPTS} 실패 (${model}) · 보낸 것: ${sent()}`, err);
      // 남은 시간이 부족하면 재시도하지 않는다 (라우트 maxDuration 보호)
      if (attempt >= MAX_ATTEMPTS || Date.now() - startedAt > RETRY_ELAPSED_BUDGET_MS) break;
      await sleep(800 * attempt);
    }
  }
  throw lastError;
}

const mb = (n: number) => (n / 1024 / 1024).toFixed(1);

/** Claude 응답에서 JSON 메타데이터를 견고하게 추출한다. */
function parseMetadata(message: Anthropic.Message): ExtractedMetadata {
  // 여러 블록/사고블록이 섞여도 text 블록만 모아서 사용 (content[0] 가정 제거)
  const responseText = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  // 코드펜스 제거 후 첫 '{' ~ 마지막 '}' 범위 파싱
  const cleaned = responseText.replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) {
    /*
     * ★응답이 어떻게 생겼는지를 적는다★ (2026-10-06) — 전에는 앞부분 200자만 적었는데,
     * 그 글이 비어 있으면(실제로 그랬다) 「빈 응답」인지 「text 블록이 아예 없는 응답」인지
     * 가릴 수 없었다. 둘은 원인이 다르다: 앞은 모델이 말을 안 한 것이고, 뒤는 멈춘 까닭이
     * 따로 있다(max_tokens·refusal 처럼). stop_reason·블록 종류·토큰이 그것을 가른다.
     * 글자는 JSON 으로 감싸 적는다 — 줄바꿈·공백만 온 경우가 그냥 빈칸으로 보이지 않게.
     */
    const shape = message.content.map((b) => `${b.type}${b.type === 'text' ? `(${b.text.length}자)` : ''}`);
    throw new Error(
      'Claude 응답에서 JSON을 찾을 수 없습니다. '
      + `stop=${message.stop_reason} · 블록=[${shape.join(',')}] `
      + `· in=${message.usage?.input_tokens ?? '?'} out=${message.usage?.output_tokens ?? '?'} `
      + `· 앞부분=${JSON.stringify(responseText.slice(0, 200))}`
    );
  }
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as ExtractedMetadata;
  } catch {
    throw new Error(`JSON 파싱 실패: ${cleaned.slice(start, start + 200)}`);
  }
}

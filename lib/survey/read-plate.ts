/**
 * 실사 사진에서 전력인입점 글자 읽기 — 판넬명 · 전주번호 · 메인차단기 (서버 전용).
 *
 * 한백 지시 2026-10-01 「사진 넣으면 전력인입점(판넬명, 전주번호)은 자동 입력되게」. 협력사는 분전반 외함의
 * 이름표(PM-101 · LE-117 · L-CAR)나 전주의 번호표(2175G142 / 송정선 / 49R3)를 찍어 넣는다 — 그 글자를
 * 칸에 다시 치고 있었다. 읽어서 ★빈 칸만★ 채운다. 사람이 적은 것은 덮지 않는다(components/survey).
 *
 * 못 읽으면 null 이다 — 지어내지 않게 프롬프트가 못박는다. 칸은 사람이 고칠 수 있으니 틀린 값보다
 * 빈 값이 낫다(화면 규칙 10). 사진 한 장에 한 번만 부른다.
 */
import Anthropic from '@anthropic-ai/sdk';
import { logLlmCall } from '@/lib/llm-usage';
import type { PlateRead } from './use-plate';

type CreateWithOutputConfig = Anthropic.MessageCreateParamsNonStreaming & {
  output_config?: { effort?: 'low' | 'medium' | 'high'; format?: { type: 'json_schema'; schema: unknown } };
};

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
/** 짧은 글자 몇 줄이라 빠른 쪽으로 — 그래도 번호 한 자리가 틀리면 다른 전주라 최신 모델을 쓴다 */
const MODEL = 'claude-opus-5-5';
/*
 * 시간 — 라우트는 60초에 끊긴다(maxDuration). 45초 한 번으로 그 안에서 끝낸다 — 다시 하지 않는다: SDK 는 혼잡(429·529)
 * 때 서버가 말한 만큼(최대 60초) 기다렸다 다시 해 Vercel 이 먼저 끊고 [survey-plate] 줄도 안 남았다. 못 읽으면 칸은
 * 사람이 적는다.
 */
const CALL_TIMEOUT_MS = 45_000;
const MAX_RETRIES = 0;
/** claude-opus-5-5 는 생각을 끌 수 없고 그것도 max_tokens 에 든다 — 답(몇 줄)보다 넉넉히 */
const MAX_TOKENS = 8192;


const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['panel', 'pole', 'breaker'],
  properties: {
    panel: { type: ['string', 'null'] },
    pole: { type: ['string', 'null'] },
    breaker: { type: ['string', 'null'] },
  },
};

const PROMPT = `전기차 충전기 설치 현장 실사 사진이다. 사진에 보이는 글자에서 다음 셋을 읽어라.

1. panel — 분전반·배전반(판넬) 외함이나 문에 붙은 이름표의 이름. 예: "PM-101", "LE-117", "L-CAR", "P-M1A", "LV-5 ATS".
   이름표 글자 그대로 적는다(대소문자·하이픈 유지). "판넬", "PANEL", "분전반" 같은 꾸밈말은 뺀다.
2. pole — 한전 전주의 번호표(보통 흰 바탕 금속판, 여러 줄). 위쪽의 전산화번호(숫자 4자리 + 영문 1자 + 숫자 3자리,
   예: 2175G142)와 선로명·선로번호(예: 송정선 49R3)를 공백 하나로 이어 적는다 → "2175G142 송정선 49R3".
   아래쪽의 설치 연월(예: 0612)·높이(예: 16M)·회사명·전화번호는 넣지 않는다.
3. breaker — 사진 속 메인 차단기(배선용 차단기) 정격 전류가 또렷이 보이면 "225A" 꼴로(극수가 보이면 "4P 225A").

★읽히지 않거나 확실하지 않으면 그 칸은 null★ — 짐작으로 채우지 않는다. 해당하는 것이 사진에 없으면 null.`;

export async function readPlate(image: { data: string; mediaType: 'image/jpeg' | 'image/png' | 'image/webp' }): Promise<PlateRead> {
  const content: Anthropic.ContentBlockParam[] = [
    { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } },
    { type: 'text', text: PROMPT },
  ];
  const at = Date.now();
  const params: CreateWithOutputConfig = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'user', content }],
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
  };
  const message = await anthropic.messages.create(params, { timeout: CALL_TIMEOUT_MS, maxRetries: MAX_RETRIES });
  logLlmCall({ route: 'survey-plate', model: MODEL, ms: Date.now() - at, usage: message.usage });
  // 잘렸거나 거절한 답은 JSON 이 아니다 — 읽지 못한 것으로 두고 까닭을 남긴다(칸은 사람이 적는다)
  if (message.stop_reason === 'max_tokens' || message.stop_reason === 'refusal') {
    console.error(`[survey-plate] 답이 끝나지 않음 — stop_reason=${message.stop_reason}`);
    return { panel: null, pole: null, breaker: null };
  }
  const text = message.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('').trim();
  const raw = JSON.parse(text) as Partial<PlateRead>; // json_schema 출력이라 JSON 그대로다
  const clean = (v: unknown) => (typeof v === 'string' && v.trim() && v.trim().length <= 60 ? v.trim().replace(/\s+/g, ' ') : null);
  return { panel: clean(raw.panel), pole: clean(raw.pole), breaker: clean(raw.breaker) };
}

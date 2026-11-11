/**
 * 실사 사진에서 전력인입점 글자 읽기 — 판넬명 · 전주번호 · 메인차단기 (서버 전용).
 *
 * 한백 지시 2026-10-01 「사진 넣으면 전력인입점(판넬명, 전주번호)은 자동 입력되게」. 협력사는 분전반 외함의
 * 이름표(PM-101 · LE-117 · L-CAR)나 전주의 번호표(2175G142 / 송정선 / 49R3)를 찍어 넣는다 — 그 글자를
 * 칸에 다시 치고 있었다. 읽어서 ★빈 칸만★ 채운다. 사람이 적은 것은 덮지 않는다(components/survey).
 *
 * 못 읽으면 null 이다 — 지어내지 않게 프롬프트가 못박는다. 칸은 사람이 고칠 수 있으니 틀린 값보다
 * 빈 값이 낫다(화면 규칙 10). 사진 한 장에 한 번만 부른다.
 *
 * ★번호표 읽는 법을 2026-11-12 에 바로잡았다★ — 한빛엔지니어링 임시 저장본(플러그링크 거점 20곳)을 사진과 대 보니 둘이
 * 틀렸다. ① 선로명을 줄마다 엇갈려 붙이고 맨 위 빨간 「위험」까지 섞었다(「7045B324 위월 금66오L6간L3」 — 맞는 것은
 * 「7045B324 금오간 66L6L3」: 왼쪽 세로 칸이 선로명, 오른쪽이 선로번호다). ② 전주가 아닌 지상변압기(PAD.TR) 번호표는
 * 아예 비웠다(「7146R / 28B / 송원로 / TR13」이 또렷한데 — 둘째 줄이 숫자만이 아니고, 지시가 전주만 알았다). 그리고
 * 선로명이 흐리면 전산화번호까지 버리지 않는다 — 실제 제출본도 전주번호 칸에 전산화번호만 적은 것이 대부분이다.
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
2. pole — 한전 번호표. 전주에 붙은 것(흰 바탕 금속판, 칸이 나뉜 여러 줄)과 지상변압기(PAD.TR)·개폐기 같은 지상
   기기 외함에 붙은 것 둘 다다. 표는 이렇게 생겼다:
   - 맨 위 두 줄이 전산화번호다. 첫 줄은 숫자 4자리 + 영문 1자(예: 7045B), 둘째 줄은 3자(예: 324, 지상 기기는 28B 처럼
     영문으로 끝나기도 한다). 두 줄을 붙인다 → 7045B324, 7146R28B.
   - 그 아래 왼쪽 좁은 칸에 한글이 한 줄에 한 글자씩 세로로 적혀 있다 — 위에서 아래로 이어 읽은 것이 선로명이다
     (예: 금 / 오 / 간 → 금오간). 오른쪽 칸의 숫자·영문을 위에서 아래로 이어 붙인 것이 선로번호다(예: 66 / L6 / L3 → 66L6L3).
     줄마다 한글과 숫자를 섞어 붙이지 않는다("금66오L6간L3" 는 틀린 것).
   - 지상변압기는 선로번호 대신 기기 번호(예: TR13)가 있다 — 선로명 뒤에 그것을 적는다.
   적는 꼴: 전산화번호, 공백, 선로명, 공백, 선로번호(또는 기기 번호) → "7045B324 금오간 66L6L3", "7146R28B 송원로 TR13".
   맨 위 빨간 "위험" 머리글, 아래쪽의 높이(예: 16M)·설치 연월·용량(예: 150KVA)·기기 종류(PAD. TR)·회사명·전화번호는 넣지 않는다.
   전산화번호가 또렷하고 선로명·선로번호가 흐리면 전산화번호만 적는다("7045B324"). 전산화번호가 한 글자라도 가려졌거나
   확실하지 않으면 pole 은 null.
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

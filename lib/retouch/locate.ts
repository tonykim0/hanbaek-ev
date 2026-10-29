/**
 * 서류 문구 수정 — 요청한 문구가 스캔본의 어디에 있는지 찾는다. [서버 전용]
 *
 * 한백 지시 2026-10-29 「문서를 올리고 프롬프트를 넣어 원하는 PDF 로 다시 받는 것」. 한백은 협력사·아파트에게서
 * 직인사용동의를 받아 두어, 한백이 대신 날인하는 사문서(계약서·동의서·신청서)는 고쳐 낼 권한이 있다.
 * 그 권한이 닿지 않는 자리는 여기서 멈춘다:
 *   ★기관이 발급한 공문서★(건축물대장·행위신고증명서·사업자등록증 등) — 직인 동의로 고칠 수 있는 서류가 아니다.
 *     판독이 issued 로 짚으면 라우트가 거절한다.
 *   ★손글씨·도장·서명 위의 글자★ — 그 사람이 쓴 것이다. 판독이 고칠 자리에 넣지 않고 note 로 돌려준다.
 * 판독이 거절하면(refusal) 다른 모델로 다시 묻지 않는다 — 그 판단을 돌아가지 않는다.
 *
 * 판독은 위치·글자·글꼴 갈래만 준다. 지우고 다시 쓰는 일은 브라우저가 원본 해상도에서 한다(lib/retouch/paint).
 */
import Anthropic from '@anthropic-ai/sdk';
import { logLlmCall } from '@/lib/llm-usage';
import type { Align, LocatedEdit, LocatePage, LocateResult } from './types';

type CreateWithOutputConfig = Anthropic.MessageCreateParamsNonStreaming & {
  output_config?: { effort?: 'low' | 'medium' | 'high'; format?: { type: 'json_schema'; schema: unknown } };
};

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
/** 글자 한 자리를 짚는 일이라 가장 정확한 모델 — 사진 글자 읽기(lib/survey/read-plate)와 같다 */
const MODEL = 'claude-opus-5-5';
/* 라우트가 120초에 끊긴다 — 그 안에서 한 번. 다시 하지 않는다(혼잡 때 SDK 가 기다리다 Vercel 이 먼저 끊는다) */
const CALL_TIMEOUT_MS = 110_000;
/** claude-opus-5-5 는 생각을 끌 수 없고 그것도 max_tokens 에 든다 */
const MAX_TOKENS = 16_000;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['docKind', 'issued', 'edits', 'note'],
  properties: {
    docKind: { type: 'string' },
    issued: { type: 'boolean' },
    edits: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['page', 'x0', 'y0', 'x1', 'y1', 'original', 'replacement', 'serif', 'bold', 'align'],
        properties: {
          page: { type: 'integer' },
          x0: { type: 'integer' },
          y0: { type: 'integer' },
          x1: { type: 'integer' },
          y1: { type: 'integer' },
          original: { type: 'string' },
          replacement: { type: 'string' },
          serif: { type: 'boolean' },
          bold: { type: 'boolean' },
          align: { type: 'string', enum: ['left', 'center', 'right'] },
        },
      },
    },
    note: { type: ['string', 'null'] },
  },
};

const promptOf = (pages: LocatePage[], request: string) => `첨부한 그림은 스캔한 서류 한 건의 쪽들이다(1쪽부터 차례로).
쪽마다 그림 크기(화소): ${pages.map((p, i) => `${i + 1}쪽 ${p.width}×${p.height}`).join(' · ')}

사용자가 이 서류에서 바꾸려는 것:
<요청>
${request}
</요청>

1. docKind — 무슨 서류인지 한 줄(예: 「현대엔지니어링 충전기 설치 계약서」).
2. issued — 국가·지자체·공공기관이 발급한 공문서이면 true: 건축물대장, 행위신고증명서·신고필증, 사업자등록증·고유번호증,
   등기사항증명서, 인감·납세·주민등록 관련 증명서, 기관 공문. 당사자끼리 쓴 계약서·동의서·신청서·확인서·견적서·회의록·
   이력표는 false.
3. edits — 요청대로 바꿀 자리마다 하나. 같은 글자가 여러 곳에 있고 요청이 그 전부를 뜻하면 전부 적는다.
   - page: 1부터.
   - x0, y0, x1, y1: ★바뀌는 글자만★ 꼭 맞게 두른 상자 — 그 쪽 그림의 화소 좌표(왼쪽 위 · 오른쪽 아래).
     그대로 남는 앞뒤 글자는 넣지 않는다. 예: 「3대」→「2대」면 「3」만, 「2026년 10월」→「2026년 11월」이면 「10」만.
   - original: 상자 안에 적힌 글자 그대로. replacement: 그 자리에 들어갈 글자.
   - serif: 그 글자가 명조(바탕·신명조 계열)면 true, 고딕(돋움·굴림·맑은 고딕 계열)이면 false. bold: 굵게 쓰였으면 true.
   - align: 표 칸 가운데에 놓인 글자면 center, 칸 오른쪽에 맞춘 숫자면 right, 그 밖은 left.
4. 손글씨·도장·서명·날인 위의 글자는 고치지 않는다 — 그런 요청이면 edits 에 넣지 말고 note 에 적는다.
5. 요청한 글자를 서류에서 못 찾으면 edits 를 비우고 note 에 까닭을 적는다. 짐작으로 상자를 만들지 않는다.
6. note — 위 4·5 나 애매한 점이 없으면 null.`;

const ALIGNS: readonly Align[] = ['left', 'center', 'right'];

/** 판독의 답을 믿을 만한 것만 남긴다 — 그림 밖 상자·빈 글자·없는 쪽은 버린다 */
function cleanEdits(raw: unknown, pages: LocatePage[]): LocatedEdit[] {
  if (!Array.isArray(raw)) return [];
  const out: LocatedEdit[] = [];
  for (const e of raw as Array<Record<string, unknown>>) {
    const page = Number(e.page);
    const p = pages[page - 1];
    if (!p) continue;
    const [x0, y0, x1, y1] = [e.x0, e.y0, e.x1, e.y1].map(Number);
    if (![x0, y0, x1, y1].every(Number.isFinite)) continue;
    const box = {
      x0: Math.max(0, Math.min(x0, x1)), y0: Math.max(0, Math.min(y0, y1)),
      x1: Math.min(p.width, Math.max(x0, x1)), y1: Math.min(p.height, Math.max(y0, y1)),
    };
    if (box.x1 - box.x0 < 2 || box.y1 - box.y0 < 2) continue;
    const original = typeof e.original === 'string' ? e.original.trim() : '';
    const replacement = typeof e.replacement === 'string' ? e.replacement : '';
    if (!original && !replacement) continue;
    out.push({
      page, box, original, replacement,
      serif: e.serif === true, bold: e.bold === true,
      align: ALIGNS.includes(e.align as Align) ? (e.align as Align) : 'left',
    });
  }
  return out;
}

export class IssuedDocument extends Error {}
export class Declined extends Error {}

export async function locateEdits(pages: LocatePage[], request: string): Promise<LocateResult> {
  const content: Anthropic.ContentBlockParam[] = [
    ...pages.map((p) => ({
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: p.image },
    })),
    { type: 'text', text: promptOf(pages, request) },
  ];
  const at = Date.now();
  const params: CreateWithOutputConfig = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    messages: [{ role: 'user', content }],
    output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
  };
  const message = await anthropic.messages.create(params, { timeout: CALL_TIMEOUT_MS, maxRetries: 0 });
  logLlmCall({ route: 'retouch', model: MODEL, ms: Date.now() - at, pages: pages.length, usage: message.usage });
  if (message.stop_reason === 'refusal') throw new Declined('판독이 이 요청을 거절했습니다.');
  if (message.stop_reason === 'max_tokens') {
    console.error('[retouch] 답이 끝나지 않음 — stop_reason=max_tokens');
    throw new Error('판독의 답이 끝나지 않았습니다.');
  }
  const text = message.content.filter((b): b is Anthropic.TextBlock => b.type === 'text').map((b) => b.text).join('').trim();
  const raw = JSON.parse(text) as Record<string, unknown>; // json_schema 출력이라 JSON 그대로다
  const docKind = typeof raw.docKind === 'string' ? raw.docKind.trim().slice(0, 80) : '서류';
  if (raw.issued === true) {
    throw new IssuedDocument(`「${docKind}」처럼 기관이 발급한 서류는 고칠 수 없습니다.`);
  }
  return {
    docKind,
    edits: cleanEdits(raw.edits, pages),
    note: typeof raw.note === 'string' && raw.note.trim() ? raw.note.trim().slice(0, 300) : null,
  };
}

import Anthropic from '@anthropic-ai/sdk';
import { logLlmCall } from '@/lib/llm-usage';
import { areaOf, bboxOf, type LngLat, type PolygonCoords } from './geo';
import type { RoofKind } from './building-register';
import { dropNested } from './roof-merge';
import { fromWorldPx } from './mercator';
import { aerialOf, type Aerial } from './sources/aerial';
import { solarApiKey } from './api-key';

/**
 * 항공사진에서 지붕을 딴다 — 지도 모양 자료가 늦거나 틀린 곳(충주 동충주산단4길 17: 2024-11 준공 4동 자리에 임시
 * 네모 하나)을 위해. VWorld 항공영상을 필지 경계(노란 선)와 함께 한 장으로 붙여 Claude 에게 보이고, 지붕 꼭짓점과
 * 못 까는 곳(채광창·설비·옥상 정원·주차장)을 픽셀로 받아 경위도로 바꾼다.
 *
 * Claude Opus 5.5 는 2,576px 까지 좌표를 픽셀 그대로(1:1) 돌려준다 — 사진은 긴 변 1,600px 안에서 보낸다.
 * ★법 확인 전 시험용이다★ — 항공영상은 국토지리정보원 측량용 사진에서 온다. 공간정보관리법 제16조(측량용 사진의
 * 국외 반출 금지)에 해외 AI 서버로 보내는 것이 걸리는지 확인한 뒤 운영한다(국내 리전 추론도 검토).
 */
export const MODEL = 'claude-opus-5-5';

/**
 * 콘솔의 SDK(0.52)에는 이 요청의 칸 둘(fallbacks · output_config)이 아직 없다 — 변수로 넘기면 SDK 가 그대로 실어 보낸다
 * (lib/survey/read-plate 와 같은 방식). 거절 갈래(stop_details)도 응답 형에 없어 같이 적는다.
 */
type TraceParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming & {
  fallbacks?: 'default';
  output_config?: { effort?: 'low' | 'medium' | 'high'; format?: { type: 'json_schema'; schema: unknown } };
};
type StopDetails = { stop_details?: { category?: string } | null };

/*
 * 시간 — 라우트는 120초에 끊긴다(app/api/solar/roofs maxDuration). 110초 한 번으로 그 안에서 끝낸다 — 다시 하지 않는다:
 * SDK 는 혼잡(429·529) 때 기다렸다 다시 해 Vercel 이 먼저 끊고 실패 문구도 안 남는다(read-plate 가 겪었다).
 */
const CALL_TIMEOUT_MS = 110_000;

const KINDS: RoofKind[] = ['판넬·금속', '콘크리트', '기와', '슬레이트', '기타'];

const POINTS = {
  type: 'array',
  description: '꼭짓점을 차례로(시계 방향이든 반대든 한 방향). 같은 점을 처음과 끝에 두 번 쓰지 않는다',
  items: {
    type: 'object',
    properties: { x: { type: 'integer' }, y: { type: 'integer' } },
    required: ['x', 'y'],
    additionalProperties: false,
  },
} as const;

const SCHEMA = {
  type: 'object',
  properties: {
    roofs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          points: POINTS,
          kind: { type: 'string', enum: KINDS },
          note: { type: 'string', description: '한국어 한 줄 — 무슨 건물로 보이는지' },
        },
        required: ['points', 'kind', 'note'],
        additionalProperties: false,
      },
    },
    obstacles: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          points: POINTS,
          note: { type: 'string', description: '한국어 한 줄 — 무엇이 있어서 못 까는지' },
        },
        required: ['points', 'note'],
        additionalProperties: false,
      },
    },
  },
  required: ['roofs', 'obstacles'],
  additionalProperties: false,
} as const;

function prompt(a: Aerial): string {
  return [
    `This is a north-up aerial photo, ${a.width} × ${a.height} pixels, about ${a.metersPerPx.toFixed(2)} m per pixel.`,
    'The yellow line is the boundary of one land parcel. We are planning rooftop solar panels for the buildings on this parcel.',
    '',
    'Task 1 — roofs: trace the outline of every building roof that lies mostly inside the yellow line.',
    '- One polygon per separately built structure; do not merge buildings that have a visible gap or a different roof height.',
    '- Follow the actual roof edge (eaves), not shadows or the ground around it. Rectangular roofs need exactly 4 points; add points only where the edge really turns.',
    '- Skip parking lots, roads, bare ground, small sheds under about 20 m², and anything mostly outside the yellow line.',
    '- kind: 판넬·금속 (metal/sandwich panel), 콘크리트 (flat concrete slab), 기와 (tiles), 슬레이트, or 기타 (anything else, e.g. a fabric/membrane tent roof). Say what you saw in note.',
    '',
    'Task 2 — obstacles: on those roofs, outline the parts where panels cannot go — skylights, rooftop equipment, roof gardens, rooftop parking, domes or towers. Leave it empty when the roofs are clear.',
    '',
    'Coordinates are integer pixels in this image: x from the left edge, y from the top edge. Be precise to a few pixels — the outlines become installation plans.',
  ].join('\n');
}

export type TracedRoof = { polygons: PolygonCoords[]; kind: RoofKind; note: string; area: number };
export type Trace = {
  roofs: TracedRoof[];
  obstacles: { polygons: PolygonCoords[]; note: string }[];
  meta: { model: string; servedBy: string; z: number; metersPerPx: number; width: number; height: number; inputTokens: number; outputTokens: number; ms: number };
};

type Raw = { roofs: { points: { x: number; y: number }[]; kind: RoofKind; note: string }[]; obstacles: { points: { x: number; y: number }[]; note: string }[] };

/** 사진 픽셀 꼭짓점 → 닫힌 경위도 고리. 꼭짓점이 셋보다 적거나 사진 밖이면 버린다 */
export function ringOf(points: { x: number; y: number }[], a: Pick<Aerial, 'originX' | 'originY' | 'z' | 'width' | 'height'>): LngLat[] | null {
  const pts = points.filter((p) => p.x >= -2 && p.y >= -2 && p.x <= a.width + 2 && p.y <= a.height + 2);
  if (pts.length < 3) return null;
  const ring = pts.map((p) => fromWorldPx([a.originX + p.x, a.originY + p.y], a.z));
  return [...ring, ring[0]];
}


let client: Anthropic | null = null;

export async function traceRoofs(parcel: PolygonCoords[]): Promise<Trace> {
  if (!solarApiKey()) throw new Error('[AI] ANTHROPIC_SOLAR_API_KEY · ANTHROPIC_API_KEY 없음');
  const box = bboxOf(parcel);
  if (!box) throw new Error('[AI] 필지 모양 없음');
  const t0 = Date.now();
  const aerial = await aerialOf(box, parcel);
  client ??= new Anthropic({ apiKey: solarApiKey() });
  const params: TraceParams = {
    model: MODEL,
    max_tokens: 16000,
    // 거절되면 같은 요청을 다른 모델이 이어받는다(서버 쪽 대체 — 거절 갈래에 맞춰 고른다)
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'high', format: { type: 'json_schema', schema: SCHEMA } },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: aerial.jpeg.toString('base64') } },
          { type: 'text', text: prompt(aerial) },
        ],
      },
    ],
  };
  const asked = Date.now();
  const res = await client.beta.messages.create(params, { timeout: CALL_TIMEOUT_MS, maxRetries: 0 });
  logLlmCall({ route: 'solar-roofs', model: MODEL, ms: Date.now() - asked, usage: res.usage });
  if (res.stop_reason === 'refusal') throw new Error(`[AI] 응답 거절 (${(res as StopDetails).stop_details?.category ?? '사유 없음'})`);
  if (res.stop_reason === 'max_tokens') throw new Error('[AI] 응답이 잘림 (max_tokens)');
  const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  let raw: Raw;
  try {
    raw = JSON.parse(text) as Raw;
  } catch {
    throw new Error(`[AI] JSON 아님: ${text.slice(0, 200)}`);
  }

  // 한 지붕을 겹쳐 딴 것(큰 지붕 안의 작은 지붕)은 뺀다 — 그대로 두면 그 자리에 패널이 두 번 깔린다
  const roofs = dropNested(
    raw.roofs.flatMap((r) => {
      const ring = ringOf(r.points, aerial);
      if (!ring) return [];
      const polygons: PolygonCoords[] = [[ring]];
      const area = areaOf(polygons);
      return area >= 20 ? [{ polygons, kind: KINDS.includes(r.kind) ? r.kind : '기타', note: r.note, area }] : [];
    }),
  );
  const obstacles = raw.obstacles.flatMap((o) => {
    const ring = ringOf(o.points, aerial);
    return ring ? [{ polygons: [[ring]] as PolygonCoords[], note: o.note }] : [];
  });
  return {
    roofs,
    obstacles,
    meta: {
      model: MODEL,
      servedBy: res.model,
      z: aerial.z,
      metersPerPx: aerial.metersPerPx,
      width: aerial.width,
      height: aerial.height,
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
      ms: Date.now() - t0,
    },
  };
}

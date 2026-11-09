/**
 * 부지 검토의 바깥 자료 — 항공사진 잇기(sources/aerial) · AI 지붕 응답 읽기(roof-trace readTrace · traceOf) · VWorld 토지이용계획 ·
 * 토지특성(sources/vworld). 바깥(VWorld · AI)은 흉내 낸다 — fetch 를 갈아 끼운다(grid.test 와 같은 방식).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { areaOf, expandBbox, type LngLat } from '@/lib/solar/geo';
import { metersPerPx, TILE, toWorldPx } from '@/lib/solar/mercator';
import { readTrace, traceOf, type Raw } from '@/lib/solar/roof-trace';
import { aerialOf, tileWindow } from '@/lib/solar/sources/aerial';
import { blank, decodeJpeg, encodeJpeg } from '@/lib/solar/sources/raster';
import { landTraits, zonesOf } from '@/lib/solar/sources/vworld';

const keep = { key: process.env.VWORLD_KEY, domain: process.env.VWORLD_DOMAIN };
beforeEach(() => {
  process.env.VWORLD_KEY = 'test-key';
  delete process.env.VWORLD_DOMAIN;
});
afterEach(() => {
  vi.unstubAllGlobals();
  if (keep.key === undefined) delete process.env.VWORLD_KEY;
  else process.env.VWORLD_KEY = keep.key;
  if (keep.domain !== undefined) process.env.VWORLD_DOMAIN = keep.domain;
});

/** 충주 동충주산단4길 17 둘레(약 90m × 90m) */
const SMALL: [number, number, number, number] = [127.9365, 37.08, 127.9375, 37.0808];

describe('항공사진의 자리 — tileWindow', () => {
  const longSide = (w: ReturnType<typeof tileWindow>) => Math.max(w.x1 - w.x0, w.y1 - w.y0);

  it('작은 필지는 가장 크게(19단계) — 긴 변이 한도 안, 받을 타일은 창을 덮는 만큼', () => {
    const w = tileWindow(SMALL, { marginM: 25, maxPx: 1600 });
    expect(w.z).toBe(19);
    expect(longSide(w)).toBeLessThanOrEqual(1600);
    const cols = Math.floor(w.x1 / TILE) - w.tx0 + 1;
    const rows = Math.floor(w.y1 / TILE) - w.ty0 + 1;
    expect(w.tiles).toHaveLength(cols * rows);
    expect(w.tiles[0]).toEqual({ tx: w.tx0, ty: w.ty0 });
    const [, s, , n] = expandBbox(SMALL, 25);
    expect(w.midLat).toBeCloseTo((s + n) / 2, 12);
  });

  it('큰 둘레는 한도에 들 때까지 단계를 낮춘다 — 한 단계 위면 넘친다', () => {
    const big: [number, number, number, number] = [127.9, 37.06, 127.94, 37.09];
    const w = tileWindow(big, { marginM: 25, maxPx: 1600 });
    expect(w.z).toBeLessThan(19);
    expect(longSide(w)).toBeLessThanOrEqual(1600);
    const [ww, s, e, n] = expandBbox(big, 25);
    const [ax, ay] = toWorldPx([ww, n], w.z + 1);
    const [bx, by] = toWorldPx([e, s], w.z + 1);
    expect(Math.max(bx - ax, by - ay)).toBeGreaterThan(1600);
  });

  it('아무리 커도 14단계 밑으로는 안 내려간다', () => {
    expect(tileWindow([126, 36, 128, 38], { marginM: 0, maxPx: 400 }).z).toBe(14);
  });
});

describe('항공사진 잇기 — aerialOf', () => {
  const tile = encodeJpeg(blank(TILE, TILE), 80);
  const tiles = () => {
    const f = vi.fn(async (_url: string) => new Response(new Uint8Array(tile), { headers: { 'content-type': 'image/jpeg' } }));
    vi.stubGlobal('fetch', f);
    return f;
  };

  it('창만큼 한 장 — 원점 · 단계 · m/px 를 같이 주고, 타일은 키를 실어 창을 덮는 만큼 받는다', async () => {
    const f = tiles();
    const w = tileWindow(SMALL, { marginM: 25, maxPx: 1600 });
    const a = await aerialOf(SMALL, []);
    expect(a).toMatchObject({ z: w.z, originX: w.x0, originY: w.y0, width: w.x1 - w.x0, height: w.y1 - w.y0 });
    expect(a.metersPerPx).toBeCloseTo(metersPerPx(w.midLat, w.z), 12);
    const img = decodeJpeg(new Uint8Array(a.jpeg));
    expect([img.width, img.height]).toEqual([a.width, a.height]);
    expect(f).toHaveBeenCalledTimes(w.tiles.length);
    expect(f.mock.calls[0][0]).toBe(`https://api.vworld.kr/req/wmts/1.0.0/test-key/Satellite/${w.z}/${w.ty0}/${w.tx0}.jpeg`);
  });

  it('필지를 노란 선으로 그려 넣는다 — AI 가 「어느 땅의 지붕인가」를 안다', async () => {
    tiles();
    const [w, s, e, n] = SMALL;
    const ring: LngLat[] = [[w, s], [e, s], [e, n], [w, n], [w, s]];
    const a = await aerialOf(SMALL, [[ring]]);
    const img = decodeJpeg(new Uint8Array(a.jpeg));
    // 필지 왼쪽 변의 가운데 — 검은 타일 위에 노란 선(#ffd400)
    const [px, py] = toWorldPx([w, (s + n) / 2], a.z);
    const i = (Math.round(py - a.originY) * img.width + Math.round(px - a.originX)) * 4;
    expect(img.data[i]).toBeGreaterThan(200);
    expect(img.data[i + 1]).toBeGreaterThan(160);
    expect(img.data[i + 2]).toBeLessThan(90);
  });

  it('타일 대신 그림 아닌 것이 오면 그 타일과 까닭으로 멈춘다 · 키가 없으면 부르지 않는다', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<xml/>', { headers: { 'content-type': 'text/xml' } })));
    await expect(aerialOf(SMALL, [])).rejects.toThrow(/\[VWorld 항공영상\] 타일 19\/\d+\/\d+ 못 받음 \(200 text\/xml\)/);
    delete process.env.VWORLD_KEY;
    await expect(aerialOf(SMALL, [])).rejects.toThrow('[VWorld] VWORLD_KEY 없음');
  });
});

describe('AI 지붕 응답 읽기 — readTrace', () => {
  const text = (...t: string[]) => ({ stop_reason: 'end_turn', content: t.map((x) => ({ type: 'text', text: x })) });
  it('글 조각을 이어 JSON 으로 — 글이 아닌 조각은 건너뛴다', () => {
    const r = { ...text('{"roofs":[],', '"obstacles":[]}'), content: [{ type: 'thinking' }, ...text('{"roofs":[],', '"obstacles":[]}').content] };
    expect(readTrace(r)).toEqual({ roofs: [], obstacles: [] });
  });
  it('거절 · 잘림 · JSON 아님은 그 까닭으로 던진다', () => {
    expect(() => readTrace({ stop_reason: 'refusal', content: [], stop_details: { category: 'cyber' } })).toThrow('[AI] 응답 거절 (cyber)');
    expect(() => readTrace({ stop_reason: 'refusal', content: [] })).toThrow('[AI] 응답 거절 (사유 없음)');
    expect(() => readTrace({ stop_reason: 'max_tokens', content: [] })).toThrow('[AI] 응답이 잘림 (max_tokens)');
    expect(() => readTrace(text('지붕이 셋 있습니다'))).toThrow('[AI] JSON 아님: 지붕이 셋 있습니다');
  });
});

describe('AI 지붕 → 경위도 — traceOf', () => {
  const z = 19;
  const [ox, oy] = toWorldPx([127.936, 37.0808], z).map(Math.floor);
  const aerial = { originX: ox, originY: oy, z, width: 800, height: 600 };
  const box = (x: number, y: number, w: number, h: number) => [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ];
  const mpp = metersPerPx(37.08, z);

  it('지붕은 닫힌 경위도 고리 · 넓이(㎡) — 픽셀 넓이 × (m/px)²', () => {
    const { roofs } = traceOf({ roofs: [{ points: box(100, 100, 200, 100), kind: '판넬·금속', note: '공장' }], obstacles: [] }, aerial);
    expect(roofs).toHaveLength(1);
    const ring = roofs[0].polygons[0][0];
    expect(ring).toHaveLength(5);
    expect(ring[4]).toEqual(ring[0]);
    expect(roofs[0].area).toBeCloseTo(areaOf(roofs[0].polygons), 6);
    expect(roofs[0].area / (200 * 100 * mpp * mpp)).toBeGreaterThan(0.98);
    expect(roofs[0].area / (200 * 100 * mpp * mpp)).toBeLessThan(1.02);
  });

  it('20㎡ 밑 · 사진 밖 · 꼭짓점 셋 미만은 버리고, 모르는 갈래는 기타, 큰 지붕 안의 작은 지붕은 뺀다', () => {
    const raw = {
      roofs: [
        { points: box(100, 100, 300, 200), kind: '콘크리트', note: '본동' },
        { points: box(150, 150, 60, 40), kind: '콘크리트', note: '본동 안 계단실' },
        { points: box(500, 400, 15, 15), kind: '판넬·금속', note: '헛간' },
        { points: box(900, 700, 100, 100), kind: '판넬·금속', note: '사진 밖' },
        { points: box(450, 100, 100, 100).slice(0, 2), kind: '판넬·금속', note: '점 둘' },
        { points: box(600, 100, 100, 80), kind: '천막', note: '막구조' },
      ],
      obstacles: [
        { points: box(120, 120, 20, 20), note: '채광창' },
        { points: box(700, 500, 5, 5).slice(0, 2), note: '점 둘' },
      ],
    } as unknown as Raw;
    const t = traceOf(raw, aerial);
    expect(t.roofs.map((r) => [r.note, r.kind])).toEqual([
      ['본동', '콘크리트'],
      ['막구조', '기타'],
    ]);
    expect(t.obstacles.map((o) => o.note)).toEqual(['채광창']);
  });
});

describe('VWorld 토지이용계획 · 토지특성', () => {
  const answer = (...bodies: unknown[]) => {
    const f = vi.fn(async (_url: string) => new Response(JSON.stringify(bodies.shift() ?? {}), { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', f);
    return f;
  };

  it('지역 · 지구는 이름과 관계(포함 · 접함) — 같은 줄은 한 번, 이름 없는 줄은 뺀다', async () => {
    const f = answer({
      landUses: {
        field: [
          { prposAreaDstrcCodeNm: ' 도시지역 ', cnflcAtNm: '포함' },
          { prposAreaDstrcCodeNm: '도시지역', cnflcAtNm: '포함' },
          { prposAreaDstrcCodeNm: '', cnflcAtNm: '포함' },
          { prposAreaDstrcCodeNm: '개발제한구역', cnflcAtNm: '접함' },
        ],
      },
    });
    expect(await zonesOf('4313041022120740000')).toEqual([
      { name: '도시지역', relation: '포함' },
      { name: '개발제한구역', relation: '접함' },
    ]);
    expect(f.mock.calls[0][0]).toContain('pnu=4313041022120740000');
    expect(f.mock.calls[0][0]).toContain('key=test-key');
  });

  it('응답에 지역 묶음이 없으면 모르는 것으로 멈춘다(「0건」과 다르다)', async () => {
    answer({ response: { status: 'ERROR' } });
    await expect(zonesOf('4313041022120740000')).rejects.toThrow(/\[VWorld 토지이용계획\] 응답에 landUses 없음/);
  });

  it('토지특성은 올해 것이 없으면 지난해 것 — 빈 칸은 null', async () => {
    const f = answer({ landCharacteristicss: { field: [] } }, { landCharacteristics: { field: [{ tpgrphHgCodeNm: ' 완경사 ', tpgrphFrmCodeNm: ' ', roadSideCodeNm: '세로각지(가)' }] } });
    expect(await landTraits('4313041022120740000', 2026)).toEqual({
      year: '2025',
      height: '완경사',
      shape: null,
      road: '세로각지(가)',
      use: null,
      category: null,
      areaM2: null,
      zoning: [],
    });
    expect(f.mock.calls.map((c) => new URL(c[0]).searchParams.get('stdrYear'))).toEqual(['2026', '2025']);
  });

  it('토지특성의 지목 · 토지 면적 · 용도지역(「지정되지않음」 뺌) — 2026-11-09 실응답(충주 영덕리 2074)의 모양', async () => {
    answer({
      landCharacteristicss: {
        field: [{ tpgrphHgCodeNm: '평지', lndcgrCodeNm: '공장용지', lndpclAr: '15446', prposArea1Nm: '일반공업지역', prposArea2Nm: '지정되지않음' }],
      },
    });
    expect(await landTraits('4313041022120740000', 2026)).toMatchObject({ category: '공장용지', areaM2: 15_446, zoning: ['일반공업지역'] });
  });

  it('두 해 다 없으면 null', async () => {
    answer({ landCharacteristicss: { field: [] } }, {});
    expect(await landTraits('4313041022120740000', 2026)).toBeNull();
  });
});

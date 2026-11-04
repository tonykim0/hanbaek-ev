import { afterEach, describe, expect, it } from 'vitest';
import { fromWorldPx, metersPerPx, toWorldPx } from '@/lib/solar/sources/aerial';
import { ringOf, solarApiKey } from '@/lib/solar/roof-trace';

describe('항공영상 픽셀 ↔ 경위도', () => {
  it('되돌리면 같은 자리 (충주, 19단계)', () => {
    const p: [number, number] = [127.9378, 37.0815];
    const [lng, lat] = fromWorldPx(toWorldPx(p, 19), 19);
    expect(lng).toBeCloseTo(p[0], 8);
    expect(lat).toBeCloseTo(p[1], 8);
  });
  it('19단계 위도 37° 에서 1px ≈ 0.238m (VWorld 위성 타일 최대 단계)', () => expect(metersPerPx(37.08, 19)).toBeCloseTo(0.238, 3));
});

describe('ringOf — AI 가 준 픽셀 꼭짓점을 닫힌 경위도 고리로', () => {
  const a = { originX: 0, originY: 0, z: 19, width: 1000, height: 800 };
  const [ox, oy] = toWorldPx([127.9378, 37.0815], 19);
  const at = { ...a, originX: Math.floor(ox), originY: Math.floor(oy) };
  it('네 꼭짓점 → 다섯 점 고리(처음 = 끝)', () => {
    const ring = ringOf(
      [
        { x: 100, y: 100 },
        { x: 300, y: 100 },
        { x: 300, y: 200 },
        { x: 100, y: 200 },
      ],
      at,
    )!;
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
    expect(ring[1][0]).toBeGreaterThan(ring[0][0]); // 오른쪽 = 동쪽
    expect(ring[2][1]).toBeLessThan(ring[1][1]); // 아래 = 남쪽
  });
  it('점이 셋보다 적거나 사진 밖이면 버린다', () => {
    expect(ringOf([{ x: 1, y: 1 }, { x: 2, y: 2 }], at)).toBeNull();
    expect(ringOf([{ x: 5000, y: 1 }, { x: 6000, y: 2 }, { x: 7000, y: 3 }], at)).toBeNull();
  });
});

/* 태양광은 따로 키를 쓴다 — 콘솔 사용량에서 태양광 몫이 갈려 보이게(키 「hanbaek-solar」, 2026-11-04) */
describe('태양광 API 키 — ANTHROPIC_SOLAR_API_KEY 먼저, 없으면 공용 키', () => {
  const keep = { solar: process.env.ANTHROPIC_SOLAR_API_KEY, main: process.env.ANTHROPIC_API_KEY };
  afterEach(() => {
    process.env.ANTHROPIC_SOLAR_API_KEY = keep.solar ?? '';
    process.env.ANTHROPIC_API_KEY = keep.main ?? '';
  });
  it('따로 넣은 키가 있으면 그것 · 비었거나 공백뿐이면 공용 키', () => {
    process.env.ANTHROPIC_API_KEY = 'main';
    process.env.ANTHROPIC_SOLAR_API_KEY = 'solar';
    expect(solarApiKey()).toBe('solar');
    process.env.ANTHROPIC_SOLAR_API_KEY = '  ';
    expect(solarApiKey()).toBe('main');
  });
});

import { describe, expect, it } from 'vitest';
import { blank, decodeJpeg, encodeJpeg, paste, strokeRing, type Rgba } from '@/lib/solar/sources/raster';

const fill = (w: number, h: number, rgb: [number, number, number]): Rgba => {
  const img = blank(w, h);
  for (let i = 0; i < img.data.length; i += 4) img.data.set([...rgb, 255], i);
  return img;
};
const at = (img: Rgba, x: number, y: number) => [...img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 3)];

describe('항공사진 짓기 — sharp 없이', () => {
  it('타일을 판의 자리에 얹고, 판 밖으로 나간 쪽은 자른다', () => {
    const photo = blank(10, 10);
    paste(photo, fill(8, 8, [200, 0, 0]), -4, 6); // 왼쪽 위로 4, 아래로 6 — 판에는 (0..3, 6..9)만 든다
    expect(at(photo, 0, 6)).toEqual([200, 0, 0]);
    expect(at(photo, 3, 9)).toEqual([200, 0, 0]);
    expect(at(photo, 4, 6)).toEqual([0, 0, 0]); // 타일 밖은 검정 바탕
    expect(at(photo, 0, 5)).toEqual([0, 0, 0]);
  });

  it('필지 선은 꼭짓점을 잇는 굵기 3px 의 노란 선이다 — 안쪽은 칠하지 않는다', () => {
    const photo = blank(40, 40);
    strokeRing(photo, [[10, 10], [30, 10], [30, 30], [10, 30], [10, 10]], [255, 212, 0], 3);
    expect(at(photo, 20, 9)).toEqual([255, 212, 0]); // 위 변(y=10) 위
    expect(at(photo, 30, 20)).toEqual([255, 212, 0]); // 오른쪽 변
    expect(at(photo, 9, 20)).toEqual([255, 212, 0]); // 왼쪽 변(마지막 점 → 첫 점)
    expect(at(photo, 20, 20)).toEqual([0, 0, 0]); // 안
    expect(at(photo, 20, 13)).toEqual([0, 0, 0]); // 선 굵기 밖
  });

  it('판 밖의 꼭짓점도 판 안의 선만 긋는다', () => {
    const photo = blank(10, 10);
    strokeRing(photo, [[-20, 5], [30, 5]], [255, 212, 0], 3);
    expect(at(photo, 0, 5)).toEqual([255, 212, 0]);
    expect(at(photo, 9, 5)).toEqual([255, 212, 0]);
  });

  it('JPEG 로 굽고 다시 읽으면 크기와 색이 남는다', () => {
    const img = fill(32, 16, [40, 120, 200]);
    const back = decodeJpeg(encodeJpeg(img, 88));
    expect([back.width, back.height]).toEqual([32, 16]);
    at(back, 16, 8).forEach((v, i) => expect(Math.abs(v - [40, 120, 200][i])).toBeLessThan(6));
  });
});

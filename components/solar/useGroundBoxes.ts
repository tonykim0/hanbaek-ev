'use client';

import { useCallback, useMemo, useState } from 'react';
import { boxArea, carportPanels, kwOfArea, type Box, type GroundUse } from '@/lib/solar/boxes';

/**
 * 지상형 설치 영역 — 지도에 그린 네모. 고치는 동안(editing)은 편집기(boxEditor)가 네모를 쥐고, 「확정」하면 그 네모들이
 * 여기 들어와 용량이 된다(한백: 「네모를 그려 사이즈를 조절하고, 확정 지으면 예상 설치용량이 나오게」).
 * 확정한 네모는 고정된다 — 지도를 옮기다 모양이 바뀌지 않게. 네모마다 지울 수 있고(그 자리에서 용량이 준다),
 * 크기·회전을 다시 맞추려면 「네모 고치기」로 다시 편집에 들어간다.
 *
 * 용량은 설치 방식으로 갈린다 — 주차장 캐노피(기본): 네모 안에 모듈을 빈틈없이 깐 장수 · 땅에 세움: 넓이 ÷ 13㎡.
 */
export type SizedBox = Box & { area: number; kw: number; count: number };

export type GroundPlan = {
  /** 확정한 네모 */
  boxes: SizedBox[];
  editing: boolean;
  use: GroundUse;
  /** 확정한 네모 넓이 합(㎡) · 용량(kW) · 패널(캐노피일 때) */
  area: number;
  capacityKw: number;
  count: number;
  setUse(use: GroundUse): void;
  startEdit(): void;
  /** 편집기의 네모들로 확정 — 0개면 네모 기준을 걷고 땅 면적 기준으로 돌아간다 */
  confirm(drawn: Box[]): void;
  cancel(): void;
  remove(id: string): void;
};

export function useGroundBoxes(lat: number | null): GroundPlan | null {
  const [raw, setRaw] = useState<Box[]>([]);
  const [editing, setEditing] = useState(false);
  const [use, setUse] = useState<GroundUse>('carport');

  const boxes = useMemo<SizedBox[]>(
    () =>
      raw.map((b) => {
        const area = boxArea(b);
        if (use === 'carport' && lat !== null) {
          const l = carportPanels(b, lat);
          return { ...b, area, kw: Math.round(l.kw * 10) / 10, count: l.count };
        }
        return { ...b, area, kw: kwOfArea(area), count: 0 };
      }),
    [raw, use, lat],
  );

  const startEdit = useCallback(() => setEditing(true), []);
  const confirm = useCallback((drawn: Box[]) => {
    setRaw(drawn);
    setEditing(false);
  }, []);
  const cancel = useCallback(() => setEditing(false), []);
  const remove = useCallback((id: string) => setRaw((prev) => prev.filter((b) => b.id !== id)), []);

  if (lat === null) return null;
  const area = boxes.reduce((s, b) => s + b.area, 0);
  const capacityKw = Math.round(boxes.reduce((s, b) => s + b.kw, 0) * 10) / 10;
  const count = boxes.reduce((s, b) => s + b.count, 0);
  return { boxes, editing, use, area, capacityKw, count, setUse, startEdit, confirm, cancel, remove };
}

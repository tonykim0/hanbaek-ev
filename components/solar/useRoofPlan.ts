'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { areaOf, type PolygonCoords } from '@/lib/solar/geo';
import { cutLayout, layoutRoof, type Layout, type LayoutStyle } from '@/lib/solar/layout';
import type { SiteMap } from '@/lib/solar/types';

/**
 * 어느 지붕에 패널을 까나 — AI 가 항공사진에서 딴 지붕에 패널을 깔고, AI 가 본 못 까는 곳과 겹친 모듈은 지운다.
 * 패널을 깔면 그 장수가 용량이다. AI 를 돌리기 전에는 깔지 않고 대장 면적으로 센다.
 *
 * 지붕은 AI 가 딴 것뿐이다(한백 지시 2026-11-03) — 지도 모양(VWorld 건물)은 지붕으로 쓰지도, 그리지도 않는다.
 * 지도 모양은 새 건물이 늦게 들어오고(충주 동충주산단4길 17: 대장 4동 · 모양 1동) 처마까지 그려 AI 지붕과 겹쳐
 * 두 번 깔렸다. 사람이 그리는 길 · 「패널 깔기」(모양 전부에 깔기)도 걷었다 — 패널은 AI 가 채운다.
 */
export type Roof = {
  id: string;
  polygons: PolygonCoords[];
  area: number;
  /** AI 가 본 지붕 갈래·한 줄 설명 */
  kind?: string;
  note?: string;
};

/** AI 가 딴 것 — /api/roofs 응답 모양 */
export type TraceResult = {
  roofs: { polygons: PolygonCoords[]; kind: string; note: string; area?: number }[];
  obstacles: { polygons: PolygonCoords[]; note: string }[];
};
/** AI 가 따도 처음부터 깔지 않는 지붕 — 막구조 천막(충주)·슬레이트. 누르면 깔린다 */
export const SKIP_KINDS = new Set(['기타', '슬레이트']);

export type TraceReply = TraceResult & { cached?: boolean; meta?: { ms?: number } };

/**
 * AI 지붕 찾기 — /api/solar/roofs. 지도의 「AI로 패널배치하기」(제안서 생성에서는 현장을 불러오면 저절로 한 번)가 부른다.
 * 실패하면 그 까닭(한글)을 던진다.
 */
export async function fetchRoofTrace(pnu: string): Promise<TraceReply> {
  const res = await fetch(`/api/solar/roofs?pnu=${pnu}`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `실패 (${res.status})`);
  return body as TraceReply;
}

/** AI 지붕 따기의 결과 한 줄 — 찾은 지붕 · 천막 · 슬레이트라 안 깐 곳 · 못 까는 곳 · 저장해 둔 결과인지 걸린 초 */
export function traceMessage(trace: TraceReply): string {
  const sec = Math.round((trace.meta?.ms ?? 0) / 1000);
  const skipped = trace.roofs.filter((r) => SKIP_KINDS.has(r.kind)).length;
  return `AI가 지붕 ${trace.roofs.length}곳${skipped ? `(그중 ${skipped}곳은 천막·슬레이트라 패널을 안 깔았습니다)` : ''}${
    trace.obstacles.length ? ` · 못 까는 곳 ${trace.obstacles.length}곳` : ''
  }을 찾았습니다${trace.cached ? ' (저장해 둔 결과)' : ` · ${sec}초`}`;
}

export type RoofPlan = {
  /** AI 가 딴 지붕 */
  roofs: Roof[];
  /** AI 가 본 못 까는 곳(누르면 지운다) */
  cuts: Roof[];
  selected: ReadonlySet<string>;
  style: LayoutStyle;
  /** 고른 지붕의 배치(못 까는 곳을 지운 뒤) */
  layouts: ReadonlyMap<string, Layout>;
  count: number;
  kw: number;
  /** 고른 지붕 넓이 합 */
  area: number;
  /** layout — 패널 장수로 센다 · register — 아직 안 깔아서 대장 면적으로 센다 */
  basis: 'layout' | 'register';
  toggle(id: string): void;
  /** AI 가 딴 지붕·못 까는 곳 — 앞서 딴 것은 바꾼다 */
  applyTrace(trace: TraceResult): void;
  removeCut(id: string): void;
  setStyle(style: LayoutStyle): void;
};

export function useRoofPlan(map: SiteMap | null): RoofPlan | null {
  const [roofs, setRoofs] = useState<Roof[]>([]);
  const [cuts, setCuts] = useState<Roof[]>([]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [style, setStyle] = useState<LayoutStyle>(map?.roofStyle ?? 'tilted');
  const nextId = useRef(0);
  // 지붕·방식마다 한 번만 배치한다 — 고르고 빼기는 다시 셈하지 않는다
  const cache = useRef(new Map<string, Layout>());

  const lat = map?.point.lat ?? 36.5;
  const layouts = useMemo(() => {
    const out = new Map<string, Layout>();
    const cutPolys = cuts.map((c) => c.polygons);
    for (const r of roofs) {
      if (!selected.has(r.id)) continue;
      const k = `${r.id}|${style}`;
      let l = cache.current.get(k);
      if (!l) {
        l = layoutRoof(r.polygons, style, lat);
        cache.current.set(k, l);
      }
      out.set(r.id, cutLayout(l, cutPolys));
    }
    return out;
  }, [roofs, selected, style, lat, cuts]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);
  const removeCut = useCallback((id: string) => setCuts((prev) => prev.filter((c) => c.id !== id)), []);
  const applyTrace = useCallback((trace: TraceResult) => {
    const traced: Roof[] = trace.roofs.map((r) => ({
      id: `a${nextId.current++}`,
      polygons: r.polygons,
      area: areaOf(r.polygons),
      kind: r.kind,
      note: r.note,
    }));
    const chosen = traced.filter((r) => !SKIP_KINDS.has(r.kind ?? ''));
    // 배치 방식은 고른 지붕 중 넓은 쪽 갈래로 — 기와(경사 지붕)만 지붕면 부착형, 나머지는 경사고정형(실제 설계가 그렇다 — lib/layout)
    const tile = chosen.filter((r) => r.kind === '기와').reduce((s, r) => s + r.area, 0);
    const rest = chosen.reduce((s, r) => s + r.area, 0) - tile;
    if (chosen.length) setStyle(tile > rest ? 'flush' : 'tilted');
    // 다시 돌리면 앞서 딴 것을 통째로 바꾼다
    setRoofs(traced);
    setCuts(trace.obstacles.map((o) => ({ id: `x${nextId.current++}`, polygons: o.polygons, area: areaOf(o.polygons), note: o.note })));
    setSelected(new Set(chosen.map((r) => r.id)));
  }, []);

  if (!map) return null;
  let count = 0;
  let kw = 0;
  let area = 0;
  for (const r of roofs)
    if (selected.has(r.id)) {
      const l = layouts.get(r.id);
      count += l?.count ?? 0;
      kw += l?.kw ?? 0;
      area += r.area;
    }
  return {
    roofs,
    cuts,
    selected,
    style,
    layouts,
    count,
    kw,
    area,
    // 아무 지붕도 안 골랐으면 대장 면적으로 — 「다 빼면 0kW」보다 처음 숫자가 낫다
    basis: selected.size ? 'layout' : 'register',
    toggle,
    applyTrace,
    removeCut,
    setStyle,
  };
}

/** AI 패널배치가 도는 중 · 결과 한 줄 · 실패 · AI 가 본 것 */
export type TraceState = { busy: boolean; msg: string | null; error: boolean; trace?: TraceResult };

/**
 * AI 패널배치(지붕 따기) — 지도의 단추와 저절로(autoRun) 같은 길 하나. 지도가 안 떠도 돈다(지붕을 받아 오는 일이다).
 * 저절로는 한 번만 — 이미 배치가 있으면(앞서 돌렸으면) 안 돈다. 개발 모드의 두 번 도는 효과에도 한 번(ref).
 *
 * @param autoRun  처음 그릴 때 저절로 한 번(제안서 생성 — 배치 없이는 제안서를 못 짓는다)
 * @param onAiBusy 도는 동안 — 제안서 생성의 만들기 단추가 기다린다
 */
export function useRoofTrace(pnu: string | null, plan: RoofPlan | null, autoRun: boolean, onAiBusy?: (busy: boolean) => void) {
  const [ai, setAi] = useState<TraceState>({ busy: false, msg: null, error: false });
  const run = async () => {
    if (!pnu || !plan || ai.busy) return;
    setAi({ busy: true, msg: null, error: false });
    try {
      const body = await fetchRoofTrace(pnu);
      plan.applyTrace(body);
      setAi({ busy: false, error: false, trace: body, msg: traceMessage(body) });
    } catch (err) {
      setAi({ busy: false, error: true, msg: err instanceof Error ? err.message : String(err) });
    }
  };
  const autoRan = useRef(false);
  useEffect(() => {
    if (!autoRun || autoRan.current || !plan || !pnu || plan.roofs.length) return;
    autoRan.current = true;
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 처음 한 번
  }, [autoRun, pnu, !!plan]);
  useEffect(() => onAiBusy?.(ai.busy), [ai.busy, onAiBusy]);
  return { ai, run };
}

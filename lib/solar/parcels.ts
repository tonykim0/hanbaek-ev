/**
 * 여러 필지를 한 부지로 — 주소 칸 한 줄(「충남 OO시 OO구 가나동 12, 12-3」)과 필지 목록 사이를 오간다. [순수]
 *
 * 한백 2026-11-12 「복수의 부지에 대해서 부지검토를 같이 해야 하는 경우도 있네 … (실제 지번 둘)
 * 2개필지에 대해서 같이 제안을 해야하는 상황. 한 부지로 제안해야해」 — 건물이 옆 필지에도 서 있는 공장 · 상가가 그렇다.
 * 부지는 주소 한 줄로 오간다(검색창 · 부지 검토 → 제안서 생성의 ?q= · 상담 접수의 주소 · 제안서의 고객 주소) — 그 한 줄이 쉼표로
 * 필지를 늘어놓으면 검토가 필지마다 자료를 받아 한 부지로 합친다(lib/solar/run). 따로 칸 · 표를 두지 않는다.
 */
import { projector } from './geo';
import type { Place } from './types';

/** 한 부지로 묶는 필지 수 — 필지마다 바깥 자료(용도지역 · 대장 · 토지특성)를 따로 부른다 */
export const MAX_PARCELS = 10;
/** 묶은 필지가 걸친 거리(동서 · 남북 중 긴 쪽) — 넘으면 한 부지가 아니다(항공사진 · 건물 상자도 그만큼 커진다) */
export const MAX_SPAN_M = 1000;

/** 번지만 — 「12」 · 「12-3」 · 「산12」 · 「산 12-3」 */
const LOT = /^(?:산\s*)?\d+(?:-\d+)?$/;
/** 주소 끝의 번지(또는 도로명의 건물번호)와 그 앞 */
const TAIL = /^(.*?\S)\s+((?:산\s*)?\d+(?:-\d+)?)$/;

function headOf(address: string): string | null {
  return address.trim().match(TAIL)?.[1] ?? null;
}

/**
 * 주소 칸 한 줄 → 필지마다의 주소. 쉼표로 나눈 뒤, 번지만 적은 칸(「12-3」)은 바로 앞 주소의 동 · 리(도로명이면 길 이름)를
 * 이어받는다. 쉼표가 없으면 그대로 하나 · 숫자 없는 칸이 끼면(상호 속의 쉼표) 나누지 않는다 · 번지만으로 시작하면 이어받을
 * 앞이 없어 나누지 않는다(그대로 찾아 「못 찾음」이 그 자리에 뜬다).
 */
export function splitParcels(query: string): string[] {
  const whole = query.trim();
  const parts = whole
    .split(/[,，]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length <= 1 || parts.some((p) => !/\d/.test(p))) return [whole];
  const out: string[] = [];
  let head: string | null = null;
  for (const p of parts) {
    if (LOT.test(p)) {
      if (!head) return [whole];
      out.push(`${head} ${p}`);
    } else {
      out.push(p);
      head = headOf(p);
    }
  }
  return out;
}

/** 필지마다의 주소 → 주소 칸 한 줄. 앞 주소와 동 · 리가 같으면 번지만 적는다(splitParcels 가 되돌린다) */
export function joinParcels(addresses: string[]): string {
  let head: string | null = null;
  return addresses
    .map((a) => {
      const m = a.trim().match(TAIL);
      if (m && head !== null && m[1] === head) return m[2];
      head = m?.[1] ?? null;
      return a.trim();
    })
    .join(', ');
}

/** 필지 이름 — 동 · 리와 번지(「가나동 12-3」). 주소 끝이 번지가 아니면 주소 그대로 */
export function lotLabel(address: string | null): string {
  if (!address) return '필지';
  const m = address.trim().match(TAIL);
  return m ? `${m[1].split(/\s+/).pop()} ${m[2]}` : address.trim();
}

/**
 * 이 부지를 다시 부르는 주소 한 줄 — 다음 화면으로 들고 가고(?q= · 상담 접수) 제안서의 고객 주소가 된다.
 * 한 필지면 도로명(없으면 지번), 여럿이면 지번을 늘어놓는다(필지가 부지의 이름이다 — 도로명은 동마다 갈린다).
 */
export function siteQueryOf(place: Pick<Place, 'parcels' | 'roadAddress' | 'jibunAddress' | 'query'>): string {
  if (place.parcels.length > 1) return joinParcels(place.parcels.map((p) => p.jibunAddress ?? p.roadAddress ?? ''));
  return place.roadAddress ?? place.jibunAddress ?? place.query;
}

/** AI 지붕 따기의 열쇠 — 필지번호를 차례대로 쉼표로(같은 부지는 넣은 차례와 상관없이 같은 열쇠 · 하루 저장도 이것으로 찾는다) */
export function traceKeyOf(pnus: readonly (string | null)[]): string | null {
  const list = [...new Set(pnus.filter((p): p is string => !!p))].sort();
  return list.length ? list.join(',') : null;
}

/** 열쇠 → 필지번호들. 19자리가 아니거나 너무 많으면 null */
export function pnusOfKey(key: string): string[] | null {
  const list = key.split(',').map((s) => s.trim());
  if (!list.length || list.length > MAX_PARCELS || list.some((p) => !/^\d{19}$/.test(p))) return null;
  return traceKeyOf(list)!.split(',');
}

/** 상자([서, 남, 동, 북] 경위도)가 걸친 거리 — 동서 · 남북 중 긴 쪽, m */
export function spanOf([w, s, e, n]: [number, number, number, number]): number {
  const [x, y] = projector([w, s])([e, n]);
  return Math.max(Math.abs(x), Math.abs(y));
}

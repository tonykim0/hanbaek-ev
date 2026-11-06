/**
 * 제안서 채우기의 공통 — 생성기 셋(fill-tyrant · fill-henergy · fill-lumora)이 받는 현장 값과 작은 도구들.
 */
import type { Terms } from './products';

/** 현장 사진 한 장 — 자리 비율(가로/세로)에 맞춰 이미 자른 JPEG */
export type SiteImage = { bytes: Uint8Array; width: number; height: number };

export type ProposalInput = {
  /** 고객명 — 「(주)OO」 */
  customer: string;
  /** 고객 주소(도로명 먼저) */
  address: string;
  /** 고른 지붕에 깔린 패널 장수(부지 검토의 AI 배치) */
  panels: number;
  /** 배치 방식 — 경사고정형(각도) · 지붕면 부착형 */
  mount: { style: 'tilted' | 'flush'; tiltDeg: number };
  /** 줄 간격을 정한 해의 높이(음영각, 도) */
  shadeDeg: number;
  /** 한전 연계 여유(kW) — 모르면 null */
  gridSpareKw: number | null;
  /** 오늘(한국 날짜 'YYYY-MM-DD') — 사업 일정 · 파일 날짜 */
  today: string;
  /**
   * 현장 사진을 자리 비율로 — withPanels 면 패널을 그린 것(가배치), 아니면 항공사진 그대로(사업지 사진).
   * 사진은 한 번 받아 두고 자리마다 잘라 쓴다(components/solar/proposal-image).
   */
  image: (aspect: number, withPanels: boolean) => Promise<SiteImage>;
};

export type FillArgs = { template: ArrayBuffer; terms: Terms; input: ProposalInput };

/**
 * 주소를 두 줄로 — 시·도 · 시·군·구 · 읍·면·동까지가 앞줄, 나머지가 뒷줄(타이런트 틀의 「설치위치」가 두 줄이다).
 * 갈 자리가 없으면 앞줄이 통째다.
 */
export function splitAddress(address: string): [string, string] {
  const words = address.trim().split(/\s+/);
  let cut = -1;
  for (let i = 0; i < words.length && i < 4; i++) if (/(읍|면|동|가|리)$/.test(words[i]) && i >= 1) cut = i;
  if (cut < 0) {
    // 읍·면·동이 없는 도로명 주소(「충청북도 충주시 산척면 …」이 아닌 「세종특별자치시 한누리대로 …」) — 시·군·구까지
    for (let i = 0; i < words.length && i < 3; i++) if (/(시|군|구)$/.test(words[i])) cut = i;
  }
  if (cut < 0 || cut >= words.length - 1) return [address.trim(), ''];
  return [words.slice(0, cut + 1).join(' '), words.slice(cut + 1).join(' ')];
}

/** 설치형식 글 — 「고정경사형 12도」 · 「지붕면 부착형」 */
export const mountText = (m: ProposalInput['mount']): string => (m.style === 'flush' ? '지붕면 부착형' : `고정경사형 ${m.tiltDeg}도`);

/** 파일 이름에 못 쓰는 글자를 걷는다 */
export const fileSafe = (s: string): string => s.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();

/** 받는 파일 이름 — 「(주)OO_타이런트아이 솔라15 기본형_제안서_261106.pptx」 */
export const proposalFileName = (customer: string, product: string, today: string): string =>
  `${fileSafe(customer) || '고객'}_${fileSafe(product)}_제안서_${today.slice(2).replace(/-/g, '')}.pptx`;

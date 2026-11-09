/**
 * 제안서 채우기의 공통 — 생성기 셋(fill-tyrant · fill-henergy · fill-lumora)이 받는 현장 값과 작은 도구들.
 */
import { formatKoreanPhone } from '@/lib/contract-form';
import type { Slide } from '@/lib/pptx/deck';
import { EMU_PER_PT, type Align, type Para } from '@/lib/pptx/xml';
import type { GridView, SiteFacts } from '@/lib/solar/types';
import type { Terms } from './products';

/** 현장 사진 한 장 — 자리 비율(가로/세로)에 맞춰 이미 자른 JPEG */
export type SiteImage = { bytes: Uint8Array; width: number; height: number };
/** 자리 비율(가로/세로)의 현장 사진 — withPanels 면 패널을 그린 것(가배치), 아니면 항공사진 그대로(사업지 사진) */
export type SiteImager = (aspect: number, withPanels: boolean) => Promise<SiteImage>;

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
  /** 한전 여유용량의 단계별 기록(부지 검토 그대로) — 모햇 「부지 검토」 쪽의 한전선로 칸 · 표. 모르면 null */
  grid: GridView | null;
  /** 현장의 공적 자료(용도지역 · 지목 · 대지면적 · 건축면적 · 주용도 · 사용승인) — 모햇 「부지 검토」 표 */
  site: SiteFacts;
  /** 오늘(한국 날짜 'YYYY-MM-DD') — 사업 일정 · 파일 날짜 */
  today: string;
  /**
   * 제안하는 영업사 — 표지와 마지막 쪽에 적는다. 한백 이름은 넣지 않는다(한백 2026-11-06 「한백이름말고, 영업사 이름과 연락처를
   * 넣을거야」 · 「웹앱에서 넣게해줘」). 영업사 · 담당자명 · 연락처 세 칸이다(2026-11-08 「제안서에 영업사, 담당자명, 연락처 다
   * 들어가야해」 — 그전에는 연락처 한 칸에 이름까지 적었다).
   */
  seller: Seller;
  /**
   * 현장 사진을 자리 비율로 — withPanels 면 패널을 그린 것(가배치), 아니면 항공사진 그대로(사업지 사진).
   * 사진은 한 번 받아 두고 자리마다 잘라 쓴다(components/solar/proposal-image).
   */
  image: SiteImager;
};

export type FillArgs = { template: ArrayBuffer; terms: Terms; input: ProposalInput };

/** 제안하는 영업사 — 회사 · 담당자명 · 연락처(휴대폰 숫자 11자리를 「010-1234-5678」로) */
export type Seller = { company: string; person: string; phone: string };

/** 연락처는 숫자 11자리(한백 2026-11-08 「연락처는 자동으로 하이픈 들어가게 해줘 11자리 숫자로」) — 하이픈은 계약서 작성과 같은 formatKoreanPhone */
export const PHONE_DIGITS = 11;
export const phoneDigitsOf = (v: string): string => v.replace(/\D/g, '');

/** 제안서의 둘째 줄 — 「홍길동 010-1234-5678」 */
export const sellerContact = (s: Seller): string => [s.person, s.phone].map((x) => x.trim()).filter(Boolean).join(' ');

/**
 * 이 브라우저가 기억한 영업사 — 지금 모양 { company, person, phone } 과 2026-11-08 전의 { name, contact: '홍길동 010-…' } 를 다 읽는다
 * (옛 연락처는 첫 숫자 앞이 담당자명, 숫자 · 하이픈 덩이가 번호). 못 읽으면 빈칸이다.
 */
export function storedSeller(raw: unknown): Seller {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === 'string' ? x : '');
  if ('company' in v || 'person' in v || 'phone' in v) return { company: str(v.company), person: str(v.person), phone: formatKoreanPhone(str(v.phone)) };
  const contact = str(v.contact);
  const at = contact.search(/\d/);
  const number = at < 0 ? '' : (contact.slice(at).match(/^[\d\s-]+/)?.[0] ?? '');
  return { company: str(v.name), person: (at < 0 ? contact : contact.slice(0, at)).trim(), phone: formatKoreanPhone(number) };
}

type SellerStyle = { font: string; size: number; label: string; name: string; contact: string };

/**
 * 글 너비 어림(pt) — 짓는 브라우저에 글꼴이 없어도 칸에 드는지 가늠한다. 계수는 실제 글꼴(Pretendard · Noto Sans KR 보통 · 굵게)을 재어
 * 그보다 조금 넉넉하게 잡았다(2026-11-07 — 한글 0.86~0.92 · 숫자 0.56~0.62 · 영문 소문자 평균 0.51~0.57 · 대문자 0.64~0.67 · @ 1.01 em).
 * 어림이 실제보다 작으면 칸을 넘으니 늘 크게 어림한다.
 */
export function estWidthPt(text: string, sizePt: number): number {
  let em = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if ((c >= 0xac00 && c <= 0xd7a3) || (c >= 0x3130 && c <= 0x318f) || (c >= 0x3200 && c <= 0x32ff) || (c >= 0x4e00 && c <= 0x9fff)) em += 0.95;
    else if (ch === ' ') em += 0.3;
    else if (ch >= '0' && ch <= '9') em += 0.66;
    else if ('mwMW@'.includes(ch)) em += 1.05;
    else if (ch >= 'a' && ch <= 'z') em += 0.6;
    else if (ch >= 'A' && ch <= 'Z') em += 0.75;
    else if ('()-.,/:·_'.includes(ch)) em += 0.5;
    else em += 1.0;
  }
  return em * sizePt;
}

/** 칸 너비(pt)에 드는 가장 큰 글자 크기 — size 에서 0.5pt 씩 줄여 min 까지(그래도 넘치면 min) */
export function fitSizePt(widthAt: (size: number) => number, size: number, maxWidthPt: number, min = 8): number {
  let s = size;
  while (s > min && widthAt(s) > maxWidthPt) s -= 0.5;
  return s;
}

/**
 * 채워 넣는 글이 칸의 90% 안에 들게 — 받는 컴퓨터에 틀의 글꼴(Pretendard · Noto Sans KR)이 없으면 더 넓은 글꼴로 바뀌어 접혔다
 * (2026-11-07 검수 — 맥 미리보기에서 긴 고객명이 타이런트 2장 제목에서 「…제2공 / 장」, 루모라 8쪽 머리 문장이 「확 / 정」으로 접혀 밑의 칸을 덮었다).
 */
export const FIT_SAFE = 0.9;

/** 그 칸(widthPt)의 90% 에 드는 글자 크기 — 원래 크기(size)를 넘지 않고, min 까지만 줄인다 */
export function fitText(text: string, size: number, widthPt: number, min = 8): number {
  return fitSizePt((z) => estWidthPt(text, z), size, widthPt * FIT_SAFE, min);
}

/** 글상자의 좌우 기본 여백(pt) — 틀이 여백을 따로 적지 않은 칸(파워포인트 기본 0.1인치) */
const INSET_PT = 7.2;

/**
 * 틀의 칸(name)에 글을 넣되 칸에 들게 — 길면 틀의 글자 크기에서 줄인다(칸 너비 = 모양 폭 − 좌우 기본 여백).
 * 틀에 크기가 안 적힌 칸(물려받는 크기)은 그대로 넣는다.
 */
export function setFittedText(slide: Slide, name: string, text: string): void {
  const size = slide.fontSizeOf(name);
  const z = size ? fitText(text, size, slide.boxOf(name).w / EMU_PER_PT - INSET_PT * 2) : null;
  slide.setText(name, text, z && size && z < size ? { size: z } : {});
}

/**
 * 표지의 영업사 — 한 줄 「제안  (주)OO에너지   홍길동 010-…」(「제안」만 그 틀의 강조색). 칸 너비(widthPt)에 들게 글자를 줄이고, 원래 크기의
 * 85% 아래로 줄여야 들면 두 줄(「제안  영업사」 / 「연락처」)로 나눈다 — 긴 영업사 이름 · 연락처(직함 · 메일까지)가 칸을 넘어 옆 글을 덮었다
 * (2026-11-07 검수: 루모라 541.8/424pt · 에이치에너지 500.2/390pt). 몇 줄인지에 따라 칸 높이는 각 틀이 정한다.
 */
export function sellerCover(seller: Seller, s: SellerStyle, widthPt: number, align?: Align): Para[] {
  const label = '제안';
  const contactText = sellerContact(seller);
  const name = `  ${seller.company}`;
  const contact = `   ${contactText}`;
  const one = fitText(label + name + contact, s.size, widthPt);
  const run = (text: string, size: number, bold: boolean, color: string) => ({ text, size, bold, color, font: s.font });
  if (one >= s.size * 0.85) return [{ runs: [run(label, one, true, s.label), run(name, one, true, s.name), run(contact, one, false, s.contact)], align }];
  const two = Math.min(fitText(label + name, s.size, widthPt), fitText(contactText, s.size, widthPt));
  return [
    { runs: [run(label, two, true, s.label), run(name, two, true, s.name)], align },
    { runs: [run(contactText, two, false, s.contact)], align },
  ];
}

/** 마지막 쪽의 두 줄 — 영업사(굵게) · 담당자명 연락처. 줄마다 칸 너비(widthPt)에 들게 글자를 줄인다 */
export function sellerBlock(seller: Seller, s: Omit<SellerStyle, 'label'> & { contactSize: number }, widthPt: number, align?: Align): Para[] {
  const contactText = sellerContact(seller);
  const nameSize = fitText(seller.company, s.size, widthPt);
  const contactSize = fitText(contactText, s.contactSize, widthPt);
  return [
    { runs: [{ text: seller.company, size: nameSize, bold: true, color: s.name, font: s.font }], align },
    { runs: [{ text: contactText, size: contactSize, color: s.contact, font: s.font }], align, spaceBeforePt: 4 },
  ];
}

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

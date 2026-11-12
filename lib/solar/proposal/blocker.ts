/**
 * 제안서를 못 짓는 까닭 — 화면 위에서부터(2 상품 → 3 패널 배치 → 4 고객 · 영업사) 처음 걸리는 것 하나. 만들기 단추에 「… — 제안서 불가」로
 * 적는다(화면 규칙 3). 없으면 null. [순수]
 */
import { kwText } from './calc';
import { PHONE_DIGITS, phoneDigitsOf, type Seller } from './fill-common';
import type { Party } from './party';

export type ProposalReadiness = {
  /** 템플릿 목록을 받았는가 */
  templatesLoaded: boolean;
  productChosen: boolean;
  /** 고른 상품의 템플릿이 못 짓는 까닭(「템플릿 없음」 · 「조건 미지정」) — 지을 수 있으면 null */
  templateState: string | null;
  pnu: string | null;
  /** 지붕 배치 자료(지도)가 있는가 */
  hasPlan: boolean;
  aiBusy: boolean;
  /** AI 가 딴 지붕 수 · 그중 고른 수 */
  roofs: number;
  selected: number;
  /** 고른 상품의 사업자 기준으로 깐 배치의 용량(kW) — 아직 모르면 null */
  kw: number | null;
  /** 그 상품의 참여 최소 용량(kW · 「템플릿 · 조건」) — 0 이면 막지 않는다 */
  minKw: number;
  /** 그 상품의 셈이 맞는 최대 용량(kW · products 의 maxKw — 지붕 REC 가중치 1.5 의 3MW) — 0 이면 막지 않는다 */
  maxKw: number;
  customer: string;
  address: string;
  /** 계약자 구분을 받는 상품인가(products 의 party — 모햇) · 고른 구분 */
  partyNeeded: boolean;
  party: Party | null;
  seller: Seller;
};

export function proposalBlocker(s: ProposalReadiness): string | null {
  const steps: [boolean, string | null][] = [
    [!s.templatesLoaded, '템플릿 읽는 중'],
    [!s.productChosen, '상품 미선택'],
    [s.templateState !== null, s.templateState],
    [!s.pnu, '필지 없음'],
    [!s.hasPlan, '지도 자료 없음'],
    [s.aiBusy, 'AI 패널 배치 중'],
    [!s.roofs, '패널 배치 전'],
    [!s.selected, '고른 지붕 없음'],
    // 사업자의 참여 자격(최소 용량) — 그 상품의 기준으로 깐 용량으로 본다
    [s.minKw > 0 && s.kw !== null && s.kw < s.minKw, `${kwText(s.minKw)}kW 미만(참여 최소 용량)`],
    // 셈의 전제가 맞는 용량까지만 — 지붕 REC 가중치 1.5 는 3MW 이하(products ROOF_REC_CAP_KW). 지도에서 지붕을 빼면 지을 수 있다
    [s.maxKw > 0 && s.kw !== null && s.kw > s.maxKw, `${kwText(s.maxKw)}kW 초과(REC 가중치 1.5 범위 밖)`],
    [!s.customer.trim(), '고객명 없음'],
    [!s.address.trim(), '주소 없음'],
    [s.partyNeeded && !s.party, '계약자 구분 미지정'],
    [!s.seller.company.trim(), '영업사 없음'],
    [!s.seller.person.trim(), '담당자명 없음'],
    [!s.seller.phone, '연락처 없음'],
    [phoneDigitsOf(s.seller.phone).length !== PHONE_DIGITS, `연락처 ${PHONE_DIGITS}자리 아님`],
  ];
  return steps.find(([hit]) => hit)?.[1] ?? null;
}

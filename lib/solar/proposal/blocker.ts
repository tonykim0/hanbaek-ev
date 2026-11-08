/**
 * 제안서를 못 짓는 까닭 — 화면 위에서부터(2 상품 → 3 패널 배치 → 4 고객 · 영업사) 처음 걸리는 것 하나. 만들기 단추에 「… — 제안서 불가」로
 * 적는다(화면 규칙 3). 없으면 null. [순수]
 */
import { PHONE_DIGITS, phoneDigitsOf, type Seller } from './fill-common';

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
  customer: string;
  address: string;
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
    [!s.customer.trim(), '고객명 없음'],
    [!s.address.trim(), '주소 없음'],
    [!s.seller.company.trim(), '영업사 없음'],
    [!s.seller.person.trim(), '담당자명 없음'],
    [!s.seller.phone, '연락처 없음'],
    [phoneDigitsOf(s.seller.phone).length !== PHONE_DIGITS, `연락처 ${PHONE_DIGITS}자리 아님`],
  ];
  return steps.find(([hit]) => hit)?.[1] ?? null;
}

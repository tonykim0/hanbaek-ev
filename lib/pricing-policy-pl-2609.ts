/**
 * 플러그링크 2026년 9월 1일 정책 — 케이스 정의 한 벌. [한백 전용]
 *
 * 원문: 한백 지시 2026-09-06.
 *   · 보조금 사업 받는 단가 ★+50만★ — 공동주택(플러그링크는 이 칸이 「공동주택 · 주거용
 *     오피스텔」이다, components/pricing/shared.tsx)의 모자분리·한전불입만 해당.
 *     ★한백 마진 20 → 30만★ 이고 올라간 나머지는 전부 영업비다. 시공비 95만은 그대로.
 *   · 기설치 연동 받는 금액 7년 120 · 10년 140만 (55/75 에서 인상). 한백 마진 20만 그대로,
 *     시공비 0 — 연동은 설치 공사가 없다(lib/pricing-policy-link-h2 와 같은 판단).
 *
 * ★이 벌은 여섯 개뿐이다★ — 「보조금 4 + 연동 2 만 변경하고 나머지는 그대로」(한백).
 * 자체투자(공동 7·10년)와 상업시설 보조금은 금액이 안 바뀌어 새로 세우지 않았다.
 * 그래서 9월 이후 자투·상업 계약은 「2026년 7월 1일 ~ 8월 31일」이라 적힌 케이스를 붙인다 —
 * 금액은 맞지만 화면의 기간과 어긋난다. 그 벌을 열어야 하면 그때 새 번호로 세운다.
 *
 * ★설치 수량 상한이 내려갔다 (한백 2026-09-06)★ — 1개 단지 최대 130 → ★100대(7년)★ ·
 * 120 → ★90대(10년)★. 그래서 설치조건은 7/1 벌을 못 잇고 이 벌의 것을 따로 적는다.
 * 연수마다 다른 값이라 케이스마다 제 것만 적는다(plhec-h2 의 「축마다 자기 조건만 갖는다」).
 *
 * ★나머지 조건 칸은 7/1 벌을 그대로 잇는다★ (「나머지는 그대로」) — 프로모션·연장 차감·
 * 충전요금·지급자재·기타가 260629 의 값이다. 새 문서가 그것들도 바꿨으면 여기와
 * 마이그레이션을 같이 고친다.
 *
 * ★기성도 7/1 벌과 같은 꼴이다★ — 보조금은 3단계(환경부 승인 20만 → 착공 (턴키−20만)÷2 →
 * 준공마감 잔액), 연동은 2단계(착공 20만 → 준공마감 잔액). 금액이 올랐으므로 2차 고정액은
 * 새 턴키로 다시 계산된다(135·145·115·125만). 비율 50% 는 문서가 확정한 값이 아니라
 * 우리가 담은 값이라는 것도 그대로다 — 정해지면 새 마이그레이션으로 고친다.
 *
 * ★id 는 손으로 적는다★ — pricingRuleId 가 축에서 만드는 값이 이 벌에서는 옛 케이스와
 * 부딪친다(연동은 pl-y7-mother-link-apt-2026 그 자체이고, 보조 한전은 v1.1 때 쓰다 0007 이
 * 걷어낸 id 를 되쓴다). 끝에 -2 를 붙이거나 남의 id 를 되쓰는 대신 시기를 접두로 박는다.
 */
import { PL_INV_STEPS, plPolicy, plSubSteps } from '@/lib/pricing-policy-plhec-h2';
import type { NewPricingRule, PowerType } from '@/types/project';

/**
 * 적용 기간 — ★계약일자 9월 1일 ~ 12월 31일 접수분★ (한백 2026-09-06).
 * 끝까지 적는다(0057 이 7/1 벌을 그렇게 닫았다) — 시작일만 적으면 열려 있는 것처럼 읽힌다.
 * 정렬·시기 축은 앞 날짜를 읽으므로(lib/pricing-match startKey → 2026-09-01) 7/1 벌 뒤에 선다.
 */
export const PL_2609_START = '2026년 9월 1일 ~ 12월 31일';

const CONS = 950_000; //     하도급 기본공사비 — 7/1 벌 그대로 (한백 2026-08-29)
const MARGIN_SUB = 300_000; // 보조금 사업 — 20 → 30만 (한백 2026-09-06)
const MARGIN_LINK = 200_000; // 연동 — 그대로

/**
 * 설치조건 — 7/1 벌에서 수량 상한만 내려왔다 (한백 2026-09-06). 나머지 두 줄은 같은 값이다.
 * 상한이 연수로 갈리므로 케이스마다 제 값만 적는다 — 두 줄을 한 칸에 같이 적으면 7년 케이스를
 * 열었을 때 10년 상한이 먼저 보인다(260629 때 상업시설 조건이 그렇게 묻혔다).
 */
const installApt = (term: number): string => [
  '· 총 주차면의 5%까지 지원',
  '· 충전기 최소 2% 전용 구역 도색 필수',
  `· 1개 단지 최대 ${term === 7 ? 100 : 90}대`,
].join('\n');

/** 보조금 신규 넷 — 공동주택(=공동주택 · 주거용 오피스텔) × 모자분리·한전불입 × 7·10년 */
const SUB: { id: string; power: PowerType & ('모자분리' | '한전불입'); term: number; total: number }[] = [
  { id: 'pl-2609-y7-mother-new-apt', power: '모자분리', term: 7, total: 2_900_000 },
  { id: 'pl-2609-y10-mother-new-apt', power: '모자분리', term: 10, total: 3_100_000 },
  { id: 'pl-2609-y7-kepco-new-apt', power: '한전불입', term: 7, total: 2_500_000 },
  { id: 'pl-2609-y10-kepco-new-apt', power: '한전불입', term: 10, total: 2_700_000 },
];

/** 기설치 연동 둘 — 시공비 0 · 마진 20만 */
const LINK: { id: string; term: number; total: number }[] = [
  { id: 'pl-2609-y7-link-apt', term: 7, total: 1_200_000 },
  { id: 'pl-2609-y10-link-apt', term: 10, total: 1_400_000 },
];

export function pl2609Rules(): (NewPricingRule & { id: string })[] {
  const sub = SUB.map((r): NewPricingRule & { id: string } => ({
    id: r.id,
    caseName: `플러그링크 (${PL_2609_START}) | 공동주택 | ${r.term}년 환경부 신규 | ${r.power}`,
    cpo: '플러그링크',
    bizType: '환경부',
    powerType: r.power,
    termYears: [r.term],
    bldgTypes: ['공동주택'],
    replType: '환경부 신규',
    channel: '턴키',
    bizYear: 2026,
    startDate: PL_2609_START,
    salesUnit: r.total - CONS - MARGIN_SUB,
    consUnit: CONS,
    margin: MARGIN_SUB,
    supervisionBearer: '영업비 차감',
    safetyFeeBearer: '한백 부담',
    note: null,
    ...plPolicy(true, r.term, ['공동주택']),
    // ★설치조건만 덮는다★ — plPolicy 가 주는 것은 7/1 벌의 130/120대다
    installTerms: installApt(r.term),
    settlementSteps: plSubSteps(r.total),
  }));

  /* 연동의 조건 칸은 link-h2 와 같다 — 설치조건은 문서에 없고(null), 대상 기기만 기타에 남는다 */
  const link = LINK.map((r): NewPricingRule & { id: string } => ({
    id: r.id,
    caseName: `플러그링크 (${PL_2609_START}) | 공동주택 | ${r.term}년 연동 | 모자분리`,
    cpo: '플러그링크',
    bizType: '연동',
    powerType: '모자분리',
    termYears: [r.term],
    bldgTypes: ['공동주택'],
    replType: '연동',
    channel: '턴키',
    bizYear: 2026,
    startDate: PL_2609_START,
    salesUnit: r.total - MARGIN_LINK,
    consUnit: 0,
    margin: MARGIN_LINK,
    supervisionBearer: null,
    safetyFeeBearer: null,
    /*
     * ★「없음」이지 「미지정」이 아니다★ — 프로덕션의 7/1 연동 둘도 '없음' 이다(0037 이
     * 맞췄다). 같은 사업의 같은 칸이 시기마다 「없음」과 「미지정」으로 갈리면 화면 규칙 10
     * (빈 값 넷은 서로 다른 말)을 어긴다 — 다음 사람이 「아직 안 정했구나」로 읽는다.
     */
    supplyItems: '없음',
    promo: null,
    promoExtend: null,
    // 충전요금은 운영사의 것이라 연동에도 같다 (한백 확정 2026-08-23)
    chargeRate: 292,
    installTerms: null,
    otherSupport: null,
    coexistTerms: null,
    miscTerms: '· 연동 대상 기기·세부 조건은 운영사 확인 필요(코스텔·PNE 한정으로 안내된 바 있음)',
    note: null,
    settlementSteps: PL_INV_STEPS,
  }));

  return [...sub, ...link];
}

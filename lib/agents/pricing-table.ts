/**
 * 운영사 담당이 읽는 단가표 — 그 운영사의 지금 단가 케이스를 글로 (순수).
 *
 * 한백 지시 2026-11-04 「각 운영사별 담당자 업무 정의에 기본적인 업무로는 영업정책 업데이트 되면 키단가표 업데이트 필요
 * (원자료는 내가 제공할 예정)」 — 새 영업정책과 견주려면 담당이 지금 단가표를 알아야 한다. 에이전트의 pricing_table 도구가
 * 부를 때만 읽는다(평소 대화에 싣지 않는다 — 운영사 하나에 케이스가 스물 남짓이라 매번 실으면 대화마다 값이 든다).
 *
 * ★콘솔의 단가표(/pricing)와 같은 값이다★ — 저장하지 않고 부를 때 읽는다. 화면에 없는 부담 주체 둘(supervisionBearer ·
 * safetyFeeBearer)은 싣지 않는다. 중지한 케이스는 빼고 개수만 적는다. 적용 시작이 늦은 것부터 — 새 영업정책은 보통 가장 늦은
 * 시기를 잇는다. 케이스 이름이 이미 시기 · 건물 · 연수 · 신설/교체 · 수전을 말한다(「나이스인프라 (2026년 1월 27일) | 공동주택 |
 * 10년 환경부 신규 | 모자분리」).
 * ★영업비 · 시공비 · 마진은 한백 안의 값이다★ — 운영사에게서 받는 것은 턴키뿐이라, 운영사에 보내는 메일에 쓰지 말라고 머리에 적는다.
 */
import type { PricingRule } from '@/types/project';
import { won } from '@/lib/format';
import { startKey } from '@/lib/pricing-match';
import { turnkeyUnit } from '@/lib/settlement';

/** 여러 줄 칸(기타 조건의 「· 」 목록)을 한 줄로 */
const oneLine = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean).join(' / ');

function moneyOf(r: PricingRule): string {
  const tk = turnkeyUnit(r);
  if (tk === null) return '금액 미지정';
  return `턴키 ${won(tk)}원 = 영업 ${won(r.salesUnit)} + 시공 ${won(r.consUnit)} + 마진 ${won(r.margin)}`;
}

/** 프로모션 — null 은 미지정, 빈 배열은 없음(화면 규칙 10 — 둘은 다른 말이다) */
function promoOf(r: PricingRule): string {
  if (r.promo === null) return '프로모션 미지정';
  if (r.promo.length === 0) return '프로모션 없음';
  return `프로모션 ${r.promo.map((p) => `${p.months}개월 ${won(p.rate)}원`).join(' → ')}`;
}

export function caseLineOf(r: PricingRule): string {
  const parts = [
    r.caseName,
    `채널 ${r.channel}`,
    moneyOf(r),
    promoOf(r),
    r.promoExtend?.length
      ? `연장 ${r.promoExtend.map((o) => `${o.months}개월 ${won(o.rate)}원(영업비 −${won(o.deduct)})`).join(' / ')}`
      : null,
    r.chargeRate === null ? null : `충전요금 ${won(r.chargeRate)}원`,
    r.supplyItems ? `지급자재 ${oneLine(r.supplyItems)}` : null,
    r.installTerms ? `설치조건 ${oneLine(r.installTerms)}` : null,
    r.coexistTerms ? `병행주차 ${oneLine(r.coexistTerms)}` : null,
    r.otherSupport ? `기타지원 ${oneLine(r.otherSupport)}` : null,
    r.miscTerms ? `기타 ${oneLine(r.miscTerms)}` : null,
    r.note ? `비고 ${oneLine(r.note)}` : null,
  ];
  return parts.filter(Boolean).join(' | ');
}

export function pricingTableText(rules: PricingRule[], cpo: string): string {
  const mine = rules.filter((r) => r.cpo === cpo);
  const live = mine
    .filter((r) => r.active)
    .sort((a, b) => startKey(b).localeCompare(startKey(a)) || a.caseName.localeCompare(b.caseName, 'ko'));
  const stopped = mine.length - live.length;
  const tail = stopped ? ` · 중지 ${stopped}개는 뺐다` : '';
  if (live.length === 0) return `[${cpo} 단가표] 쓰는 케이스가 없다${tail}.`;
  return [
    `[${cpo} 단가표 — 콘솔 단가 케이스 ${live.length}개${tail} · 금액은 1기당 · 적용 시작이 늦은 것부터]`,
    '턴키 = 영업비 + 시공비 + 마진. 운영사에게서 받는 것은 턴키이고, 영업비 · 시공비 · 마진은 한백 안의 값이다 — 운영사에 보내는 메일에 쓰지 않는다.',
    ...live.map((r) => `- ${caseLineOf(r)}`),
  ].join('\n');
}

/**
 * 태양광 제안서의 상품 — 사업자(타이런트아이 · 에이치에너지 · 루모라)가 준 틀에 현장 칸만 채운다(한백 2026-11-06 「필요에 따라
 * 타이런트아이, 에이치에너지, 루모라로 사업유형별 제안서를 만들고 싶어. 에너닷 예시 처럼」 · 「고객 주소랑 고객명 넣고, 사업자
 * 선택하면 제안서가 자동생성되게」 · 「수정가능하게」 → PPTX). [순수]
 *
 * ★사업자의 조건 숫자(단가 · 이벤트 · 가정)는 여기 없다★ — 저장소가 공개라서다. 틀 파일도 저장소에 넣지 않는다: 사업자 자료는
 * 「Confidential」이고 타이런트 업무협약서 3조가 받은 자료를 남에게 내지 못하게 한다. 둘 다 DB(solar_proposal_templates — 틀은
 * Blob 주소)에 있고 한백 관리자가 화면에서 올리고 고친다. 여기는 칸의 이름과 모양(무엇을 받는가)만 적는다.
 * 숫자의 구조(몇 년 · 몇 안)는 상품의 이름이나 틀 쪽 차례에 박힌 것이라 여기 둔다.
 *
 * 자가소비형(루모라 구독형 리스)은 고객의 한전 파워플래너 15분 사용량 파일을 올렸을 때만 짓는다(한백 2026-11-07 「파일 올렸을 때만」).
 * 그 파일의 견본이 아직 없어 고르는 자리에는 못 고르는 칩으로 서고(UPCOMING), 템플릿 · 조건은 지금 넣을 수 있다(「자가소비형도
 * 추가해줘. 입력해야할 조건들이랑」). 고객의 한전 단가 · 요금제 이름은 영업사가 넣는다(같은 날 「단가·요금제 직접 입력」) — 셈은
 * calc.ts 의 lumoraLease.
 *
 * ★에이치에너지는 모햇 하나다★(한백 2026-11-09 「에이치에너지에서 솔라쉐어는 우리가 안할거고 모햇만 할 예정」) — 솔라쉐어 2.0 ·
 * 솔라쉐어바로는 걷었다(그 둘의 DB 줄은 남아 있어도 아무도 안 읽는다 — lib/data/solar-proposals 가 여기 있는 틀만 돌려준다).
 */

/** 틀 하나 — 사업자가 준 파일 한 벌. 상품 여럿이 같은 틀을 쓸 수 있다(솔라15 기본형 · 5년 선납형) */
export type TemplateKey = 'tyrant-solar15' | 'henergy-mohaet' | 'lumora-rent' | 'lumora-lease';
export type ProductKey = 'tyrant-solar15-basic' | 'tyrant-solar15-prepay' | 'henergy-mohaet' | 'lumora-rent';

/** 조건 칸 하나 — 값은 DB(한백이 넣는다). min · max 는 잘못 친 값을 막는 넓은 울타리다 */
export type TermField = {
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  /** 0 이 「콘솔 기본을 쓴다」인 칸 — 그때 화면에 보일 말 */
  zeroText?: string;
  /** 비워 둬도 되는 칸 — 비면 0(zeroText)과 같다. 사업자 자료에 있을 때만 넣는 조건(참여 최소 용량 등) */
  optional?: true;
};

export type TemplateDef = {
  key: TemplateKey;
  company: string;
  /** 화면의 틀 이름 */
  title: string;
  /** 올리는 파일 — 사업자가 준 원본 그대로(루모라는 PDF 만 받았다) */
  file: 'pptx' | 'pdf';
  /** 올린 파일이 그 틀인지 보는 표 — 원본 파일 이름의 실마리(화면 안내) */
  hint: string;
  terms: TermField[];
  /** 이 용량(kW)을 넘는 배치면 만들기를 막는다 — 셈이 그 용량까지만 맞다(ROOF_REC_CAP_KW) */
  maxKw?: number;
};

/**
 * 지붕 태양광의 REC 가중치 1.5 는 3MW 이하 설비의 것이다(신 · 재생에너지 공급인증서 가중치 — 건축물 등 기존 시설물 이용). 3MW 를 넘는 부분은
 * 가중치가 낮다. 타이런트 솔라15(16~35년 발전수익 = REC × 1.5)와 모햇(계약서상 가중치가 1.5 보다 낮으면 임대료가 그만큼 준다)의 셈은 1.5 를
 * 전제로 하므로, 3MW 를 넘는 지붕은 제안서 숫자가 실제보다 크게 나간다. 넘는 부분을 낮은 가중치로 섞어 셀 수도 있지만 사업자 견본에 그런 예가
 * 없어 맞게 셌는지 대조할 길이 없다 — 막는다(한백 2026-11-12 「이건 막아주고」). 그 규모는 사업자와 따로 협의한다 · 지도에서 지붕을 빼 3MW
 * 안으로 줄이면 지을 수 있다. 3MW 는 발전사업허가가 시 · 도지사에서 산업부로 넘어가는 경계이기도 하다(capacity-checks permitCheckOf).
 */
export const ROOF_REC_CAP_KW = 3_000;

const W: TermField = { key: 'moduleWatt', label: '모듈 출력', unit: 'W', min: 300, max: 900 };
/**
 * 배치 기준 — 패널을 까는 설계 기준이 사업자마다 다르다(한백 2026-11-06 「각 사업자 기준맞춰서 AI지붕깔기 해줘」 — lib/solar/proposal/layout-rule).
 * 경사각과 줄 간격을 정하는 태양 고도. 고도가 0 이면 콘솔 기본(동지 10~14시 그림자 — 위도마다 약 25~30°)이다.
 */
const TILT: TermField = { key: 'tiltDeg', label: '모듈 경사각', unit: '°', min: 0, max: 45 };
const SHADE: TermField = { key: 'shadeAngleDeg', label: '줄 간격 기준 태양 고도', unit: '°', min: 0, max: 60, zeroText: '동지 10~14시 그림자' };
/** 모듈 방위각 한도 — 정남에서 동 · 서로 몇 도까지(0 이면 건물 변을 따라 45° 까지) */
const AZIMUTH: TermField = { key: 'azimuthLimitDeg', label: '모듈 방위각 한도(정남 ±)', unit: '°', min: 0, max: 45, zeroText: '제한 없음' };
/**
 * 참여 최소 용량 — 사업자 자료가 「최소 몇 kW 이상」을 정한 상품(2026-11-10 조건 대조 — 타이런트 템플릿의 참여 자격 · 루모라 투자가이드의
 * 최소용량). 이 용량에 못 미치는 배치면 만들기 단추가 「…kW 미만(참여 최소 용량)」으로 막힌다(blocker). 비우면 막지 않는다.
 */
const MIN_KW: TermField = { key: 'minKw', label: '참여 최소 용량', unit: 'kW', min: 0, max: 100_000, zeroText: '제한 없음', optional: true };

export const TEMPLATES: Record<TemplateKey, TemplateDef> = {
  'tyrant-solar15': {
    key: 'tyrant-solar15',
    company: '타이런트아이',
    title: '솔라15',
    file: 'pptx',
    hint: '「[타이런트] 솔라15(Solar15)_템플릿.pptx」',
    terms: [
      W,
      TILT,
      SHADE,
      AZIMUTH,
      { key: 'rentPerKw', label: '기본형 임대료(1~15년)', unit: '원/kW·년', min: 1_000, max: 1_000_000 },
      { key: 'prepayPerKw', label: '5년 선납형 선지급(1년차 일시)', unit: '원/kW', min: 1_000, max: 5_000_000 },
      { key: 'prepayRentPerKw', label: '5년 선납형 임대료(6~15년)', unit: '원/kW·년', min: 1_000, max: 1_000_000 },
      { key: 'hoursPerDay', label: '발전시간', unit: '시간/일', min: 1, max: 6 },
      { key: 'smp', label: 'SMP', unit: '원/kWh', min: 1, max: 1_000 },
      { key: 'rec', label: 'REC', unit: '원/kWh', min: 0, max: 1_000 },
      { key: 'recWeight', label: 'REC 가중치', unit: '배', min: 0, max: 5 },
      { key: 'degradationPct', label: '모듈 열화율', unit: '%/년', min: 0, max: 5 },
      MIN_KW,
      /**
       * 작은 발전소는 한전 계통연계비용을 건물주의 미래 임대수익에서 뺀다(템플릿의 고정 장에 적힌 조건 — 2026-11-10 조건 대조). 얼마인지는
       * 한전 비용이라 미리 모른다 — 이 용량 미만이면 Cash Flow 표 밑에 「표는 차감 전 금액」 각주를 단다(fill-tyrant). 비우면 달지 않는다.
       */
      { key: 'gridCostBelowKw', label: '계통연계비 차감(이 용량 미만)', unit: 'kW', min: 0, max: 100_000, zeroText: '없음', optional: true },
    ],
    maxKw: ROOF_REC_CAP_KW,
  },
  /**
   * 모햇 공유옥상 임대 — 지붕을 모햇 협동조합에 20년 빌려주고 임대료를 받는다. 1년 선납(해마다 1년치) · 5년 선납(상업운전 때 5년치를
   * 낮은 단가로 한 번에, 6년차부터 해마다 1년치) 둘을 나란히 보이고, 5년 선납을 고른 법인 임대인에게는 참여지원금이 한 번 더 간다.
   * 참여지원금이 0 인 조건은 받지 않는다 — 틀의 각주 · 비교표가 지원금을 전제로 쓰였다(지원금이 없어지면 에이치에너지가 틀을 바꾼다).
   * 개인사업자는 참여지원금을 받지 않는다 — 계약자 구분을 받아 견본의 그 계약자 글만 남긴다(PRODUCTS 의 party · lib/solar/proposal/party).
   */
  'henergy-mohaet': {
    key: 'henergy-mohaet',
    company: '에이치에너지',
    title: '모햇',
    file: 'pptx',
    hint: '「03. 모햇 제안서_SAMPLE….pptx」',
    terms: [
      W,
      TILT,
      SHADE,
      AZIMUTH,
      { key: 'rentPerKw', label: '임대료(1년 선납 · 5년 선납 6~20년차)', unit: '원/kW·년', min: 1_000, max: 1_000_000 },
      { key: 'prepay5PerKw', label: '5년 선납 임대료(1~5년차)', unit: '원/kW·년', min: 1_000, max: 1_000_000 },
      { key: 'subsidyPerKw', label: '참여지원금(5년 선납 법인, 1회)', unit: '원/kW', min: 1, max: 5_000_000 },
    ],
    maxKw: ROOF_REC_CAP_KW,
  },
  'lumora-rent': {
    key: 'lumora-rent',
    company: '루모라',
    title: '지붕임대',
    file: 'pdf',
    hint: '「[루모라] 임대형 태양광 사업 제안서.pdf」',
    terms: [
      W,
      TILT,
      SHADE,
      AZIMUTH,
      { key: 'price1', label: '1년 선납 임대료', unit: '원/kW·년', min: 1_000, max: 1_000_000 },
      { key: 'price5', label: '5년 선납 임대료', unit: '원/kW·년', min: 1_000, max: 1_000_000 },
      { key: 'price10', label: '10년 선납 임대료', unit: '원/kW·년', min: 1_000, max: 1_000_000 },
      MIN_KW,
    ],
  },
  /** 자가소비형 — 구독료(원/kWh)로 발전량을 사고 한전 요금을 대체한다. 요금 시나리오 셋(동결 · 기본 · 인상 확대)과 RE100(REC 구매 대비) */
  'lumora-lease': {
    key: 'lumora-lease',
    company: '루모라',
    title: '구독형 리스',
    file: 'pdf',
    hint: '「[루모라]구독형 리스 사업 제안서.pdf」',
    terms: [
      W,
      TILT,
      SHADE,
      AZIMUTH,
      { key: 'subscriptionPrice', label: '구독료', unit: '원/kWh', min: 1, max: 1_000 },
      { key: 'hoursPerDay', label: '발전시간', unit: '시간/일', min: 1, max: 6 },
      { key: 'degradationPct', label: '발전효율 감소율', unit: '%/년', min: 0, max: 5 },
      { key: 'tariffIncreasePct', label: '전기요금 인상률 — 기본', unit: '%/년', min: 0, max: 20 },
      { key: 'tariffIncreaseHighPct', label: '전기요금 인상률 — 인상 확대', unit: '%/년', min: 0, max: 20 },
      { key: 'excessPrice', label: '초과발전 판매 단가(SMP+REC)', unit: '원/kWh', min: 0, max: 1_000 },
      { key: 'recPrice', label: 'REC 구매 단가', unit: '원/kWh', min: 0, max: 1_000 },
      { key: 'regoPrice', label: 'REGO 판매 단가', unit: '원/kWh', min: 0, max: 1_000 },
      { key: 'emissionFactor', label: '배출계수', unit: 'tCO₂/MWh', min: 0, max: 2 },
    ],
  },
};

export type ProductDef = {
  key: ProductKey;
  template: TemplateKey;
  company: string;
  label: string;
  /**
   * 계약자 구분(개인사업자 · 법인)을 받는 상품 — 견본이 두 계약자를 한 판에 함께 써서, 그 계약자의 글만 남긴다(한백 2026-11-10
   * 「에이치에너지는 개인은 참여지원금을 안줘서 … 미리 필터링이 필요해」). 고르기 전에는 만들기가 막힌다(blocker)
   */
  party?: true;
};

/** 화면의 차례 — 사업자마다 묶인다 */
export const PRODUCTS: ProductDef[] = [
  { key: 'tyrant-solar15-basic', template: 'tyrant-solar15', company: '타이런트아이', label: '솔라15 기본형' },
  { key: 'tyrant-solar15-prepay', template: 'tyrant-solar15', company: '타이런트아이', label: '솔라15 5년 선납형' },
  { key: 'henergy-mohaet', template: 'henergy-mohaet', company: '에이치에너지', label: '모햇', party: true },
  { key: 'lumora-rent', template: 'lumora-rent', company: '루모라', label: '지붕임대' },
];

/**
 * 받을 것이 와야 짓는 상품 — 고르는 자리에 못 고르는 칩으로 세운다(한백 2026-11-07 「… 선택지로 해놓고 비활성화」).
 * 자가소비형은 템플릿 · 조건은 있고(TEMPLATES) 고객의 파워플래너 파일을 읽는 자리가 없다 — 그 파일의 견본이 오면 PRODUCTS 로 옮긴다.
 * ★올 것이 없는 상품은 세우지 않는다★ — 모햇이 「템플릿 받기 전」으로 섰다가 걷혔고(11-09 오전 「모햇은 템플릿이 없대」), 같은 날
 * 오후 견본(「03. 모햇 제안서_SAMPLE」)이 와 고르는 상품이 됐다.
 */
export const UPCOMING: { company: string; label: string; why: string }[] = [{ company: '루모라', label: '구독형 리스', why: '파워플래너 견본 받기 전' }];

export const TEMPLATE_KEYS = Object.keys(TEMPLATES) as TemplateKey[];
export const isTemplateKey = (v: unknown): v is TemplateKey => typeof v === 'string' && (TEMPLATE_KEYS as string[]).includes(v);
export const productOf = (key: ProductKey): ProductDef => PRODUCTS.find((p) => p.key === key)!;

export type Terms = Record<string, number>;

/**
 * 받은 조건을 다듬는다 — 그 틀의 칸만, 숫자만, 울타리 안만. 틀리면 그 칸의 말로 던진다(라우트에서 400).
 * 빈 칸은 두지 않는다 — 다 있어야 제안서를 짓는다(빠진 칸은 missingTerms 가 짚는다). 비워 둬도 되는 칸(optional)만 비면 뺀다.
 */
export function cleanTerms(template: TemplateKey, raw: unknown): Terms {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: Terms = {};
  for (const f of TEMPLATES[template].terms) {
    const given = r[f.key];
    if (f.optional && (given === undefined || given === null || (typeof given === 'string' && !given.trim()))) continue;
    const v = typeof given === 'string' ? Number(given.replace(/,/g, '')) : given;
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${f.label}을(를) 숫자로 넣어 주세요.`);
    if (v < f.min || v > f.max) throw new Error(`${f.label}은(는) ${f.min.toLocaleString()}~${f.max.toLocaleString()} ${f.unit} 사이여야 합니다.`);
    out[f.key] = v;
  }
  return out;
}

/** 아직 안 넣은 조건 칸의 이름 — 하나라도 있으면 그 틀의 제안서를 짓지 않는다(비워 둬도 되는 칸은 빼고) */
export function missingTerms(template: TemplateKey, terms: Partial<Terms> | null | undefined): string[] {
  return TEMPLATES[template].terms.filter((f) => !f.optional && typeof terms?.[f.key] !== 'number').map((f) => f.label);
}

/** 조건 칸의 값 — 비워 둔 칸(optional)은 0 */
export const termOf = (terms: Partial<Terms> | null | undefined, key: string): number => (typeof terms?.[key] === 'number' ? terms[key]! : 0);

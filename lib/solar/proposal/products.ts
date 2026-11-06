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
 * 자가소비형 둘(에이치에너지 솔라쉐어바로 · 루모라 구독형 리스)은 고객의 한전 파워플래너 사용량이 있어야 숫자가 나와 아직 없다.
 */

/** 틀 하나 — 사업자가 준 파일 한 벌. 상품 여럿이 같은 틀을 쓸 수 있다(솔라15 기본형 · 5년 선납형) */
export type TemplateKey = 'tyrant-solar15' | 'henergy-solarshare2' | 'lumora-rent';
export type ProductKey = 'tyrant-solar15-basic' | 'tyrant-solar15-prepay' | 'henergy-solarshare2' | 'lumora-rent';

/** 조건 칸 하나 — 값은 DB(한백이 넣는다). min · max 는 잘못 친 값을 막는 넓은 울타리다 */
export type TermField = { key: string; label: string; unit: string; min: number; max: number };

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
};

const W: TermField = { key: 'moduleWatt', label: '모듈 출력', unit: 'W', min: 300, max: 900 };

export const TEMPLATES: Record<TemplateKey, TemplateDef> = {
  'tyrant-solar15': {
    key: 'tyrant-solar15',
    company: '타이런트아이',
    title: '솔라15',
    file: 'pptx',
    hint: '「[타이런트] 솔라15(Solar15)_템플릿.pptx」',
    terms: [
      W,
      { key: 'rentPerKw', label: '기본형 임대료(1~15년)', unit: '원/kW·년', min: 1_000, max: 1_000_000 },
      { key: 'prepayPerKw', label: '5년 선납형 선지급(1년차 일시)', unit: '원/kW', min: 1_000, max: 5_000_000 },
      { key: 'prepayRentPerKw', label: '5년 선납형 임대료(6~15년)', unit: '원/kW·년', min: 1_000, max: 1_000_000 },
      { key: 'hoursPerDay', label: '발전시간', unit: '시간/일', min: 1, max: 6 },
      { key: 'smp', label: 'SMP', unit: '원/kWh', min: 1, max: 1_000 },
      { key: 'rec', label: 'REC', unit: '원/kWh', min: 0, max: 1_000 },
      { key: 'recWeight', label: 'REC 가중치', unit: '배', min: 0, max: 5 },
      { key: 'degradationPct', label: '모듈 열화율', unit: '%/년', min: 0, max: 5 },
    ],
  },
  'henergy-solarshare2': {
    key: 'henergy-solarshare2',
    company: '에이치에너지',
    title: '솔라쉐어 2.0',
    file: 'pptx',
    hint: '「01. 솔라쉐어 제안서_SAMPLE_….pptx」',
    terms: [
      W,
      { key: 'rentPerKw', label: '기본 임대료', unit: '원/kW·년', min: 1_000, max: 1_000_000 },
      { key: 'prepayBasePerKw', label: '5년치 선지급 — 기본', unit: '원/kW·년', min: 0, max: 1_000_000 },
      { key: 'prepayEventPerKw', label: '5년치 선지급 — 이벤트', unit: '원/kW·년', min: 0, max: 1_000_000 },
      { key: 'annualEventPerKw', label: '매년 지급 — 1년차 이벤트', unit: '원/kW', min: 0, max: 5_000_000 },
    ],
  },
  'lumora-rent': {
    key: 'lumora-rent',
    company: '루모라',
    title: '지붕임대',
    file: 'pdf',
    hint: '「[루모라] 임대형 태양광 사업 제안서.pdf」',
    terms: [
      W,
      { key: 'price1', label: '1년 선납 임대료', unit: '원/kW·년', min: 1_000, max: 1_000_000 },
      { key: 'price5', label: '5년 선납 임대료', unit: '원/kW·년', min: 1_000, max: 1_000_000 },
      { key: 'price10', label: '10년 선납 임대료', unit: '원/kW·년', min: 1_000, max: 1_000_000 },
    ],
  },
};

export type ProductDef = { key: ProductKey; template: TemplateKey; company: string; label: string };

/** 화면의 차례 — 사업자마다 묶인다 */
export const PRODUCTS: ProductDef[] = [
  { key: 'tyrant-solar15-basic', template: 'tyrant-solar15', company: '타이런트아이', label: '솔라15 기본형' },
  { key: 'tyrant-solar15-prepay', template: 'tyrant-solar15', company: '타이런트아이', label: '솔라15 5년 선납형' },
  { key: 'henergy-solarshare2', template: 'henergy-solarshare2', company: '에이치에너지', label: '솔라쉐어 2.0' },
  { key: 'lumora-rent', template: 'lumora-rent', company: '루모라', label: '지붕임대' },
];

export const TEMPLATE_KEYS = Object.keys(TEMPLATES) as TemplateKey[];
export const isTemplateKey = (v: unknown): v is TemplateKey => typeof v === 'string' && (TEMPLATE_KEYS as string[]).includes(v);
export const productOf = (key: ProductKey): ProductDef => PRODUCTS.find((p) => p.key === key)!;

export type Terms = Record<string, number>;

/**
 * 받은 조건을 다듬는다 — 그 틀의 칸만, 숫자만, 울타리 안만. 틀리면 그 칸의 말로 던진다(라우트에서 400).
 * 빈 칸은 두지 않는다 — 다 있어야 제안서를 짓는다(빠진 칸은 missingTerms 가 짚는다).
 */
export function cleanTerms(template: TemplateKey, raw: unknown): Terms {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: Terms = {};
  for (const f of TEMPLATES[template].terms) {
    const v = typeof r[f.key] === 'string' ? Number(String(r[f.key]).replace(/,/g, '')) : r[f.key];
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${f.label}을(를) 숫자로 넣어 주세요.`);
    if (v < f.min || v > f.max) throw new Error(`${f.label}은(는) ${f.min.toLocaleString()}~${f.max.toLocaleString()} ${f.unit} 사이여야 합니다.`);
    out[f.key] = v;
  }
  return out;
}

/** 아직 안 넣은 조건 칸의 이름 — 하나라도 있으면 그 틀의 제안서를 짓지 않는다 */
export function missingTerms(template: TemplateKey, terms: Partial<Terms> | null | undefined): string[] {
  return TEMPLATES[template].terms.filter((f) => typeof terms?.[f.key] !== 'number').map((f) => f.label);
}

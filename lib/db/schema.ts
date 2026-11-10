/**
 * Postgres 스키마 — SYSTEM_ARCHITECTURE §6 논리 스키마의 물리 구현.
 *
 * 원칙 셋:
 *  1. 단가·정산 규칙은 ★불변★ — 추가와 비활성만. 한 번 지정되면 수정하지 않는다.
 *     그래서 계약 라인은 값을 복사(스냅샷)하지 않고 규칙을 참조만 한다.
 *  2. 금액은 전부 정수(원). KRW 는 소수점이 없어 numeric 이 필요 없고,
 *     integer 면 부동소수 오차가 원천적으로 안 생긴다.
 *  3. 협력사 직접입력이라 audit_log 를 남긴다. 노션엔 없던 것.
 */
import {
  bigint, boolean, index, integer, jsonb, pgTable, primaryKey,
  smallint, text, timestamp, uniqueIndex,
} from 'drizzle-orm/pg-core';
import type { NoticeFile } from '@/types/project';
import type { SiteFile } from '@/lib/solar/sites';
import type { AgentMessageMeta } from '@/types/agents';
import type { ConsultDup } from '@/lib/consult-dup';

// ── 계정 ────────────────────────────────────────────────────────
export const users = pgTable('users', {
  id: text('id').primaryKey(),               // 로그인 ID
  name: text('name').notNull(),
  role: text('role').notNull(),              // admin | viewer | salesCons | cons | sales
  org: text('org'),                          // 협력사 소속. 관리자는 null
  passwordHash: text('password_hash').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  /** 전기차 공지 화면(/notices)을 마지막으로 연 시각 — 그보다 뒤의 전기차 공지가 「안 읽은 것」(상단바 배지) */
  noticesReadAt: timestamp('notices_read_at', { withTimezone: true }),
  /** 태양광 공지 화면(/solar/notices)을 마지막으로 연 시각 — 읽음도 사업마다 따로다(migrations/0116) */
  solarNoticesReadAt: timestamp('solar_notices_read_at', { withTimezone: true }),
  /** 태양광 사업 참여 — 켜면 사업 전환이 보이고 제 소속의 태양광 현장을 본다(migrations/0105). 한백은 안 봐도 늘 본다 */
  solar: boolean('solar').notNull().default(false),
});

/**
 * 태양광 현장 — 상담 접수로 들어온다 (migrations/0105, 한백 지시 2026-11-03 「현장관리에서 상담 개소 접수」).
 * 전기차 현장(projects)과 섞지 않는다 — 운영사 · 단가 케이스 · 기성의 모델이 없다(CLAUDE.md 「사업이 둘이다」).
 * id 는 SL-연도-순번(시퀀스 solar_sites_seq — 지운 번호를 다시 쓰지 않는다). org 는 담당 협력사, 한백이 직접 받으면 null.
 */
export const solarSites = pgTable('solar_sites', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  address: text('address').notNull(),
  kind: text('kind').notNull(),              // roof | ground
  customer: text('customer'),
  phone: text('phone'),
  memo: text('memo'),
  org: text('org'),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
  /** 붙은 파일 — SiteFile[] (migrations/0106). Blob 의 solar-sites/{현장}/ 아래. 붙이기 · 빼기는 한 줄 update(경합 없음) */
  files: jsonb('files').$type<SiteFile[]>().notNull().default([]),
}, (t) => ({
  byOrg: index('solar_sites_org_idx').on(t.org, t.createdAt),
}));

/**
 * 태양광 제안서의 틀과 조건 (migrations/0124, 2026-11-06) — 틀(lib/solar/proposal/products TemplateKey)마다 한 줄.
 * 파일은 Blob 의 solar-proposals/<틀>/ 아래(사업자가 준 원본 그대로), 조건은 숫자들(terms). 둘 다 한백 관리자가 화면에서 넣는다 —
 * 저장소가 공개라 값을 코드 · 마이그레이션에 두지 않는다.
 */
/**
 * AI 지붕 따기의 결과 · 부른 기록 (migrations/0127, 2026-11-08) — 같은 필지는 하루 안의 마지막 결과를 돌려주고, 계정마다 오늘 줄 수가
 * 하루 한도다. 부르기 전에 줄을 세우고(trace 없음) 끝나면 적는다 — 실패한 것도 한 번으로 센다(lib/data/solar-roof-traces).
 */
export const solarRoofTraces = pgTable('solar_roof_traces', {
  id: text('id').primaryKey(),
  pnu: text('pnu').notNull(),
  userId: text('user_id').notNull(),
  trace: jsonb('trace').$type<unknown>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byPnu: index('solar_roof_traces_pnu_idx').on(t.pnu, t.createdAt),
  byUser: index('solar_roof_traces_user_idx').on(t.userId, t.createdAt),
}));

export const solarProposalTemplates = pgTable('solar_proposal_templates', {
  key: text('key').primaryKey(),
  fileUrl: text('file_url'),
  fileName: text('file_name'),
  fileSize: integer('file_size'),
  fileAt: timestamp('file_at', { withTimezone: true }),
  fileBy: text('file_by'),
  terms: jsonb('terms').$type<Record<string, number>>().notNull().default({}),
  termsAt: timestamp('terms_at', { withTimezone: true }),
  termsBy: text('terms_by'),
});

/**
 * 공지 — 한백이 협력사 전체에 알리는 글 (migrations/0051).
 *
 * 정적 HTML(public/notices/)로 한 장씩 만들던 것을 표로 받는다 — 파일은 쓸 때마다
 * 배포가 필요하고 「읽었는가」를 셀 수 없다. 읽음은 users.notices_read_at 가 안다.
 */
export const notices = pgTable('notices', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  /** 고친 시각 — 배지는 보지 않는다(오타 수정이 전원을 다시 부르면 안 된다) */
  updatedAt: timestamp('updated_at', { withTimezone: true }),
  /** 붙은 파일 — NoticeFile[] (양식·서식처럼 협력사가 받아 가는 것) */
  files: jsonb('files').$type<NoticeFile[]>().notNull().default([]),
  /** 사업 — 'ev' 전기차 · 'solar' 태양광(migrations/0116). 그전 공지는 전부 전기차다. 쓴 뒤에는 안 바뀐다 */
  biz: text('biz').notNull().default('ev'),
});

/**
 * 공지의 메모 — 한백과 협력사 모두가 보는 한 줄기 (migrations/0094 · 0095). org 는 쓴 쪽의 소속이다(한백은 없음) —
 * 0094 에서는 업체마다 줄기를 가르는 열쇠였다. author 는 「한백」 또는 협력사 이름, author_id 는 지우기 권한에만 쓴다.
 */
export const noticeMessages = pgTable('notice_messages', {
  id: text('id').primaryKey(),
  noticeId: text('notice_id').notNull().references(() => notices.id, { onDelete: 'cascade' }),
  org: text('org'),
  author: text('author').notNull(),
  authorId: text('author_id'),
  body: text('body').notNull(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byThread: index('notice_messages_thread_idx').on(t.noticeId, t.org, t.at),
}));

/**
 * 협력사 정보 — 계정마다 사업자등록증·정산 계좌를 둔다.
 *
 * 지급(하도급 정산)에 쓰는 값이라 계정이 아니라 회사의 것에 가깝지만, 지금 계정은
 * 회사당 하나라 계정에 붙인다. 파일(사업자등록증·통장사본)은 Vercel Blob 에 두고
 * 여기는 URL 만 둔다.
 *
 * users 를 참조하지 않는다 — 계정은 DB 와 배포 설정(AUTH_USERS)·개발 시드 두 곳에
 * 살아서(lib/auth/users.ts), FK 를 걸면 배포 설정 계정은 자기 계좌를 못 적는다.
 * 계정 검증은 저장소(requirePartnerAccount)가 userStore 로 한다.
 */
export const partnerDetails = pgTable('partner_details', {
  userId: text('user_id').primaryKey(),
  bizRegNo: text('biz_reg_no'),                 // 사업자등록번호 — 숫자 10자리
  /** 대표자·사업장 주소 — 거래명세서의 공급자 칸에 들어간다(0015). 업태·종목은 안 적는다 */
  ceo: text('ceo'),
  addr: text('addr'),
  bizCertUrl: text('biz_cert_url'),             // 사업자등록증 파일
  bankName: text('bank_name'),
  bankAccountNo: text('bank_account_no'),
  bankHolder: text('bank_holder'),              // 예금주
  bankbookUrl: text('bankbook_url'),            // 통장사본 파일
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * 로그인 실패 기록 — 전수 대입을 막는다.
 *
 * ★왜 표가 필요한가★
 * 비밀번호 최소 길이를 4자로 내렸다(PASSWORD_MIN_LEN). 숫자 4자리면 조합이 만 가지뿐이라
 * 해시를 아무리 세게 걸어도(pbkdf2 12만 회) 로그인 화면을 두드리는 것만으로 뚫린다 —
 * 해싱은 DB 가 새어나갔을 때를 막는 장치고, 이 표는 화면을 두드리는 쪽을 막는다.
 *
 * 메모리에 세지 않는다 — 서버리스는 인스턴스가 여러 개라 각자 따로 세면 인스턴스 수만큼
 * 시도할 수 있다. 세는 자리는 모두가 같이 보는 한 곳이어야 한다.
 *
 * key 는 두 종류다. `id:<로그인ID>` 는 그 계정을 지키고, `ip:<주소>` 는 한 주소에서 여러
 * 계정을 훑는 것을 막는다.
 */
export const loginAttempts = pgTable('login_attempts', {
  key: text('key').primaryKey(),
  fails: integer('fails').notNull().default(0),
  /** 이 창의 첫 실패. 창은 마지막 실패(≈ 잠금 끝)에서 잰다 — lib/auth/throttle failsInWindow */
  firstFailAt: timestamp('first_fail_at', { withTimezone: true }).notNull().defaultNow(),
  /** 이 시각까지 막는다. null 이면 아직 안 막힌 것 */
  lockedUntil: timestamp('locked_until', { withTimezone: true }),
});

// ── 규칙 (불변) ─────────────────────────────────────────────────
export const settlementRules = pgTable('settlement_rules', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** [{ trigger, basis }] — basis 는 고정/비율/잔액 */
  steps: jsonb('steps').notNull(),
  note: text('note'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const pricingRules = pgTable('pricing_rules', {
  id: text('id').primaryKey(),
  caseName: text('case_name').notNull(),
  cpo: text('cpo').notNull(),
  bizType: text('biz_type').notNull(),
  powerType: text('power_type').notNull(),          // 모자분리 | 한전불입 (겸용은 행을 쪼갬)
  termYears: jsonb('term_years').notNull(),         // [7] 또는 [7,10]
  bldgTypes: jsonb('bldg_types').notNull(),
  replType: text('repl_type').notNull(),
  /** 턴키 | 영업 | 시공 — 한쪽만 맡는 현장의 단가는 구성이 다르다 (옛 값 '시공만' 은 '시공' 으로 이관) */
  channel: text('channel').notNull().default('턴키'),
  bizYear: integer('biz_year').notNull(),
  startDate: text('start_date').notNull(),
  salesUnit: integer('sales_unit').notNull(),
  consUnit: integer('cons_unit').notNull(),
  margin: integer('margin').notNull(),
  /*
   * 정책 조건 — 전부 nullable 이다. 이 칸이 생기기 전에 만든 케이스가 이미 있고(2026-08-22),
   * 그것들은 「아직 안 적음」이라 빈 값이 맞다. notNull + 기본값으로 채우면 「0원 · 없음」이
   * 되어 적은 것과 안 적은 것이 같아 보인다(화면 규칙 10번).
   */
  supplyItems: text('supply_items'),
  /** [{ months, rate }] — 구간이 이어진다. null 은 미지정, [] 은 프로모션 없음 */
  promo: jsonb('promo'),
  /**
   * [{ months, rate, deduct }] — 고를 수 있는 프로모션 연장. 협력사도 본다(연장 여부 판단).
   * null 은 미지정, [] 은 연장 없음.
   *
   * 옛 칸 promo_extend_deduct(integer, 1개월당 차감액)를 대신한다 — 늘리는 요금마다
   * 차감액이 갈리는 것을 한 숫자로 담을 수 없었다(0011). 옛 칸은 DB 에 남아 있다:
   * 마이그레이션은 배포보다 먼저 돌아서, 지우면 아직 바뀌기 전 배포가 그 칸을 찾다 터진다.
   * 값이 전부 null 이라 남겨 둬도 해가 없고, 새 코드가 다 나간 뒤 따로 지운다.
   */
  promoExtend: jsonb('promo_extend'),
  chargeRate: integer('charge_rate'),
  installTerms: text('install_terms'),
  otherSupport: text('other_support'),
  coexistTerms: text('coexist_terms'),
  miscTerms: text('misc_terms'),
  /** 이 케이스에 통상 붙는 정산 규칙 — 제안값. 실제 적용은 현장에 둔다. */
  defaultSettlementRuleId: text('default_settlement_rule_id').references(() => settlementRules.id),
  supervisionBearer: text('supervision_bearer'),
  safetyFeeBearer: text('safety_fee_bearer'),
  note: text('note'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byAxis: index('pricing_rules_axis_idx').on(t.cpo, t.bizType, t.powerType, t.replType, t.active),
}));

// ── 현장 ────────────────────────────────────────────────────────
export const projects = pgTable('projects', {
  id: text('id').primaryKey(),                      // HB-2026-041
  mgmtNo: text('mgmt_no'),
  cpo: text('cpo').notNull(),
  salesOrg: text('sales_org'),
  gcOrg: text('gc_org'),
  name: text('name').notNull(),
  addr: text('addr'),
  bldgType: text('bldg_type'),
  /** 설치위치 — 실내 · 실외 · 실내·실외. null 이면 미지정 */
  installLoc: text('install_loc'),
  contractParty: text('contract_party'),            // 노션에 없던 신규 필드
  parkTotal: integer('park_total'),
  mgr: text('mgr'),
  /** 계약주체의 대표자 — 사업자등록증·고유번호증에서 읽는다 (migrations/0096) */
  repName: text('rep_name'),
  /** 계약서상 계약일 YYYY-MM-DD — 계약서 서명란 위의 날짜. 계약서 수령일(createdAt)과 다르다 (migrations/0096) */
  contractDate: text('contract_date'),
  tel: text('tel'),
  mail: text('mail'),
  preInstall: text('pre_install').notNull().default('없음'),
  preNote: text('pre_note'),
  /** 사전현장컨설팅 결과서 「6. 중복설치」를 읽은 것 — 나이스 제출 정보 7번의 정본 (migrations/0112 · lib/consult-dup) */
  consultDup: jsonb('consult_dup').$type<ConsultDup>(),
  /**
   * 기설치 조사를 했는가.
   *
   * preInstall 의 '없음' 과 「아직 안 봤음」을 가르는 값이다 — 접수 기본값이 '없음' 이라
   * 이것 없이는 「조사해서 없음」과 「조사를 안 함」이 같은 모양으로 보인다.
   * 환경부 사업은 현장마다 이 조사를 해야 해서, 안 한 현장을 골라내는 것이 실제 업무다.
   */
  preChecked: boolean('pre_checked').notNull().default(false),
  /**
   * ★죽은 칸★ — 코드가 읽지도 쓰지도 않는다 (2026-09-03).
   *
   * 기설치 조사 반려였는데, 기설치 두 칸(설치이력·증빙)의 서류 반려와 결과가 같은
   * 세 번째 문이라 걷었다. 살아 있던 값은 그 칸의 반려로 옮겼다(migrations/0050).
   * 칸을 지우지 않는 것은 되돌릴 길을 남기려는 것이다(화면 규칙 7) — 여기에 다시
   * 값을 쓰지 않는다.
   */
  preRejectReason: text('pre_reject_reason'),
  powerType: text('power_type'),
  replType: text('repl_type'),
  bizType: text('biz_type'),
  /** 환경부 보조금 신청 대기번호 — 받은 형태 그대로 (「2026-595」 또는 「595」) */
  envQueueNo: text('env_queue_no'),
  /** 환경부 사업연도 — 단가 케이스·대기번호의 연도와 같은 축. 접수 연도가 기본값 */
  bizYear: integer('biz_year'),
  /** 접수할 때 협력사가 적은 말. 영업비 차감·프로모션 적용 같은 조건이 여기 온다. */
  note: text('note'),
  /**
   * 한백이 계약을 확인한 날 (YYYY-MM-DD). null 이면 확인 전.
   * 서류가 반려되면 지워진다 — 보완 뒤 다시 확인해야 한다.
   */
  contractConfirmedAt: text('contract_confirmed_at'),
  /** 한백이 처음 보완요청(서류 반려)을 한 날 — 지우지 않는다 (migrations/0020) */
  contractFixAskedAt: text('contract_fix_asked_at'),
  /**
   * 협력사가 「계약서 접수하기」를 누른 날 (YYYY-MM-DD). null 이면 아직 모으는 중이다.
   * 확인일과 짝이다 — 이쪽은 협력사가 「다 냈다」, 저쪽은 한백이 「봤다」.
   */
  contractSubmittedAt: text('contract_submitted_at'),
  /*
   * 지급조건(단가 케이스·정산 규칙)을 확정한 날 — 확정되면 못 바꾼다(migrations/0035).
   * 지급이 나가면 자동으로 찍힌다: 돈이 움직인 뒤에 조건을 갈아 끼우면 잔액과 기성이
   * 같이 뒤틀리기 때문이다. 고쳐야 하면 관리자가 해제하고 고친 뒤 다시 확정한다.
   */
  payoutTermsConfirmedAt: text('payout_terms_confirmed_at'),
  /*
   * 현장 대당 영업비·시공비 — ★값 그대로★(원). 비어 있으면 단가 케이스 값이다. 케이스·라인은 그대로다
   * (migrations/0102, 한백 지시 2026-10-20). 화면에 고치는 자리는 없다 — Claude Code 로 요청받아 직접 적는다.
   * (0101 의 sales_unit_adjust 등 가감 칸은 DB 에 남아 있으나 읽지 않는다 — 0102 머리말)
   */
  salesUnitOverride: integer('sales_unit_override'),
  consUnitOverride: integer('cons_unit_override'),
  /** 왜 바꿨는가 — 한백만 본다 */
  unitOverrideNote: text('unit_override_note'),
  /** 한백이 현장별로 적용하는 정산 규칙 */
  settlementRuleId: text('settlement_rule_id').references(() => settlementRules.id),
  settlementAppliedAt: text('settlement_applied_at'),
  /** 계약중단(옛 값: 보류 · DROP). null 이면 정상 진행 중 — 진행 단계와 섞지 않는다. */
  holdState: text('hold_state'),
  holdNote: text('hold_note'),
  /** 담당 — 지금 누가 움직여야 하는가 */
  court: text('court').notNull().default('한백'),
  /** 마지막 진척일. 정체일 계산의 기준 — 노션엔 없던 지표 */
  lastProgressAt: text('last_progress_at').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byOrg: index('projects_org_idx').on(t.salesOrg, t.gcOrg),
  byCourt: index('projects_court_idx').on(t.court),
}));

export const contractLines = pgTable('contract_lines', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  termYears: integer('term_years').notNull(),
  qty: integer('qty').notNull(),
  powerType: text('power_type'),                    // 혼용 현장은 라인별로 갈린다
  replType: text('repl_type'),                      // 자체투자 현장은 라인별로 갈린다
  memo: text('memo'),
  /** 참조만 한다. 케이스가 불변이라 값을 복사할 필요가 없다. */
  pricingRuleId: text('pricing_rule_id').references(() => pricingRules.id),
  pricedAt: text('priced_at'),
}, (t) => ({
  byProject: index('contract_lines_project_idx').on(t.projectId),
}));

// ── 서류 ────────────────────────────────────────────────────────
export const documents = pgTable('documents', {
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  /** contract, agreement, minutes … 번호가 아니라 종류 */
  kind: text('kind').notNull(),
  filename: text('filename'),
  /** Vercel Blob URL */
  blobUrl: text('blob_url'),
  status: text('status').notNull().default('none'), // none | uploaded | approved | rejected
  rejectReason: text('reject_reason'),
  uploadedBy: text('uploaded_by'),
  uploadedAt: text('uploaded_at'),
  /**
   * 이 칸의 파일들 — [{ name, url, uploadedBy, uploadedAt }] (migrations/0021).
   * 파일 목록의 정본이다. 위 filename·blob_url 은 첫 파일의 사본이다(옛 코드·SQL 이 본다).
   */
  files: jsonb('files').notNull().default([]),
  /** 보완요청이 세운 반려인가 — 취소는 이것만 되돌린다 (migrations/0068, 감사 M11) */
  askedAt: text('asked_at'),
}, (t) => ({
  pk: primaryKey({ columns: [t.projectId, t.kind] }),
}));

/**
 * 충전기 모델 — 등록해 두고 현장에서 고른다 (한백 지시 2026-08-26).
 *
 * 노션에서는 「모델명(충전기)」 multi_select 였다. 표로 두는 이유는 오타로 같은 모델이
 * 여러 이름을 갖는 것을 막기 위해서다. 쓰지 않게 된 모델은 지우지 않고 내린다
 * (active=false) — 옛 현장이 그 모델을 참조하고 있다.
 */
/**
 * 협력사별 자주 쓰는 충전기 수령지 (한백 지시 2026-09-30) — 현장 공정의 수령지 칸에서
 * 골라 넣는다. org 는 normalizeOrg 를 거친 시공사 이름이다.
 */
export const recvPresets = pgTable('recv_presets', {
  id: text('id').primaryKey(),
  org: text('org').notNull(),
  addr: text('addr').notNull(),
  name: text('name'),
  phone: text('phone'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * 실사보고서 임시 저장 (한백 지시 2026-10-01) — 계정마다 여럿. 사진은 Blob(survey-drafts/<계정>/<id>/),
 * 값은 data. 남의 계정 것은 저장소가 내주지 않는다(store/survey-drafts).
 */
export const surveyDrafts = pgTable('survey_drafts', {
  id: text('id').primaryKey(),
  ownerId: text('owner_id').notNull(),
  ownerOrg: text('owner_org'),
  cpo: text('cpo').notNull(),
  title: text('title').notNull().default(''),
  photoCount: integer('photo_count').notNull().default(0),
  data: jsonb('data').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  ownerIdx: index('survey_drafts_owner_idx').on(t.ownerId, t.cpo, t.updatedAt),
}));

/** 기설치 이력 엑셀 ↔ 증빙 대조 — 현장마다 마지막 하나 (migrations/0093, lib/preinstall-check) */
export const preinstallChecks = pgTable('preinstall_checks', {
  projectId: text('project_id').primaryKey().references(() => projects.id, { onDelete: 'cascade' }),
  result: jsonb('result').notNull(),
  checkedBy: text('checked_by'),
  checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
});

/** 건축물대장 대조 결과 — 현장마다 마지막 하나 (migrations/0100, lib/parking-check) */
export const parkingChecks = pgTable('parking_checks', {
  projectId: text('project_id').primaryKey().references(() => projects.id, { onDelete: 'cascade' }),
  result: jsonb('result').notNull(),
  checkedBy: text('checked_by'),
  checkedAt: timestamp('checked_at', { withTimezone: true }).notNull().defaultNow(),
});

export const chargerModels = pgTable('charger_models', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** 제조사 — 모델명만으로 어느 회사 것인지 모를 때가 있다 */
  maker: text('maker'),
  note: text('note'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ── 공정 ────────────────────────────────────────────────────────
export const processes = pgTable('processes', {
  projectId: text('project_id').primaryKey().references(() => projects.id, { onDelete: 'cascade' }),
  envApprovalDate: text('env_approval_date'),        // 환경부 승인 트리거
  /** 운영사에 계약서를 낸 날 — 「운영사 계약서 제출」의 근거. 우리가 하는 일이다. */
  cpoSubmitDate: text('cpo_submit_date'),
  /** 운영사 시공승인일 — 따로 통보받는다. 「충전기 발주」의 근거 */
  cpoApprovalDate: text('cpo_approval_date'),
  chargerOrderDate: text('charger_order_date'),
  chargerShipDate: text('charger_ship_date'),
  chargerRecvDate: text('charger_recv_date'),
  startPlanDate: text('start_plan_date'),
  startActualDate: text('start_actual_date'),        // 착공 트리거
  installDoneDate: text('install_done_date'),
  /** 설치 실적 — 몇 거점 · 몇 기. 시공사가 설치완료 때 적는다 */
  installedSpots: integer('installed_spots'),
  installedUnits: integer('installed_units'),
  commDoneDate: text('comm_done_date'),
  /** 개통완료일 — 통신까지 끝나고 실제 개통된 날. 시공사가 적는다 */
  openDate: text('open_date'),
  /** 행위신고 신청일 — 파일을 올리면 그 날이 기본으로 들어간다(비어 있을 때만) */
  notifyDate: text('notify_date'),
  /*
   * 시공 기록 날짜 (migrations/0121, 한백 지시 2026-11-05) — 기록만이다. 단계를 넘기는 조건이 아니다.
   * 적는 사람은 한백과 그 현장의 시공사다.
   */
  /** 행위신고 완료일 — 신고증명서를 받은 날(notifyDoneAt 은 「완료했다」는 선언이라 다른 칸이다) */
  notifyCertDate: text('notify_cert_date'),
  /** 착공서류(안전계획서 · 위험성평가) 제출일 */
  preStartSubmitDate: text('prestart_submit_date'),
  /** 기초 및 배관/배선일 */
  foundationDate: text('foundation_date'),
  /** 충전기 및 캐노피 설치일 — 설치를 다 마친 날(installDoneDate)과 다르다 */
  chargerInstallDate: text('charger_install_date'),
  /** 전기사용신청일 — 시공완료 뒤 첫 걸음(한백 공정 설명) */
  elecApplyDate: text('elec_apply_date'),
  /** 사용전점검/검사일 — 모자분리에서는 「전기안전점검」이라 부른다. 같은 점검이다 */
  safetyCheckDate: text('safety_check_date'),
  /** 한전 외선공사일 — 한전불입만(모자분리는 한전 외선공사가 없다) */
  kepcoLineDate: text('kepco_line_date'),
  /** 계량기 부설일 — 한전불입만 */
  meterDate: text('meter_date'),
  /** 지자체 사용검사 신청일 */
  useInspectApplyDate: text('use_inspect_apply_date'),
  /** 발주한 수량 — 한백이 적는다. 수령 수량과 가른다(부분 입고·오배송을 알아야 한다) */
  chargerOrderQty: integer('charger_order_qty'),
  modemOrderQty: integer('modem_order_qty'),
  /** 수령한 수량 — 충전기 몇 대, 모뎀 몇 개. 시공사가 수령 때 센다 */
  chargerQty: integer('charger_qty'),
  modemQty: integer('modem_qty'),
  /**
   * 이 현장에 들어가는 충전기 모델 — 목록(charger_models)에서 고른다.
   * 이름을 적지 않고 참조하는 이유: 오타로 같은 모델이 여러 이름을 갖는 것을 막는다.
   */
  chargerModelId: text('charger_model_id').references(() => chargerModels.id),
  /** 충전기 수령지 — 발주 때 어디로 보낼지. 협력사가 행위신고 칸에서 적는다 */
  recvAddr: text('recv_addr'),
  recvName: text('recv_name'),
  recvPhone: text('recv_phone'),
  /** 묶음별 완료 체크(체크한 날) — 단계 이동을 잠근다. types/project.ts ProcessInfo 주석 참조 */
  notifyDoneAt: text('notify_done_at'),
  /** 행위신고 불필요로 판정한 날 — 완료와 다른 칸이다 (migrations/0024) */
  notifySkippedAt: text('notify_skipped_at'),
  /** 행위신고가 필요하다고 판정한 날 — 미정과 가른다 (migrations/0029) */
  notifyRequiredAt: text('notify_required_at'),
  chargerDoneAt: text('charger_done_at'),
  installConfirmedAt: text('install_confirmed_at'),
  openDoneAt: text('open_done_at'),
  completionSubmitAt: text('completion_submit_at'),
  /** 준공완료로 넘어간 날 — 영업비·시공비 2차 지급의 조건이다(2026-08-31) */
  completeDoneAt: text('complete_done_at'),
  /** 진행현황 6단계 (types/project.ts PROCESS_STATUSES) */
  status: text('status').notNull().default('계약완료'),
  memo: text('memo'),
});

export const processDocuments = pgTable('process_documents', {
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),                      // notify, elecapply, completion …
  filename: text('filename'),
  blobUrl: text('blob_url'),
  status: text('status').notNull().default('none'),
  /** 반려 사유 — 계약 서류와 같은 자리다 (migrations/0049, 2026-08-31) */
  rejectReason: text('reject_reason'),
  uploadedBy: text('uploaded_by'),
  uploadedAt: text('uploaded_at'),
  /** 이 칸의 파일들 — 계약 서류와 같은 모양이다 (migrations/0021) */
  files: jsonb('files').notNull().default([]),
}, (t) => ({
  pk: primaryKey({ columns: [t.projectId, t.kind] }),
}));

/**
 * 진행현황 — 한백과 협력사가 이 현장에 대해 남기는 말.
 *
 * 감사로그(audit_log)와 다른 것이다. 감사로그는 「무슨 값이 무엇으로 바뀌었나」를 기계가
 * 남기고, 이것은 「무슨 일이 있었나」를 사람이 남긴다 — 관리사무소가 공사를 미뤘다,
 * 한전 불입이 지연됐다 같은, 어느 칸에도 안 들어가는 사정이 여기 온다.
 *
 * 자기가 쓴 것은 고칠 수 있다 — 오타나 잘못 적은 날짜를 그냥 두면 다음 사람이 그것을 믿는다.
 * 다만 고친 흔적(editedAt)은 남긴다. 남의 글은 못 고치고, 지우는 길은 두지 않는다.
 */
export const projectNotes = pgTable('project_notes', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  /** 어느 쪽이 썼나 — 「한백」 또는 협력사 이름. 사람 이름은 남기지 않는다(계정이 회사당 하나다) */
  author: text('author').notNull(),
  body: text('body').notNull(),
  /**
   * 어느 탭의 이야기인가 — 「계약」 또는 「시공」 (한백 지시 2026-09-17, migrations/0080).
   * 화면이 갈래마다 따로 그린다. 옛 글은 남긴 시각이 계약 확정 전인가로 갈랐다.
   */
  scope: text('scope').notNull().default('시공'),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  /** 고친 시각. null 이면 처음 쓴 그대로다. */
  editedAt: timestamp('edited_at', { withTimezone: true }),
}, (t) => ({
  byProject: index('project_notes_project_idx').on(t.projectId, t.at),
}));

/**
 * 알림 — 진행현황 글·서류 반려·누락 서류 보완요청이 그 현장의 사람들에게 간다 (migrations/0090·0092 · lib/notify.ts).
 * 받는 사람마다 한 줄이다. 읽음은 read_at. 글을 지우면 같이 지워진다(note_id cascade).
 */
export const notifications = pgTable('notifications', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  /** 현장 알림이면 그 현장 — 공지 메시지 알림은 비어 있다(migrations/0094) */
  projectId: text('project_id').references(() => projects.id, { onDelete: 'cascade' }),
  /** 공지 메시지 알림이면 그 공지와 그 메시지 (migrations/0094) */
  noticeId: text('notice_id').references(() => notices.id, { onDelete: 'cascade' }),
  noticeMsgId: text('notice_msg_id').references(() => noticeMessages.id, { onDelete: 'cascade' }),
  /** 진행현황 글 알림이면 그 글 — 반려·보완요청 알림은 비어 있다(migrations/0092) */
  noteId: text('note_id').references(() => projectNotes.id, { onDelete: 'cascade' }),
  /**
   * note(진행현황 글) · reject(서류 반려) · ask(누락 서류 보완요청) · notice(공지 메모) · approval · queue(환경부 승인 · 대기번호) ·
   * agent(담당이 못 한 일 — 현장) · remind(담당의 정기 알림 — agent_id) — types/project NotificationKind
   */
  kind: text('kind').notNull().default('note'),
  /** 그 알림이 서는 탭의 갈래 — 계약·시공·기성. 그 탭을 열면 읽힌다 */
  scope: text('scope'),
  /** 반려한 서류 종류 — 반려를 풀면 이 서류의 안 읽은 알림을 거둔다 */
  docKind: text('doc_kind'),
  /** 반려·보완요청의 머리(「반려 — 계약서」)와 한백의 메시지(반려 사유). 글 알림은 글에서 읽는다 */
  title: text('title'),
  body: text('body'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  readAt: timestamp('read_at', { withTimezone: true }),
  /**
   * 어느 사업의 알림인가 — ev 전기차 · solar 태양광(migrations/0107). 전기차는 /notifications, 태양광은 /solar/notifications 에
   * 서고 배지도 사업마다 센다. 그전에 쌓인 것은 전부 전기차다(기본값).
   */
  biz: text('biz').notNull().default('ev'),
  /**
   * 담당의 정기 알림(kind 'remind')이면 그 담당 — 현장도 공지도 아니다. 누르면 그 담당과의 대화고, 거기를 열면 읽힌다
   * (migrations/0115 · 정산 담당의 열린구매 상신 알림, lib/agents/open-purchase)
   */
  agentId: text('agent_id').references(() => agents.id, { onDelete: 'cascade' }),
}, (t) => ({
  byUser: index('notifications_user_idx').on(t.userId, t.createdAt),
}));

// ── 정산 ────────────────────────────────────────────────────────
export const settlements = pgTable('settlements', {
  projectId: text('project_id').primaryKey().references(() => projects.id, { onDelete: 'cascade' }),
  /** 준공마감일 — 한백이 지정한다. 공정에서 유도하지 않는다. */
  closeDate: text('close_date'),
  collected1At: text('collected_1_at'),
  collected2At: text('collected_2_at'),
  collected3At: text('collected_3_at'),
  /*
   * 실수금액 — 받은 금액을 그대로 적는다(migrations/0034). null 이면 계획액대로 받은 것이다.
   * 협의로 턴키단가와 다르게 받는 현장이 있어서 둔다 — 그 한 건 때문에 협의용 단가 케이스를
   * 만들면 단가표가 정책표가 아니게 된다.
   */
  collected1Amount: integer('collected_1_amount'),
  collected2Amount: integer('collected_2_amount'),
  collected3Amount: integer('collected_3_amount'),
  /*
   * 운영사에 청구한 날 (한백 지시 2026-11-02, migrations/0104). 조건이 찬 다음 달부터 적을 수 있고,
   * 수금은 이 날이 있는 차수에만 적는다 — 그래서 「청구했는데 아직 안 들어온 돈」(미수금)이 선다.
   * 옛 수금 기록은 이 칸이 비어 있다(그때는 청구를 기록하지 않았다).
   */
  claimed1At: text('claimed_1_at'),
  claimed2At: text('claimed_2_at'),
  claimed3At: text('claimed_3_at'),
  /*
   * ★전기안전점검수수료 — 운영사에게서 따로 받는 돈★ (한백 2026-09-06, migrations/0061).
   * 대상은 SK일렉링크·나이스인프라·현대엔지니어링이고 수전방식과 무관하다(lib/settlement
   * SAFETY_FEE_CPOS 가 정본). 기성 차수에 못 얹는 돈이라 현장 단위로 받는다 — 차수 합은
   * 받는 단가와 정확히 같아야 한다(checkSettlementSteps).
   *
   * ★이 칸의 뜻이 바뀌었다.★ 골격 첫 커밋부터 있었지만 어느 화면도 읽거나 쓴 적이 없고
   * (프로덕션 31행 전부 null, 2026-09-06 확인) 타입 주석만 「안전관리비 — 원가」라고
   * 적혀 있었다 — 방향이 반대인 말이었다. 값이 없는 칸이라 뜻을 여기서 확정한다.
   */
  safetyFee: integer('safety_fee'),
  /** 그 수수료를 운영사에 청구한 날 — 트리거가 없는 돈이라 금액을 적은 뒤 언제든 (migrations/0104) */
  safetyFeeClaimedAt: text('safety_fee_claimed_at'),
  /** 그 수수료를 받은 날 */
  safetyFeeCollectedAt: text('safety_fee_collected_at'),
  /** 지급 관련 메모 — 감액·보류 사유 등 금액만으로 설명되지 않는 것 */
  payNote: text('pay_note'),
});

/**
 * 하도급사 지급 원장 — 한 행이 지급(또는 조정) 한 건이다.
 *
 * 지급일 4칸(영업 1·2차, 시공 1·2차)으로 저장하던 것을 바꿨다 — 선금·차액·회수·차감이
 * 날짜 한 칸에 들어가지 않는다. 금액은 부호 있는 원 단위 정수, 회수·차감은 음수.
 * 검사 규칙은 lib/settlement.ts checkPayoutEntry 한 곳이다.
 */
export const payoutEntries = pgTable('payout_entries', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  category: text('category').notNull(),
  amount: integer('amount').notNull(),
  /**
   * 어느 회차 몫인가 — 1·2, null 이면 회차를 안 정한 총액 조정
   * (types/project.ts PayoutEntry.step 이 뜻의 정본이다).
   *
   * ★null 을 허용해야 한다★ — 프로덕션에 이미 있는 조정 줄은 어느 차수 몫인지 사실이
   * 원장에 없다. 기본값을 박으면 없는 사실을 지어내는 것이고, 그 값으로 회차 기준액이
   * 움직인다. 값 검사는 lib/settlement.ts checkPayoutEntry 한 곳이다(저장소 관례).
   */
  step: smallint('step'),
  /** 지급일(지급) 또는 발생일(조정), YYYY-MM-DD */
  at: text('at').notNull(),
  note: text('note'),
  createdAt: text('created_at').notNull(),
}, (t) => ({
  byProject: index('payout_entries_project_idx').on(t.projectId, t.at),
}));

// ── 세금계산서 ─────────────────────────────────────────────────
/**
 * 배치(지급처 × 구분 × 지급일)마다 한 장. [한백 전용]
 * 현장이 아니라 배치에 붙는다 — 협력사는 한 지급일에 여러 현장 몫을 묶되 영업비와
 * 시공비는 따로 발행한다(한백 확인 2026-08-24). 그래서 project_id 가 없고 kind 가 있다. 배치의 지급일을 옮기면 이 행의 pay_date 도 같이
 * 옮긴다(pg-store movePayoutBatch) — 키가 갈라지면 첨부가 고아가 된다.
 */
export const taxInvoices = pgTable('tax_invoices', {
  id: text('id').primaryKey(),
  org: text('org').notNull(),
  /** 영업비 | 시공비 — 영업·시공은 계산서를 따로 끊는다(한백 확인 2026-08-24) */
  kind: text('kind').notNull(),
  payDate: text('pay_date').notNull(),
  blobUrl: text('blob_url').notNull(),
  filename: text('filename').notNull(),
  /** 금액 칸 — 대조 기능을 걷어내며 지금은 쓰지 않는다(2026-08-23). 되살리면 여기부터. */
  supplyAmount: integer('supply_amount'),
  taxAmount: integer('tax_amount'),
  totalAmount: integer('total_amount'),
  uploadedAt: text('uploaded_at').notNull(),
}, (t) => ({
  // 배치(지급처 × 구분 × 지급일) 하나에 한 장 — 다시 올리면 교체다
  byBatch: uniqueIndex('tax_invoices_batch_kind_idx').on(t.org, t.payDate, t.kind),
}));

// ── 배치 최종 확정 ─────────────────────────────────────────────
/**
 * 확정된 배치(지급처 × 구분 × 지급일) — 행이 있으면 확정, 없으면 가확정이다.
 * 세금계산서와 무관하다(한백 확인 2026-08-24 — 계산서는 검토 없는 보관용 첨부일 뿐,
 * 확정은 한백이 배치를 잠그는 행위다). 확정되면 항목 빼기·지급일 변경·취소가 막힌다.
 */
export const batchFinals = pgTable('batch_finals', {
  id: text('id').primaryKey(),
  org: text('org').notNull(),
  kind: text('kind').notNull(),
  payDate: text('pay_date').notNull(),
  finalizedAt: text('finalized_at').notNull(),
}, (t) => ({
  byBatch: uniqueIndex('batch_finals_batch_idx').on(t.org, t.kind, t.payDate),
}));

// ── 감사 로그 ───────────────────────────────────────────────────
/** 협력사가 직접 입력하므로 누가 무엇을 바꿨는지 남긴다 */
export const auditLog = pgTable('audit_log', {
  id: text('id').primaryKey(),
  projectId: text('project_id'),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  field: text('field'),
  oldValue: text('old_value'),
  newValue: text('new_value'),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byProject: index('audit_log_project_idx').on(t.projectId, t.at),
}));

// ── 에이전트 ────────────────────────────────────────────────────
/**
 * 에이전트 — 한백의 일을 나눠 맡는 AI 담당 (migrations/0109, 한백 지시 2026-11-01·02). 운영사 다섯 · 정산 · 열린구매 ·
 * 전략·기획을 심었다. 에이전트가 보는 현장·지급·기성은 여기 없다 — 부를 때마다 콘솔이 셈한 것을 읽는다(lib/agents/scope).
 * 여기 남는 것은 한백이 적는 업무 정의 · 할 일 · 오간 말뿐이다.
 */
export const agents = pgTable('agents', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  cpo: text('cpo'),
  name: text('name').notNull(),
  sort: integer('sort').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  /** 사업 — 'ev' 전기차 · 'solar' 태양광(migrations/0118). 조직도가 사업마다다(/admin/agents · /solar/agents) */
  biz: text('biz').notNull().default('ev'),
  /** 사업자 담당(kind 'owner', 태양광)이 맡은 사업자 이름 — 운영사 담당의 cpo 와 같은 몫. 나머지는 null */
  company: text('company'),
  /**
   * 지금 답하는 중이라는 표지(migrations/0125) — /reply 가 모델을 부르기 전에 잡고 끝나면 놓는다. 같은 담당에게 답이 동시에 두 번
   * 돌지 않게(store/agents claimAgentReply). 못 놓은 표지는 REPLY_CLAIM_SECONDS 가 지나면 다음 요청이 가져간다
   */
  replyingAt: timestamp('replying_at', { withTimezone: true }),
});

/** 업무 정의 — 한백이 담당마다 적는다. 에이전트는 이것을 지시로 읽는다 */
export const agentDuties = pgTable('agent_duties', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  sort: integer('sort').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
}, (t) => ({
  byAgent: index('agent_duties_agent_idx').on(t.agentId, t.sort),
}));

/**
 * 팀 목표 · 방향 — 팀장(전략·기획 담당)이 세우고 그 사업의 실무자 모두가 부를 때마다 읽는다(migrations/0120, 한백 2026-11-04
 * 「전략및기획에서 세우는 목표나 OKR 방향성 또는 다른 사업구조에 대해서도 밑에 실무자들이 알아야하는」). agent_id 는 팀장이다.
 * 한백이 화면에서 적거나 팀장이 대화 중에 올린다 — author 는 사람 이름 또는 담당 이름(store/agent-team)
 */
export const agentDirections = pgTable('agent_directions', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  sort: integer('sort').notNull().default(0),
  author: text('author').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
}, (t) => ({
  byAgent: index('agent_directions_agent_idx').on(t.agentId, t.sort),
}));

/**
 * 메모장 — 담당이 한백에게서 들은 사실 · 정한 것 · 바라는 방식을 주제마다 한 장씩(migrations/0122). agent_id 가 있으면 그 담당의
 * 메모, 없으면 그 사업(biz)의 팀 공용 메모. 담당은 제목만 늘 읽고 내용은 그때그때 꺼내 쓴다(lib/agents/memos · store/agent-memory)
 */
export const agentMemos = pgTable('agent_memos', {
  id: text('id').primaryKey(),
  biz: text('biz').notNull(),
  agentId: text('agent_id').references(() => agents.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  author: text('author').notNull(),
  byAgent: boolean('by_agent').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }),
}, (t) => ({
  byAgent: index('agent_memos_agent_idx').on(t.agentId),
}));

/** 할 일 — 한백이 적거나 대화 중에 에이전트가 적는다(author). 기한은 'YYYY-MM-DD' 글자 */
export const agentTasks = pgTable('agent_tasks', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  note: text('note'),
  projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
  /**
   * 콘솔이 저절로 적은 할 일의 종류 — 양식 메일이면 그 양식 이름(agent_mails.kind 와 같은 말 · lib/site-mail, 그 메일이 나가면 저절로
   * 끝난다), 정기 알림이면 그 알림의 열쇠(open-purchase:2026-11-10 · lib/agents/open-purchase). 사람이 적은 것은 null
   */
  kind: text('kind'),
  due: text('due'),
  doneAt: timestamp('done_at', { withTimezone: true }),
  author: text('author').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byAgent: index('agent_tasks_agent_idx').on(t.agentId, t.doneAt),
}));

/** 오간 말 — user(지시) · note(기록만) · agent(에이전트의 말). meta 는 에이전트의 말에만(AgentMessageMeta) */
export const agentMessages = pgTable('agent_messages', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  author: text('author').notNull(),
  authorId: text('author_id'),
  body: text('body').notNull(),
  meta: jsonb('meta').$type<AgentMessageMeta>(),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byThread: index('agent_messages_thread_idx').on(t.agentId, t.at),
}));

/** 담당에게 넘긴 파일 — 지시나 기록에 붙는다. 파일은 Blob 의 agent-files/<담당>/ 아래(migrations/0110) */
export const agentFiles = pgTable('agent_files', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  messageId: text('message_id').notNull().references(() => agentMessages.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  pathname: text('pathname').notNull(),
  url: text('url').notNull(),
  size: integer('size').notNull().default(0),
  contentType: text('content_type'),
  at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  byAgent: index('agent_files_agent_idx').on(t.agentId, t.at),
  byMessage: index('agent_files_message_idx').on(t.messageId),
}));

/**
 * 콘솔이 메일을 보내는 계정 — 한백의 다음(카카오) 메일 한 줄(id 'mail', migrations/0111). token 은 잠근 앱 비밀번호다
 * (lib/agents/secret-box) — 화면·응답으로 나가지 않는다(store/agent-mail).
 */
export const mailAccounts = pgTable('mail_accounts', {
  id: text('id').primaryKey(),
  email: text('email').notNull(),
  token: text('token').notNull(),
  /** 붙는 곳 — smtp.daum.net:465 */
  server: text('server').notNull(),
  connectedBy: text('connected_by').notNull(),
  connectedAt: timestamp('connected_at', { withTimezone: true }).notNull().defaultNow(),
});

/** 보낼 메일 — 에이전트가 초안을 올리고 한백이 승인하면 나간다(migrations/0111, store/agent-mail) */
export const agentMails = pgTable('agent_mails', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull().references(() => agents.id, { onDelete: 'cascade' }),
  messageId: text('message_id').references(() => agentMessages.id, { onDelete: 'set null' }),
  status: text('status').notNull().default('draft'),
  to: jsonb('to_addrs').$type<string[]>().notNull().default([]),
  cc: jsonb('cc_addrs').$type<string[]>().notNull().default([]),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  fileIds: jsonb('file_ids').$type<string[]>().notNull().default([]),
  error: text('error'),
  from: text('from_addr'),
  /** 메일 서버가 붙인 접수 표시(250 답의 글) */
  sentRef: text('sent_ref'),
  /** 현장 메일이면 그 현장 · 양식 이름(nice-contract-draft) · 붙일 현장 서류(그때의 파일) — migrations/0112 */
  projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
  kind: text('kind'),
  docFiles: jsonb('doc_files').$type<Array<{
    name: string; url: string; size: number; contentType: string | null;
    /** 붙이기 전에 본 결과(lib/hec-approval) — 현장 양식 메일만 */
    checks?: Array<{ level: 'block' | 'warn'; why: string }>;
  }>>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  sentBy: text('sent_by'),
  /** 예약 보내기 — 그날 오전 9시(한국)와 예약한 사람(migrations/0123 · lib/agents/mail-schedule). status 'scheduled' 일 때만 */
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  scheduledBy: text('scheduled_by'),
}, (t) => ({
  byAgent: index('agent_mails_agent_idx').on(t.agentId, t.createdAt),
  byMessage: index('agent_mails_message_idx').on(t.messageId),
}));

// ── 아지트 ─────────────────────────────────────────────────────
/**
 * 아지트 그룹 웹훅 — 한 줄(id 'agit', migrations/0126). 주소가 곧 열쇠라 잠가 둔다(lib/agents/secret-box) — 화면 · 응답으로 나가지
 * 않는다(store/agit). DB 마다 따로라 개발 · 프리뷰는 따로 연결하지 않는 한 운영 그룹에 글을 못 쓴다.
 * assignees 는 요청 글의 담당자(아지트 ID) — 연결과 따로다: 연결 전에 넣어 두고(token 이 빈 줄), 끊어도 남는다(token 만 비운다).
 */
export const agitHooks = pgTable('agit_hooks', {
  id: text('id').primaryKey(),
  /** 잠근 웹훅 주소 — 비었으면 연결 전(담당자만 미리 넣어 둔 줄) · 끊으면 비운다 */
  token: text('token'),
  assignees: jsonb('assignees').$type<string[]>().notNull().default([]),
  connectedBy: text('connected_by'),
  connectedAt: timestamp('connected_at', { withTimezone: true }),
  /**
   * 한백의 아지트 로그인(migrations/0130) — 잠근 쿠키 JSON(lib/agit/session · secret-box). 콘솔이 이 로그인으로 글을 올린다.
   * 비밀번호는 없다 — 연결할 때 로그인에 한 번 쓰고 버린다. session_until 은 로그인 쿠키가 끝나는 때, session_error 는 올리다가 로그인이
   * 풀린 것을 알았을 때의 까닭(다시 연결하면 지운다)
   */
  session: text('session'),
  sessionLogin: text('session_login'),
  sessionBy: text('session_by'),
  sessionAt: timestamp('session_at', { withTimezone: true }),
  sessionUntil: timestamp('session_until', { withTimezone: true }),
  sessionError: text('session_error'),
});

/**
 * 아지트 열린구매 글 — 결제일 하나에 한 글(lib/agit/post). status: draft(정산 담당이 올린 초안 — 한백의 승인을 기다린다) ·
 * sending(올리는 중 — 두 번 누름을 막는다) · posted · failed. 한 결제일에 열린 초안은 하나다(store/agit draftAgitPost) — 여러 줄은
 * 다시 올린 것이다. body 는 초안이면 지금 글, 올렸으면 실제로 보낸 글 그대로다.
 */
export const agitPosts = pgTable('agit_posts', {
  id: text('id').primaryKey(),
  payDate: text('pay_date').notNull(),
  /** 구분 — 영업비 · 시공비. 글은 결제일 × 구분마다 하나다(migrations/0129) */
  kind: text('kind').notNull().default('영업비'),
  status: text('status').notNull(),
  body: text('body').notNull(),
  total: bigint('total', { mode: 'number' }).notNull(),
  batches: integer('batches').notNull(),
  error: text('error'),
  /** 그 글에 붙인 요청 담당자 — 올릴 때 적는다 */
  assignees: jsonb('assignees').$type<string[]>().notNull().default([]),
  /** 카드가 서는 정산 담당 대화의 말(agent_messages.id) — 상신 알림 · 초안을 올린 답 */
  messageId: text('message_id'),
  /** 이미 올린 결제일을 다시 올리는 초안 */
  again: boolean('again').notNull().default(false),
  /** 긴급사유 — 있으면 긴급 글(글양식 긴급구매요청 · lib/agit/post), 없으면 보통 글(migrations/0128) */
  urgentReason: text('urgent_reason'),
  /** 아지트가 돌려준 그 글의 id · 주소(lib/agit/send) — 카드의 「아지트에서 보기」 */
  agitId: text('agit_id'),
  agitUrl: text('agit_url'),
  /** 초안이면 쓴 담당, 올렸으면 승인한 사람 */
  postedBy: text('posted_by').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  /** 올린 때 — 올리는 중에는 누른 때(멈춘 「올리는 중」을 가른다) */
  postedAt: timestamp('posted_at', { withTimezone: true }),
}, (t) => ({
  byPayDate: index('agit_posts_pay_date_idx').on(t.payDate, t.createdAt),
  byPayDateKind: index('agit_posts_pay_date_kind_idx').on(t.payDate, t.kind, t.createdAt),
  byMessage: index('agit_posts_message_idx').on(t.messageId),
}));

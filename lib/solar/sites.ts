/**
 * 태양광 현장 — 상담 접수로 들어온다(2026-11-03, 한백 「현장관리에서 상담 개소 접수 할 수 있도록」). 순수 모듈이다:
 * 모양 · 받은 값 다듬기 · 번호. 화면(접수 폼)과 저장소(lib/data/solar-sites)가 같은 규칙을 쓴다.
 *
 * 전기차 현장(projects)과 섞지 않는다 — 운영사 · 단가 케이스 · 기성이 없다(CLAUDE.md 「사업이 둘이다」).
 * 단계는 지금 상담 하나다 — 다음 단계(현장 확인 · 견적·계약 …)는 무엇으로 넘어가는지 정해지면 붙인다(lib/solar/stages 초안).
 */
import { canWrite, type Role } from '@/lib/roles';

export type SiteKind = 'roof' | 'ground';
export const SITE_KINDS: readonly SiteKind[] = ['roof', 'ground'];
/** 부지 검토의 두 검색창과 같은 이름 — 지붕형(건물 지붕) · 지상형(땅) */
export const SITE_KIND_LABEL: Record<SiteKind, string> = { roof: '지붕형', ground: '지상형' };

/**
 * 현장에 붙은 파일 한 장 — 상담 때 받은 사진 · 전기요금 고지서 · 도면 같은 것(형식을 묻지 않는다 — 전기차 서류 칸과 같다).
 * url · size 는 서버가 우리 저장소에서 찾은 값이다(브라우저가 준 주소를 그대로 적지 않는다).
 */
export type SiteFile = {
  url: string;
  /** 올린 사람이 붙인 이름(파일 이름) */
  name: string;
  size: number;
  /** 붙인 시각(ISO) · 붙인 계정(로그인 ID) */
  at: string;
  by: string;
};

/** 파일이 사는 자리 — Blob 의 solar-sites/{현장}/ 아래만 그 현장의 파일로 받는다 */
export const siteFilePrefix = (siteId: string): string => `solar-sites/${siteId}/`;

/**
 * 올릴 자리 — 시각을 붙여 같은 이름끼리 덮지 않는다. 이름은 확장자만 남긴다(한글 · 빈칸이 주소에 실리면 깨진다 —
 * 보이는 이름은 SiteFile.name 이 따로 갖는다).
 */
export function siteFilePathname(siteId: string, filename: string, now: number = Date.now()): string {
  const ext = /\.([A-Za-z0-9]{1,8})$/.exec(filename)?.[1]?.toLowerCase();
  return `${siteFilePrefix(siteId)}${now}-${Math.random().toString(36).slice(2, 8)}${ext ? `.${ext}` : ''}`;
}

/** 파일 한 장의 한도 — 전기차 서류 칸과 같다(types/project MAX_DOC_BYTES) */
export const SITE_FILE_MAX_BYTES = 100 * 1024 * 1024;

export type SolarSite = {
  /** SL-2026-001 — 지운 현장의 번호를 다시 쓰지 않는다(시퀀스) */
  id: string;
  /** 현장명 — 상호 · 건물명 */
  name: string;
  address: string;
  kind: SiteKind;
  /** 고객 담당자 · 연락처 · 상담 메모 — 비어 있을 수 있다 */
  customer: string | null;
  phone: string | null;
  memo: string | null;
  /**
   * 담당 협력사 — 협력사가 접수하면 그 계정의 소속, 한백이 접수하면 고른 태양광 참여 협력사(한백 지시 2026-11-03 「한백 직접은
   * 없어」 · 11-04 「한백도 접수하게해줘」). null 은 그 지시 전에 한백이 「한백 직접」으로 받은 것뿐이다 — 한백이 고쳐 채운다.
   */
  org: string | null;
  /** 접수한 계정(로그인 ID) */
  createdBy: string;
  /** 접수 시각(ISO) */
  createdAt: string;
  updatedAt: string | null;
  files: SiteFile[];
};

export type SiteInput = {
  name: string;
  address: string;
  kind: SiteKind;
  customer: string | null;
  phone: string | null;
  memo: string | null;
};

/** 칸마다 받는 길이 — 화면의 maxLength 와 저장소의 검사가 같은 수를 본다 */
export const SITE_LIMITS = { name: 80, address: 200, customer: 40, phone: 40, memo: 2000 } as const;

const textOf = (v: unknown): string => (typeof v === 'string' ? v.normalize('NFC').trim() : '');
const optional = (v: unknown, max: number, what: string): string | null => {
  const t = textOf(v);
  if (!t) return null;
  if (t.length > max) throw new Error(`${what}은(는) ${max}자까지입니다.`);
  return t;
};

/**
 * 받은 값을 다듬고 빠진 것을 짚는다 — 틀리면 그 칸의 말로 던진다(저장소에서는 422 로 나간다).
 * 현장명 · 주소 · 설치 형태가 있어야 접수다. 연락처는 숫자 모양을 강제하지 않는다(내선 · 「사무실」 같은 말이 붙는다).
 */
export function cleanSiteInput(raw: unknown): SiteInput {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const name = textOf(r.name);
  if (!name) throw new Error('현장명을 넣어 주세요.');
  if (name.length > SITE_LIMITS.name) throw new Error(`현장명은 ${SITE_LIMITS.name}자까지입니다.`);
  const address = textOf(r.address);
  if (!address) throw new Error('주소를 넣어 주세요.');
  if (address.length > SITE_LIMITS.address) throw new Error(`주소는 ${SITE_LIMITS.address}자까지입니다.`);
  const kind = SITE_KINDS.find((k) => k === r.kind);
  if (!kind) throw new Error('설치 형태(지붕형 · 지상형)를 골라 주세요.');
  return {
    name,
    address,
    kind,
    customer: optional(r.customer, SITE_LIMITS.customer, '고객 담당자'),
    phone: optional(r.phone, SITE_LIMITS.phone, '연락처'),
    memo: optional(r.memo, SITE_LIMITS.memo, '상담 메모'),
  };
}

/** 접수 · 고치기 폼이 쥐는 값 — 칸은 빈 글자로, 설치 형태 · 담당 협력사는 안 골랐으면 null */
export type SiteDraft = {
  name: string;
  address: string;
  kind: SiteKind | null;
  customer: string;
  phone: string;
  memo: string;
  /** 담당 협력사 — 한백의 폼에서만 고른다(협력사는 제 소속으로 굳는다) */
  org: string | null;
};

/**
 * 상담 접수를 하는가 — 한백 관리자와 태양광 참여를 켠 협력사(2026-11-04 한백 「한백도 접수하게해줘」). 열람 전용은 아니다.
 * 현장관리의 단추 · 접수 화면의 문 · 부지 검토의 「이 부지로 상담 접수」가 이것 하나를 본다(저장소가 한 번 더 본다).
 */
export const canRegisterSite = (s: { role: Role; solar?: boolean }): boolean =>
  canWrite(s.role) && (s.role === 'admin' || s.solar === true);

/**
 * 현장(또는 들고 온 값) → 폼의 값. 접수 페이지(서버)와 상세(화면)가 같이 부른다 — 그래서 'use client' 파일이 아니라
 * 여기 둔다(서버 화면이 클라이언트 파일의 함수를 부르면 「is not a function」으로 죽는다).
 */
export const draftOf = (s: Partial<SolarSite> = {}): SiteDraft => ({
  name: s.name ?? '',
  address: s.address ?? '',
  kind: s.kind ?? null,
  customer: s.customer ?? '',
  phone: s.phone ?? '',
  memo: s.memo ?? '',
  org: s.org ?? null,
});

/** SL-연도-순번(세 자리 — 넘으면 그대로 늘어난다) */
export const siteIdOf = (year: number, n: number): string => `SL-${year}-${String(n).padStart(3, '0')}`;

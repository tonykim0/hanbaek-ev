/**
 * 서류에서 읽어 현장 정보에 넣는 값 — 다듬기와 물음 (한백 지시 2026-10-08).
 *
 *   · 대표자 — 사업자등록증·고유번호증의 「대표자」 성명 (「앞으로는 사업자등록증상 대표자 이름까지 추출해서 계약
 *     현장정보에 넣어줘」). 입주자대표회의 고유번호증이면 회장이다.
 *   · 계약일 — 계약서 끝 서명란 위의 「계약일」 (「계약서상 계약일도 적어줘」). 계약서 수령일(계약접수일)과 다른 값이다.
 *   · 주소·주차면·담당자·연락처·이메일 (2026-10-29) — 계약서 첫 장의 부지제공자 칸과 설치신청서. 접수 판독은 원래 이것들도
 *     읽는데, 서류 없이 접수하고 칸마다 따로 올리면 영영 비어 있었다(HB-2026-282 효성로즈타운 — 주소 없음·현장명에 지역 없음).
 *
 * 읽는 길은 둘이다: 접수 판독이 다른 값과 같이 읽고(lib/prompts → lib/intake-auto), 접수 뒤 그 칸(사업자등록증·계약서·
 * 설치신청서)에 파일이 들어오면 값이 비었을 때만 그 파일을 읽는다(lib/fact-read-run). 사람이 적은 값은 덮지 않는다.
 *
 * 순수 모듈이다 — 판독에 보내는 것은 lib/fact-read-run.
 */
import type { FactField, FilledFacts } from '@/types/project';

/** 칸마다 읽은 값 — 못 읽은 칸은 없다 */
export type FactValues = Partial<{
  repName: string; contractDate: string; addr: string; parkTotal: number; mgr: string; tel: string; mail: string;
}>;

/**
 * 이름만 남긴다 — 판독이 「회장 김철수 (인)」·「대표자: 김철수」처럼 붙여 오는 일이 있다.
 * 끝의 「인」 한 글자는 건드리지 않는다 — 이름이 「…인」으로 끝나기도 한다(괄호 친 「(인)」만 걷는다).
 */
export function repNameOf(v: string | null | undefined): string | null {
  const s = (v ?? '')
    .normalize('NFC')
    .replace(/[(（]\s*인\s*[)）]/g, '')
    .replace(/^\s*(대표자\s*성명|대표자|성명|대표이사|대표|회장|관리단장|관리인)\s*[:：]?\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s || null;
}

/** 달력에 있는 날인가 — 「2026-02-30」 같은 것을 거른다 */
export function isDay(v: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/**
 * 날짜 글자를 YYYY-MM-DD 로 — 판독은 접수에서 「20260609」, 따로 물으면 「2026-06-09」로 답한다.
 * 「2026년 6월 9일」·「2026.6.9」도 받는다. 달력에 없는 날·2000년 전·먼 앞날은 버린다(잘못 읽은 것이다).
 */
export function dayOf(v: string | null | undefined): string | null {
  const s = (v ?? '').normalize('NFC').trim();
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(s)
    ?? /^(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?$/.exec(s);
  if (!m) return null;
  const day = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  const year = +m[1];
  return isDay(day) && year >= 2000 && year <= new Date().getFullYear() + 1 ? day : null;
}

/** 사업자등록증 한 장에 묻는 말 */
export const REP_NAME_PROMPT = `사업자등록증 또는 고유번호증입니다. 「대표자」(「대표자 성명」) 칸에 적힌 사람 이름만 JSON 으로 답하세요.
직함·「(인)」·생년월일·주민번호는 빼고 이름만. 추측하지 마세요. JSON 외의 글은 쓰지 마세요.

{"repName": "김철수"}

사업자등록증·고유번호증이 아니거나 대표자 칸을 읽을 수 없으면 {"repName": null}.`;

/**
 * 계약서에 묻는 말 — 끝의 계약일과 첫 장의 부지제공자(아파트) 칸.
 * ★운영사(충전사업자) 칸과 섞이면 안 된다★ — 계약서 첫 장에는 두 당사자의 주소·전화·이메일이 나란히 있다.
 */
export const CONTRACT_PROMPT = `전기차 충전기 설치·운영 계약서입니다(다른 서류가 같이 묶여 있을 수 있다). 아래를 JSON 으로 답하세요.

· contractDate — 계약서 끝 서명란 위에 적힌 ★계약일★(「계약일 2026년 6월 9일」, 「2026년 6월 9일」처럼 당사자 서명 바로 위의 날짜).
  발급일·회의일·접수일·계약기간의 시작일 같은 다른 날짜로 대신하지 마세요.
· addr — 충전기를 설치하는 현장의 주소. 「설치장소」 칸이 있으면 그것, 없으면 부지제공자(아파트·건물 쪽 당사자)의 주소.
· mgr — 부지제공자 쪽 「담당자」 칸에 적힌 그대로(「관리소장」처럼 직함만 적혀 있어도 그대로).
· tel — 부지제공자 쪽 전화번호. · mail — 부지제공자 쪽 이메일.

★충전사업자(운영사)·영업자·시공사 쪽의 주소·담당·전화·이메일을 적지 마세요★ — 계약서 첫 장에 두 당사자의 칸이 나란히 있습니다.
추측하지 마세요. 비어 있거나 읽을 수 없는 값은 null. JSON 외의 글은 쓰지 마세요.

{"contractDate": "2026-06-09", "addr": "전북특별자치도 익산시 선화로23길 52", "mgr": "관리소장", "tel": "063-842-3396", "mail": "apt@naver.com"}

계약서가 아니면 모두 null.`;

/** 설치신청서(환경부 완속충전시설 설치 신청서)에 묻는 말 */
export const APPLY_PROMPT = `전기자동차 충전시설 설치 신청서입니다. 아래를 JSON 으로 답하세요.

· addr — 「설치 희망지」의 주소(「도로명 주소 :」 뒤). 신청자 주소가 따로 있어도 설치 희망지의 것을 적으세요.
· parkTotal — 「보유 주차면수」의 숫자만(「310면」 → 310).
· tel — 「신청자」 줄의 연락처.

★「사업수행기관」·「모집대행사」 칸의 담당자·연락처는 영업자의 것이다 — 적지 마세요★.
추측하지 마세요. 비어 있거나 읽을 수 없는 값은 null. JSON 외의 글은 쓰지 마세요.

{"addr": "서울특별시 도봉구 해동로 32", "parkTotal": 310, "tel": "02-998-3536"}

설치 신청서가 아니면 모두 null.`;

export function repNameReadOf(raw: unknown): string | null {
  const r = (raw ?? {}) as { repName?: unknown };
  return typeof r.repName === 'string' ? repNameOf(r.repName) : null;
}

export function contractDateReadOf(raw: unknown): string | null {
  const r = (raw ?? {}) as { contractDate?: unknown };
  return typeof r.contractDate === 'string' ? dayOf(r.contractDate) : null;
}

const textOf = (v: unknown) => (typeof v === 'string' ? v.normalize('NFC').replace(/\s+/g, ' ').trim() || null : null);

/** 주소 — 「도로명 주소 :」 같은 이름표를 걷는다. 시·군·구 하나도 없는 짧은 글은 주소가 아니다 */
export function addrOf(v: unknown): string | null {
  const s = textOf(v)?.replace(/^(도로명\s*주소|주소|설치장소)\s*[:：]?\s*/, '') ?? null;
  return s && s.length >= 6 && /[시군구도]\s/.test(`${s} `) ? s : null;
}

/** 전화번호 — 숫자가 9~12자리인 것만(지역번호 포함). 모양은 적힌 그대로 둔다 */
export function telOf(v: unknown): string | null {
  const s = textOf(v);
  const digits = s?.replace(/\D/g, '') ?? '';
  return s && digits.length >= 9 && digits.length <= 12 ? s : null;
}

export function mailOf(v: unknown): string | null {
  const s = textOf(v)?.replace(/\s/g, '') ?? null;
  return s && /^[^@]+@[^@]+\.[^@]+$/.test(s) ? s : null;
}

/** 주차면 — 「310면」·「310」·310. 0 이나 터무니없는 수는 잘못 읽은 것이다 */
export function parkOf(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[,\s면대]/g, '')) : NaN;
  return Number.isInteger(n) && n > 0 && n < 100000 ? n : null;
}

const drop = (o: FactValues): FactValues =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined)) as FactValues;

export function repNameValuesOf(raw: unknown): FactValues {
  return drop({ repName: repNameReadOf(raw) ?? undefined });
}

export function contractReadOf(raw: unknown): FactValues {
  const r = (raw ?? {}) as Record<string, unknown>;
  return drop({
    contractDate: contractDateReadOf(raw) ?? undefined,
    addr: addrOf(r.addr) ?? undefined,
    mgr: textOf(r.mgr) ?? undefined,
    tel: telOf(r.tel) ?? undefined,
    mail: mailOf(r.mail) ?? undefined,
  });
}

export function applyReadOf(raw: unknown): FactValues {
  const r = (raw ?? {}) as Record<string, unknown>;
  return drop({ addr: addrOf(r.addr) ?? undefined, parkTotal: parkOf(r.parkTotal) ?? undefined, tel: telOf(r.tel) ?? undefined });
}

/**
 * 빠진 장이 넣었던 값 중 걷을 것 — ★아직 그 값 그대로인 칸만★. 그 뒤 사람이 고쳤으면 그 사람의 값이다.
 * 현장명은 지역을 붙인 그 이름 그대로일 때만 붙이기 전으로 되돌린다.
 */
export function staleFacts(
  gone: FilledFacts[],
  now: Partial<Record<FactField, unknown>> & { name: string }
): { clear: FactField[]; name: string | null } {
  const clear = new Set<FactField>();
  let name: string | null = null;
  for (const g of gone) {
    for (const [k, v] of Object.entries(g.facts ?? {}) as Array<[FactField, string | number]>) {
      if (now[k] !== null && now[k] !== undefined && String(now[k]) === String(v)) clear.add(k);
    }
    if (g.name && now.name === g.name.to) name = g.name.from;
  }
  return { clear: [...clear], name };
}

/**
 * 접수 판독의 서류 목록에서 이번 계약일 — 계약서가 여럿이면 ★가장 최근 계약일★이 이번 계약이다(lib/prompts 의 규칙:
 * 예전 계약서는 이미 설치된 충전기의 것). 날짜를 못 읽은 계약서는 뺀다.
 */
export function contractDateOfFiles(files: Array<{ category: string; date?: string | null }> | null | undefined): string | null {
  const days = (files ?? []).filter((f) => f.category === '계약서').map((f) => dayOf(f.date)).filter((d): d is string => !!d);
  return days.sort().at(-1) ?? null;
}

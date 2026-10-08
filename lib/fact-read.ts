/**
 * 서류에서 읽어 현장 정보에 넣는 값 둘 — 다듬기와 물음 (한백 지시 2026-10-08).
 *
 *   · 대표자 — 사업자등록증·고유번호증의 「대표자」 성명 (「앞으로는 사업자등록증상 대표자 이름까지 추출해서 계약
 *     현장정보에 넣어줘」). 입주자대표회의 고유번호증이면 회장이다.
 *   · 계약일 — 계약서 끝 서명란 위의 「계약일」 (「계약서상 계약일도 적어줘」). 계약서 수령일(계약접수일)과 다른 값이다.
 *
 * 읽는 길은 둘이다: 접수 판독이 다른 값과 같이 읽고(lib/prompts → lib/intake-auto), 접수 뒤 그 칸(사업자등록증·계약서)에
 * 파일이 들어오면 값이 비었을 때만 그 파일을 읽는다(lib/fact-read-run). 사람이 적은 값은 덮지 않는다.
 *
 * 순수 모듈이다 — 판독에 보내는 것은 lib/fact-read-run.
 */

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

/** 계약서에 묻는 말 */
export const CONTRACT_DATE_PROMPT = `전기차 충전기 설치·운영 계약서입니다(다른 서류가 같이 묶여 있을 수 있다). 계약서 끝 서명란 위에 적힌
★계약일★(「계약일 2026년 6월 9일」, 「2026년 6월 9일」처럼 당사자 서명 바로 위의 날짜)만 JSON 으로 답하세요.
발급일·회의일·접수일·계약기간의 시작일 같은 다른 날짜로 대신하지 마세요. 추측하지 마세요. JSON 외의 글은 쓰지 마세요.

{"contractDate": "2026-06-09"}

계약서가 아니거나 계약일이 비어 있거나(「    년   월   일」) 읽을 수 없으면 {"contractDate": null}.`;

export function repNameReadOf(raw: unknown): string | null {
  const r = (raw ?? {}) as { repName?: unknown };
  return typeof r.repName === 'string' ? repNameOf(r.repName) : null;
}

export function contractDateReadOf(raw: unknown): string | null {
  const r = (raw ?? {}) as { contractDate?: unknown };
  return typeof r.contractDate === 'string' ? dayOf(r.contractDate) : null;
}

/**
 * 접수 판독의 서류 목록에서 이번 계약일 — 계약서가 여럿이면 ★가장 최근 계약일★이 이번 계약이다(lib/prompts 의 규칙:
 * 예전 계약서는 이미 설치된 충전기의 것). 날짜를 못 읽은 계약서는 뺀다.
 */
export function contractDateOfFiles(files: Array<{ category: string; date?: string | null }> | null | undefined): string | null {
  const days = (files ?? []).filter((f) => f.category === '계약서').map((f) => dayOf(f.date)).filter((d): d is string => !!d);
  return days.sort().at(-1) ?? null;
}

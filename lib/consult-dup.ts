/**
 * 사전현장컨설팅 결과서의 「6. 중복설치」 — 나이스인프라 제출 정보 7번 「기설치 현황」의 정본
 * (한백 지시 2026-11-03 「나이스인프라 제출정보에서 기설치 현황은 지금 사전현장컨설팅 결과서 중복설치에서 값을 가져와야해」).
 *
 * 그전에는 접수 때 협력사가 고른 「기설치 있음/없음」과 그 메모를 옮겼다. 운영사(나이스)가 견주는 것은 결과서(별지 제7호 서식)의
 * 6번이라, 거기 적힌 것을 그대로 내야 한다. 6번은 체크박스 다섯 — 급속충전기 · 완속충전기 · 전력분배형 · 과금형콘센트 ·
 * 키오스크 — 과 그 수량, 그리고 「해당사항 없음」이다(계약서 작성 도구가 채우는 칸과 같다 — lib/schema dup*).
 *
 * 판독은 체크와 수량만 읽고(lib/consult-dup-run), 글로 바꾸는 것은 코드다. 순수 모듈이다.
 */

export const DUP_KINDS = [
  { key: 'fast', label: '급속' },
  { key: 'slow', label: '완속' },
  { key: 'dist', label: '전력분배형' },
  { key: 'outlet', label: '과금형콘센트' },
  { key: 'kiosk', label: '키오스크' },
] as const;
export type DupKey = (typeof DUP_KINDS)[number]['key'];

/** 결과서 6번을 읽은 것 — projects.consult_dup (migrations/0112) */
export interface ConsultDup {
  /** 6번 칸을 찾았는가 — 못 찾았어도 남긴다(같은 파일로 다시 묻지 않게). 그때 7번은 빈칸이다 */
  found: boolean;
  /** 「해당사항 없음」에 체크했는가 */
  none: boolean;
  /** 체크된 항목과 그 수량 — 체크 안 된 항목은 없다. 체크만 되고 수량이 비었으면 null */
  items: Partial<Record<DupKey, number | null>>;
  /** 읽은 파일의 주소 — 결과서 칸의 파일이 바뀌면 다시 읽는다 */
  files: string[];
  /** 읽은 때(ISO) */
  readAt: string;
}

/**
 * 제출 정보 7번에 쓰는 글 — 「없음」 또는 「완속 4기, 급속 1기」. 아직 못 읽었으면 null(빈칸으로 둔다 — 지어내지 않는다).
 * 아무것도 체크돼 있지 않으면 「없음」이다 — 결과서 서식이 「미체크면 해당사항 없음」으로 본다(계약서 작성 도구도 그렇게 채운다).
 */
export function dupTextOf(d: (Pick<ConsultDup, 'none' | 'items'> & { found?: boolean }) | null | undefined): string | null {
  if (!d || d.found === false) return null;
  const parts = DUP_KINDS.flatMap(({ key, label }) => {
    if (!(key in d.items)) return [];
    const qty = d.items[key];
    return [qty === null || qty === undefined ? `${label} (수량 미기재)` : `${label} ${qty}기`];
  });
  return parts.length ? parts.join(', ') : '없음';
}

/** 결과서에 묻는 말 — 6번 칸만 */
export const CONSULT_DUP_PROMPT = `사전 현장 컨설팅 결과서(별지 제7호 서식)입니다. 사진대지 등 다른 서류가 같이 묶여 있을 수 있습니다.
결과서의 「6. 중복설치」(중복설치 여부) 칸만 읽어 JSON 으로 답하세요.
- 체크박스 다섯: 급속충전기(fast) · 완속충전기(slow) · 전력분배형(dist) · 과금형콘센트(outlet) · 키오스크(kiosk).
  각각 체크(■ ☑ V ✓ 표시)됐는지(checked)와 옆에 적힌 수량(qty, 숫자만)을 읽으세요.
- 「해당사항 없음」에 체크됐는지(none).
- 빈 체크박스(□)는 false 입니다. 수량이 비었거나 읽을 수 없으면 null. 추측하지 마세요.
- 결과서가 없거나 6번 칸을 찾지 못하면 "found": false 로만 답하세요.
{"found": true, "none": false, "fast": {"checked": false, "qty": null}, "slow": {"checked": true, "qty": 4}, "dist": {"checked": false, "qty": null}, "outlet": {"checked": false, "qty": null}, "kiosk": {"checked": false, "qty": null}}
JSON 외의 글은 쓰지 마세요.`;

/** 「4」 · 「4대」 · 「4 기」 · 4 → 4. 못 읽으면 null */
function qtyOf(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[^0-9]/g, '') || NaN) : NaN;
  return Number.isInteger(n) && n >= 0 && n < 10_000 ? n : null;
}

/** 판독의 답 → 6번. 칸을 못 찾았거나 모양이 틀리면 null */
export function consultDupOf(raw: unknown): Pick<ConsultDup, 'none' | 'items'> | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.found === false) return null;
  const items: ConsultDup['items'] = {};
  for (const { key } of DUP_KINDS) {
    const cell = r[key];
    if (cell && typeof cell === 'object' && (cell as { checked?: unknown }).checked === true) {
      items[key] = qtyOf((cell as { qty?: unknown }).qty);
    }
  }
  return { none: r.none === true, items };
}

/** 지금 결과서 칸의 파일로 읽은 것인가 — 순서는 보지 않는다 */
export function sameDupFiles(d: Pick<ConsultDup, 'files'> | null | undefined, urls: string[]): boolean {
  if (!d) return false;
  const a = [...d.files].sort();
  const b = [...urls].sort();
  return a.length === b.length && a.every((u, i) => u === b[i]);
}

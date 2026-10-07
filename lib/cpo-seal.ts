/**
 * 계약서에 충전사업자(운영사) 직인이 찍혔는가 — 현대엔지니어링·SK일렉링크 (한백 지시 2026-10-07 「계약서류에서
 * 현대엔지니어링과 SK 계약서는 충전사업자 직인이 필요해 — 파일을 읽고 태깅을 따로 해줘」).
 *
 * 협력사가 내는 계약서는 아파트(부지제공자·서비스이용자) 쪽만 날인돼 오고, 운영사 쪽 「(인)」 칸은 비어 있는 일이
 * 많다 — 운영사가 받아 역날인한 판(「현엔 날인승인」·「날인본」)이 따로 돈다. 그 칸이 찍혔는지를 판독이 읽어
 * 파일에 꼬리표로 단다(DocFile.cpoSeal). 막지 않는다 — 꼬리표만 붙고 판단은 사람이 한다(서류 검수와 같은 방식).
 *
 * ★도장이 찍혔는지만 묻는다★ — 누구 도장인지 맞히라고 하지 않는다. 운영사 서명 칸(회사 이름·「(인)」 자리)에 찍힌
 * 인영이 있는가만 본다. 아파트 쪽 도장과 쪽 사이의 간인(쪽 가장자리에 걸친 도장)은 세지 않는다.
 *
 * 순수 모듈이다 — 화면(계약 탭의 「직인 읽기」)이 needsCpoSeal 을 같이 본다. 판독에 보내는 것은 lib/cpo-seal-run.
 */

/** 운영사 직인이 필요한 운영사 — 이 둘의 계약서만 읽는다 */
export const SEAL_CPOS = ['현대엔지니어링', 'SK일렉링크'] as const;
export type SealCpo = (typeof SEAL_CPOS)[number];
export const needsCpoSeal = (cpo: string | null | undefined): cpo is SealCpo =>
  (SEAL_CPOS as readonly string[]).includes(cpo ?? '');

/** 운영사가 서명 칸에 적히는 모양 — 판독에 찾을 이름을 일러 준다 */
const PARTY: Record<SealCpo, { names: string; role: string }> = {
  현대엔지니어링: { names: '현대엔지니어링(주) · 현대엔지니어링 주식회사 (대표이사 주우정)', role: '충전사업자' },
  SK일렉링크: { names: 'SK일렉링크 주식회사 · 에스케이일렉링크 주식회사', role: '서비스제공자' },
};

export function sealPrompt(cpo: SealCpo): string {
  const p = PARTY[cpo];
  return `전기차 충전기 설치·운영 계약서(다른 서류가 같이 묶여 있을 수 있다)입니다. 계약서의 당사자 서명·날인 칸을 찾아
★운영사(${p.role}) 쪽 칸에 도장(인영)이 찍혀 있는지★만 보고 JSON 으로 답하세요. 추측하지 마세요. JSON 외의 글은 쓰지 마세요.

## 운영사
${cpo} — 서명 칸에는 「${p.names}」로 적혀 있고, 이름 끝이나 옆에 「(인)」 자리가 있습니다.
계약서 끝(「계약서 2부를 작성하여 … 날인 후 각 1부씩 보관」 아래)의 두 당사자 칸 중 이 회사 쪽 칸입니다.

## 답 모양
{"found": true, "seal": false, "page": 2}

- found: 그 운영사의 서명 칸을 찾았으면 true. 계약서가 아니거나 서명 칸이 안 보이면 false 이고 seal 은 null.
- seal: 그 운영사 칸 안이나 칸에 걸쳐 ★붉은(흑백 스캔이면 검은) 동그라미·네모 도장 자국★이 있으면 true.
  「(인)」 글자만 있고 도장이 없으면 false. 손글씨 서명만 있어도 false.
  ★세지 않는 것★: 다른 당사자(아파트·입주자대표회의·관리단·부지제공자·서비스이용자) 칸의 도장, 쪽과 쪽 사이 가장자리에
  걸친 간인, 머리글·로고. 계약서 사본이 두 벌 묶여 있으면 하나라도 찍혀 있으면 true.
- page: 그 서명 칸이 있는 쪽 번호(1부터). 모르면 null.`;
}

export interface CpoSealRead {
  /** true 찍힘 · false 비어 있음 · null 서명 칸을 못 찾음(계약서가 아님 등) */
  seal: boolean | null;
  page: number | null;
}

export function sealReadOf(raw: unknown): CpoSealRead {
  const r = (raw ?? {}) as { found?: unknown; seal?: unknown; page?: unknown };
  const page = typeof r.page === 'number' && Number.isFinite(r.page) && r.page > 0 ? Math.round(r.page) : null;
  if (r.found !== true) return { seal: null, page };
  return { seal: typeof r.seal === 'boolean' ? r.seal : null, page };
}

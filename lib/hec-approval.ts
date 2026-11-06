/**
 * 현대엔지니어링 설치승인서 검증 — 메일에 붙이기 전에 그 파일이 이 현장의 설치승인서인지 본다. [순수]
 * 한백 2026-11-06 「앞으로 파일이 설치승인서가 맞는지도 검증해주는 단계가 필요할듯」 → 「응 이대로 진행해」.
 *
 * 설치승인서는 현대엔지니어링 EVC사업팀의 「전기차 충전기 설치 신청·승인서」 양식이다 — 한백이 채워 내고 운영사가 결재한다.
 * 이 Mac 의 실제 파일(서로 다른 pptx 142개)이 전부 그 양식이고, 첫 장의 표에 현장명 · 주소(상세) · 설치 기수(완속 · 급속)가 있다
 * (140개 — 나머지 둘은 빈 양식 「00기」). PDF 는 그 pptx 를 내보낸 것이다(글자층의 제목은 「신청 • 승인서」) — 컨설팅결과서 ·
 * 체크리스트와 한 파일로 묶여 오기도 한다.
 *
 * 판정 둘 (lib/site-mail 이 받는다):
 *   block  그대로 보내면 사고다 — 초안을 쓰지 않는다: ① 양식이 아니다(설치승낙서 · 계약서 …) ② 빈 양식 ③ 다른 현장의 것
 *   warn   초안은 쓰고 카드에 「확인 필요」: ④ 기수가 콘솔과 다르다 · 글자를 못 읽었다 · 이 현장의 것인지 가리지 못했다
 * ★③ 은 길과 이름 둘 다 다를 때만이다★ — 승인서의 현장명은 콘솔과 다르게 적는 일이 흔하고(콘솔 「경기 용인 라미드에이치엠
 * (스윙쉐프동백)」 ↔ 승인서 「라온705」), ★아파트 단지는 동마다 건물번호가 달라★ 번호로 가르면 같은 현장을 막는다 — 첫 판이 운영의
 * 승인서 54장 중 3장을 그렇게 막았다(2026-11-06 「삼흥로88번길 10」 ↔ 「삼흥로 88번길 8」 · 「승학길 90」 ↔ 「승학길 88」 · 두 길에
 * 걸친 단지 「영천고2길 42」 ↔ 「문화새길 39」 — 이름은 둘 다 「문화아파트」). 그래서 같은 길(번호 빼고 · lib/parking-check
 * roadKeyOf) · 같은 지번 · 이름 낱말 하나가 같으면 이 현장이다. ★길도 이름도 다르고 둘 다 도로명 주소일 때만★ 다른 현장이라
 * 막는다 — 한쪽이 지번이거나 비었으면 가리지 못한 것이다(warn).
 * ④ 를 막지 않는 것은 승인서와 콘솔 중 어느 쪽이 틀렸는지 모르기 때문이다 — 메일 제목의 기수는 콘솔 값이다(lib/site-mail hecLetter).
 */
import { roadKeyOf } from './parking-check';
import { regionPartsOf } from './region';
import type { DocCheck } from './site-mail';

/** 승인서 한 장에서 읽은 것 — pptx 는 코드가(readApprovalSlides), PDF · 사진은 판독이(approvalReadOf) 읽는다 */
export interface ApprovalRead {
  /** 양식 제목(「전기차 충전기 설치 신청·승인서」)이 있는가 — null 이면 글자를 못 읽었다 */
  form: boolean | null;
  /** 표의 현장명 · 주소(상세) — 못 읽었거나 비었으면 null */
  name: string | null;
  addr: string | null;
  /** 설치 기수(완속 + 급속) — 못 읽었으면 null */
  qty: number | null;
  /** 빈 양식 — 현장명이 비었거나 기수가 「00기」 */
  blank: boolean;
  /** 그 쪽(장)의 글자 전부 — 콘솔 주소 · 이름을 찾는 자리(판독이 읽은 것이면 null) */
  text: string | null;
}

/** 콘솔의 그 현장 — 견줄 값 */
export interface ApprovalSite {
  name: string;
  addr: string | null;
  /** 계약 라인의 대수 합 — 메일 제목의 「N기」 */
  qty: number;
}

/** 빈칸 · 줄바꿈을 걷은 글자 — 「삼흥로 88번길 8」과 「삼흥로88번길 8」이 같아진다 */
const squash = (s: string) => s.normalize('NFC').replace(/\s+/g, '');

/** 양식 제목 — 「설치 신청·승인서」 · 「설치 신청 • 승인서」(PDF) · 가운뎃점 없이 「설치신청승인서」 */
const TITLE = /설치신청[·•ㆍ・‧∙.]?승인서/;
export const hasApprovalTitle = (text: string): boolean => TITLE.test(squash(text));

const ENTITY: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unescapeXml = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITY[e.toLowerCase()] ?? m;
  });

/** 문단 하나의 글자 — 같은 문단의 조각(a:t)은 붙이고 */
const paraText = (p: string) => unescapeXml([...p.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join(''));
const parasOf = (xml: string) => [...xml.matchAll(/<a:p>[\s\S]*?<\/a:p>/g)].map((m) => paraText(m[0]));

/** 슬라이드의 글자 전부 — 문단마다 한 줄 */
export function slideText(xml: string): string {
  return parasOf(xml).filter((t) => t.trim()).join('\n').normalize('NFC');
}

/** 슬라이드 표의 칸 — 차례대로(줄 → 칸), 칸 안의 문단은 빈칸으로 잇는다. 합친 칸도 빈 칸으로 자리를 지킨다 */
export function slideCells(xml: string): string[] {
  return [...xml.matchAll(/<a:tc\b[\s\S]*?<\/a:tc>/g)]
    .map((m) => parasOf(m[0]).join(' ').replace(/\s+/g, ' ').trim().normalize('NFC'));
}

/** 빈 양식의 기수 칸 — 「00기」(양식 그대로) */
const isBlankQty = (c: string | undefined) => c !== undefined && /^00+기?$/.test(c.replace(/\s+/g, ''));

/** 「4기」 · 「4」(상가 현장들은 「기」 없이 적었다) → 4 · 「-」 · 「-기」 · 빈 칸 → 0 · 「00기」 · 그 밖은 null */
function qtyCell(c: string | undefined): number | null {
  if (c === undefined || isBlankQty(c)) return null;
  const s = c.replace(/\s+/g, '');
  if (/^-?기?$/.test(s)) return 0;
  const m = /^(\d+)기?$/.exec(s);
  return m ? Number(m[1]) : null;
}

/** 완속 · 급속 칸 → 기수 합 · 빈 양식인가. 둘 다 못 읽었거나 합이 0 이면 기수는 null(모른다) */
function qtyOf(slowCell: string | undefined, fastCell: string | undefined): { qty: number | null; zeroes: boolean } {
  const slow = qtyCell(slowCell);
  const fast = qtyCell(fastCell);
  const sum = slow === null && fast === null ? 0 : (slow ?? 0) + (fast ?? 0);
  return { qty: sum > 0 ? sum : null, zeroes: isBlankQty(slowCell) || isBlankQty(fastCell) };
}

/**
 * 양식 쪽(제목이 있는 슬라이드)에서 칸을 읽는다. 「현장명」 · 「주소(상세)」는 이름 칸 바로 다음 칸이 값이다. 기수는 표 맨 위
 * 줄의 「완속」 · 「급속」 다음 칸이다(「완속 | 4기 | % | 7년 …」 — 아래 시공정보 표의 「4기 | 3기」는 지상 · 지하라 안 본다).
 */
export function readApprovalSlide(xml: string): ApprovalRead {
  const text = slideText(xml);
  const cells = slideCells(xml);
  const after = (label: string) => {
    const i = cells.findIndex((c) => squash(c) === label);
    return i >= 0 && i + 1 < cells.length ? cells[i + 1] : undefined;
  };
  const name = after('현장명') || null;
  const addr = after('주소(상세)') || null;
  const { qty, zeroes } = qtyOf(after('완속'), after('급속'));
  return { form: hasApprovalTitle(text), name, addr, qty, blank: !name || zeroes, text };
}

/**
 * 파워포인트의 슬라이드들(차례대로) — 제목이 있는 첫 장을 읽는다. 어느 장에도 없으면 「양식 아님」이다. 글자가 한 줄도 없으면
 * (그림만 붙인 슬라이드) 못 읽은 것이다.
 */
export function readApprovalSlides(slides: string[]): ApprovalRead {
  const hit = slides.find((x) => hasApprovalTitle(slideText(x)));
  if (hit) return readApprovalSlide(hit);
  const text = slides.map(slideText).join('\n');
  return { form: text.replace(/\s+/g, '').length > 0 ? false : null, name: null, addr: null, qty: null, blank: false, text };
}

/** 글자만 읽힌 파일(워드 · 한글 · 엑셀) — 제목으로 양식인지만 가린다. 칸은 못 읽는다 */
export function readApprovalText(text: string): ApprovalRead {
  const t = text.normalize('NFC');
  return { form: t.replace(/\s+/g, '').length > 0 ? hasApprovalTitle(t) : null, name: null, addr: null, qty: null, blank: false, text: t };
}

/** PDF · 사진을 판독에 보낼 때의 물음 — 양식 쪽을 찾고 칸을 그대로 옮겨 적게 한다(판정은 코드가 한다) */
export const APPROVAL_PROMPT = `전기차 충전기 설치 관련 서류입니다(여러 서류가 한 파일에 묶여 있을 수 있다).
그 안에 ★「전기차 충전기 설치 신청·승인서」 양식의 쪽★(현대엔지니어링 EVC사업팀 · 대외비 · 결재란 「담당 · 그룹장 · 팀장」 ·
「주요 현장 정보」 표)이 있는지 찾고, 있으면 그 표의 칸을 적힌 그대로 옮겨 JSON 으로 답하세요. 추측하지 마세요. JSON 외의 글은 쓰지 마세요.

## 답 모양
{"form": true, "name": "호남신학대학교", "addr": "광주광역시 남구 제중로 77", "slow": "4기", "fast": "-"}

- form: 그 양식의 쪽이 있으면 true. 설치승낙서 · 계약서 · 컨설팅결과서 · 체크리스트만 있으면 false. 글자를 알아볼 수 없으면 null.
- name: 표의 「현장명」 칸. 비었으면 null.
- addr: 표의 「주소(상세)」 칸. 비었으면 null.
- slow · fast: 맨 위 표 「충전기 종류」가 완속 · 급속인 줄의 「설치 기수」 칸 글자 그대로(예: "4기", "-", "00기"). 없으면 null.
- form 이 false 나 null 이면 나머지는 모두 null.`;

/** 판독의 답 → 읽은 것 */
export function approvalReadOf(raw: unknown): ApprovalRead {
  const r = (raw ?? {}) as { form?: unknown; name?: unknown; addr?: unknown; slow?: unknown; fast?: unknown };
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().normalize('NFC') : null);
  if (r.form !== true) return { form: r.form === false ? false : null, name: null, addr: null, qty: null, blank: false, text: null };
  const { qty, zeroes } = qtyOf(str(r.slow) ?? undefined, str(r.fast) ?? undefined);
  const name = str(r.name);
  return { form: true, name, addr: str(r.addr), qty, blank: !name || zeroes, text: null };
}

/** 글자 안에 도로명 열쇠가 있는가 — 「제중로 77」이 「제중로 771」에 걸리지 않게 번호 뒤를 본다 */
function hasRoadKey(hay: string, key: string): boolean {
  const h = squash(hay);
  const k = squash(key);
  for (let i = h.indexOf(k); i >= 0; i = h.indexOf(k, i + 1)) {
    if (!/[0-9-]/.test(h[i + k.length] ?? '')) return true;
  }
  return false;
}

/**
 * 지번 열쇠 — 「상모동 76-1」 · 「모현동1가 142-2」(마지막 동 · 리 · 가 + 번지). 도로명이 없는 주소끼리 같은 곳인지 볼 때만 쓴다 —
 * 맞으면 이 현장이고, 달라도 막지는 않는다(지번은 쓰는 꼴이 갈려 다르다고 단정하지 않는다).
 */
function jibunKeyOf(addr: string | null | undefined): string | null {
  if (!addr) return null;
  const all = [...squash(addr.replace(/\([^)]*\)/g, ' ')).matchAll(/([가-힣0-9]*[가-힣](?:동|리|가))(산?\d+(?:-\d+)?)/g)];
  const m = all.at(-1);
  return m ? `${m[1]}${m[2]}` : null;
}

/** 도로 이름 — 도로명 열쇠의 번호 앞(「삼흥로88번길 10」 → 「삼흥로88번길」) */
const roadOf = (addr: string | null | undefined): string | null => {
  const key = roadKeyOf(addr);
  return key ? squash(key.slice(0, key.lastIndexOf(' '))) : null;
};

/**
 * 같은 길인가 — 번호는 안 본다. ★아파트 단지는 동마다 건물번호가 다르다★(운영 2026-11-06: 콘솔 「삼흥로88번길 10」 ↔ 승인서
 * 「삼흥로 88번길 8」 · 「승학길 90」 ↔ 「승학길 88」 — 같은 현장이었다). 「삼흥로 88번길」을 띄어 쓰면 열쇠가 「88번길」만 잡혀
 * 끝이 같으면 같은 길로 본다(세 글자부터).
 */
function sameRoad(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  return short === long || (short.length >= 3 && long.endsWith(short));
}

/** 이름 낱말에서 걷는 말 — 어느 현장에나 붙어 이름을 가르지 못한다 */
const GENERIC = /아파트|입주자대표회의|입대의|관리사무소|관리단|자치운영회|주식회사|\(주\)|㈜|^상가$|^apt$/gi;

/**
 * 이름의 낱말 — 지역(콘솔이 이름 앞에 붙인 「경북 포항」 · lib/region regionPartsOf) · 괄호 · 흔한 말을 걷고 두 글자부터.
 * 「경북 영천 문화아파트」 → 「문화」 · 「주안 태평아파트」 → 「주안」 「태평」
 */
function nameWords(name: string, region: ReadonlySet<string>): string[] {
  return name.normalize('NFC').replace(/\([^)]*\)/g, ' ').split(/[\s,·]+/)
    .filter((t) => t && !region.has(t))
    .map((t) => t.replace(GENERIC, ''))
    .filter((t) => t.length >= 2);
}

/**
 * 승인서의 현장명이 콘솔 현장명과 같은 곳을 가리키는가 — 낱말 하나가 같거나(두 글자부터), 한쪽이 다른 쪽을 품으면(세 글자부터).
 * 승인서는 이름을 다르게 적는 일이 흔하다(콘솔 「경북 영천 문화아파트」 ↔ 승인서 「문화아파트」 — 운영에서 길도 달랐다(단지가 두
 * 길에 걸쳤다)).
 */
function sameName(site: ApprovalSite, approval: string | null): boolean {
  if (!approval) return false;
  const region = new Set(regionPartsOf(site.addr));
  const a = nameWords(approval, region);
  const c = nameWords(site.name, region);
  return a.some((x) => c.some((y) => x === y || (Math.min(x.length, y.length) >= 3 && (x.includes(y) || y.includes(x)))));
}

/** 승인서의 현장명을 못 읽었을 때(판독이 칸을 못 찾음 등) — 콘솔 이름의 낱말(세 글자부터)이 그 쪽 글자에 있는가 */
function nameInText(site: ApprovalSite, text: string | null): boolean {
  if (!text) return false;
  const t = squash(text);
  return nameWords(site.name, new Set(regionPartsOf(site.addr))).some((w) => w.length >= 3 && t.includes(w));
}

/** 보이는 이름 — 「승인서 「라온705 · 경기도 용인시 …」」 */
const shown = (r: ApprovalRead) => [r.name, r.addr].filter(Boolean).join(' · ') || '현장명 · 주소 없음';

/**
 * 읽은 것을 그 현장과 견준다 — 맞으면 빈 목록. block 이 하나라도 있으면 그것 하나만 돌려준다(그 파일은 보낼 수 없다).
 */
export function judgeApproval(read: ApprovalRead, site: ApprovalSite): DocCheck[] {
  if (read.form === null) return [{ level: 'warn', why: '글자를 읽지 못했습니다 — 열어 보고 승인해 주세요' }];
  if (!read.form) return [{ level: 'block', why: '설치승인서 양식이 아닙니다(「전기차 충전기 설치 신청·승인서」 제목 없음)' }];
  if (read.blank) return [{ level: 'block', why: '빈 양식입니다(현장명 · 기수가 비어 있음)' }];

  const out: DocCheck[] = [];
  const siteKey = roadKeyOf(site.addr);
  const hay = [read.addr, read.text].filter(Boolean).join('\n');
  const jibun = jibunKeyOf(site.addr);
  const addrHit = (siteKey !== null && hasRoadKey(hay, siteKey))
    || sameRoad(roadOf(site.addr), roadOf(read.addr))
    || (jibun !== null && jibun === jibunKeyOf(read.addr));
  const nameHit = sameName(site, read.name) || (read.name === null && nameInText(site, read.text));
  if (!addrHit && !nameHit) {
    // ★길도 이름도 다르고 둘 다 도로명일 때만★ 다른 현장이다 — 한쪽이 지번이거나 비었으면 가리지 못한 것이다
    if (siteKey !== null && roadKeyOf(read.addr) !== null) {
      return [{ level: 'block', why: `다른 현장의 승인서로 보입니다 — 승인서 「${shown(read)}」 · 콘솔 주소 「${site.addr}」` }];
    }
    out.push({ level: 'warn', why: `이 현장의 승인서인지 가리지 못했습니다 — 승인서 「${shown(read)}」` });
  }
  if (read.qty !== null && site.qty > 0 && read.qty !== site.qty) {
    out.push({ level: 'warn', why: `기수가 다릅니다 — 승인서 ${read.qty}기 · 콘솔 ${site.qty}기` });
  }
  return out;
}

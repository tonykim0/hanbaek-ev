/**
 * 여러 현장의 같은 서류를 zip 하나로 — 메일 초안에 붙인다 (순수 — 저장소 · 네트워크를 안 끌어온다. 받아 묶고 올리는 일은 bundle-run).
 *
 * 한백 2026-11-05 「콘솔 프로젝트마다 저장되어있는 파일을 한꺼번에 불러와서 압축해서 이메일로 보내고 싶은데 안되나보네. 방법
 * 찾아봐줘」 → 「응 진행해」. 현대엔지니어링 담당이 16개소 설치승인서를 한 통으로 보내려다 「제가 메일에 붙일 수 있는 건 이 대화창에
 * 올려 주신 파일뿐」이라고 멈췄다 — 현장 서류는 양식 메일(현장마다 한 통)만 붙일 수 있었고, 메일 한 통의 첨부는 10개 · 25MB 까지다.
 *
 * 그래서 담당이 bundle_site_docs(현장 관리번호들 + 서류 이름)로 묶는다: 콘솔이 현장마다 그 칸의 파일을 받아 zip 으로 묶어 올리고,
 * 담당이 묶음마다 draft_mail 의 attach_bundle_ids 로 한 통씩 초안을 쓴다. 나가는 것은 여전히 한백의 「승인하고 보내기」뿐이다.
 *
 * ★첨부로만 보낸다 — 한 통에 들어갈 만큼씩 나눠 묶는다★(같은 날 「현대같이 단순 첨부파일만 다운로드만되는 곳은 이 링크가 안열리지
 * 않을까」 → 「B로하자」). 첫 판은 한 zip 이 25MB 를 넘으면 본문의 내려받기 링크로 달았는데, 현대 16개소가 62.6MB 라 링크로 나갔고
 * 대기업 메일은 바깥 저장소 링크를 막는 일이 많다. 이제 현장을 쪼개지 않고 차례대로 한 묶음이 상한(기본 20MB — 받는 메일함 ·
 * 다음 메일 서버의 실제 한도를 몰라 25MB 보다 낮게) 안에 들게 나눈다(packSites). 한 현장의 파일만으로 상한을 넘을 때만 그 묶음은
 * 첨부로 못 붙여 링크(link_bundle_ids)로 단다.
 */
import { DOC_KEYS, docNameOf, PROCESS_DOCS } from '@/lib/doc-rules';
import { MAIL_LIMITS } from './mime';

/** 서류 칸 — 계약 서류(documents)인지 공정 서류(process_documents)인지와 키 · 이름 */
export interface DocSlot {
  table: 'contract' | 'process';
  key: string;
  name: string;
}

/** 묶음 상한 — 현장 수 · 받는 파일 합계(함수 메모리 안에서 묶는다) */
export const BUNDLE_LIMIT = { sites: 80, bytes: 150 * 1024 * 1024 } as const;
/** 메일 한 통에 붙이는 묶음의 크기 — 기본 20MB, 한백이 「10MB씩」처럼 말하면 그 값(5 ~ 25MB) */
export const PART_MB = { default: 20, min: 5, max: 25 } as const;
export const partBytesOf = (mb: number | null | undefined): number => {
  const m = typeof mb === 'number' && Number.isFinite(mb) ? Math.min(PART_MB.max, Math.max(PART_MB.min, mb)) : PART_MB.default;
  return Math.floor(m * 1024 * 1024);
};

/**
 * 현장을 묶음으로 나눈다 — 현장을 쪼개지 않고 준 차례대로, 한 묶음의 합이 limit 안에 들게. 한 현장만으로 limit 을 넘으면 그 현장
 * 혼자 한 묶음(첨부로 못 붙는다 — 링크). sizes 는 현장마다의 바이트 합, 돌려주는 것은 현장 자리의 묶음들.
 * zip 의 머리말(파일마다 백 바이트 남짓)을 생각해 한도의 99% 로 센다.
 */
export function packSites(sizes: number[], limit: number): number[][] {
  const cap = Math.floor(limit * 0.99);
  const parts: number[][] = [];
  let cur: number[] = [];
  let sum = 0;
  sizes.forEach((n, i) => {
    if (cur.length && sum + n > cap) {
      parts.push(cur);
      cur = [];
      sum = 0;
    }
    cur.push(i);
    sum += n;
  });
  if (cur.length) parts.push(cur);
  return parts;
}

const SLOTS: DocSlot[] = [
  ...DOC_KEYS.map((key) => ({ table: 'contract' as const, key, name: docNameOf(key) ?? key })),
  ...PROCESS_DOCS.map((d) => ({ table: 'process' as const, key: d.key, name: d.name })),
];

/** 이름 견주기 — 띄어쓰기 · 괄호 안을 뺀다(「설치승인서 (현대엔지니어링)」 → 「설치승인서」) */
const bare = (s: string) => s.replace(/\([^)]*\)/g, '').replace(/\s+/g, '').toLowerCase();
const flat = (s: string) => s.replace(/[\s()]+/g, '').toLowerCase();

/**
 * 담당이 말한 서류 이름 → 칸. 키 그대로 · 괄호 뺀 이름이 같은 것 · 이름에 든 것 순으로 찾고, 여럿이면 후보를 적어 되묻게 한다.
 */
export function docSlotOf(ref: string): DocSlot | { error: string } {
  const r = ref.trim();
  if (!r) return { error: '서류 이름이 비었다.' };
  const byKey = SLOTS.find((s) => s.key === r);
  if (byKey) return byKey;
  /* 괄호까지 같은 이름이 먼저 — 「견적서」는 「견적서 (SK)」가 아니라 「견적서」 */
  const full = SLOTS.filter((s) => flat(s.name) === flat(r));
  if (full.length === 1) return full[0];
  const exact = full.length ? full : SLOTS.filter((s) => bare(s.name) === bare(r));
  if (exact.length === 1) return exact[0];
  const near = exact.length ? exact : SLOTS.filter((s) => flat(s.name).includes(flat(r)));
  if (near.length === 1) return near[0];
  if (near.length === 0) return { error: `「${r}」 서류 칸을 찾지 못했다 — 서류 이름을 콘솔의 칸 이름대로 쓴다.` };
  return { error: `「${r}」에 맞는 서류 칸이 여럿이다: ${near.map((s) => s.name).join(' · ')} — 하나를 골라 그 이름으로 쓴다.` };
}

/** 칸의 짧은 이름 — 괄호 안(운영사 · 갈래 표시)을 뺀다: 「설치승인서 (현대엔지니어링)」 → 「설치승인서」 */
export const shortName = (slot: DocSlot): string => slot.name.replace(/\s*\([^)]*\)/g, '').trim() || slot.name;

/** 파일 이름에 못 쓰는 글자 */
const safe = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * zip 안의 이름 — 「HB-2026-270 호남신학대학교 - 설치승인서.pptx」. 현장에 파일이 여럿이면 「… (2).pptx」, 확장자는 원래 파일의 것.
 * used 에 쓴 이름을 쌓는다(lib/files uniqueFileName 과 같은 결).
 */
export function bundleEntryName(
  site: { mgmtNo: string | null; name: string }, slot: DocSlot, fileName: string, used: Set<string>,
): string {
  const dot = fileName.lastIndexOf('.');
  const ext = dot > 0 && fileName.length - dot <= 8 ? fileName.slice(dot).toLowerCase() : '';
  const base = safe(`${site.mgmtNo ?? ''} ${site.name} - ${shortName(slot)}`);
  let candidate = `${base}${ext}`;
  for (let n = 2; used.has(candidate); n += 1) candidate = `${base} (${n})${ext}`;
  used.add(candidate);
  return candidate;
}

/** zip 이름 — 「설치승인서 16개소.zip」, 나뉘었으면 「설치승인서 4개소 (1).zip」 */
export const bundleZipName = (slot: DocSlot, sites: number, part?: { index: number; total: number }): string =>
  `${safe(shortName(slot))} ${sites}개소${part && part.total > 1 ? ` (${part.index})` : ''}.zip`;

/** 첨부로 붙일 수 있는가 — 메일 한 통의 첨부 합계(25MB) 안이면. 넘으면 본문의 내려받기 링크로 */
export const attachable = (bytes: number, otherBytes = 0): boolean => bytes + otherBytes <= MAIL_LIMITS.attachBytes;

/** 크기 글자 — 1.2MB · 340KB */
export function sizeText(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1048576).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

/** 첨부로 못 붙는 묶음을 링크로 보낼 때 본문 끝에 붙는 줄 */
export const bundleLinkLines = (zip: { name: string; url: string; size: number }): string =>
  `\n\n첨부 파일이 커서(${sizeText(zip.size)}) 내려받기 링크로 보내드립니다.\n${zip.name}: ${zip.url}`;

/** 묶음 하나 — 올린 zip(id 는 그 자리의 무작위 마디 — draft_mail 의 attach_bundle_ids) · 든 현장 · 상한을 넘었나 */
export interface BundlePart {
  id: string;
  zip: { name: string; url: string; size: number; contentType: string };
  sites: Array<{ mgmtNo: string | null; name: string; files: number }>;
  /** 한 현장만으로 상한을 넘은 묶음 — 첨부로 못 붙는다(링크) */
  over: boolean;
}

/** 묶은 결과 — 담당에게 돌려줄 말에 쓴다 */
export interface BundleResult {
  slot: DocSlot;
  /** 한 묶음의 상한(바이트) */
  limit: number;
  parts: BundlePart[];
  /** 그 칸에 파일이 없어 뺀 현장 */
  missing: string[];
  /** 찾지 못한 관리번호 */
  unknown: string[];
  /** 다른 운영사 현장이라 뺀 것(운영사 담당은 제 운영사 현장만) */
  otherCpo: string[];
}

const siteLabel = (s: { mgmtNo: string | null; name: string }) => `${s.mgmtNo ?? ''} ${s.name}`.trim();

/** bundle_site_docs 의 답 — 묶음마다 id · zip · 크기 · 든 현장, 그리고 뺀 것. 담당은 이것으로 묶음마다 한 통씩 쓴다 */
export function bundleText(b: BundleResult): string {
  const total = b.parts.reduce((n, p) => n + p.sites.length, 0);
  const head = b.parts.length > 1
    ? `${shortName(b.slot)} ${total}곳을 한 통 ${sizeText(b.limit)} 안으로 ${b.parts.length}묶음으로 나눴다 — 묶음마다 메일 한 통씩(draft_mail attach_bundle_ids) 쓴다.`
    : `${shortName(b.slot)} ${total}곳을 한 묶음으로 묶었다 — draft_mail 의 attach_bundle_ids 로 붙인다.`;
  return [
    head,
    ...b.parts.map((p, i) => `묶음 ${i + 1}/${b.parts.length} (id=${p.id}) 「${p.zip.name}」 ${sizeText(p.zip.size)} — `
      + `${p.sites.length}곳: ${p.sites.map(siteLabel).join(', ')}`
      + (p.over ? ` — 한 현장만으로 ${sizeText(b.limit)}를 넘어 첨부로 못 붙는다. 이 묶음은 link_bundle_ids 로 본문에 링크를 단다` : '')),
    b.missing.length ? `그 칸에 파일이 없어 뺀 현장: ${b.missing.join(', ')}` : '',
    b.unknown.length ? `찾지 못한 관리번호: ${b.unknown.join(', ')}` : '',
    b.otherCpo.length ? `다른 운영사 현장이라 뺀 것: ${b.otherCpo.join(', ')}` : '',
  ].filter(Boolean).join('\n');
}

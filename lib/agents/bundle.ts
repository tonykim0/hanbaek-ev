/**
 * 여러 현장의 같은 서류를 zip 하나로 — 메일 초안에 붙인다 (순수 — 저장소 · 네트워크를 안 끌어온다. 받아 묶고 올리는 일은 bundle-run).
 *
 * 한백 2026-11-05 「콘솔 프로젝트마다 저장되어있는 파일을 한꺼번에 불러와서 압축해서 이메일로 보내고 싶은데 안되나보네. 방법
 * 찾아봐줘」 → 「응 진행해」. 현대엔지니어링 담당이 16개소 설치승인서를 한 통으로 보내려다 「제가 메일에 붙일 수 있는 건 이 대화창에
 * 올려 주신 파일뿐」이라고 멈췄다 — 현장 서류는 양식 메일(현장마다 한 통)만 붙일 수 있었고, 메일 한 통의 첨부는 10개 · 25MB 까지다.
 *
 * 그래서 담당의 draft_mail 에 site_docs(현장 관리번호들 + 서류 이름)를 둔다: 콘솔이 현장마다 그 칸의 파일을 받아 zip 하나로 묶고,
 * 25MB 안이면 첨부로, 넘으면 본문 끝의 내려받기 링크로 단다(다음 메일의 대용량 첨부와 같은 결). 나가는 것은 여전히 한백의
 * 「승인하고 보내기」뿐이다.
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

/** zip 이름 — 「설치승인서 16개소.zip」 */
export const bundleZipName = (slot: DocSlot, sites: number): string =>
  `${safe(shortName(slot))} ${sites}개소.zip`;

/** 첨부로 붙일 수 있는가 — 메일 한 통의 첨부 합계(25MB) 안이면. 넘으면 본문의 내려받기 링크로 */
export const attachable = (bytes: number, otherBytes = 0): boolean => bytes + otherBytes <= MAIL_LIMITS.attachBytes;

/** 크기 글자 — 1.2MB · 340KB */
export function sizeText(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1048576).toFixed(1)}MB`;
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
}

/** 25MB 를 넘어 링크로 보낼 때 본문 끝에 붙는 줄 */
export const bundleLinkLines = (zip: { name: string; url: string; size: number }): string =>
  `\n\n첨부 파일이 커서(${sizeText(zip.size)}) 내려받기 링크로 보내드립니다.\n${zip.name}: ${zip.url}`;

/** 묶은 결과 — 담당에게 돌려줄 말에 쓴다 */
export interface BundleResult {
  slot: DocSlot;
  zip: { name: string; url: string; size: number; contentType: string };
  /** 묶은 현장 — 관리번호 · 이름 · 파일 수 */
  included: Array<{ mgmtNo: string | null; name: string; files: number }>;
  /** 그 칸에 파일이 없어 뺀 현장 */
  missing: string[];
  /** 찾지 못한 관리번호 */
  unknown: string[];
  /** 다른 운영사 현장이라 뺀 것(운영사 담당은 제 운영사 현장만) */
  otherCpo: string[];
}

/** 담당에게 돌려줄 한 줄 — 무엇을 묶었고 무엇을 뺐나 */
export function bundleSummary(b: BundleResult, how: 'attach' | 'link'): string {
  const files = b.included.reduce((n, s) => n + s.files, 0);
  return [
    `${shortName(b.slot)} ${b.included.length}곳 · 파일 ${files}개를 「${b.zip.name}」(${sizeText(b.zip.size)})로 묶어 `
      + (how === 'attach' ? '첨부로 붙였다' : `25MB 를 넘어 본문 끝에 내려받기 링크로 달았다`),
    b.missing.length ? `그 칸에 파일이 없어 뺀 현장: ${b.missing.join(', ')}` : '',
    b.unknown.length ? `찾지 못한 관리번호: ${b.unknown.join(', ')}` : '',
    b.otherCpo.length ? `다른 운영사 현장이라 뺀 것: ${b.otherCpo.join(', ')}` : '',
  ].filter(Boolean).join('. ');
}

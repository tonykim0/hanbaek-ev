/**
 * 기설치 이력 엑셀 ↔ 증빙 대조를 돌린다 — 한 곳 (서버 전용).
 *
 * 한백 지시 2026-10-06 「기설치 이력엑셀에 있는 수치와 증빙자료가 맞는지도 검증」 · 2026-10-07 「접수단계에서 자동으로」.
 * 엑셀은 코드가 읽고(lib/legacy-sheet), 증빙은 판독이 숫자만 읽고(lib/legacy-evidence), 맞는지는 코드가 가른다
 * (lib/preinstall-check). 부르는 곳 둘:
 *   · 한백이 「대조」를 누를 때 — app/api/projects/[id]/preinstall/check
 *   · ★접수 단계에서 저절로★ — 설치이력·증빙 칸에 파일이 들고 날 때와 협력사가 「계약서 접수」를 누를 때
 *     (schedulePreInstallCheck). 판독이 20~40초라 접수를 기다리게 하지 않고 응답 뒤에 돈다(lib/background).
 * 반려(직인 없음 보완요청 등)는 여전히 결과를 보고 사람이 누른다 — 판독이 틀린 반려가 협력사에게 저절로 가지 않게.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { documents } from '@/lib/db/schema';
import { getRepository } from '@/lib/data';
import type { Actor } from '@/lib/data/repository';
import { loadPreInstallCheck } from '@/lib/data/store/preinstall-check';
import { readLegacySheet, type LegacySheet } from '@/lib/legacy-sheet';
import { readEvidence, readSheetScans } from '@/lib/legacy-evidence';
import {
  CHECKED_KINDS, checkedFilesOf, compareLegacy, sameFiles, sealOf, subsidyOnly, type PreInstallCheck, type SheetScan,
} from '@/lib/preinstall-check';
import { background } from '@/lib/background';
import type { DocFile, ProjectDetail } from '@/types/project';

/** 칸 안에서 이름이 겹치면 판독의 답을 파일에 되짚을 수 없다 — 뒤에 번호를 붙인다 */
function named(files: DocFile[]): { name: string; url: string }[] {
  const seen = new Map<string, number>();
  return files.map((f) => {
    const n = (seen.get(f.name) ?? 0) + 1;
    seen.set(f.name, n);
    return { url: f.url, name: n === 1 ? f.name : f.name.replace(/(\.[^.]+)?$/, ` (${n})$1`) };
  });
}

async function fetchFile(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`파일을 읽지 못했습니다 (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

/** 여럿을 받는다 — 한 장을 못 받아도 대조를 멈추지 않고 그 장을 「못 읽음」으로 돌려준다 */
async function fetchAll(files: { name: string; url: string }[]): Promise<{ got: { name: string; buffer: Buffer }[]; failed: string[] }> {
  const got: { name: string; buffer: Buffer }[] = [];
  const failed: string[] = [];
  for (const f of files) {
    try { got.push({ name: f.name, buffer: await fetchFile(f.url) }); } catch { failed.push(f.name); }
  }
  return { got, failed };
}

export async function runPreInstallCheck(detail: ProjectDetail): Promise<PreInstallCheck> {
  const p = detail.project;
  const docOf = (kind: string) => detail.documents.find((d) => d.kind === kind);
  const logFiles = docOf('legacylog')?.files ?? [];
  const evFiles = docOf('legacyev')?.files ?? [];
  const base: PreInstallCheck = {
    checkedAt: new Date().toISOString(),
    files: [...logFiles, ...evFiles].map((f) => f.url),
    sheetFile: null, sheet: null, lines: [], standing: null, survey: null, unread: [], problem: null,
  };

  if (logFiles.length === 0) return { ...base, problem: '설치이력 엑셀이 없습니다.' };
  const sheets = logFiles.filter((f) => /\.xlsx$/i.test(f.name));
  /* 엑셀 말고 칸에 온 것 — 출력해 날인하고 스캔한 설치이력(날인본)이다. 직인을 여기서 본다 */
  const scanFiles = named(logFiles.filter((f) => !/\.xlsx$/i.test(f.name)));
  const sheetFile = sheets[0]?.name ?? null;

  let sheet: LegacySheet | null = null;
  let problem: string | null = null;
  if (sheets.length > 1) problem = `설치이력 엑셀이 ${sheets.length}개입니다 — 한 장만 남겨주세요.`;
  else if (sheets.length === 1) {
    try {
      sheet = await readLegacySheet(await fetchFile(sheets[0].url));
    } catch (err) {
      problem = (err as Error).message;
    }
  }

  /*
   * 직인은 기설치가 없을 때만 본다(sealOf) — 엑셀이 기설치 있음을 말하면 스캔본을 읽을 까닭이 없다.
   * 엑셀이 없으면 스캔본이 「없음」인지부터 판독이 읽는다.
   */
  const needScans = scanFiles.length > 0 && (!sheet || sheet.rows.every((r) => !r.d));
  let scans: SheetScan[] = [];
  let scanUnread: string[] = [];
  if (needScans) {
    const { got, failed } = await fetchAll(scanFiles);
    const read = await readSheetScans(got);
    scans = read.scans;
    scanUnread = [...failed, ...read.unread];
  }
  const seal = sealOf(sheet, scans, sheetFile);

  if (!sheet) {
    // 스캔본만 낸 「이력 없음」은 견줄 줄이 없다 — 엑셀이 아니라고 짚지 않는다
    if (!problem && !(sheets.length === 0 && seal)) problem = '설치이력이 엑셀(.xlsx)이 아니라 줄 대조를 못 했습니다.';
    return { ...base, sheetFile, problem, seal, unread: scanUnread };
  }

  const ctx = {
    survey: { state: p.preInstall, checked: p.preChecked },
    // 이 날 뒤의 행위신고는 이번 설치 건이다 — 접수 선언이 없는 옛 현장은 확인일로 받친다
    since: p.contractSubmittedAt ?? p.contractConfirmedAt ?? null,
  };
  const sheetFacts = { standing: sheet.standing, final: sheet.final, badSplit: sheet.badSplit, none: sheet.none };

  /*
   * ★모든 줄이 보조사업(사업연도·대기번호)이면 증빙을 읽지 않는다★ (한백 지시 2026-10-08 「별도의 증빙자료 필요없으므로
   * 검수 불필요」). 판독 값도 시간도 들지 않는다 — 줄은 다 「보조사업 · 증빙 면제」로 서고 계약 확인을 막지 않는다.
   */
  if (subsidyOnly(sheet)) {
    return { ...base, sheetFile, sheet: sheetFacts, ...compareLegacy(sheet, [], ctx), seal, unread: scanUnread, subsidyOnly: true };
  }

  const { got: evGot, failed: evFailed } = await fetchAll(named(evFiles));
  const { acts, unread: evUnread } = await readEvidence(evGot);
  const unread = [...evFailed, ...evUnread];
  return {
    ...base,
    sheetFile,
    sheet: sheetFacts,
    ...compareLegacy(sheet, acts, ctx),
    seal,
    unread: [...unread, ...scanUnread],
  };
}


/** 저절로 돈 대조를 남기는 이름 — 감사 기록·「대조한 사람」에 사람 대신 선다 */
const AUTO: Actor = { id: 'system', name: '자동 대조', role: 'admin', org: null };
/** 연달아 올라오는 파일(증빙 여러 장)을 기다리는 시간 — 마지막 올림 하나만 돈다 */
const SETTLE_MS = 8_000;

const isChecked = (kind: string) => (CHECKED_KINDS as readonly string[]).includes(kind);

/** 지금 설치이력·증빙 칸의 파일 주소 */
async function currentFiles(projectId: string): Promise<{ all: string[]; hasLog: boolean }> {
  const docs = await getDb().select({ kind: documents.kind, files: documents.files }).from(documents)
    .where(and(eq(documents.projectId, projectId), inArray(documents.kind, [...CHECKED_KINDS])));
  const list = docs.map((d) => ({ kind: d.kind, files: (d.files ?? []) as DocFile[] }));
  return { all: checkedFilesOf(list), hasLog: list.some((d) => d.kind === 'legacylog' && d.files.length > 0) };
}

/**
 * ★접수 단계에서 저절로 대조한다★ (한백 지시 2026-10-07) — 응답을 보낸 뒤에 돈다.
 *
 * 여러 장을 연달아 올리면 올림마다 불린다. 그래서 잠깐 기다렸다가 ★그때도 칸이 같을 때만★ 돈다 — 그새 또
 * 올라왔으면 그 올림이 돈다(마지막 하나만). 이미 이 서류로 대조했으면 다시 돌지 않는다(한백이 누른 것 포함).
 * 도는 사이 서류가 바뀌었으면 결과를 버린다 — 뒤의 올림이 다시 돈다.
 *
 * @param kind 바뀐 칸 — 설치이력·증빙이 아니면 할 일이 없다. 없으면(계약서 접수) 칸을 가리지 않는다.
 */
export function schedulePreInstallCheck(projectId: string, kind?: string, settleMs = SETTLE_MS): Promise<void> | void {
  if (kind && !isChecked(kind)) return;
  return background((async () => {
    const before = await currentFiles(projectId);
    if (!before.hasLog) return;
    await new Promise((r) => setTimeout(r, settleMs));
    const now = await currentFiles(projectId);
    if (!sameFiles(before.all, now.all) || !now.hasLog) return;
    const prev = await loadPreInstallCheck(projectId);
    if (prev && sameFiles(prev.files, now.all)) return;
    const repo = getRepository();
    const detail = await repo.getProject(projectId, { role: AUTO.role, org: null });
    if (!detail) return;
    const check = await runPreInstallCheck(detail);
    if (!sameFiles(check.files, (await currentFiles(projectId)).all)) return;
    await repo.savePreInstallCheck(projectId, check, AUTO);
  })(), `preinstall-auto ${projectId}`);
}

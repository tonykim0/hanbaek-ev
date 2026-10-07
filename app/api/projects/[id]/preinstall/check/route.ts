/**
 * POST /api/projects/[id]/preinstall/check — 기설치 이력 엑셀 ↔ 증빙 대조 [한백 전용]
 *
 * 한백 지시 2026-10-06 「기설치 이력엑셀에 있는 수치와 증빙자료가 맞는지도 검증」.
 * 엑셀은 코드가 읽고(lib/legacy-sheet), 증빙은 판독이 숫자만 읽고(lib/legacy-evidence),
 * 맞는지는 코드가 가른다(lib/preinstall-check). 결과는 저장해 현장 상세가 다시 보여준다.
 *
 * 접수가 아니라 여기서 한백이 눌러 돌린다 — 판독이 20~40초 걸려 접수를 느리게 만들지 않으려는
 * 것이고(CLAUDE.md 「접수 서류를 열어보지 않고 믿을 수 있게」 ⓑ), 반려는 결과를 보고 사람이 누른다.
 */
import { getRepository } from '@/lib/data';
import { adminWrite } from '@/lib/api/write-route';
import { readLegacySheet, type LegacySheet } from '@/lib/legacy-sheet';
import { readEvidence, readSheetScans } from '@/lib/legacy-evidence';
import { compareLegacy, sealOf, type PreInstallCheck, type SheetScan } from '@/lib/preinstall-check';
import type { DocFile, ProjectDetail } from '@/types/project';

/** 판독까지 도는 경로라 길다 — 접수 ZIP 과 같은 예산 */
export const maxDuration = 300;

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

async function runCheck(detail: ProjectDetail): Promise<PreInstallCheck> {
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

  const { got: evGot, failed: evFailed } = await fetchAll(named(evFiles));
  const { acts, unread: evUnread } = await readEvidence(evGot);
  const unread = [...evFailed, ...evUnread];
  return {
    ...base,
    sheetFile,
    sheet: { standing: sheet.standing, final: sheet.final, badSplit: sheet.badSplit, none: sheet.none },
    ...compareLegacy(sheet, acts, {
      survey: { state: p.preInstall, checked: p.preChecked },
      // 이 날 뒤의 행위신고는 이번 설치 건이다 — 접수 선언이 없는 옛 현장은 확인일로 받친다
      since: p.contractSubmittedAt ?? p.contractConfirmedAt ?? null,
    }),
    seal,
    unread: [...unread, ...scanUnread],
  };
}

export const POST = adminWrite<{ id: string }, undefined>(
  '한백 관리자만 기설치를 대조할 수 있습니다.',
  async ({ params, actor }) => {
    const repo = getRepository();
    const detail = await repo.getProject(params.id, actor);
    if (!detail) throw new Error('현장을 찾을 수 없습니다.');
    const check = await runCheck(detail);
    await repo.savePreInstallCheck(params.id, check, actor);
    return { check };
  }
);

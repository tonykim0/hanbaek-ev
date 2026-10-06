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
import { readLegacySheet } from '@/lib/legacy-sheet';
import { readEvidence } from '@/lib/legacy-evidence';
import { compareLegacy, type PreInstallCheck } from '@/lib/preinstall-check';
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

  const sheets = logFiles.filter((f) => /\.xlsx$/i.test(f.name));
  if (logFiles.length === 0) return { ...base, problem: '설치이력 엑셀이 없습니다.' };
  if (sheets.length === 0) return { ...base, problem: '설치이력이 엑셀(.xlsx)이 아니라 읽지 못했습니다.' };
  if (sheets.length > 1) return { ...base, problem: `설치이력 엑셀이 ${sheets.length}개입니다 — 한 장만 남겨주세요.` };

  const sheetFile = sheets[0].name;
  let sheet;
  try {
    sheet = await readLegacySheet(await fetchFile(sheets[0].url));
  } catch (err) {
    return { ...base, sheetFile, problem: (err as Error).message };
  }

  const ev = named(evFiles);
  const { acts, unread } = await readEvidence(
    await Promise.all(ev.map(async (f) => ({ name: f.name, buffer: await fetchFile(f.url) })))
  );
  return {
    ...base,
    sheetFile,
    sheet: { standing: sheet.standing, final: sheet.final, badSplit: sheet.badSplit, none: sheet.none },
    ...compareLegacy(sheet, acts, {
      survey: { state: p.preInstall, checked: p.preChecked },
      // 이 날 뒤의 행위신고는 이번 설치 건이다 — 접수 선언이 없는 옛 현장은 확인일로 받친다
      since: p.contractSubmittedAt ?? p.contractConfirmedAt ?? null,
    }),
    unread,
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

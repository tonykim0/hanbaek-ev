/**
 * 현장 양식 메일을 실제로 쓰는 곳 (서버 전용) — 서류 칸의 파일을 붙일 초안으로 만들고(Blob 에 크기를 묻는다) 저장소에 넘긴다.
 * 무엇을 · 언제 · 어떻게 말하는지는 lib/site-mail(순수)이고, 쓰는 일은 store/agent-mail siteMail 이다. 부르는 곳 셋:
 *   · 계약서 접수 — scheduleSiteMailIntake(app/api/projects/[id]/contract-submit). 응답 뒤에 돈다(lib/background) — 그 담당이
 *     할 일 · 초안 · 대화 한 줄을 남기고, 붙일 서류가 없으면 한백 관리자에게 알린다.
 *   · 한백이 그 담당에게 다시 요청할 때 — lib/agents/brain 의 site_mail 도구(app/api/agents/[id]/reply)
 *   · 나이스 제출 정보 밑 「계약서 초안 메일」 단추 — app/api/projects/[id]/nice-draft-mail
 * 나이스는 쓰기 전에 결과서 6번(제출 정보 7번)을 읽는다 — 이미 이 결과서로 읽었으면 다시 안 읽는다(ensureConsultDup).
 */
import { getRepository } from '@/lib/data';
import { background } from '@/lib/background';
import { AUTO } from '@/lib/check-kit';
import { ensureConsultDup } from '@/lib/consult-dup-run';
import { NICE_DRAFT_MAIL } from '@/lib/nice-submit';
import { emptyFieldsOf, siteMailOfCpo, type SiteMailSpec } from '@/lib/site-mail';
import type { Actor, SiteDocFile, SiteMailResult } from '@/lib/data/repository';
import type { ProjectDetail } from '@/types/project';

const FILE_TYPES: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  hwpx: 'application/hwp+zip',
  hwp: 'application/x-hwp',
  pdf: 'application/pdf',
  // 현대엔지니어링 설치승인서는 거의 파워포인트로 온다(이 Mac 의 실제 104장 중 103장)
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

/** Blob 에 크기와 형식을 묻는다 — 못 물으면 크기 0(한도 셈에서 빠진다) · 형식은 확장자로 */
async function headOf(url: string, name: string): Promise<{ size: number; contentType: string | null }> {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(10_000) });
    const size = Number(res.headers.get('content-length') ?? 0);
    return { size: Number.isFinite(size) ? size : 0, contentType: FILE_TYPES[ext] ?? res.headers.get('content-type') };
  } catch {
    return { size: 0, contentType: FILE_TYPES[ext] ?? null };
  }
}

const qtyOf = (detail: ProjectDetail) => detail.lines.reduce((n, l) => n + l.qty, 0);

/** 지금 서류로 쓴 초안 — 붙일 서류 칸이 비었으면 null */
export async function siteLetterOf(
  spec: SiteMailSpec, detail: ProjectDetail,
): Promise<{ subject: string; body: string; docFiles: SiteDocFile[] } | null> {
  const files = (detail.documents.find((d) => d.kind === spec.slot)?.files ?? []).filter((f) => f.url);
  if (files.length === 0) return null;
  const docFiles: SiteDocFile[] = [];
  for (const f of files) docFiles.push({ name: f.name, url: f.url, ...(await headOf(f.url, f.name)) });
  return { ...spec.letter(detail.project, qtyOf(detail)), docFiles };
}

/** 나이스면 결과서 6번을 먼저 — 새로 읽었으면 현장을 다시 받는다(7번이 바뀌었다) */
async function readyDetail(spec: SiteMailSpec, detail: ProjectDetail, viewer: { role: Actor['role']; org: string | null }) {
  if (spec.kind !== NICE_DRAFT_MAIL) return detail;
  if (!(await ensureConsultDup(detail.project.id, detail.project.consultDup))) return detail;
  return (await getRepository().getProject(detail.project.id, viewer)) ?? detail;
}

/** 저절로 한 일의 이름 — 감사기록에 그 담당이 선다(사람이 아니다) */
const autoActor = (spec: SiteMailSpec): Actor => ({ id: AUTO.id, name: `${spec.cpo} 담당`, role: 'admin', org: null });

/**
 * 계약서가 접수됐을 때 — 그 운영사에 양식 메일이 있으면 그 담당이 할 일 · 초안 · 대화 한 줄을 남긴다(서류가 없으면 알림까지).
 * 양식이 없는 운영사거나, 응답 뒤에 도는 사이 접수가 풀렸으면 아무것도 안 하고 null.
 */
export async function runSiteMailIntake(projectId: string): Promise<SiteMailResult | null> {
  const viewer = { role: AUTO.role, org: null };
  const found = await getRepository().getProject(projectId, viewer);
  const spec = siteMailOfCpo(found?.project.cpo);
  if (!found || !spec || !found.project.contractSubmittedAt) return null;
  const detail = await readyDetail(spec, found, viewer);
  const letter = await siteLetterOf(spec, detail);
  return getRepository().siteMail({
    kind: spec.kind, projectId, letter, intake: { empty: emptyFieldsOf(spec, detail.project, qtyOf(detail)) },
  }, autoActor(spec));
}

/** ★계약서 접수 때 저절로★ — 응답을 보낸 뒤에 돈다. 양식이 없는 운영사면 runSiteMailIntake 가 바로 끝난다 */
export function scheduleSiteMailIntake(projectId: string): Promise<void> {
  return background(runSiteMailIntake(projectId), `site-mail ${projectId}`);
}

/**
 * 한백이 (다시) 요청할 때 — 지금 서류로 초안을 쓴다(같은 서류로 이미 보냈어도 다시 쓴다 · 보내지 않은 같은 초안이 있으면 그것).
 * 붙일 서류가 없으면 사람 말로 던진다(「설치승인서가 없습니다 — 먼저 올려 주세요.」). expect 를 주면 그 양식의 현장만 받는다.
 */
export async function requestSiteMail(projectId: string, actor: Actor, expect?: SiteMailSpec): Promise<SiteMailResult> {
  const viewer = { role: actor.role, org: actor.org };
  const found = await getRepository().getProject(projectId, viewer);
  if (!found) throw new Error('현장을 찾을 수 없습니다.');
  const spec = siteMailOfCpo(found.project.cpo);
  if (!spec || (expect && spec.kind !== expect.kind)) {
    throw new Error(expect ? `${expect.cpo} 현장이 아닙니다.` : '이 현장의 운영사에는 양식 메일이 없습니다.');
  }
  const detail = await readyDetail(spec, found, viewer);
  const letter = await siteLetterOf(spec, detail);
  return getRepository().siteMail({ kind: spec.kind, projectId, letter, intake: null }, actor);
}

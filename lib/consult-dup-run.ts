/**
 * 사전현장컨설팅 결과서 「6. 중복설치」를 읽어 현장에 남긴다 — 한 곳 (서버 전용 · 한백 지시 2026-11-03).
 *
 * 무엇을 어떻게 읽는지는 lib/consult-dup(순수)이고, 여기는 결과서 칸의 파일을 받아 판독에 보내고 남기는 일이다.
 * 부르는 곳 둘 — 건축물대장 대조(lib/parking-run)와 같은 결이다:
 *   · ★저절로★ — 결과서 칸에 파일이 들고 날 때와 협력사가 「계약서 접수」를 누를 때(scheduleConsultDup). 판독이 수십 초라
 *     응답 뒤에 돈다(lib/background). 잠깐 기다렸다가 그때도 칸이 같을 때만 돌고, 이미 이 파일들로 읽었으면 다시 안 돈다.
 *   · 한백이 제출 정보의 「결과서에서 다시 읽기」를 누를 때 — app/api/projects/[id]/consult-dup.
 * 실측(2026-11-03, 이 Mac 의 실제 결과서 5장): 6번을 다 찾았고 눈으로 본 두 장(숲속마을벨라시온 완속 5 · 도곡우성 해당사항 없음)이
 * 서류와 같았다. 체크 안 된 칸에 적힌 「0」(키오스크)은 판독이 체크 없음으로 읽어 빠진다.
 */
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { documents } from '@/lib/db/schema';
import { getRepository } from '@/lib/data';
import { askPdfJson, preparePdfs } from '@/lib/vision-ask';
import { background } from '@/lib/background';
import { AUTO, fetchAll, named, SETTLE_MS } from '@/lib/check-kit';
import { CONSULT_DUP_PROMPT, consultDupOf, sameDupFiles, type ConsultDup } from '@/lib/consult-dup';
import type { Actor } from '@/lib/data/repository';
import type { DocFile } from '@/types/project';

/** 결과서 칸의 서류 종류 */
export const CONSULT_SLOT = 'consult';

/** 지금 결과서 칸의 파일 */
async function consultFiles(projectId: string): Promise<DocFile[]> {
  const [doc] = await getDb().select({ files: documents.files }).from(documents)
    .where(and(eq(documents.projectId, projectId), eq(documents.kind, CONSULT_SLOT)));
  return ((doc?.files ?? []) as DocFile[]).filter((f) => f.url);
}

/**
 * 지금 결과서 칸의 파일로 읽는다 — 6번을 못 찾으면 found:false 로 남긴다(같은 파일로 다시 묻지 않게). 칸이 비었으면 아무것도 안 하고 null.
 * 도는 사이 칸의 파일이 바뀌었으면 남기지 않는다(다음 바뀜이 다시 부른다).
 */
export async function readConsultDupNow(projectId: string, actor: Actor = AUTO): Promise<ConsultDup | null> {
  const files = await consultFiles(projectId);
  if (files.length === 0) return null;
  const { got } = await fetchAll(named(files));
  const { batches } = await preparePdfs(got, 'consult-dup');
  let read: Pick<ConsultDup, 'none' | 'items'> | null = null;
  for (const batch of batches) {
    read = consultDupOf(await askPdfJson(batch, CONSULT_DUP_PROMPT, 'consult-dup'));
    if (read) break;
  }
  const urls = files.map((f) => f.url);
  const value: ConsultDup = {
    found: read !== null, none: read?.none ?? false, items: read?.items ?? {}, files: urls, readAt: new Date().toISOString(),
  };
  if (!sameDupFiles(value, (await consultFiles(projectId)).map((f) => f.url))) return null;
  await getRepository().saveConsultDup(projectId, value, actor);
  return value;
}

/**
 * ★접수 단계에서 저절로 읽는다★ — 응답을 보낸 뒤에 돈다.
 * @param kind 바뀐 칸 — 결과서 칸이 아니면 할 일이 없다. 없으면(계약서 접수) 칸을 가리지 않는다.
 */
export function scheduleConsultDup(projectId: string, kind?: string, settleMs = SETTLE_MS): Promise<void> | void {
  if (kind && kind !== CONSULT_SLOT) return;
  return background((async () => {
    const before = (await consultFiles(projectId)).map((f) => f.url);
    if (before.length === 0) return;
    await new Promise((r) => setTimeout(r, settleMs));
    const now = (await consultFiles(projectId)).map((f) => f.url);
    if (now.length === 0 || !sameDupFiles({ files: before }, now)) return;
    const prev = (await getRepository().getProject(projectId, { role: AUTO.role, org: null }))?.project.consultDup ?? null;
    if (sameDupFiles(prev, now)) return; // 이 파일들로 이미 읽었다
    await readConsultDupNow(projectId);
  })(), `consult-dup ${projectId}`);
}

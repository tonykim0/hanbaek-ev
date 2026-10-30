/**
 * 건축물대장 대조(주차면·주소·발급일)를 돌린다 — 한 곳 (서버 전용).
 *
 * 한백 지시 2026-10-16 「계약단계에서 건축물대장에 대한 에이전트를 하나 더」. 건축물대장 칸(K-apt·공문이 같이 온다)·
 * 사전현장컨설팅 결과서·설치신청서의 주차면·열람용 여부·주소와 건축물대장 발급일을 판독이 읽고(lib/parking-read), 맞는지는
 * 코드가 가른다(lib/parking-check — 발급일은 현장의 계약접수일에 견준다). 부르는 곳 둘 — 기설치 대조(lib/preinstall-run)와 같다:
 *   · 한백이 「대조」를 누를 때 — app/api/projects/[id]/parking/check
 *   · ★접수 단계에서 저절로★ — 세 칸에 파일이 들고 날 때와 협력사가 「계약서 접수」를 누를 때(scheduleParkingCheck).
 *     판독이 수십 초라 접수를 기다리게 하지 않고 응답 뒤에 돈다(lib/background). 이때는 바뀐 파일만 읽는다(reusableReads).
 * 반려(열람용 등)는 결과를 보고 사람이 누른다 — 판독이 틀린 반려가 협력사에게 저절로 가지 않게.
 */
import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { documents } from '@/lib/db/schema';
import { getRepository } from '@/lib/data';
import { loadParkingCheck } from '@/lib/data/store/parking-check';
import { evaluateDocs, buildDocContext } from '@/lib/doc-rules';
import { readParking } from '@/lib/parking-read';
import {
  judgeParking, outdatedCheck, PARKING_CHECK_VERSION, PARKING_SLOTS, parkingFilesOf, redatedCheck, reusableReads,
  sameParkingFiles, type ParkingCheck, type ParkingSlot,
} from '@/lib/parking-check';
import { background } from '@/lib/background';
import { AUTO, fetchAll, named, SETTLE_MS } from '@/lib/check-kit';
import type { DocFile, ProjectDetail } from '@/types/project';

/**
 * @param reuse 지난 결과 — 주면 같은 파일의 판독을 그대로 쓰고 바뀐 파일만 읽는다(자동 대조 · parking-check reusableReads).
 *   한백의 「다시 대조」는 주지 않는다 — 전부 새로 읽는다.
 */
export async function runParkingCheck(detail: ProjectDetail, reuse?: ParkingCheck | null): Promise<ParkingCheck> {
  const p = detail.project;
  const filesOf = (slot: ParkingSlot) => detail.documents.find((d) => d.kind === slot)?.files ?? [];
  const bySlot = PARKING_SLOTS.map((slot) => ({ slot, files: filesOf(slot) }));
  /* 이름은 세 칸을 통틀어 겹치지 않게 — 판독의 답을 파일(과 그 칸)에 되짚는다 */
  const all = named(bySlot.flatMap(({ slot, files }) => files.map((f) => ({ ...f, slot }))));

  /* 설치신청서는 환경부 사업의 필수 서류다 — 서류 규칙(doc-rules)이 정한 것을 그대로 본다 */
  const ctx = buildDocContext({
    cpo: p.cpo, contractParty: p.contractParty, bldgType: p.bldgType,
    projectPowerType: p.powerType, linePowerTypes: detail.lines.map((l) => l.powerType),
    preInstall: p.preInstall, bizType: p.bizType,
  });
  const applyRequired = evaluateDocs(ctx).some((d) => d.key === 'apply' && d.req === 'm');

  const { kept, toRead } = reusableReads(reuse, all);
  const { got, failed } = await fetchAll(toRead);
  const { reads: fresh, unread } = got.length > 0 ? await readParking(got) : { reads: [], unread: [] };
  // 칸·파일 차례로 — 다시 쓴 판독과 새로 읽은 판독이 섞여도 늘 같은 순서로 보인다
  const order = new Map(all.map((f, i) => [f.name, i]));
  const reads = [...kept, ...fresh].sort((a, b) => (order.get(a.file) ?? 0) - (order.get(b.file) ?? 0));
  const filed = Object.fromEntries(bySlot.map(({ slot, files }) => [slot, files.length > 0])) as Record<ParkingSlot, boolean>;

  return {
    checkedAt: new Date().toISOString(),
    files: all.map((f) => f.url),
    reads,
    // 발급일은 계약접수일(머리말의 그 칸 · createdAt)에 견준다 — 6번 규칙
    ...judgeParking(reads, { applyRequired, filed, receivedOn: p.createdAt }),
    unread: [...failed, ...unread],
    version: PARKING_CHECK_VERSION,
  };
}

const isParkingSlot = (kind: string) => (PARKING_SLOTS as readonly string[]).includes(kind);

/** 지금 세 칸의 파일 주소 */
async function currentFiles(projectId: string): Promise<string[]> {
  const docs = await getDb().select({ kind: documents.kind, files: documents.files }).from(documents)
    .where(and(eq(documents.projectId, projectId), inArray(documents.kind, [...PARKING_SLOTS])));
  return parkingFilesOf(docs.map((d) => ({ kind: d.kind, files: (d.files ?? []) as DocFile[] })));
}

/**
 * ★접수 단계에서 저절로 대조한다★ — 응답을 보낸 뒤에 돈다. 기설치 대조의 schedulePreInstallCheck 와 같은 규칙이다:
 * 잠깐 기다렸다가 그때도 칸이 같을 때만 돈다(여러 장을 연달아 올리면 마지막 올림 하나만) · 이미 이 서류로 대조했으면
 * 다시 돌지 않는다 · 도는 사이 서류가 바뀌었으면 결과를 버린다.
 *
 * @param kind 바뀐 칸 — 세 칸이 아니면 할 일이 없다. 없으면(계약서 접수) 칸을 가리지 않는다.
 */
export function scheduleParkingCheck(projectId: string, kind?: string, settleMs = SETTLE_MS): Promise<void> | void {
  if (kind && !isParkingSlot(kind)) return;
  return background((async () => {
    const before = await currentFiles(projectId);
    if (before.length === 0) return;
    await new Promise((r) => setTimeout(r, settleMs));
    const now = await currentFiles(projectId);
    if (!sameParkingFiles(before, now) || now.length === 0) return;
    const prev = await loadParkingCheck(projectId);
    const repo = getRepository();
    const detail = await repo.getProject(projectId, { role: AUTO.role, org: null });
    if (!detail) return;
    // 같은 서류로 이미 대조했으면 다시 안 돈다 — 견주는 것이 늘기 전의 결과거나 그 뒤 계약접수일을 고쳤으면 다시 돈다
    if (prev && sameParkingFiles(prev.files, now) && !outdatedCheck(prev)
      && !redatedCheck(prev, detail.project.createdAt)) return;
    // 바뀐 파일만 읽는다 — 계약접수일만 바뀐 것이면 판독 없이 다시 가른다
    const check = await runParkingCheck(detail, prev);
    if (!sameParkingFiles(check.files, await currentFiles(projectId))) return;
    await repo.saveParkingCheck(projectId, check, AUTO);
  })(), `parking-auto ${projectId}`);
}

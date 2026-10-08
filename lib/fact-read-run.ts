/**
 * 서류 칸의 파일에서 현장 정보 값을 읽어 넣는다 — 그 값이 비었을 때만 (한백 지시 2026-10-08). [서버 전용]
 *
 *   사업자등록증(bizreg) → 대표자(repName) · 계약서(contract) → 계약일(contractDate)   (lib/fact-read)
 *
 * 접수 판독이 이미 읽었으면(lib/intake-auto) 할 일이 없다. 판독이 못 읽었거나 접수 뒤에 그 서류가 들어온 현장을 이것이
 * 받친다. ★사람이 적은 값은 덮지 않는다★ — 읽기 직전과 쓰기 직전에 두 번 본다. 고치려면 현장 정보·머리말에서.
 */
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { documents, projects } from '@/lib/db/schema';
import { getRepository } from '@/lib/data';
import type { Actor } from '@/lib/data/repository';
import { background } from '@/lib/background';
import { CONTRACT_DATE_PROMPT, REP_NAME_PROMPT, contractDateReadOf, repNameReadOf } from '@/lib/fact-read';
import { askPdfJson, preparePdfs } from '@/lib/vision-ask';
import { splitPdf } from '@/lib/pdf-split';
import type { DocFile } from '@/types/project';

type Field = 'repName' | 'contractDate';

const READS: Record<string, { field: Field; prompt: string; parse: (raw: unknown) => string | null; pages: number; tag: string }> = {
  /* 사업자등록증은 한 장이다 — 묶음 스캔이 와도 앞 두 쪽만 */
  bizreg: { field: 'repName', prompt: REP_NAME_PROMPT, parse: repNameReadOf, pages: 2, tag: 'rep-name' },
  /* 계약일은 서명란 위다 — 운영사 계약서 넷 모두 앞 여섯 쪽 안이다(운영사 직인 읽기와 같은 범위, lib/cpo-seal-run) */
  contract: { field: 'contractDate', prompt: CONTRACT_DATE_PROMPT, parse: contractDateReadOf, pages: 6, tag: 'contract-date' },
};

/** 현장 정보 수정 기록에 사람 대신 서는 이름 */
const AUTO: Actor = { id: 'system', name: '자동 판독', role: 'admin', org: null };

/** 파일 한 장에서 그 칸의 값을 읽는다 — 못 읽으면 null */
export async function readFact(kind: keyof typeof READS & string, file: { name: string; buffer: Buffer }): Promise<string | null> {
  const r = READS[kind];
  const head = /\.pdf$/i.test(file.name)
    ? { ...file, buffer: await splitPdf(file.buffer, Array.from({ length: r.pages }, (_, i) => i + 1)) }
    : file;
  const { batches } = await preparePdfs([head], r.tag);
  if (batches.length === 0) return null;
  return r.parse(await askPdfJson(batches[0], r.prompt, r.tag));
}

async function valueNow(projectId: string, field: Field): Promise<string | null | undefined> {
  const [p] = await getDb().select({ v: projects[field] }).from(projects).where(eq(projects.id, projectId)).limit(1);
  return p ? p.v : undefined;
}

/** 값이 비었으면 그 칸의 파일을 차례로 읽어 처음 읽힌 값을 넣는다 — 넣은 값을 돌려준다 */
export async function fillFactNow(projectId: string, kind: string): Promise<string | null> {
  const r = READS[kind];
  if (!r || (await valueNow(projectId, r.field)) !== null) return null;
  const [d] = await getDb().select({ files: documents.files }).from(documents)
    .where(and(eq(documents.projectId, projectId), eq(documents.kind, kind))).limit(1);
  for (const f of ((d?.files ?? []) as DocFile[]).filter((x) => x?.url)) {
    try {
      const res = await fetch(f.url);
      if (!res.ok) throw new Error(`파일을 읽지 못했습니다 (${res.status})`);
      const value = await readFact(kind, { name: f.name, buffer: Buffer.from(await res.arrayBuffer()) });
      if (!value) continue;
      // 읽는 사이 사람이 적었으면 덮지 않는다
      if ((await valueNow(projectId, r.field)) !== null) return null;
      await getRepository().setProjectFacts(projectId, { [r.field]: value }, AUTO);
      return value;
    } catch (err) {
      console.warn(`[${r.tag}] ${projectId} ${f.name} 판독 실패`, err);
    }
  }
  return null;
}

/**
 * 그 칸에 파일이 올라왔으면 응답 뒤에 읽는다 — kind 가 없으면(접수 일괄) 받은 칸들 중 읽을 칸을 다 본다.
 * 칸마다 차례로 — 판독을 한꺼번에 보내면 연결이 끊긴 일이 있다(lib/cpo-seal-run).
 */
export function scheduleFactRead(projectId: string, kinds: string[]): Promise<void> | void {
  const todo = kinds.filter((k) => k in READS);
  if (todo.length === 0) return;
  return background((async () => {
    for (const k of todo) await fillFactNow(projectId, k);
  })(), `fact-read ${projectId}`);
}

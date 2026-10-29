/**
 * 서류 칸의 파일에서 현장 정보 값을 읽어 넣는다 — 그 값이 비었을 때만 (한백 지시 2026-10-08). [서버 전용]
 *
 *   사업자등록증(bizreg) → 대표자
 *   계약서(contract)     → 계약일 · 주소 · 담당자 · 연락처 · 이메일
 *   설치신청서(apply)    → 주소 · 주차면 · 연락처                       (물음과 다듬기는 lib/fact-read)
 *
 * 접수 판독이 이미 읽었으면(lib/intake-auto) 할 일이 없다. 판독이 못 읽었거나 접수 뒤에 그 서류가 들어온 현장을 이것이
 * 받친다 — 서류 두 장만 넣고 접수한 뒤 나머지를 칸마다 올린 현장의 주소가 영영 비어 있었다(HB-2026-282, 2026-10-29).
 * ★사람이 적은 값은 덮지 않는다★ — 읽기 직전과 쓰기 직전에 두 번 본다. 고치려면 현장 정보·머리말에서.
 *
 * 넣은 값은 그 파일 기록에 남긴다(DocFile.filled). 그 파일이 빠지면 아직 그 값 그대로인 칸을 비우고 남은 서류에서 다시
 * 읽는다(scheduleFactUndo) — 잘못 올렸다 뺀 남의 현장 계약서에서 읽은 계약일이 그대로 남은 일이 있었다(같은 현장).
 */
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { documents, projects } from '@/lib/db/schema';
import { getRepository } from '@/lib/data';
import type { Actor } from '@/lib/data/repository';
import { background } from '@/lib/background';
import {
  APPLY_PROMPT, CONTRACT_PROMPT, REP_NAME_PROMPT, applyReadOf, contractReadOf, repNameValuesOf, staleFacts,
  type FactValues,
} from '@/lib/fact-read';
import { withRegionPrefix } from '@/lib/region';
import { askPdfJson, preparePdfs } from '@/lib/vision-ask';
import { splitPdf } from '@/lib/pdf-split';
import type { DocFile, FactField, FilledFacts } from '@/types/project';

interface Read {
  /** 이 중 하나라도 비어야 읽는다 */
  need: FactField[];
  /** 읽는 김에 비었으면 같이 넣는다 — 이것만 비었다고 판독을 보내지 않는다(이메일 없는 계약서가 흔하다) */
  also: FactField[];
  prompt: string;
  parse: (raw: unknown) => FactValues;
  pages: number;
  tag: string;
}

const READS: Record<string, Read> = {
  /* 사업자등록증은 한 장이다 — 묶음 스캔이 와도 앞 두 쪽만 */
  bizreg: { need: ['repName'], also: [], prompt: REP_NAME_PROMPT, parse: repNameValuesOf, pages: 2, tag: 'rep-name' },
  /* 계약일은 서명란 위, 부지제공자 칸은 첫 장이다 — 운영사 계약서 넷 모두 앞 여섯 쪽 안이다(운영사 직인 읽기와 같은 범위, lib/cpo-seal-run) */
  contract: {
    need: ['contractDate', 'addr'], also: ['mgr', 'tel', 'mail'],
    prompt: CONTRACT_PROMPT, parse: contractReadOf, pages: 6, tag: 'contract-date',
  },
  /* 설치신청서는 한 장이다 */
  apply: { need: ['addr', 'parkTotal'], also: ['tel'], prompt: APPLY_PROMPT, parse: applyReadOf, pages: 2, tag: 'apply-facts' },
};

/** 현장 정보 수정 기록에 사람 대신 서는 이름 */
const AUTO: Actor = { id: 'system', name: '자동 판독', role: 'admin', org: null };

/** 파일 한 장에서 그 칸의 값들을 읽는다 — 못 읽은 칸은 없다 */
export async function readFact(kind: string, file: { name: string; buffer: Buffer }): Promise<FactValues> {
  const r = READS[kind];
  if (!r) return {};
  const head = /\.pdf$/i.test(file.name)
    ? { ...file, buffer: await splitPdf(file.buffer, Array.from({ length: r.pages }, (_, i) => i + 1)) }
    : file;
  const { batches } = await preparePdfs([head], r.tag);
  if (batches.length === 0) return {};
  return r.parse(await askPdfJson(batches[0], r.prompt, r.tag));
}

type Now = Record<FactField, unknown> & { name: string };

async function factsNow(projectId: string): Promise<Now | null> {
  const [p] = await getDb().select({
    name: projects.name, repName: projects.repName, contractDate: projects.contractDate, addr: projects.addr,
    parkTotal: projects.parkTotal, mgr: projects.mgr, tel: projects.tel, mail: projects.mail,
  }).from(projects).where(eq(projects.id, projectId)).limit(1);
  return p ?? null;
}

const blank = (now: Now, fields: FactField[]) => fields.filter((f) => now[f] === null);

/**
 * 비어 있는 칸이 있으면 그 칸의 파일을 차례로 읽어 빈 칸을 채운다 — 넣은 값을 돌려준다.
 * 주소를 넣으면 현장명 앞에 지역을 붙인다 — 접수가 하는 일과 같다(pg-store projectRowOf withRegionPrefix).
 */
export async function fillFactNow(projectId: string, kind: string): Promise<FactValues> {
  const r = READS[kind];
  if (!r) return {};
  const start = await factsNow(projectId);
  if (!start || blank(start, r.need).length === 0) return {};
  let now: Now = start;
  const [d] = await getDb().select({ files: documents.files }).from(documents)
    .where(and(eq(documents.projectId, projectId), eq(documents.kind, kind))).limit(1);
  const repo = getRepository();
  const put: FactValues = {};
  for (const f of ((d?.files ?? []) as DocFile[]).filter((x) => x?.url)) {
    if (blank(now, r.need).length === 0) break;
    try {
      const res = await fetch(f.url);
      if (!res.ok) throw new Error(`파일을 읽지 못했습니다 (${res.status})`);
      const read = await readFact(kind, { name: f.name, buffer: Buffer.from(await res.arrayBuffer()) });
      // 읽는 사이 사람이 적었으면 덮지 않는다
      const fresh = await factsNow(projectId);
      if (!fresh) return put;
      now = fresh;
      const patch = Object.fromEntries(
        blank(now, [...r.need, ...r.also]).filter((k) => read[k] !== undefined).map((k) => [k, read[k]])
      ) as FactValues;
      if (Object.keys(patch).length === 0) continue;
      await repo.setProjectFacts(projectId, patch, AUTO);
      const filled: FilledFacts = { facts: { ...f.filled?.facts, ...patch } };
      if (patch.addr) {
        const to = withRegionPrefix(now.name, patch.addr);
        if (to !== now.name) {
          await repo.setProjectName(projectId, to, AUTO);
          filled.name = { from: now.name, to };
        }
      }
      if (!filled.name && f.filled?.name) filled.name = f.filled.name;
      await repo.setDocFileFacts({ projectId, kind, url: f.url, facts: { filled } }, AUTO);
      Object.assign(put, patch);
      now = { ...now, ...patch, name: filled.name?.to ?? now.name };
    } catch (err) {
      console.warn(`[${r.tag}] ${projectId} ${f.name} 판독 실패`, err);
    }
  }
  return put;
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

/** 빠진 장들이 넣었던 값을 걷고, 비운 칸을 남은 서류에서 다시 읽는다 — 걷은 칸을 돌려준다 */
export async function undoFactsNow(projectId: string, gone: FilledFacts[]): Promise<FactField[]> {
  const now = await factsNow(projectId);
  if (!now) return [];
  const { clear, name } = staleFacts(gone, now);
  const repo = getRepository();
  if (clear.length > 0) await repo.setProjectFacts(projectId, Object.fromEntries(clear.map((k) => [k, null])), AUTO);
  if (name) await repo.setProjectName(projectId, name, AUTO);
  for (const [kind, r] of Object.entries(READS)) {
    if ([...r.need, ...r.also].some((k) => clear.includes(k))) await fillFactNow(projectId, kind);
  }
  return clear;
}

/** 파일이 빠졌으면 응답 뒤에 그 장이 넣었던 값을 걷는다 — 넣은 것이 없던 장이면 할 일이 없다 */
export function scheduleFactUndo(projectId: string, gone: Array<FilledFacts | null | undefined>): Promise<void> | void {
  const records = gone.filter((g): g is FilledFacts => !!g && Object.keys(g.facts ?? {}).length > 0);
  if (records.length === 0) return;
  return background(undoFactsNow(projectId, records), `fact-undo ${projectId}`);
}

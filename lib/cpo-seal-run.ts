/**
 * 계약서의 운영사 직인을 읽어 파일에 단다 — 올라오면 저절로, 한백이 누르면 다시 (한백 지시 2026-10-07). [서버 전용]
 *
 * 현대엔지니어링·SK일렉링크 현장의 계약서 칸(contract)만 본다(lib/cpo-seal SEAL_CPOS). 읽은 것은 그 파일의
 * DocFile.cpoSeal 에 남고, 서류 카드가 꼬리표로 그린다. 막지 않는다 — 꼬리표만.
 *
 * ★저절로 도는 것은 아직 안 읽은 파일만★ — 이미 읽은 파일을 업로드마다 다시 읽으면 판독 값이 늘어난다(판독 한 번
 * 6~10초 · 몇 센트). 한백이 「직인 다시 읽기」를 누르면 칸의 파일을 모두 다시 읽는다(운영사가 역날인한 판을 같은
 * 칸에 다시 올리면 새 파일이라 저절로 읽힌다).
 */
import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { documents, projects } from '@/lib/db/schema';
import { getRepository } from '@/lib/data';
import type { Actor } from '@/lib/data/repository';
import { background } from '@/lib/background';
import { needsCpoSeal, sealPrompt, sealReadOf, type CpoSealRead, type SealCpo } from '@/lib/cpo-seal';
import { askPdfJson, preparePdfs } from '@/lib/vision-ask';
import { splitPdf } from '@/lib/pdf-split';
import type { DocFile } from '@/types/project';

const KIND = 'contract';
/** 저절로 읽은 것을 남기는 이름 — 감사로그를 안 남기는 쓰기지만 저장소가 행위자를 받는다 */
const AUTO: Actor = { id: 'system', name: '자동 판독', role: 'admin', org: null };

/**
 * 앞에서 몇 쪽까지 보나 — 운영사 서명 칸은 계약서 앞쪽에 있다(현대엔지니어링·SK 모두 2쪽, 샘플 7건).
 * 계약서에 회의록·건축물대장까지 묶은 스캔은 20MB 를 넘어 한 번에 못 보낸다(매호 효성백년가약 16쪽 20.7MB) —
 * 앞쪽만 잘라 보낸다. 서명 칸이 그 뒤에 있으면 「못 찾음」(null)으로 돌아온다.
 */
const HEAD_PAGES = 6;

/** 계약서 파일 한 장을 읽는다 — 못 읽는 형식이면 seal null */
export async function readCpoSeal(file: { name: string; buffer: Buffer }, cpo: SealCpo): Promise<CpoSealRead> {
  const head = /\.pdf$/i.test(file.name)
    ? { ...file, buffer: await splitPdf(file.buffer, Array.from({ length: HEAD_PAGES }, (_, i) => i + 1)) }
    : file;
  const { batches } = await preparePdfs([head], 'cpo-seal');
  if (batches.length === 0) return { seal: null, page: null };
  return sealReadOf(await askPdfJson(batches[0], sealPrompt(cpo), 'cpo-seal'));
}

export interface SealResult { name: string; url: string; cpoSeal: boolean | null }

async function contractFiles(projectId: string): Promise<{ cpo: string | null; files: DocFile[] }> {
  const db = getDb();
  const [p] = await db.select({ cpo: projects.cpo }).from(projects).where(eq(projects.id, projectId)).limit(1);
  const [d] = await db.select({ files: documents.files }).from(documents)
    .where(and(eq(documents.projectId, projectId), eq(documents.kind, KIND))).limit(1);
  return { cpo: p?.cpo ?? null, files: ((d?.files ?? []) as DocFile[]).filter((f) => f?.url) };
}

/**
 * 칸의 계약서를 읽어 단다 — all 이면 모두, 아니면 아직 안 읽은 것(cpoSeal 이 없는 것)만.
 * 한 장이 실패해도 나머지는 읽는다 — 실패한 장은 남기지 않는다(다음에 다시 읽힌다).
 */
export async function readCpoSealsNow(projectId: string, actor: Actor, all: boolean): Promise<SealResult[]> {
  const { cpo, files } = await contractFiles(projectId);
  if (!needsCpoSeal(cpo)) return [];
  const repo = getRepository();
  const out: SealResult[] = [];
  // 한 장씩 — 판독을 한꺼번에 보내면 연결이 끊긴 일이 있다
  for (const f of files.filter((x) => all || x.cpoSeal === undefined)) {
    try {
      const res = await fetch(f.url);
      if (!res.ok) throw new Error(`파일을 읽지 못했습니다 (${res.status})`);
      const read = await readCpoSeal({ name: f.name, buffer: Buffer.from(await res.arrayBuffer()) }, cpo);
      await repo.setDocFileFacts({ projectId, kind: KIND, url: f.url, facts: { cpoSeal: read.seal } }, actor);
      out.push({ name: f.name, url: f.url, cpoSeal: read.seal });
    } catch (err) {
      console.warn(`[cpo-seal] ${projectId} ${f.name} 판독 실패`, err);
    }
  }
  return out;
}

/** 계약서 칸에 파일이 올라왔으면 응답 뒤에 읽는다 — kind 가 계약서가 아니면 할 일이 없다 */
export function scheduleCpoSealRead(projectId: string, kind?: string): Promise<void> | void {
  if (kind && kind !== KIND) return;
  return background(readCpoSealsNow(projectId, AUTO, false), `cpo-seal ${projectId}`);
}

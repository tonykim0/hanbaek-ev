/**
 * 여러 현장의 같은 서류를 받아 zip 하나로 묶고 Blob 에 올린다 (서버 전용 — 이름 · 판단은 lib/agents/bundle).
 *
 * 한백 2026-11-05 「콘솔 프로젝트마다 저장되어있는 파일을 한꺼번에 불러와서 압축해서 이메일로 보내고 싶은데」. 담당의 draft_mail 이
 * site_docs 를 받으면 라우트가 이것을 부르고, 돌려준 zip 을 25MB 안이면 첨부(agent_mails.doc_files)로, 넘으면 본문의 링크로 단다.
 *
 * ★운영사 담당은 제 운영사 현장만 묶는다★ — 현대엔지니어링 담당이 다른 운영사의 서류를 실수로 보내지 않게. 정산 · 전략·기획은
 * 전기차 현장 모두. zip 은 이 담당의 자리(agent-files/<담당>/bundles/<무작위>/)에 남는다 — 메일을 보낼 때 그 주소에서 다시 받아
 * 붙이고(app/api/agents/[id]/mails/[mailId]/send), 링크로 보낼 때는 받는 사람이 그 주소로 받는다(주소는 무작위라 추측할 수 없다).
 */
import JSZip from 'jszip';
import { put } from '@vercel/blob';
import type { Actor } from '@/lib/data/repository';
import { getRepository } from '@/lib/data';
import type { Agent } from '@/types/agents';
import { BUNDLE_LIMIT, bundleEntryName, bundleZipName, docSlotOf, sizeText, type BundleResult } from './bundle';

/** 파일 하나를 받는 시간 · 한꺼번에 받는 수 */
const FETCH_MS = 30_000;
const PARALLEL = 4;

async function fetchBytes(url: string): Promise<Buffer> {
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(FETCH_MS) });
  if (!res.ok) throw new Error(`서류를 받지 못했다(${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * 묶는다 — refs 는 담당이 준 관리번호들, siteOf 는 관리번호 → 현장 id(lib/agents/scope). 묶을 파일이 하나도 없으면 사람 말로 던진다
 * (그 말이 도구 결과로 담당에게 간다).
 */
export async function bundleSiteDocs(input: {
  agent: Agent;
  refs: string[];
  doc: string;
  siteOf(ref: string): string | null;
  actor: Actor;
}): Promise<BundleResult> {
  const { agent, actor } = input;
  if (agent.biz !== 'ev') throw new Error('태양광 현장의 파일은 아직 묶지 못한다.');
  const slot = docSlotOf(input.doc);
  if ('error' in slot) throw new Error(slot.error);
  const refs = [...new Set(input.refs.map((r) => r.trim()).filter(Boolean))];
  if (refs.length === 0) throw new Error('묶을 현장의 관리번호가 없다.');
  if (refs.length > BUNDLE_LIMIT.sites) throw new Error(`한 번에 ${BUNDLE_LIMIT.sites}곳까지 묶는다 — 나눠서 보낸다.`);

  const unknown: string[] = [];
  const ids: string[] = [];
  for (const r of refs) {
    const id = input.siteOf(r);
    if (id) ids.push(id);
    else unknown.push(r);
  }
  const sites = await getRepository().siteDocFiles(actor, { projectIds: ids, table: slot.table, kind: slot.key });
  const label = (s: { mgmtNo: string | null; name: string }) => s.mgmtNo ?? s.name;
  const otherCpo = agent.kind === 'operator' ? sites.filter((s) => s.cpo !== agent.cpo).map(label) : [];
  const mine = agent.kind === 'operator' ? sites.filter((s) => s.cpo === agent.cpo) : sites;
  const missing = mine.filter((s) => s.files.length === 0).map(label);
  const withFiles = mine.filter((s) => s.files.length > 0);
  if (withFiles.length === 0) {
    throw new Error([
      `묶을 ${slot.name} 파일이 없다`,
      missing.length ? `파일 없음: ${missing.join(', ')}` : '',
      unknown.length ? `찾지 못한 관리번호: ${unknown.join(', ')}` : '',
      otherCpo.length ? `다른 운영사 현장: ${otherCpo.join(', ')}` : '',
    ].filter(Boolean).join(' — '));
  }

  /* 받는다 — 넷씩, 합계가 상한을 넘으면 멈춘다(함수 메모리 안에서 묶는다) */
  const jobs = withFiles.flatMap((s) => s.files.map((f) => ({ site: s, file: f })));
  const bytes: Buffer[] = new Array(jobs.length);
  let total = 0;
  for (let i = 0; i < jobs.length; i += PARALLEL) {
    const chunk = jobs.slice(i, i + PARALLEL);
    const got = await Promise.all(chunk.map((j) => fetchBytes(j.file.url).catch((e: unknown) => {
      throw new Error(`${label(j.site)} 의 「${j.file.name}」 — ${e instanceof Error ? e.message : String(e)}`);
    })));
    got.forEach((b, k) => { bytes[i + k] = b; total += b.length; });
    if (total > BUNDLE_LIMIT.bytes) throw new Error(`묶을 파일이 ${sizeText(BUNDLE_LIMIT.bytes)}를 넘는다 — 현장을 나눠 두 통으로 보낸다.`);
  }

  const zip = new JSZip();
  const used = new Set<string>();
  jobs.forEach((j, k) => zip.file(bundleEntryName(j.site, slot, j.file.name, used), bytes[k]));
  /* 서류는 대개 이미 압축된 꼴(pdf · pptx · jpg)이라 세게 누르지 않는다 */
  const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 3 } });
  const name = bundleZipName(slot, withFiles.length);
  const blob = await put(`agent-files/${agent.id}/bundles/${crypto.randomUUID()}/${name}`, buf, {
    access: 'public',
    contentType: 'application/zip',
    token: process.env.BLOB_READ_WRITE_TOKEN,
  });
  return {
    slot,
    zip: { name, url: blob.url, size: buf.length, contentType: 'application/zip' },
    included: withFiles.map((s) => ({ mgmtNo: s.mgmtNo, name: s.name, files: s.files.length })),
    missing,
    unknown,
    otherCpo,
  };
}

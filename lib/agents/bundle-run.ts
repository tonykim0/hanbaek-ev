/**
 * 여러 현장의 같은 서류를 받아 zip 하나로 묶고 Blob 에 올린다 (서버 전용 — 이름 · 판단은 lib/agents/bundle).
 *
 * 한백 2026-11-05 「콘솔 프로젝트마다 저장되어있는 파일을 한꺼번에 불러와서 압축해서 이메일로 보내고 싶은데」. 담당의
 * bundle_site_docs 가 이것을 부르고, ★한 통에 들어갈 만큼씩 나눈 묶음★(lib/agents/bundle packSites — 같은 날 「B로하자」)을 하나씩
 * 올린다. 담당은 묶음마다 draft_mail attach_bundle_ids 로 한 통씩 쓰고(agent_mails.doc_files 첨부), 한 현장만으로 상한을 넘은 묶음만
 * link_bundle_ids 로 본문에 링크를 단다. 묶음 id 는 올린 자리의 무작위 마디라, 뒤의 답에서도 bundleFileOf 로 다시 찾는다.
 *
 * ★운영사 담당은 제 운영사 현장만 묶는다★ — 현대엔지니어링 담당이 다른 운영사의 서류를 실수로 보내지 않게. 정산 · 전략·기획은
 * 전기차 현장 모두. zip 은 이 담당의 자리(agent-files/<담당>/bundles/<무작위>/)에 남는다 — 메일을 보낼 때 그 주소에서 다시 받아
 * 붙이고(app/api/agents/[id]/mails/[mailId]/send), 링크로 보낼 때는 받는 사람이 그 주소로 받는다(주소는 무작위라 추측할 수 없다).
 */
import JSZip from 'jszip';
import type { Actor } from '@/lib/data/repository';
import { getRepository } from '@/lib/data';
import type { Agent } from '@/types/agents';
import {
  BUNDLE_LIMIT, bundleEntryName, bundleZipName, docSlotOf, packSites, partBytesOf, sizeText, type BundlePart, type BundleResult,
} from './bundle';
import { listBlobs, putBlob, readBlob } from '@/lib/blob/server';

/** 파일 하나를 받는 시간 · 한꺼번에 받는 수 */
const FETCH_MS = 30_000;
const PARALLEL = 4;

async function fetchBytes(url: string): Promise<Buffer> {
  // 비공개 저장소 — 맨 주소는 403 이라 SDK 로 읽는다(lib/blob/server)
  return Promise.race([
    readBlob(url),
    new Promise<never>((_, no) => setTimeout(() => no(new Error('서류를 받지 못했다(시간 초과)')), FETCH_MS)),
  ]);
}

/**
 * 묶는다 — refs 는 담당이 준 관리번호들, siteOf 는 관리번호 → 현장 id(lib/agents/scope). 묶을 파일이 하나도 없으면 사람 말로 던진다
 * (그 말이 도구 결과로 담당에게 간다).
 */
export async function bundleSiteDocs(input: {
  agent: Agent;
  refs: string[];
  doc: string;
  /** 한 묶음(메일 한 통)의 상한 MB — 비우면 기본 20MB(lib/agents/bundle PART_MB) */
  maxMb?: number | null;
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

  /* 나눈다 — 현장을 쪼개지 않고 차례대로 한 묶음이 상한 안에 들게(lib/agents/bundle packSites) */
  const limit = partBytesOf(input.maxMb);
  const siteBytes = withFiles.map((s) => jobs.reduce((n, j, k) => (j.site === s ? n + bytes[k].length : n), 0));
  const groups = packSites(siteBytes, limit);
  const folder = `agent-files/${agent.id}/bundles`;
  const parts: BundlePart[] = [];
  for (const [g, group] of groups.entries()) {
    const zip = new JSZip();
    const used = new Set<string>();
    const members = group.map((i) => withFiles[i]);
    jobs.forEach((j, k) => {
      if (members.includes(j.site)) zip.file(bundleEntryName(j.site, slot, j.file.name, used), bytes[k]);
    });
    /* 서류는 대개 이미 압축된 꼴(pdf · pptx · jpg)이라 세게 누르지 않는다 */
    const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 3 } });
    const name = bundleZipName(slot, members.length, { index: g + 1, total: groups.length });
    const id = crypto.randomUUID();
    const blob = await putBlob(`${folder}/${id}/${name}`, buf, { contentType: 'application/zip' });
    parts.push({
      id,
      zip: { name, url: blob.url, size: buf.length, contentType: 'application/zip' },
      sites: members.map((m) => ({ mgmtNo: m.mgmtNo, name: m.name, files: m.files.length })),
      over: buf.length > limit,
    });
  }
  return {
    slot,
    limit,
    parts,
    missing,
    unknown,
    otherCpo,
  };
}

/** 앞서 올린 묶음 하나 — id 는 올린 자리의 무작위 마디. 이 담당의 자리에서만 찾는다(없으면 null) */
export async function bundleFileOf(agentId: string, id: string): Promise<BundlePart['zip'] | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const blobs = await listBlobs(`agent-files/${agentId}/bundles/${id}/`, { limit: 1 });
  const b = blobs[0];
  if (!b) return null;
  const tail = b.pathname.slice(b.pathname.lastIndexOf('/') + 1);
  let name = tail;
  try { name = decodeURIComponent(tail); } catch { /* 이미 글자 그대로다 */ }
  return { name, url: b.url, size: b.size, contentType: 'application/zip' };
}

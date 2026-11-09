/**
 * 브라우저에서 — 제안서 틀 올리기와 제안서 짓기. [브라우저]
 *
 * 틀 올리기: 토큰(자리는 서버가 짓는다) → Blob 에 바로(틀은 20MB 안팎 — 서버리스 본문 한도 4.5MB) → 확인(서버가 그 자리를 다시 찾아 적는다).
 * 짓기: 틀 파일을 받아(사업자의 원본) 그 틀의 생성기로 채운다 — 생성기는 쓸 때 실어 온다(부지 검토 화면을 무겁게 하지 않게).
 * 실패하면 그 까닭(한글)을 던진다 — 부르는 쪽이 누른 자리 옆에 띄운다.
 */
import type { ProposalTemplate } from '@/lib/data/solar-proposals';
import type { FillArgs, ProposalInput } from './fill-common';
import { TEMPLATES, type ProductKey, type TemplateKey, type Terms } from './products';

const JSON_HEADERS = { 'Content-Type': 'application/json' };
const mb = (n: number) => Math.round((n / 1024 / 1024) * 10) / 10;

export async function uploadProposalTemplate(key: TemplateKey, file: File, onPct?: (pct: number) => void): Promise<ProposalTemplate> {
  const kind = TEMPLATES[key].file;
  if (!file.name.toLowerCase().endsWith(`.${kind}`)) throw new Error(`${kind} 파일을 올려 주세요 — ${TEMPLATES[key].hint}`);
  if (file.size > 100 * 1024 * 1024) throw new Error(`${file.name} — ${mb(file.size)}MB · 100MB 까지입니다.`);
  const t = await fetch('/api/solar/proposals?step=token', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ key, filename: file.name }) });
  const tb = (await t.json().catch(() => ({}))) as { token?: string; pathname?: string; contentType?: string; error?: string };
  if (!t.ok || !tb.token || !tb.pathname) throw new Error(tb.error ?? '업로드 준비에 실패했습니다.');
  const { put } = await import('@vercel/blob/client');
  await put(tb.pathname, file, {
    access: 'public',
    token: tb.token,
    contentType: tb.contentType,
    multipart: file.size > 10 * 1024 * 1024,
    onUploadProgress: ({ percentage }) => onPct?.(Math.round(percentage)),
  });
  const c = await fetch('/api/solar/proposals', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ key, pathname: tb.pathname, filename: file.name }) });
  const cb = (await c.json().catch(() => ({}))) as { template?: ProposalTemplate; error?: string };
  if (!c.ok || !cb.template) throw new Error(cb.error ?? '올린 템플릿을 확인하지 못했습니다.');
  return cb.template;
}

/** 틀 · 조건 목록 — 제안서 생성이 열릴 때 한 번 */
export async function fetchProposalTemplates(): Promise<ProposalTemplate[]> {
  const r = await fetch('/api/solar/proposals');
  const b = (await r.json().catch(() => ({}))) as { templates?: ProposalTemplate[]; error?: string };
  if (!r.ok || !b.templates) throw new Error(b.error ?? `템플릿을 읽지 못했습니다 (${r.status})`);
  return b.templates;
}

export async function saveProposalTerms(key: TemplateKey, terms: Record<string, string | number>): Promise<ProposalTemplate> {
  const r = await fetch('/api/solar/proposals', { method: 'PATCH', headers: JSON_HEADERS, body: JSON.stringify({ key, terms }) });
  const b = (await r.json().catch(() => ({}))) as { template?: ProposalTemplate; error?: string };
  if (!r.ok || !b.template) throw new Error(b.error ?? '조건을 저장하지 못했습니다.');
  return b.template;
}

/** 제안서 한 벌 — 틀 파일을 받아 그 상품의 생성기로 채운다 */
export async function buildProposal(product: ProductKey, template: ProposalTemplate, input: ProposalInput): Promise<Blob> {
  if (!template.file) throw new Error('템플릿이 아직 없습니다.');
  const res = await fetch(template.file.url);
  if (!res.ok) throw new Error(`템플릿 파일을 받지 못했습니다 (${res.status}).`);
  const data = await res.arrayBuffer();
  const out = await fill(product, { template: data, terms: template.terms as Terms, input });
  return out instanceof Blob ? out : new Blob([out as BlobPart]);
}

/** 상품의 생성기 — 상품마다 빠짐없이(상품을 더하면 tsc 가 여기를 짚는다) */
async function fill(product: ProductKey, args: FillArgs): Promise<Blob | Uint8Array> {
  switch (product) {
    case 'tyrant-solar15-basic':
    case 'tyrant-solar15-prepay': {
      const { fillTyrant } = await import('./fill-tyrant');
      return fillTyrant(args, product === 'tyrant-solar15-prepay' ? 'prepay' : 'basic');
    }
    case 'henergy-mohaet': {
      const { fillHenergy } = await import('./fill-henergy');
      return fillHenergy(args);
    }
    case 'lumora-rent': {
      const { fillLumora } = await import('./fill-lumora');
      return fillLumora(args);
    }
    default: {
      const none: never = product;
      throw new Error(`생성기가 없는 상품입니다 — ${String(none)}`);
    }
  }
}

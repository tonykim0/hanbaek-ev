/**
 * POST /api/projects/[id]/nice-draft-mail — 나이스인프라 「계약서 초안 메일」 초안을 올린다 [한백 관리자]
 *
 * 한백 2026-11-03 「나이스인프라는 계약서 접수 시, 워드파일을 초안으로 받고 있어. 그 파일을 첨부한 메일 보내고싶어」.
 * 그 현장의 「계약서 초안」 칸 파일(워드)을 붙이고, 본문은 한백이 준 양식(인사 · 나이스인프라 제출 정보 1~7번 · 맺음 —
 * lib/nice-submit niceDraftMail)이다. 초안은 나이스인프라 담당의 것으로 올라가고(store/agent-mail addSiteMail), ★한백이
 * 승인해야 나간다★ — 계약 탭에서 바로 보이는 카드에서 「승인하고 보내기」. 받는 사람은 같은 양식으로 마지막에 보낸 주소다.
 * 붙일 파일의 크기는 Blob 에 물어 적는다(카드 · 첨부 한도에 쓴다).
 */
import { getRepository } from '@/lib/data';
import { adminWrite } from '@/lib/api/write-route';
import { NICE_DRAFT_MAIL, niceDraftMail } from '@/lib/nice-submit';

/** 나이스인프라 담당 — migrations/0109 가 심은 id */
const NICE_AGENT = 'op-nice';
const DRAFT_SLOT = 'contractDraft';

const WORD_TYPES: Record<string, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  hwpx: 'application/hwp+zip',
  hwp: 'application/x-hwp',
  pdf: 'application/pdf',
};

/** Blob 에 크기와 형식을 묻는다 — 못 물으면 크기 0(한도 셈에서 빠진다) · 형식은 확장자로 */
async function headOf(url: string, name: string): Promise<{ size: number; contentType: string | null }> {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(10_000) });
    const size = Number(res.headers.get('content-length') ?? 0);
    return { size: Number.isFinite(size) ? size : 0, contentType: WORD_TYPES[ext] ?? res.headers.get('content-type') };
  } catch {
    return { size: 0, contentType: WORD_TYPES[ext] ?? null };
  }
}

export const POST = adminWrite<{ id: string }, undefined>(
  '계약서 초안 메일은 한백 관리자만 올릴 수 있습니다.',
  async ({ params, actor }) => {
    const repo = getRepository();
    const detail = await repo.getProject(params.id, { role: actor.role, org: actor.org });
    if (!detail) throw new Error('현장을 찾을 수 없습니다.');
    if (detail.project.cpo !== '나이스인프라') throw new Error('나이스인프라 현장이 아닙니다.');
    const files = detail.documents.find((d) => d.kind === DRAFT_SLOT)?.files ?? [];
    if (files.length === 0) throw new Error('계약서 초안(워드)이 없습니다 — 먼저 올려 주세요.');
    const docFiles = [];
    for (const f of files) docFiles.push({ name: f.name, url: f.url, ...(await headOf(f.url, f.name)) });
    const qty = detail.lines.reduce((n, l) => n + l.qty, 0);
    const { subject, body } = niceDraftMail(detail.project, qty);
    const mail = await repo.addSiteMail({ agentId: NICE_AGENT, projectId: params.id, kind: NICE_DRAFT_MAIL, subject, body, docFiles }, actor);
    return { mail };
  }
);

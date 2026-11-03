/**
 * 에이전트 메일 — 담당이 올린 초안 · 한백의 승인 · 보낸 기록, 그리고 콘솔이 보내는 메일 계정 (migrations/0111).
 *
 * ★한백 관리자만★ 읽고 쓴다. ★메일은 한백이 승인해야 나간다★(한백 2026-11-03 「난 그거에 대해 승인을 하고 너가 메일을 보내는건데」)
 * — 에이전트의 손(lib/agents/brain draft_mail)은 초안까지고, 나가는 것은 사람이 누른 「승인하고 보내기」뿐이다.
 *
 * 보내는 순서(라우트 app/api/agents/[id]/mails/[mailId]/send):
 *   claimAgentMail   승인 대기 · 보내지 못함인 줄을 「보내는 중」으로 잡는다 — 줄 잠금 안에서 상태를 보므로 두 번 누르거나
 *                    두 창에서 같이 눌러도 한 번만 잡힌다(그래서 한 번만 나간다)
 *   (라우트가 다음 메일 서버로 보낸다 — lib/agents/smtp)
 *   finishAgentMail  보냄 · 보내지 못함으로 닫는다 — 보냄은 감사기록에 남고, 주간 기록이 그것을 읽는다
 * 「보내는 중」에서 멈춘 줄(보내는 도중 함수가 끊긴 것)은 STALE_SENDING_MS 가 지나야 다시 잡힌다 — 그사이 나갔을 수 있어서
 * 화면이 받는 사람에게 갔는지 먼저 보라고 말한다.
 *
 * 계정은 메일 주소와 카카오 앱 비밀번호다(한백 「내 다음카카오 이메일로만 보내면 되는거고」). 앱 비밀번호는 잠가서 둔다
 * (lib/agents/secret-box · 열쇠는 AUTH_SECRET). 보낼 때만 mailCredential 이 풀어 라우트에 준다 — 화면 · 응답에는 실리지 않는다.
 */
import { and, asc, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { writeAudit } from '@/lib/db/audit';
import { agentFiles, agentMails, agents, mailAccounts } from '@/lib/db/schema';
import { stampOf } from '@/lib/date';
import { getSecret } from '@/lib/auth/secret';
import { addressesOf, MAIL_LIMITS } from '@/lib/agents/mime';
import { seal, unseal } from '@/lib/agents/secret-box';
import { sizeLabel } from '@/lib/agents/files';
import type { AgentFile, AgentMail, AgentMailStatus, MailAccountInfo } from '@/types/agents';
import { AGENT_MAIL_STATUSES } from '@/types/agents';
import type { ProjectRepository } from '../repository';
import { assertAdmin } from './shared';

/** 메일 계정 줄 — 콘솔에 하나 */
const ACCOUNT_ID = 'mail';
/** 보내는 중에서 이만큼 멈췄으면 다시 잡을 수 있다 */
export const STALE_SENDING_MS = 10 * 60 * 1000;

export const NO_ACCOUNT = '메일 연결 전 — 보낼 수 없습니다. 「보내는 메일」에서 메일 주소와 앱 비밀번호로 먼저 연결해 주세요.';

type MailRow = typeof agentMails.$inferSelect;

function statusOf(v: string): AgentMailStatus {
  return (AGENT_MAIL_STATUSES as readonly string[]).includes(v) ? (v as AgentMailStatus) : 'draft';
}

function fileOf(r: typeof agentFiles.$inferSelect): AgentFile {
  return { id: r.id, name: r.name, url: r.url, size: r.size, contentType: r.contentType };
}

/**
 * 줄 → 화면의 모양. 붙일 파일은 넘긴 파일(id 순서 그대로 — 지워진 파일은 빠진다) 다음에 현장 서류(그때 적어 둔 파일)다.
 * 현장 서류에는 id 가 없어 「doc:순번」으로 단다(화면의 열쇠로만 쓴다).
 */
export function mailOf(r: MailRow, files: Map<string, AgentFile>): AgentMail {
  return {
    id: r.id,
    messageId: r.messageId,
    projectId: r.projectId ?? null,
    kind: r.kind ?? null,
    status: statusOf(r.status),
    to: r.to ?? [],
    cc: r.cc ?? [],
    subject: r.subject,
    body: r.body,
    files: [
      ...(r.fileIds ?? []).map((id) => files.get(id)).filter((f): f is AgentFile => Boolean(f)),
      ...(r.docFiles ?? []).map((f, i) => ({ id: `doc:${i}`, name: f.name, url: f.url, size: f.size, contentType: f.contentType })),
    ],
    error: r.error,
    from: r.from,
    createdAt: stampOf(r.createdAt),
    sentAt: r.sentAt ? stampOf(r.sentAt) : null,
    sentBy: r.sentBy,
  };
}

/** 줄 여럿의 붙일 파일을 한 번에 읽는다 */
export async function mailsOf(rows: MailRow[]): Promise<AgentMail[]> {
  const ids = [...new Set(rows.flatMap((r) => r.fileIds ?? []))];
  const files = ids.length ? await getDb().select().from(agentFiles).where(inArray(agentFiles.id, ids)) : [];
  const byId = new Map(files.map((f) => [f.id, fileOf(f)]));
  return rows.map((r) => mailOf(r, byId));
}

async function agentNameOf(id: string): Promise<string> {
  const [row] = await getDb().select({ name: agents.name }).from(agents).where(eq(agents.id, id)).limit(1);
  if (!row) throw new Error('담당을 찾을 수 없습니다.');
  return row.name;
}

async function mailRow(agentId: string, id: string): Promise<MailRow> {
  const [row] = await getDb().select().from(agentMails)
    .where(and(eq(agentMails.id, id), eq(agentMails.agentId, agentId))).limit(1);
  if (!row) throw new Error('메일을 찾을 수 없습니다.');
  return row;
}

/**
 * 받는 사람 · 참조 · 제목 · 본문을 고른다 — 초안을 올릴 때와 고칠 때가 같은 판정을 쓴다.
 * 받는 사람은 에이전트의 초안 · 고치기에서는 꼭 있어야 하고(지어내지 않게), 사람이 누른 현장 메일은 처음에 비어 있을 수 있다
 * (같은 양식으로 보낸 적이 없을 때 — 카드에서 「고치기」로 넣는다. 보내기는 받는 사람이 있어야 열린다).
 */
function letterOf(input: { to: unknown; cc?: unknown; subject: string; body: string }, opts: { emptyTo?: boolean } = {}) {
  const to = addressesOf(input.to, '받는 사람');
  if (to.length === 0 && !opts.emptyTo) throw new Error('받는 사람을 적어주세요.');
  const toKeys = new Set(to.map((a) => a.toLowerCase()));
  const cc = addressesOf(input.cc, '참조').filter((a) => !toKeys.has(a.toLowerCase()));
  if (to.length + cc.length > MAIL_LIMITS.recipients) throw new Error(`받는 사람과 참조는 합쳐 ${MAIL_LIMITS.recipients}명까지입니다.`);
  const subject = (input.subject ?? '').replace(/\s+/g, ' ').trim();
  if (!subject) throw new Error('제목을 적어주세요.');
  if (subject.length > MAIL_LIMITS.subject) throw new Error(`제목은 ${MAIL_LIMITS.subject}자까지입니다.`);
  const body = (input.body ?? '').replace(/\r\n/g, '\n').trim();
  if (!body) throw new Error('본문을 적어주세요.');
  if (body.length > MAIL_LIMITS.body) throw new Error(`본문은 ${MAIL_LIMITS.body}자까지입니다.`);
  return { to, cc, subject, body };
}

/** 감사기록 한 줄의 값 — 제목 → 받는 사람(참조) */
const letterLine = (m: { subject: string; to: string[]; cc: string[] }) =>
  `${m.subject} → ${m.to.join(', ')}${m.cc.length ? ` (참조 ${m.cc.join(', ')})` : ''}`.slice(0, 2000);

export const agentMailStore: Pick<
  ProjectRepository,
  | 'getMailAccount' | 'saveMailAccount' | 'deleteMailAccount' | 'mailCredential'
  | 'addAgentMail' | 'linkAgentMails' | 'editAgentMail' | 'setAgentMailDiscarded' | 'claimAgentMail' | 'finishAgentMail'
  | 'addSiteMail' | 'projectMails'
> = {
  /**
   * 현장 메일 — 계약서 초안처럼 현장 서류를 붙여 보내는 양식 메일을 그 담당의 초안으로 올린다(한백 2026-11-03 「나이스인프라는 계약서
   * 접수 시, 워드파일을 초안으로 받고 있어. 그 파일을 첨부한 메일 보내고싶어」). 사람이 누른 것이라 에이전트 답에 잇지 않는다 —
   * 그 담당의 대화에는 올린 시각의 자리에 선다.
   * 같은 현장 · 같은 양식의 보내지 않은 초안이 있으면 새로 만들지 않고 그것을 돌려준다(두 번 눌러도 하나).
   * 받는 사람 · 참조는 같은 양식으로 마지막에 보낸 메일의 것을 쓴다 — 처음이면 비어 있다(카드에서 넣는다).
   */
  async addSiteMail(input, actor): Promise<AgentMail> {
    assertAdmin(actor, '현장 메일');
    const agentName = await agentNameOf(input.agentId);
    const db = getDb();
    const docFiles = input.docFiles.slice(0, MAIL_LIMITS.files);
    if (docFiles.length === 0) throw new Error('붙일 서류가 없습니다.');
    const total = docFiles.reduce((n, f) => n + (f.size || 0), 0);
    if (total > MAIL_LIMITS.attachBytes) throw new Error(`붙일 서류는 합쳐 ${sizeLabel(MAIL_LIMITS.attachBytes)}까지입니다.`);
    const id = await db.transaction(async (tx) => {
      /* 같은 현장 · 양식의 초안을 동시에 둘 만들지 않게 — 그 현장 줄을 잡고 본다 */
      await tx.execute(sql`select 1 from projects where id = ${input.projectId} for update`);
      const [open] = await tx.select({ id: agentMails.id }).from(agentMails)
        .where(and(eq(agentMails.projectId, input.projectId), eq(agentMails.kind, input.kind), inArray(agentMails.status, ['draft', 'failed'])))
        .orderBy(desc(agentMails.createdAt)).limit(1);
      if (open) return open.id;
      const [last] = await tx.select({ to: agentMails.to, cc: agentMails.cc }).from(agentMails)
        .where(and(eq(agentMails.kind, input.kind), eq(agentMails.status, 'sent')))
        .orderBy(desc(agentMails.sentAt)).limit(1);
      const letter = letterOf({ to: last?.to ?? [], cc: last?.cc ?? [], subject: input.subject, body: input.body }, { emptyTo: true });
      const made = crypto.randomUUID();
      await tx.insert(agentMails).values({
        id: made, agentId: input.agentId, status: 'draft', ...letter, fileIds: [], docFiles,
        projectId: input.projectId, kind: input.kind,
      });
      await writeAudit(tx, {
        projectId: input.projectId, actor, action: '현장 메일 초안', field: agentName, oldValue: null,
        newValue: `${letterLine(letter)} · 첨부 ${docFiles.map((f) => f.name).join(', ')}`.slice(0, 2000),
      });
      return made;
    });
    const [mail] = await mailsOf([await mailRow(input.agentId, id)]);
    return mail;
  },

  /** 그 현장의 그 양식 메일 — 오래된 것이 앞 */
  async projectMails(projectId, kind, actor): Promise<AgentMail[]> {
    assertAdmin(actor, '현장 메일');
    const rows = await getDb().select().from(agentMails)
      .where(and(eq(agentMails.projectId, projectId), eq(agentMails.kind, kind)))
      .orderBy(asc(agentMails.createdAt));
    return mailsOf(rows);
  },

  async getMailAccount(actor): Promise<MailAccountInfo | null> {
    assertAdmin(actor, '메일 계정');
    const [row] = await getDb().select().from(mailAccounts).where(eq(mailAccounts.id, ACCOUNT_ID)).limit(1);
    return row ? { email: row.email, connectedAt: stampOf(row.connectedAt), connectedBy: row.connectedBy } : null;
  },

  async saveMailAccount(input, actor): Promise<MailAccountInfo> {
    assertAdmin(actor, '메일 계정');
    const email = input.email.trim();
    if (!email || !input.secret) throw new Error('메일 주소와 앱 비밀번호를 적어주세요.');
    const token = seal(input.secret, getSecret());
    const server = input.server;
    const db = getDb();
    await db.transaction(async (tx) => {
      const [old] = await tx.select({ email: mailAccounts.email }).from(mailAccounts).where(eq(mailAccounts.id, ACCOUNT_ID)).for('update');
      await tx.insert(mailAccounts)
        .values({ id: ACCOUNT_ID, email, token, server, connectedBy: actor.name })
        .onConflictDoUpdate({
          target: mailAccounts.id,
          set: { email, token, server, connectedBy: actor.name, connectedAt: new Date() },
        });
      await writeAudit(tx, {
        projectId: null, actor, action: '메일 계정 연결', field: '보내는 메일', oldValue: old?.email ?? null, newValue: email,
      });
    });
    const saved = await agentMailStore.getMailAccount(actor);
    if (!saved) throw new Error('연결을 저장하지 못했습니다.');
    return saved;
  },

  async deleteMailAccount(actor): Promise<{ email: string } | null> {
    assertAdmin(actor, '메일 계정');
    const db = getDb();
    return db.transaction(async (tx) => {
      const [gone] = await tx.delete(mailAccounts).where(eq(mailAccounts.id, ACCOUNT_ID)).returning();
      if (!gone) return null;
      await writeAudit(tx, { projectId: null, actor, action: '메일 계정 끊음', field: '보내는 메일', oldValue: gone.email, newValue: null });
      return { email: gone.email };
    });
  },

  async mailCredential(actor): Promise<{ email: string; secret: string }> {
    assertAdmin(actor, '메일 보내기');
    const [row] = await getDb().select().from(mailAccounts).where(eq(mailAccounts.id, ACCOUNT_ID)).limit(1);
    if (!row) throw new Error(NO_ACCOUNT);
    const secret = unseal(row.token, getSecret());
    if (!secret) throw new Error('메일 연결을 풀 수 없습니다(콘솔의 열쇠가 바뀌었습니다) — 「보내는 메일」에서 다시 연결해 주세요.');
    return { email: row.email, secret };
  },

  async addAgentMail(input, actor): Promise<{ id: string; subject: string }> {
    assertAdmin(actor, '메일 초안');
    const agentName = await agentNameOf(input.agentId);
    const letter = letterOf(input);
    const fileIds = [...new Set(input.fileIds ?? [])];
    if (fileIds.length > MAIL_LIMITS.files) throw new Error(`붙일 파일은 ${MAIL_LIMITS.files}개까지입니다.`);
    const db = getDb();
    if (fileIds.length) {
      const files = await db.select({ id: agentFiles.id, size: agentFiles.size }).from(agentFiles)
        .where(and(inArray(agentFiles.id, fileIds), eq(agentFiles.agentId, input.agentId)));
      if (files.length !== fileIds.length) throw new Error('붙일 파일을 찾을 수 없습니다 — 이 담당에게 넘긴 파일만 붙일 수 있습니다.');
      const total = files.reduce((n, f) => n + f.size, 0);
      if (total > MAIL_LIMITS.attachBytes) throw new Error(`붙일 파일은 합쳐 ${sizeLabel(MAIL_LIMITS.attachBytes)}까지입니다.`);
    }
    const id = crypto.randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(agentMails).values({ id, agentId: input.agentId, status: 'draft', ...letter, fileIds });
      await writeAudit(tx, {
        projectId: null, actor, action: '에이전트 메일 초안 (에이전트가 적음)', field: agentName, oldValue: null, newValue: letterLine(letter),
      });
    });
    return { id, subject: letter.subject };
  },

  async linkAgentMails(input, actor): Promise<void> {
    assertAdmin(actor, '메일 초안');
    if (input.ids.length === 0) return;
    await getDb().update(agentMails).set({ messageId: input.messageId })
      .where(and(eq(agentMails.agentId, input.agentId), inArray(agentMails.id, input.ids)));
  },

  async editAgentMail(input, actor): Promise<AgentMail> {
    assertAdmin(actor, '메일 초안');
    const agentName = await agentNameOf(input.agentId);
    const letter = letterOf(input);
    const db = getDb();
    await db.transaction(async (tx) => {
      const [old] = await tx.select().from(agentMails)
        .where(and(eq(agentMails.id, input.id), eq(agentMails.agentId, input.agentId))).for('update');
      if (!old) throw new Error('메일을 찾을 수 없습니다.');
      const st = statusOf(old.status);
      if (st === 'discarded') throw new Error('버린 메일입니다 — 되살린 뒤 고쳐 주세요.');
      if (st !== 'draft' && st !== 'failed') throw new Error(st === 'sent' ? '이미 보낸 메일은 고칠 수 없습니다.' : '보내는 중인 메일은 고칠 수 없습니다.');
      await tx.update(agentMails).set({ ...letter, updatedAt: new Date() }).where(eq(agentMails.id, old.id));
      await writeAudit(tx, {
        projectId: null, actor, action: '에이전트 메일 고침', field: agentName,
        oldValue: letterLine({ subject: old.subject, to: old.to ?? [], cc: old.cc ?? [] }), newValue: letterLine(letter),
      });
    });
    const [mail] = await mailsOf([await mailRow(input.agentId, input.id)]);
    return mail;
  },

  async setAgentMailDiscarded(input, actor): Promise<AgentMail> {
    assertAdmin(actor, '메일 초안');
    const agentName = await agentNameOf(input.agentId);
    const db = getDb();
    await db.transaction(async (tx) => {
      const [old] = await tx.select().from(agentMails)
        .where(and(eq(agentMails.id, input.id), eq(agentMails.agentId, input.agentId))).for('update');
      if (!old) throw new Error('메일을 찾을 수 없습니다.');
      const st = statusOf(old.status);
      if (input.discarded && st !== 'draft' && st !== 'failed') {
        throw new Error(st === 'discarded' ? '이미 버린 메일입니다.' : st === 'sent' ? '이미 보낸 메일은 버릴 수 없습니다.' : '보내는 중인 메일은 버릴 수 없습니다.');
      }
      if (!input.discarded && st !== 'discarded') throw new Error('버린 메일만 되살릴 수 있습니다.');
      await tx.update(agentMails).set({ status: input.discarded ? 'discarded' : 'draft', updatedAt: new Date() }).where(eq(agentMails.id, old.id));
      await writeAudit(tx, {
        projectId: null, actor, action: input.discarded ? '에이전트 메일 버림' : '에이전트 메일 되살림', field: agentName,
        oldValue: letterLine({ subject: old.subject, to: old.to ?? [], cc: old.cc ?? [] }), newValue: null,
      });
    });
    const [mail] = await mailsOf([await mailRow(input.agentId, input.id)]);
    return mail;
  },

  async claimAgentMail(input, actor): Promise<AgentMail> {
    assertAdmin(actor, '메일 보내기');
    const db = getDb();
    const row = await db.transaction(async (tx) => {
      const [old] = await tx.select().from(agentMails)
        .where(and(eq(agentMails.id, input.id), eq(agentMails.agentId, input.agentId))).for('update');
      if (!old) throw new Error('메일을 찾을 수 없습니다.');
      const st = statusOf(old.status);
      if (st === 'sent') throw new Error('이미 보낸 메일입니다.');
      if (st === 'discarded') throw new Error('버린 메일입니다 — 되살린 뒤 보내 주세요.');
      if (st === 'sending' && Date.now() - old.updatedAt.getTime() < STALE_SENDING_MS) throw new Error('보내는 중입니다 — 잠시 뒤 다시 보세요.');
      if ((old.to ?? []).length === 0) throw new Error('받는 사람이 없습니다 — 「고치기」로 받는 사람을 넣어 주세요.');
      const [claimed] = await tx.update(agentMails).set({ status: 'sending', error: null, updatedAt: new Date() })
        .where(eq(agentMails.id, old.id)).returning();
      return claimed;
    });
    const [mail] = await mailsOf([row]);
    return mail;
  },

  async finishAgentMail(input, actor): Promise<AgentMail> {
    assertAdmin(actor, '메일 보내기');
    const agentName = await agentNameOf(input.agentId);
    const db = getDb();
    await db.transaction(async (tx) => {
      const [old] = await tx.select().from(agentMails)
        .where(and(eq(agentMails.id, input.id), eq(agentMails.agentId, input.agentId))).for('update');
      if (!old) throw new Error('메일을 찾을 수 없습니다.');
      if (statusOf(old.status) !== 'sending') throw new Error('보내는 중인 메일이 아닙니다.');
      const line = letterLine({ subject: old.subject, to: old.to ?? [], cc: old.cc ?? [] });
      if (input.result.ok) {
        await tx.update(agentMails).set({
          status: 'sent', error: null, from: input.result.from, sentRef: input.result.ref,
          sentAt: new Date(), sentBy: actor.name, updatedAt: new Date(),
        }).where(eq(agentMails.id, old.id));
        await writeAudit(tx, { projectId: null, actor, action: '에이전트 메일 보냄', field: agentName, oldValue: null, newValue: line });
      } else {
        const error = input.result.error.slice(0, 500);
        await tx.update(agentMails).set({ status: 'failed', error, updatedAt: new Date() }).where(eq(agentMails.id, old.id));
        await writeAudit(tx, { projectId: null, actor, action: '에이전트 메일 실패', field: agentName, oldValue: line, newValue: error });
      }
    });
    const [mail] = await mailsOf([await mailRow(input.agentId, input.id)]);
    return mail;
  },
};

/** 대화에 실린 말들의 메일 — 지금 대화(withOrphans)면 답에 이어지지 못한 초안도 같이(오래된 것이 앞) */
export async function mailsForMessages(agentId: string, messageIds: string[], withOrphans: boolean): Promise<AgentMail[]> {
  const db = getDb();
  const [linked, orphans] = [
    messageIds.length
      ? await db.select().from(agentMails)
        .where(and(eq(agentMails.agentId, agentId), inArray(agentMails.messageId, messageIds)))
        .orderBy(asc(agentMails.createdAt))
      : [],
    withOrphans
      ? await db.select().from(agentMails)
        .where(and(eq(agentMails.agentId, agentId), isNull(agentMails.messageId)))
        .orderBy(asc(agentMails.createdAt))
      : [],
  ];
  return mailsOf([...linked, ...orphans].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()));
}

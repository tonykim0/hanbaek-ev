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
 *
 * ★현장 양식 메일★(lib/site-mail — 나이스 계약서 초안 · 현대엔지니어링 설치승인서)은 siteMail 하나가 쓴다: 계약서가 접수되면
 * 저절로(할 일 · 대화 한 줄 · 서류가 없으면 알림까지), 한백이 다시 요청하면 초안만. 그 양식의 메일이 나가면 finishAgentMail 이
 * 그 현장 · 양식의 할 일을 닫는다.
 */
import { and, asc, desc, eq, inArray, isNull, lte } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { writeAudit } from '@/lib/db/audit';
import {
  agentFiles, agentMails, agentMessages, agents, agentTasks, documents, mailAccounts, processDocuments, projects,
} from '@/lib/db/schema';
import { stampOf } from '@/lib/date';
import { getSecret } from '@/lib/auth/secret';
import { addressesOf, MAIL_LIMITS } from '@/lib/agents/mime';
import { scheduledAtOf, scheduleError, scheduleLabel } from '@/lib/agents/mail-schedule';
import { seal, unseal } from '@/lib/agents/secret-box';
import { sizeLabel } from '@/lib/agents/files';
import {
  blockedOf, checkLines, intakeSay, invalidAlarm, invalidError, invalidNoteOf, missingAlarm, missingError, missingNoteOf, planSiteDraft,
  siteMailOfKind, taskTitleOf, waitingNotesOf,
} from '@/lib/site-mail';
import type { AgentFile, AgentMail, AgentMailStatus, AgentMessageMeta, MailAccountInfo } from '@/types/agents';
import { AGENT_MAIL_STATUSES, agentAuditKey } from '@/types/agents';
import { asBiz, type Biz } from '@/lib/biz';
import type { ProjectRepository, SiteMailResult } from '../repository';
import { assertAdmin } from './shared';
import { notifyAgentAlarm, retractAgentAlarm } from './notifications';

/** 메일 계정 줄 — 콘솔에 하나 */
/*
 * 보내는 메일 계정 — ★사업마다 한 줄★(2026-11-04): 전기차 'mail'(0111 부터) · 태양광 'mail-solar'. 태양광 AI에이전트는 전기차와
 * 따로인 조직이라(한백 「태양광전용으로 하나 · 기존 전기차 AI에이전트에 붙이지 말고」) 한쪽에서 끊어도 다른 쪽은 그대로다.
 */
const ACCOUNT_ID: Record<Biz, string> = { ev: 'mail', solar: 'mail-solar' };
/** 감사기록의 칸 이름 — 사업마다 */
const ACCOUNT_FIELD: Record<Biz, string> = { ev: '보내는 메일', solar: '보내는 메일(태양광)' };
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
    checks: checkLines(r.docFiles ?? []),
    error: r.error,
    from: r.from,
    createdAt: stampOf(r.createdAt),
    sentAt: r.sentAt ? stampOf(r.sentAt) : null,
    sentBy: r.sentBy,
    scheduledDay: r.status === 'scheduled' && r.scheduledAt ? stampOf(r.scheduledAt).slice(0, 10) : null,
    scheduledBy: r.status === 'scheduled' ? r.scheduledBy ?? null : null,
  };
}

/** 줄 여럿의 붙일 파일을 한 번에 읽는다 */
export async function mailsOf(rows: MailRow[]): Promise<AgentMail[]> {
  const ids = [...new Set(rows.flatMap((r) => r.fileIds ?? []))];
  const files = ids.length ? await getDb().select().from(agentFiles).where(inArray(agentFiles.id, ids)) : [];
  const byId = new Map(files.map((f) => [f.id, fileOf(f)]));
  return rows.map((r) => mailOf(r, byId));
}

/** 담당의 이름(말 · 할 일에 「적은 쪽」으로 선다)과 감사기록의 열쇠(types/agents agentAuditKey — 주간 기록이 찾는다) · 사업 */
async function agentLabelOf(id: string): Promise<{ name: string; key: string; biz: Biz }> {
  const [row] = await getDb().select({ name: agents.name, biz: agents.biz }).from(agents).where(eq(agents.id, id)).limit(1);
  if (!row) throw new Error('담당을 찾을 수 없습니다.');
  return { name: row.name, key: agentAuditKey(row), biz: asBiz(row.biz) };
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
  | 'siteMail' | 'projectMails' | 'siteDocFiles' | 'scheduleAgentMail' | 'dueAgentMails'
> = {
  /**
   * 현장 양식 메일 (lib/site-mail) — 지금 서류로 쓴 초안(letter)을 그 담당의 초안으로 둔다. 한 트랜잭션 · 그 현장 줄을 잡고 본다
   * (같은 현장 · 양식의 초안을 동시에 둘 만들지 않게).
   * 무엇을 할지는 planSiteDraft 다: 보내지 않은 초안이 같으면 그대로 · 다르면 버리고 새로(받는 사람은 이어받는다) · 같은 서류로
   * 이미 보냈으면 저절로 돌 때는 그만 · 아니면 새로(받는 사람은 같은 양식으로 마지막에 보낸 메일의 것 — 처음이면 비어 있다).
   *
   * intake(계약서 접수 때 저절로 — lib/site-mail-run)면 더 한다: 할 일(같은 현장 · 양식의 열린 것이 없을 때) · 대화 한 줄(말의 종류
   * auto — 새로 한 것이 있을 때만, 같은 접수가 두 번 불려도 한 줄) · 서류가 없으면 한백 관리자 알림. intake 가 아니면(한백의 요청)
   * 서류가 없을 때 사람 말로 던진다 — 대화의 도구 · 단추가 그 말을 그대로 보인다.
   */
  async siteMail(input, actor): Promise<SiteMailResult> {
    assertAdmin(actor, '현장 메일');
    const spec = siteMailOfKind(input.kind);
    if (!spec) throw new Error('모르는 양식의 메일입니다.');
    const { name: agentName, key: agentKey } = await agentLabelOf(spec.agentId);
    const letterIn = input.letter;
    const docFiles = letterIn ? letterIn.docFiles.slice(0, MAIL_LIMITS.files) : [];
    if (letterIn) {
      const total = docFiles.reduce((n, f) => n + (f.size || 0), 0);
      if (total > MAIL_LIMITS.attachBytes) throw new Error(`붙일 서류는 합쳐 ${sizeLabel(MAIL_LIMITS.attachBytes)}까지입니다.`);
    }
    const db = getDb();
    const out = await db.transaction(async (tx) => {
      const [site] = await tx.select({ id: projects.id, name: projects.name }).from(projects)
        .where(eq(projects.id, input.projectId)).for('update');
      if (!site) throw new Error('현장을 찾을 수 없습니다.');
      const rows = await tx.select().from(agentMails)
        .where(and(eq(agentMails.projectId, site.id), eq(agentMails.kind, spec.kind)))
        .orderBy(desc(agentMails.createdAt));
      const open = rows.find((r) => r.status === 'draft' || r.status === 'failed') ?? null;
      const plan = planSiteDraft(
        letterIn ? { ...letterIn, docFiles } : null,
        {
          open: open && { subject: open.subject, body: open.body, docFiles: open.docFiles ?? [] },
          sent: rows.filter((r) => r.status === 'sent').map((r) => (r.docFiles ?? []).map((f) => f.url)),
        },
        !input.intake,
        input.force === true,
      );
      if (plan === 'missing' && !input.intake) throw new Error(missingError(spec));
      const blocked = blockedOf(letterIn);
      if (plan === 'invalid' && !input.intake) throw new Error(invalidError(spec, blocked));
      const none = { plan, mailId: null as string | null, taskId: null as string | null, messageId: null as string | null, alarmed: 0 };
      if (plan === 'sent') return none;

      /*
       * 버린다 — 서류가 바뀌었거나(replace) 칸이 비었거나(missing) 맞지 않는데(invalid) 보내지 않은 초안이 남았을 때. 그 초안의 파일은
       * 이제 칸에 없거나 보낼 수 없는 것이다
       */
      const discarded = open !== null && (plan === 'replace' || plan === 'missing' || plan === 'invalid');
      if (open && discarded) {
        await tx.update(agentMails).set({ status: 'discarded', updatedAt: new Date() }).where(eq(agentMails.id, open.id));
        await writeAudit(tx, {
          projectId: site.id, actor, action: '에이전트 메일 버림', field: agentKey,
          oldValue: letterLine({ subject: open.subject, to: open.to ?? [], cc: open.cc ?? [] }),
          newValue: plan === 'replace' ? '서류가 바뀌어 새로 씀'
            : plan === 'invalid' ? `${spec.doc} 확인 필요 — ${blocked.join(' / ')}`.slice(0, 2000) : `${spec.doc} 없음`,
        });
      }
      /* 그대로 둔 초안 — 서류를 본 결과만 지금 것으로(같은 파일이라도 콘솔의 주소 · 기수가 바뀌었을 수 있다) */
      if (plan === 'keep' && open && letterIn) {
        await tx.update(agentMails).set({ docFiles, updatedAt: new Date() }).where(eq(agentMails.id, open.id));
      }
      let mailId: string | null = plan === 'keep' && open ? open.id : null;
      let to: string[] = plan === 'keep' && open ? open.to ?? [] : [];
      if ((plan === 'create' || plan === 'replace') && letterIn) {
        /* 받는 사람 — 버린 초안의 것(한백이 넣은 주소를 잃지 않게), 아니면 같은 양식으로 마지막에 보낸 메일의 것 */
        const [last] = open
          ? [{ to: open.to ?? [], cc: open.cc ?? [] }]
          : await tx.select({ to: agentMails.to, cc: agentMails.cc }).from(agentMails)
            .where(and(eq(agentMails.kind, spec.kind), eq(agentMails.status, 'sent')))
            .orderBy(desc(agentMails.sentAt)).limit(1);
        const letter = letterOf({ to: last?.to ?? [], cc: last?.cc ?? [], subject: letterIn.subject, body: letterIn.body }, { emptyTo: true });
        mailId = crypto.randomUUID();
        to = letter.to;
        await tx.insert(agentMails).values({
          id: mailId, agentId: spec.agentId, status: 'draft', ...letter, fileIds: [], docFiles, projectId: site.id, kind: spec.kind,
        });
        await writeAudit(tx, {
          projectId: site.id, actor, action: '현장 메일 초안', field: agentKey, oldValue: null,
          newValue: `${letterLine(letter)} · 첨부 ${docFiles.map((f) => f.name).join(', ')}`.slice(0, 2000),
        });
        // 서류가 채워지거나 고쳐져 메일을 쓰게 됐다 — 「못 보냄」 알림과 할 일의 「없음 · 확인 필요」 덧붙임은 이제 거짓말이다
        await retractAgentAlarm(tx, { projectId: site.id, docKind: spec.slot });
        await tx.update(agentTasks).set({ note: null }).where(and(
          eq(agentTasks.agentId, spec.agentId), eq(agentTasks.projectId, site.id), eq(agentTasks.kind, spec.kind),
          isNull(agentTasks.doneAt), inArray(agentTasks.note, waitingNotesOf(spec)),
        ));
      }
      if (!input.intake) return { ...none, mailId };

      /* 할 일 — 같은 현장 · 양식의 열린 것이 없을 때만. 그 양식의 메일이 나가면 finishAgentMail 이 닫는다 */
      const [openTask] = await tx.select({ id: agentTasks.id, note: agentTasks.note }).from(agentTasks).where(and(
        eq(agentTasks.agentId, spec.agentId), eq(agentTasks.projectId, site.id), eq(agentTasks.kind, spec.kind), isNull(agentTasks.doneAt),
      )).limit(1);
      const title = taskTitleOf(spec);
      const waitNote = plan === 'missing' ? missingNoteOf(spec) : plan === 'invalid' ? invalidNoteOf(spec) : null;
      let taskId: string | null = null;
      const noteChanged = Boolean(openTask && waitNote && openTask.note !== waitNote);
      if (openTask && waitNote && noteChanged) {
        // 열린 할 일의 까닭을 지금 것으로 — 없던 서류가 들어왔는데 맞지 않으면 「없음」이 「확인 필요」로
        await tx.update(agentTasks).set({ note: waitNote }).where(eq(agentTasks.id, openTask.id));
      }
      if (!openTask) {
        taskId = crypto.randomUUID();
        const note = waitNote;
        await tx.insert(agentTasks).values({
          id: taskId, agentId: spec.agentId, title, note, projectId: site.id, kind: spec.kind, author: agentName,
        });
        await writeAudit(tx, {
          projectId: site.id, actor, action: '에이전트 할 일 (에이전트가 적음)', field: agentKey, oldValue: null,
          newValue: [title, site.name, note].filter(Boolean).join(' · ').slice(0, 2000),
        });
      }

      /* 새로 한 것이 없으면 말하지 않는다 — 같은 접수가 두 번 불려도(두 번 누름) 대화에 한 줄 */
      const wrote = plan === 'create' || plan === 'replace';
      if (!wrote && taskId === null && !discarded && !noteChanged) return { ...none, mailId };
      const body = intakeSay(spec, site.name, {
        plan, to, taskAdded: taskId !== null, empty: input.intake.empty,
        checks: plan === 'invalid' ? blocked : checkLines(docFiles),
      });
      const messageId = crypto.randomUUID();
      const meta: AgentMessageMeta = {
        site: { id: site.id, name: site.name },
        ...(taskId ? { added: [title] } : {}),
        ...(wrote && letterIn ? { mails: [letterIn.subject] } : {}),
      };
      await tx.insert(agentMessages).values({ id: messageId, agentId: spec.agentId, role: 'auto', author: agentName, body, meta });
      await writeAudit(tx, {
        projectId: site.id, actor, action: '에이전트 자동', field: agentKey, oldValue: null, newValue: body.slice(0, 2000),
      });
      /* 초안은 이 말 밑에 선다 — 그대로 둔 초안은 아직 어느 말에도 안 이어졌을 때만(사람이 단추로 먼저 쓴 것) */
      if (mailId && (wrote || (open !== null && open.messageId === null))) {
        await tx.update(agentMails).set({ messageId }).where(eq(agentMails.id, mailId));
      }
      /*
       * 서류가 없거나 맞지 않아 못 쓴 것은 한백 관리자에게 알린다(한백 「없어서 못보낸다고 알람을 줘야하고」). 안 읽은 앞 알림은 거두고 —
       * 같은 현장 · 칸의 알림은 지금의 까닭 하나만 선다(「없음」 뒤에 맞지 않는 파일이 들어오면 「확인 필요」로 바뀐다)
       */
      const alarm = plan === 'missing' ? missingAlarm(spec, agentName)
        : plan === 'invalid' ? invalidAlarm(spec, agentName, blocked) : null;
      let alarmed = 0;
      if (alarm) {
        await retractAgentAlarm(tx, { projectId: site.id, docKind: spec.slot });
        alarmed = await notifyAgentAlarm(tx, { projectId: site.id, docKind: spec.slot, ...alarm });
      }
      return { plan, mailId, taskId, messageId, alarmed };
    });
    const mail = out.mailId ? (await mailsOf([await mailRow(spec.agentId, out.mailId)]))[0] : null;
    return { plan: out.plan, mail, taskId: out.taskId, messageId: out.messageId, alarmed: out.alarmed };
  },

  /** 그 현장의 그 양식 메일 — 오래된 것이 앞 */
  async projectMails(projectId, kind, actor): Promise<AgentMail[]> {
    assertAdmin(actor, '현장 메일');
    const rows = await getDb().select().from(agentMails)
      .where(and(eq(agentMails.projectId, projectId), eq(agentMails.kind, kind)))
      .orderBy(asc(agentMails.createdAt));
    return mailsOf(rows);
  },

  async getMailAccount(actor, biz: Biz = 'ev'): Promise<MailAccountInfo | null> {
    assertAdmin(actor, '메일 계정');
    const [row] = await getDb().select().from(mailAccounts).where(eq(mailAccounts.id, ACCOUNT_ID[biz])).limit(1);
    return row ? { email: row.email, connectedAt: stampOf(row.connectedAt), connectedBy: row.connectedBy } : null;
  },

  async saveMailAccount(input, actor): Promise<MailAccountInfo> {
    assertAdmin(actor, '메일 계정');
    const email = input.email.trim();
    if (!email || !input.secret) throw new Error('메일 주소와 앱 비밀번호를 적어주세요.');
    const token = seal(input.secret, getSecret());
    const server = input.server;
    const biz = input.biz ?? 'ev';
    const db = getDb();
    await db.transaction(async (tx) => {
      const [old] = await tx.select({ email: mailAccounts.email }).from(mailAccounts).where(eq(mailAccounts.id, ACCOUNT_ID[biz])).for('update');
      await tx.insert(mailAccounts)
        .values({ id: ACCOUNT_ID[biz], email, token, server, connectedBy: actor.name })
        .onConflictDoUpdate({
          target: mailAccounts.id,
          set: { email, token, server, connectedBy: actor.name, connectedAt: new Date() },
        });
      await writeAudit(tx, {
        projectId: null, actor, action: '메일 계정 연결', field: ACCOUNT_FIELD[biz], oldValue: old?.email ?? null, newValue: email,
      });
    });
    const saved = await agentMailStore.getMailAccount(actor, biz);
    if (!saved) throw new Error('연결을 저장하지 못했습니다.');
    return saved;
  },

  async deleteMailAccount(actor, biz: Biz = 'ev'): Promise<{ email: string } | null> {
    assertAdmin(actor, '메일 계정');
    const db = getDb();
    return db.transaction(async (tx) => {
      const [gone] = await tx.delete(mailAccounts).where(eq(mailAccounts.id, ACCOUNT_ID[biz])).returning();
      if (!gone) return null;
      await writeAudit(tx, { projectId: null, actor, action: '메일 계정 끊음', field: ACCOUNT_FIELD[biz], oldValue: gone.email, newValue: null });
      return { email: gone.email };
    });
  },

  /** 그 담당의 사업의 보내는 메일 — 태양광 담당의 초안은 태양광 계정으로만 나간다 */
  async mailCredential(actor, agentId: string): Promise<{ email: string; secret: string }> {
    assertAdmin(actor, '메일 보내기');
    const { biz } = await agentLabelOf(agentId);
    const [row] = await getDb().select().from(mailAccounts).where(eq(mailAccounts.id, ACCOUNT_ID[biz])).limit(1);
    if (!row) throw new Error(NO_ACCOUNT);
    const secret = unseal(row.token, getSecret());
    if (!secret) throw new Error('메일 연결을 풀 수 없습니다(콘솔의 열쇠가 바뀌었습니다) — 「보내는 메일」에서 다시 연결해 주세요.');
    return { email: row.email, secret };
  },

  async addAgentMail(input, actor): Promise<{ id: string; subject: string }> {
    assertAdmin(actor, '메일 초안');
    const { name: agentName, key: agentKey } = await agentLabelOf(input.agentId);
    const letter = letterOf(input);
    const fileIds = [...new Set(input.fileIds ?? [])];
    /* 콘솔이 묶어 올린 현장 서류(lib/agents/bundle-run — 여러 현장의 같은 서류 zip). 우리 Blob 의 이 담당 자리만 받는다 */
    const docFiles = input.docFiles ?? [];
    for (const f of docFiles) {
      let ours = false;
      try {
        const u = new URL(f.url);
        ours = u.protocol === 'https:' && u.hostname.endsWith('.public.blob.vercel-storage.com')
          && u.pathname.startsWith(`/agent-files/${input.agentId}/bundles/`);
      } catch { /* 주소가 아니다 */ }
      if (!ours) throw new Error('붙일 묶음을 찾을 수 없습니다.');
    }
    if (fileIds.length + docFiles.length > MAIL_LIMITS.files) throw new Error(`붙일 파일은 ${MAIL_LIMITS.files}개까지입니다.`);
    const db = getDb();
    let total = docFiles.reduce((n, f) => n + (f.size || 0), 0);
    if (fileIds.length) {
      const files = await db.select({ id: agentFiles.id, size: agentFiles.size }).from(agentFiles)
        .where(and(inArray(agentFiles.id, fileIds), eq(agentFiles.agentId, input.agentId)));
      if (files.length !== fileIds.length) throw new Error('붙일 파일을 찾을 수 없습니다 — 이 담당에게 넘긴 파일만 붙일 수 있습니다.');
      total += files.reduce((n, f) => n + f.size, 0);
    }
    if (total > MAIL_LIMITS.attachBytes) throw new Error(`붙일 파일은 합쳐 ${sizeLabel(MAIL_LIMITS.attachBytes)}까지입니다.`);
    const id = crypto.randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(agentMails).values({ id, agentId: input.agentId, status: 'draft', ...letter, fileIds, docFiles });
      await writeAudit(tx, {
        projectId: null, actor, action: '에이전트 메일 초안 (에이전트가 적음)', field: agentKey, oldValue: null, newValue: letterLine(letter),
      });
    });
    return { id, subject: letter.subject };
  },

  /**
   * 여러 현장의 한 서류 칸 — 묶어 메일에 붙일 때(lib/agents/bundle-run). 준 차례대로, 현장마다 그 칸의 파일(없으면 빈 목록).
   * 계약 서류(documents)와 공정 서류(process_documents)를 table 로 가른다. 없는 현장 id 는 빠진다.
   */
  async siteDocFiles(actor, input): Promise<Array<{
    projectId: string; mgmtNo: string | null; name: string; cpo: string | null; files: Array<{ name: string; url: string }>;
  }>> {
    assertAdmin(actor, '현장 서류 묶기');
    const ids = [...new Set(input.projectIds)];
    if (ids.length === 0) return [];
    const db = getDb();
    const sites = await db.select({ id: projects.id, mgmtNo: projects.mgmtNo, name: projects.name, cpo: projects.cpo })
      .from(projects).where(inArray(projects.id, ids));
    const docs = input.table === 'contract'
      ? await db.select({ projectId: documents.projectId, files: documents.files }).from(documents)
        .where(and(inArray(documents.projectId, ids), eq(documents.kind, input.kind)))
      : await db.select({ projectId: processDocuments.projectId, files: processDocuments.files }).from(processDocuments)
        .where(and(inArray(processDocuments.projectId, ids), eq(processDocuments.kind, input.kind)));
    const filesOf = new Map<string, Array<{ name: string; url: string }>>();
    for (const d of docs) {
      const list = (Array.isArray(d.files) ? d.files : []) as Array<{ name?: unknown; url?: unknown }>;
      filesOf.set(d.projectId, [
        ...(filesOf.get(d.projectId) ?? []),
        ...list.filter((f) => typeof f.url === 'string' && f.url && typeof f.name === 'string')
          .map((f) => ({ name: f.name as string, url: f.url as string })),
      ]);
    }
    const byId = new Map(sites.map((p) => [p.id, p]));
    return ids.flatMap((id) => {
      const p = byId.get(id);
      return p ? [{ projectId: p.id, mgmtNo: p.mgmtNo, name: p.name, cpo: p.cpo, files: filesOf.get(p.id) ?? [] }] : [];
    });
  },

  async linkAgentMails(input, actor): Promise<void> {
    assertAdmin(actor, '메일 초안');
    if (input.ids.length === 0) return;
    await getDb().update(agentMails).set({ messageId: input.messageId })
      .where(and(eq(agentMails.agentId, input.agentId), inArray(agentMails.id, input.ids)));
  },

  async editAgentMail(input, actor): Promise<AgentMail> {
    assertAdmin(actor, '메일 초안');
    const { name: agentName, key: agentKey } = await agentLabelOf(input.agentId);
    const letter = letterOf(input);
    const db = getDb();
    await db.transaction(async (tx) => {
      const [old] = await tx.select().from(agentMails)
        .where(and(eq(agentMails.id, input.id), eq(agentMails.agentId, input.agentId))).for('update');
      if (!old) throw new Error('메일을 찾을 수 없습니다.');
      const st = statusOf(old.status);
      if (st === 'discarded') throw new Error('버린 메일입니다 — 되살린 뒤 고쳐 주세요.');
      if (st === 'scheduled') throw new Error('예약한 메일입니다 — 예약을 취소한 뒤 고쳐 주세요.');
      if (st !== 'draft' && st !== 'failed') throw new Error(st === 'sent' ? '이미 보낸 메일은 고칠 수 없습니다.' : '보내는 중인 메일은 고칠 수 없습니다.');
      await tx.update(agentMails).set({ ...letter, updatedAt: new Date() }).where(eq(agentMails.id, old.id));
      await writeAudit(tx, {
        projectId: null, actor, action: '에이전트 메일 고침', field: agentKey,
        oldValue: letterLine({ subject: old.subject, to: old.to ?? [], cc: old.cc ?? [] }), newValue: letterLine(letter),
      });
    });
    const [mail] = await mailsOf([await mailRow(input.agentId, input.id)]);
    return mail;
  },

  async setAgentMailDiscarded(input, actor): Promise<AgentMail> {
    assertAdmin(actor, '메일 초안');
    const { name: agentName, key: agentKey } = await agentLabelOf(input.agentId);
    const db = getDb();
    await db.transaction(async (tx) => {
      const [old] = await tx.select().from(agentMails)
        .where(and(eq(agentMails.id, input.id), eq(agentMails.agentId, input.agentId))).for('update');
      if (!old) throw new Error('메일을 찾을 수 없습니다.');
      const st = statusOf(old.status);
      if (input.discarded && st !== 'draft' && st !== 'failed' && st !== 'scheduled') {
        throw new Error(st === 'discarded' ? '이미 버린 메일입니다.' : st === 'sent' ? '이미 보낸 메일은 버릴 수 없습니다.' : '보내는 중인 메일은 버릴 수 없습니다.');
      }
      if (!input.discarded && st !== 'discarded') throw new Error('버린 메일만 되살릴 수 있습니다.');
      await tx.update(agentMails).set({
        status: input.discarded ? 'discarded' : 'draft', scheduledAt: null, scheduledBy: null, updatedAt: new Date(),
      }).where(eq(agentMails.id, old.id));
      await writeAudit(tx, {
        projectId: null, actor, action: input.discarded ? '에이전트 메일 버림' : '에이전트 메일 되살림', field: agentKey,
        oldValue: letterLine({ subject: old.subject, to: old.to ?? [], cc: old.cc ?? [] }), newValue: null,
      });
    });
    const [mail] = await mailsOf([await mailRow(input.agentId, input.id)]);
    return mail;
  },

  /**
   * 예약 보내기 — day(YYYY-MM-DD)를 주면 그날 오전 9시대에 나가게 예약한다(승인은 지금 예약하는 사람), null 이면 예약을 거둔다
   * (초안으로). 승인 대기 · 보내지 못함 · 이미 예약한 것만 예약하고, 받는 사람이 있어야 한다. lib/agents/mail-schedule 이 날을 본다.
   */
  async scheduleAgentMail(input, actor): Promise<AgentMail> {
    assertAdmin(actor, '메일 예약');
    const { key: agentKey } = await agentLabelOf(input.agentId);
    if (input.day !== null) {
      const why = scheduleError(input.day);
      if (why) throw new Error(why);
    }
    const db = getDb();
    await db.transaction(async (tx) => {
      const [old] = await tx.select().from(agentMails)
        .where(and(eq(agentMails.id, input.id), eq(agentMails.agentId, input.agentId))).for('update');
      if (!old) throw new Error('메일을 찾을 수 없습니다.');
      const st = statusOf(old.status);
      const line = letterLine({ subject: old.subject, to: old.to ?? [], cc: old.cc ?? [] });
      if (input.day === null) {
        if (st !== 'scheduled') throw new Error('예약한 메일이 아닙니다.');
        await tx.update(agentMails).set({ status: 'draft', scheduledAt: null, scheduledBy: null, updatedAt: new Date() })
          .where(eq(agentMails.id, old.id));
        await writeAudit(tx, { projectId: null, actor, action: '에이전트 메일 예약 취소', field: agentKey, oldValue: line, newValue: null });
        return;
      }
      if (st !== 'draft' && st !== 'failed' && st !== 'scheduled') {
        throw new Error(st === 'sent' ? '이미 보낸 메일입니다.' : st === 'discarded' ? '버린 메일입니다 — 되살린 뒤 예약해 주세요.' : '보내는 중인 메일입니다.');
      }
      if ((old.to ?? []).length === 0) throw new Error('받는 사람이 없습니다 — 「고치기」로 받는 사람을 넣어 주세요.');
      await tx.update(agentMails).set({
        status: 'scheduled', scheduledAt: scheduledAtOf(input.day), scheduledBy: actor.name, error: null, updatedAt: new Date(),
      }).where(eq(agentMails.id, old.id));
      await writeAudit(tx, {
        projectId: null, actor, action: '에이전트 메일 예약', field: agentKey, oldValue: null, newValue: `${line} · ${scheduleLabel(input.day)}`,
      });
    });
    const [mail] = await mailsOf([await mailRow(input.agentId, input.id)]);
    return mail;
  },

  /** 때가 된 예약 — 예약한 날 오전 9시가 지난 것(크론 /api/cron/mails 가 하나씩 보낸다). 예약한 사람을 같이 */
  async dueAgentMails(actor, now): Promise<Array<{ agentId: string; id: string; scheduledBy: string | null }>> {
    assertAdmin(actor, '메일 예약');
    return getDb().select({ agentId: agentMails.agentId, id: agentMails.id, scheduledBy: agentMails.scheduledBy }).from(agentMails)
      .where(and(eq(agentMails.status, 'scheduled'), lte(agentMails.scheduledAt, now)))
      .orderBy(asc(agentMails.scheduledAt), asc(agentMails.createdAt));
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
    const { name: agentName, key: agentKey } = await agentLabelOf(input.agentId);
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
        await writeAudit(tx, { projectId: null, actor, action: '에이전트 메일 보냄', field: agentKey, oldValue: null, newValue: line });
        /* 현장 양식 메일이면 그 현장 · 양식의 할 일이 끝난다 — 접수 때 담당이 적은 「… 메일 보내기」(lib/site-mail) */
        if (old.projectId && old.kind) {
          const closed = await tx.update(agentTasks).set({ doneAt: new Date() }).where(and(
            eq(agentTasks.agentId, old.agentId), eq(agentTasks.projectId, old.projectId), eq(agentTasks.kind, old.kind), isNull(agentTasks.doneAt),
          )).returning({ title: agentTasks.title });
          if (closed.length) {
            const [site] = await tx.select({ name: projects.name }).from(projects).where(eq(projects.id, old.projectId));
            for (const t of closed) {
              await writeAudit(tx, {
                projectId: old.projectId, actor, action: '에이전트 할 일 끝냄', field: agentKey,
                oldValue: [t.title, site?.name].filter(Boolean).join(' · '), newValue: '끝냄 — 메일 보냄',
              });
            }
          }
        }
      } else {
        const error = input.result.error.slice(0, 500);
        await tx.update(agentMails).set({ status: 'failed', error, updatedAt: new Date() }).where(eq(agentMails.id, old.id));
        await writeAudit(tx, { projectId: null, actor, action: '에이전트 메일 실패', field: agentKey, oldValue: line, newValue: error });
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

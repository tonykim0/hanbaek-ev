/**
 * 현장 양식 메일 — 운영사 담당이 접수된 현장의 서류를 붙여 보내는 메일. 무엇을 · 언제 · 어떻게 말하는지 한 곳이다. [순수]
 *
 *   나이스인프라    계약서 초안(워드) — 본문은 한백이 준 양식(인사 · 제출 정보 1~7번 · 맺음, lib/nice-submit) · 한백 지시 2026-11-03
 *   현대엔지니어링  설치승인서 — 한백 지시 2026-11-04 「접수되는 현장들 서류 중에 설치승인서를 메일로 보내줘야해」. 본문 양식은 아직
 *                   받지 않아 인사 · 현장 · 주소 · 맺음으로 둔다(카드의 「고치기」로 고친다 — 양식을 받으면 hecLetter 를 고친다)
 *
 * 흐름 (lib/site-mail-run · store/agent-mail siteMail):
 *   · ★계약서가 접수되면 저절로★(한백 2026-11-04 「바로 할 일로 올려서 메일 초안작성해서 보내야해. 그걸 대화창에서 보여줘야하고」) —
 *     그 담당이 할 일을 적고 초안을 쓰고 대화에 한 줄 남긴다(말의 종류 'auto' — 모델을 부르지 않는다, 양식이 정해져 있다).
 *   · ★붙일 서류가 없으면 못 보낸다고 알린다★(한백 「만약 없을 경우, 없어서 못보낸다고 알람을 줘야하고」) — 대화에 그 말, 한백
 *     관리자에게 알림(notifications 'agent'). 할 일은 열린 채로 남는다.
 *   · ★서류가 채워지면 한백이 다시 요청한다★(한백 「그때 내가 다시 요청할 예정이고, 넌 그때 메일을 다시 보내줘」) — 그 담당과의
 *     대화에서(lib/agents/brain 의 site_mail 도구) · 나이스는 제출 정보 밑 「계약서 초안 메일」 단추로도.
 *   · ★나가는 것은 여전히 한백의 승인이다★ — 초안 카드의 「승인하고 보내기」. 나가면 그 현장 · 양식의 할 일이 저절로 끝난다.
 * 같은 일을 두 번 하지 않는다 — planSiteDraft 가 가르고, 새로 한 것이 있을 때만 대화에 말한다.
 */
import type { CpoName } from '@/types/project';
import { NICE_DRAFT_MAIL, niceDraftMail, niceSubmitLines, type NiceSubmitSite } from './nice-submit';

/** 양식 메일의 본문을 짓는 데 쓰는 현장 값 */
export type SiteMailSite = NiceSubmitSite;

export interface SiteMailSpec {
  /** 양식 이름 — agent_mails.kind · agent_tasks.kind */
  kind: string;
  cpo: CpoName;
  /** 맡은 담당 — migrations/0109 가 심은 id */
  agentId: string;
  /** 붙일 서류 칸(lib/doc-rules 의 key) */
  slot: string;
  /** 붙일 서류의 이름 — 말에 쓴다 */
  doc: string;
  /** 메일의 이름 — 할 일 · 말 */
  label: string;
  letter(p: SiteMailSite, qty: number): { subject: string; body: string };
}

/** 현대엔지니어링 설치승인서 메일 — 양식을 받기 전의 기본 꼴(나이스 양식과 같은 결: 인사 · 현장 · 맺음) */
export function hecLetter(p: SiteMailSite): { subject: string; body: string } {
  return {
    subject: `설치승인서 송부 — ${p.name}`,
    body: ['안녕하세요, 설치승인서 송부드립니다.', '', `현장 : ${p.name}`, `주소 : ${p.addr ?? ''}`, '', '감사합니다'].join('\n'),
  };
}

export const HEC_APPROVAL_MAIL = 'hec-install-approval';

export const SITE_MAILS: readonly SiteMailSpec[] = [
  {
    kind: NICE_DRAFT_MAIL, cpo: '나이스인프라', agentId: 'op-nice', slot: 'contractDraft',
    doc: '계약서 초안', label: '계약서 초안 메일', letter: niceDraftMail,
  },
  {
    kind: HEC_APPROVAL_MAIL, cpo: '현대엔지니어링', agentId: 'op-hec', slot: 'approval',
    doc: '설치승인서', label: '설치승인서 메일', letter: hecLetter,
  },
];

export const siteMailOfCpo = (cpo: string | null | undefined): SiteMailSpec | null =>
  SITE_MAILS.find((s) => s.cpo === cpo) ?? null;
export const siteMailOfKind = (kind: string | null | undefined): SiteMailSpec | null =>
  SITE_MAILS.find((s) => s.kind === kind) ?? null;

/** 받침이 있으면 앞의 조사, 없으면 뒤의 것 — 「계약서 초안이」 · 「설치승인서가」 */
export function josa(word: string, withFinal: string, without: string): string {
  const code = word.trim().charCodeAt(word.trim().length - 1) - 0xac00;
  const final = code >= 0 && code <= 11171 && code % 28 !== 0;
  return `${word}${final ? withFinal : without}`;
}

/** 접수 때 담당이 적는 할 일 — 그 양식의 메일이 나가면 저절로 끝난다 */
export const taskTitleOf = (spec: SiteMailSpec) => `${spec.label} 보내기`;

/** 붙일 서류가 없어 열어 둔 할 일의 덧붙임 — 서류가 채워져 초안을 쓰면 걷는다(이제 거짓말이다) */
export const missingNoteOf = (spec: SiteMailSpec) => `${spec.doc} 없음 — 채워지면 다시 요청`;

/** 붙일 서류가 없을 때 — 한백이 요청한 길(대화 · 단추)이 이 말로 멈춘다 */
export const missingError = (spec: SiteMailSpec) => `${josa(spec.doc, '이', '가')} 없습니다 — 먼저 올려 주세요.`;

/** 메일 하나의 견줄 모양 — 초안이든 지금 서류로 쓴 것이든 */
export interface LetterLike {
  subject: string;
  body: string;
  docFiles: ReadonlyArray<{ url: string }>;
}

const subjectKey = (s: string) => s.replace(/\s+/g, ' ').trim();
const bodyKey = (s: string) => s.replace(/\r\n/g, '\n').trim();
const urlsOf = (l: LetterLike) => l.docFiles.map((f) => f.url);
const sameList = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** 같은 메일인가 — 제목 · 본문(저장할 때 다듬는 그대로 견준다) · 붙일 파일 주소(순서까지) */
export function sameLetter(a: LetterLike, b: LetterLike): boolean {
  return subjectKey(a.subject) === subjectKey(b.subject) && bodyKey(a.body) === bodyKey(b.body) && sameList(urlsOf(a), urlsOf(b));
}

/**
 * 지금 서류로 쓴 초안(letter)을 어떻게 할까 —
 *   missing  붙일 서류가 없다 — 쓰지 못한다(보내지 않은 초안이 남아 있으면 버린다: 그 파일은 이제 칸에 없다)
 *   keep     보내지 않은 초안이 지금 서류와 같다 — 그대로 둔다(두 번 눌러도 · 같은 접수가 두 번 불려도 하나)
 *   replace  보내지 않은 초안이 지금 서류와 다르다(다시 접수하며 서류 · 값이 바뀜) — 버리고 새로 쓴다(받는 사람은 이어받는다)
 *   sent     같은 서류로 이미 보냈다 — 아무것도 안 한다. ★저절로 돌 때만★ — 한백이 요청하면(requested) 다시 쓴다
 *   create   새로 쓴다
 * @param s.open 보내지 않은(승인 대기 · 보내지 못함) 가장 최근 초안 · s.sent 이 현장 · 양식으로 보낸 메일들의 붙인 파일 주소
 */
export type DraftPlan = 'missing' | 'keep' | 'replace' | 'sent' | 'create';

export function planSiteDraft(
  letter: LetterLike | null,
  s: { open: LetterLike | null; sent: ReadonlyArray<readonly string[]> },
  requested: boolean,
): DraftPlan {
  if (!letter) return 'missing';
  if (s.open) return sameLetter(s.open, letter) ? 'keep' : 'replace';
  if (!requested && s.sent.some((urls) => sameList(urls, urlsOf(letter)))) return 'sent';
  return 'create';
}

/** 메일에 비어 나가는 줄 — 나이스 제출 정보 1~7번 중 값이 없는 것(「7번 기설치 현황」). 다른 양식은 없다 */
export function emptyFieldsOf(spec: SiteMailSpec, p: SiteMailSite, qty: number): string[] {
  if (spec.kind !== NICE_DRAFT_MAIL) return [];
  return niceSubmitLines(p, qty).flatMap((line) => {
    const m = /^(\d)\. (.+?) : $/.exec(line);
    return m ? [`${m[1]}번 ${m[2]}`] : [];
  });
}

/**
 * 계약서가 접수됐을 때 담당이 대화에 남기는 말 — 새로 한 것이 있을 때만 불린다(store/agent-mail siteMail).
 * 받는 사람이 비었으면(같은 양식으로 보낸 적이 없다) 넣을 자리를 말하고, 비어 나가는 줄을 짚는다.
 */
export function intakeSay(spec: SiteMailSpec, site: string, o: {
  plan: Exclude<DraftPlan, 'sent'>; to: string[]; taskAdded: boolean; empty: string[];
}): string {
  const head = `${site} — 계약서가 ${o.plan === 'replace' ? '다시 ' : ''}접수됐습니다.`;
  if (o.plan === 'missing') {
    return [
      head,
      `${josa(spec.doc, '이', '가')} 없어 ${spec.label}을 보내지 못합니다. 할 일로 남겨 두었습니다 — `
        + `${josa(spec.doc, '이', '가')} 채워지면 이 대화에서 다시 요청해 주세요.`,
    ].join('\n');
  }
  const did = o.plan === 'replace'
    ? `서류가 바뀌어 ${spec.label}을 새로 썼습니다(앞 초안은 버렸습니다).`
    : o.plan === 'keep'
      ? `보내지 않은 ${josa(spec.label, '이', '가')} 이미 있습니다${o.taskAdded ? ' — 할 일에 올렸습니다' : ''}.`
      : `${spec.label}을 썼습니다(${spec.doc} 첨부)${o.taskAdded ? ' — 할 일에도 올렸습니다' : ''}.`;
  return [
    head,
    did,
    o.to.length
      ? `받는 사람 ${o.to.join(', ')} — 확인하고 「승인하고 보내기」를 눌러 주세요.`
      : '받는 사람이 미지정입니다 — 「고치기」로 받는 사람을 넣고 승인해 주세요.',
    o.empty.length ? `비어 있는 줄: ${o.empty.join(' · ')} — 「고치기」로 채워 주세요.` : '',
  ].filter(Boolean).join('\n');
}

/** 붙일 서류가 없을 때 한백 관리자에게 가는 알림 — 누르면 그 현장의 계약 탭(서류 칸이 거기 있다) */
export function missingAlarm(spec: SiteMailSpec, agentName: string): { title: string; body: string } {
  return {
    title: `${spec.doc} 없음 — 메일 못 보냄`,
    body: `${josa(spec.doc, '이', '가')} 없어 ${spec.label}을 보내지 못했습니다 — 채워지면 ${agentName}에게 다시 요청해 주세요.`,
  };
}

/**
 * 메일을 보낸 뒤 그 담당의 대화에 남는 말(자동) — 순수 (test/agents-mail-say.test.ts). store/agent-mail finishAgentMail 이 싣는다.
 *
 * 한백 2026-11-27 「메일이 정상적으로 발신되었다면 에이전트 통해 알려줘」 — 그전에는 카드의 띠가 「보냄」으로 바뀌는 것뿐이라, 예약해 둔
 * 메일은 아침에 나갔는지 카드를 찾아 열어 봐야 알았다. 「승인하고 보내기」와 예약 보내기(크론)가 같은 길(lib/agents/mail-send)이라 둘 다 선다.
 *
 * ★「보냈다」는 다음 메일 서버가 받았다는 뜻이다★ — 마지막 250(접수)을 받은 뒤에만 이 말이 선다. 받는 쪽 메일함까지 갔는지는 우리가
 * 알 수 없다(받는 쪽이 거절하면 반송 메일이 보낸 주소의 메일함으로 온다) — 그래서 보낸 주소를 같이 적는다.
 *
 * 보내지 못한 것은 예약 보내기만 말한다 — 「승인하고 보내기」는 누른 단추 옆에 까닭이 바로 뜨지만(화면 규칙 9), 예약은 아무도 보고
 * 있지 않다. 카드의 띠는 어느 쪽이든 「보내지 못함」이다.
 */

/** 첨부 이름은 셋까지 — 넘으면 「외 N개」 */
const SHOWN_FILES = 3;

export interface SentMailFacts {
  subject: string;
  to: string[];
  cc: string[];
  /** 붙인 파일 이름 — 넘긴 파일 · 현장 서류 · 묶음 zip 차례 그대로 */
  files: string[];
  /** 보낸 주소(연결한 메일 계정) — 반송이 이리로 온다 */
  from: string;
  /** 「승인하고 보내기」를 누른 사람 · 예약이면 예약한 사람 */
  by: string;
  scheduled: boolean;
}

function filesLine(files: string[]): string | null {
  if (files.length === 0) return null;
  const shown = files.slice(0, SHOWN_FILES).join(', ');
  const more = files.length - SHOWN_FILES;
  return `첨부 ${files.length}개 — ${shown}${more > 0 ? ` 외 ${more}개` : ''}`;
}

export function mailSentSay(m: SentMailFacts): string {
  return [
    `${m.scheduled ? '예약한 메일을' : '메일을'} 보냈습니다 — ${m.subject}`,
    `받는 사람 ${m.to.join(', ')}${m.cc.length ? ` · 참조 ${m.cc.join(', ')}` : ''}`,
    filesLine(m.files),
    `보낸 주소 ${m.from} (${m.scheduled ? '예약' : '승인'} ${m.by}) — 메일 서버가 받았습니다. 받는 쪽에서 반송되면 이 메일함으로 옵니다.`,
  ].filter((l): l is string => l !== null).join('\n');
}

/** 예약 보내기가 못 보낸 것 — 까닭과 할 일 */
export function scheduledMailFailedSay(m: { subject: string; error: string; by: string }): string {
  return [
    `예약한 메일을 보내지 못했습니다 — ${m.subject}`,
    `까닭: ${m.error}`,
    `예약 ${m.by} · 카드에서 고친 뒤 「승인하고 보내기」로 다시 보내 주세요.`,
  ].join('\n');
}

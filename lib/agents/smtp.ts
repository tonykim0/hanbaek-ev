/**
 * 메일 보내기 — 한백의 다음(카카오) 메일 계정으로, 메일 프로그램이 쓰는 표준 통로(SMTP)로 보낸다 (서버 전용).
 *
 * 한백 2026-11-03 「내 다음카카오 이메일로만 보내면 되는거고 형식도 정해져있는건데」 — 그래서 구글 연결(OAuth)을 걷고 이것으로
 * 바꿨다. 받는 사람에게는 한백의 메일 주소 그대로 보이고, hanbaek.co 의 SPF 에 다음 서버가 들어 있어 스팸으로 갈 까닭도 없다.
 * 로그인은 ★카카오 앱 비밀번호★다 — 2025-01-02 부터 다음 메일은 메일 프로그램 로그인에 2단계 인증의 앱 비밀번호를 받는다.
 * 다음 메일 설정에서 「IMAP/SMTP 사용함」이 켜져 있어야 한다.
 *
 * 서버는 smtp.daum.net:465(처음부터 TLS) — 2026-11-03 로그인 없이 붙어 보니 AUTH LOGIN · PLAIN 을 받고 한 통 70MB 까지다.
 * 587 은 응답이 없었다. 바깥 꾸러미 없이 Node 의 tls 로 짧게 말한다: 인사 → EHLO → AUTH PLAIN → MAIL FROM → RCPT TO →
 * DATA → QUIT. 메일 글은 lib/agents/mime buildMime 이 짓는다(줄 끝 CRLF · 줄은 짧다). 서버의 거절은 사람 말로 바꿔 던진다.
 *
 * 시험은 connect 를 바꿔 끼워 가짜 서버에 붙인다(test/agents-smtp.test.ts).
 */
import net from 'net';
import tls from 'tls';

export const DAUM_SMTP = { host: 'smtp.daum.net', port: 465 } as const;
const TIMEOUT_MS = 30_000;
const HELLO_NAME = 'hanbaek-console';

/** 서버가 돌려준 말 — 세 자리 번호와 글(여러 줄이면 이어 붙인다) */
interface Reply {
  code: number;
  text: string;
}

/** 서버가 거절했다 — 번호와 서버의 글 */
export class SmtpError extends Error {
  constructor(readonly code: number, readonly reply: string, readonly stage: string) {
    super(reply);
  }
}

export interface SmtpLogin {
  user: string;
  pass: string;
}

type Connect = () => net.Socket;
/** 한 줄 보내고(null 이면 보내지 않고) 답을 기다린다 — 기대한 번호가 아니면 SmtpError */
type Say = (line: string | null, expect: number[], stage: string) => Promise<Reply>;

/** 실제 서버 — 처음부터 TLS 로 */
const daum: Connect = () => tls.connect({ host: DAUM_SMTP.host, port: DAUM_SMTP.port, servername: DAUM_SMTP.host });

/** 한 번 붙어 명령을 주고받는다 — 말이 끝나면(또는 실패하면) 닫는다 */
async function session<T>(connect: Connect, run: (say: Say) => Promise<T>): Promise<T> {
  const socket = connect();
  socket.setTimeout(TIMEOUT_MS);
  let buf = '';
  let lines: string[] = [];
  const ready: Reply[] = [];
  const waiting: Array<{ ok: (r: Reply) => void; fail: (e: Error) => void }> = [];
  let broken: Error | null = null;

  const failAll = (e: Error) => {
    broken ??= e;
    while (waiting.length) waiting.shift()!.fail(broken);
  };
  socket.on('data', (d: Buffer) => {
    buf += d.toString('utf8');
    let i: number;
    while ((i = buf.indexOf('\r\n')) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 2);
      lines.push(line);
      if (/^\d{3}(?: |$)/.test(line)) {
        const reply = { code: Number(line.slice(0, 3)), text: lines.map((l) => l.slice(4)).join(' ').trim() };
        lines = [];
        const w = waiting.shift();
        if (w) w.ok(reply);
        else ready.push(reply);
      }
    }
  });
  socket.on('error', (e) => failAll(e));
  socket.on('timeout', () => {
    failAll(new Error('timeout'));
    socket.destroy();
  });
  socket.on('close', () => failAll(new Error('closed')));

  const next = () => {
    const r = ready.shift();
    if (r) return Promise.resolve(r);
    if (broken) return Promise.reject(broken);
    return new Promise<Reply>((ok, fail) => waiting.push({ ok, fail }));
  };
  const say: Say = async (line, expect, stage) => {
    if (line !== null) socket.write(`${line}\r\n`);
    const r = await next();
    if (!expect.includes(r.code)) throw new SmtpError(r.code, r.text, stage);
    return r;
  };

  try {
    await say(null, [220], 'greeting');
    await say(`EHLO ${HELLO_NAME}`, [250], 'ehlo');
    return await run(say);
  } finally {
    socket.end();
    socket.destroy();
  }
}

async function login(say: Say, who: SmtpLogin) {
  const token = Buffer.from(`\u0000${who.user}\u0000${who.pass}`, 'utf8').toString('base64');
  await say(`AUTH PLAIN ${token}`, [235], 'auth');
}

/** 마침표로 시작하는 줄은 하나 더 붙인다(RFC 5321 4.5.2) — 끝 표시(「.」 한 줄)와 섞이지 않게 */
export function dotStuff(data: string): string {
  return data.replace(/\r?\n/g, '\r\n').replace(/(^|\r\n)\./g, '$1..');
}

/** 연결할 때 — 로그인만 해 보고 닫는다. 메일은 보내지 않는다 */
export async function verifySmtp(who: SmtpLogin, connect: Connect = daum): Promise<void> {
  try {
    await session(connect, async (say) => {
      await login(say, who);
      await say('QUIT', [221], 'quit').catch(() => undefined);
    });
  } catch (e) {
    throw humanSmtpError(e);
  }
}

/** 메일 한 통 — 받는 사람과 참조 모두에게(RCPT TO). data 는 buildMime 이 지은 글 */
export async function sendSmtp(input: SmtpLogin & { from: string; to: string[]; data: string }, connect: Connect = daum): Promise<{ id: string }> {
  try {
    return await session(connect, async (say) => {
      await login(say, input);
      await say(`MAIL FROM:<${input.from}>`, [250], 'from');
      for (const rcpt of input.to) await say(`RCPT TO:<${rcpt}>`, [250, 251], `rcpt:${rcpt}`);
      await say('DATA', [354], 'data');
      const body = dotStuff(input.data);
      const done = await say(`${body}${body.endsWith('\r\n') ? '' : '\r\n'}.`, [250], 'sent');
      await say('QUIT', [221], 'quit').catch(() => undefined);
      /* 서버가 붙인 접수 번호(「250 2.0.0 OK 1730000000 abc123」 같은 것)를 남긴다 — 나중에 서버 쪽 기록과 대 볼 때 */
      return { id: done.text.slice(0, 200) };
    });
  } catch (e) {
    throw humanSmtpError(e);
  }
}

/** 서버의 거절 → 단추 옆에 띄울 사람 말. 모르는 것은 [mail] 로그를 남긴다 */
export function humanSmtpError(e: unknown): Error {
  if (e instanceof SmtpError) {
    if (e.stage === 'auth' || e.code === 535 || e.code === 534) {
      return new Error('메일 로그인이 거절됐습니다 — 주소와 앱 비밀번호를 확인해 주세요(카카오 2단계 인증의 앱 비밀번호 · 다음 메일 설정의 「IMAP/SMTP 사용함」).');
    }
    if (e.stage.startsWith('rcpt:')) return new Error(`메일 서버가 받는 사람을 받지 않았습니다: ${e.stage.slice(5)} — ${e.reply}`);
    if (e.code === 552) return new Error('메일이 너무 큽니다 — 붙인 파일을 줄여 주세요.');
    if (e.code >= 400 && e.code < 500) return new Error(`메일 서버가 지금 받지 않습니다(${e.code}) — 잠시 뒤 다시 보내 주세요.`);
    console.error('[mail] 서버 거절', e.stage, e.code, e.reply);
    return new Error(`메일 서버가 거절했습니다(${e.code}) — ${e.reply}`);
  }
  if (e instanceof Error && /[가-힣]/.test(e.message)) return e;
  console.error('[mail] 서버에 닿지 못함', e);
  return new Error('메일 서버에 닿지 못했습니다 — 잠시 뒤 다시 눌러 주세요.');
}

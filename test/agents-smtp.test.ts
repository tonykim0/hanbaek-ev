/**
 * 다음 메일 서버와 말하는 쪽(lib/agents/smtp) — 로그인만 해 보기 · 한 통 보내기 · 거절을 사람 말로.
 *
 * 진짜 서버 대신 이 자리에서 가짜 SMTP 서버를 띄워 붙는다(평문 — connect 를 바꿔 끼운다). 실제 다음 서버도 같은 말을 한다:
 * 220 인사 → EHLO 여러 줄 답 → AUTH PLAIN 235 → MAIL FROM · RCPT TO 250 → DATA 354 → 마침표 한 줄 250 → QUIT 221.
 */
import net from 'net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { dotStuff, sendSmtp, verifySmtp } from '@/lib/agents/smtp';

interface Fake {
  port: number;
  /** 서버가 받은 명령 줄(DATA 본문 빼고) */
  lines: string[];
  /** DATA 로 받은 본문(줄 끝 CRLF 그대로, 끝 표시 빼고) */
  data: string;
  close: () => Promise<void>;
}

const open: Fake[] = [];

/** 가짜 SMTP 서버 — authOk 가 false 면 로그인을 거절하고, rejectRcpt 를 담은 받는 사람은 550 으로 거절한다 */
function fakeServer(opt: { authOk?: boolean; rejectRcpt?: string } = {}): Promise<Fake> {
  const fake: Fake = { port: 0, lines: [], data: '', close: async () => undefined };
  const server = net.createServer((sock) => {
    sock.write('220 fake.daum ESMTP\r\n');
    let buf = '';
    let inData = false;
    sock.on('data', (d: Buffer) => {
      buf += d.toString('utf8');
      let i: number;
      while ((i = buf.indexOf('\r\n')) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 2);
        if (inData) {
          if (line === '.') {
            inData = false;
            sock.write('250 2.0.0 OK queued as ABC123\r\n');
          } else {
            fake.data += `${line}\r\n`;
          }
          continue;
        }
        fake.lines.push(line);
        if (line.startsWith('EHLO')) sock.write('250-fake.daum\r\n250-AUTH LOGIN PLAIN\r\n250 SIZE 73400320\r\n');
        else if (line.startsWith('AUTH PLAIN')) sock.write(opt.authOk === false ? '535 5.7.8 Authentication failed\r\n' : '235 2.7.0 Accepted\r\n');
        else if (line.startsWith('MAIL FROM')) sock.write('250 2.1.0 OK\r\n');
        else if (line.startsWith('RCPT TO')) {
          sock.write(opt.rejectRcpt && line.includes(opt.rejectRcpt) ? '550 5.1.1 No such user\r\n' : '250 2.1.5 OK\r\n');
        } else if (line === 'DATA') {
          inData = true;
          sock.write('354 go ahead\r\n');
        } else if (line === 'QUIT') {
          sock.write('221 2.0.0 bye\r\n');
          sock.end();
        } else sock.write('502 5.5.2 unknown\r\n');
      }
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      fake.port = (server.address() as net.AddressInfo).port;
      fake.close = () => new Promise((r) => server.close(() => r()));
      open.push(fake);
      resolve(fake);
    });
  });
}

const to = (f: Fake) => () => net.connect({ host: '127.0.0.1', port: f.port });

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(open.splice(0).map((f) => f.close()));
});

describe('로그인만 해 보기 — 연결할 때', () => {
  it('맞으면 조용히 끝난다 — 메일은 보내지 않는다', async () => {
    const f = await fakeServer();
    await verifySmtp({ user: 'hanbaek@hanbaek.co', pass: 'app-pass-1234' }, to(f));
    expect(f.lines[0]).toBe('EHLO hanbaek-console');
    expect(f.lines[1]).toBe(`AUTH PLAIN ${Buffer.from('\u0000hanbaek@hanbaek.co\u0000app-pass-1234').toString('base64')}`);
    expect(f.lines.some((l) => l.startsWith('MAIL FROM'))).toBe(false);
    expect(f.lines.at(-1)).toBe('QUIT');
  });

  it('틀린 앱 비밀번호는 무엇을 확인할지 말한다', async () => {
    const f = await fakeServer({ authOk: false });
    await expect(verifySmtp({ user: 'a@hanbaek.co', pass: 'wrong' }, to(f))).rejects.toThrow('메일 로그인이 거절됐습니다');
  });

  it('서버에 닿지 못하면 그렇게 말한다', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const f = await fakeServer();
    const port = f.port;
    await f.close();
    open.splice(0);
    await expect(verifySmtp({ user: 'a@hanbaek.co', pass: 'x' }, () => net.connect({ host: '127.0.0.1', port })))
      .rejects.toThrow('메일 서버에 닿지 못했습니다');
  });
});

describe('한 통 보내기', () => {
  it('받는 사람 · 참조 모두에게 RCPT · 본문은 마침표 줄을 하나 더 붙여 싣는다 · 서버의 접수 표시를 돌려준다', async () => {
    const f = await fakeServer();
    const data = 'Subject: x\r\n\r\n.첫 줄이 마침표\r\n둘째 줄\r\n';
    const r = await sendSmtp({
      user: 'hanbaek@hanbaek.co', pass: 'p', from: 'hanbaek@hanbaek.co', to: ['ops@example.com', 'boss@example.com'], data,
    }, to(f));
    expect(f.lines).toContain('MAIL FROM:<hanbaek@hanbaek.co>');
    expect(f.lines).toContain('RCPT TO:<ops@example.com>');
    expect(f.lines).toContain('RCPT TO:<boss@example.com>');
    expect(f.data).toBe('Subject: x\r\n\r\n..첫 줄이 마침표\r\n둘째 줄\r\n');
    expect(r.id).toContain('queued as ABC123');
  });

  it('받는 사람을 서버가 거절하면 그 주소를 짚는다', async () => {
    const f = await fakeServer({ rejectRcpt: 'nobody@' });
    await expect(sendSmtp({
      user: 'a@hanbaek.co', pass: 'p', from: 'a@hanbaek.co', to: ['ok@example.com', 'nobody@example.com'], data: 'x\r\n',
    }, to(f))).rejects.toThrow('메일 서버가 받는 사람을 받지 않았습니다: nobody@example.com');
  });
});

describe('마침표 줄', () => {
  it('줄 첫머리의 마침표만 하나 더 — 줄 끝은 CRLF 로', () => {
    expect(dotStuff('.a\nb.c\r\n..d')).toBe('..a\r\nb.c\r\n...d');
  });
});

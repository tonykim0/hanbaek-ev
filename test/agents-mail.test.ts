/**
 * 에이전트 메일의 순수한 쪽 — 받는 사람 고르기 · 메일 짓기(lib/agents/mime) · 토큰 잠그기(secret-box) · 구글 연결의 주소와
 * 거절 문구(lib/agents/gmail). 실제로 보내는 길은 test/db/agents-mail.test.ts 가 본다(구글은 흉내).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { addressesOf, buildMime, headerText, isMailAddress } from '@/lib/agents/mime';
import { seal, unseal } from '@/lib/agents/secret-box';
import { emailOfIdToken, gmailAuthUrl, GoogleError, humanGoogleError, mailBackOf, withMailNote } from '@/lib/agents/gmail';

/** 머리말 값 → 글자(접은 줄을 펴고 낱말을 푼다) */
function decodeHeader(v: string): string {
  return v
    .replace(/\r\n[ \t]/g, ' ')
    .replace(/=\?UTF-8\?B\?([^?]+)\?=(?:\s+(?==\?UTF-8\?B\?))?/g, (_, b: string) => Buffer.from(b, 'base64').toString('utf8'));
}

/** 메일 글 → 머리말(이름 → 값, 접은 줄을 편 것)과 몸 */
function parse(mime: string): { head: Map<string, string>; body: string } {
  const cut = mime.indexOf('\r\n\r\n');
  const head = new Map<string, string>();
  for (const line of mime.slice(0, cut).replace(/\r\n[ \t]/g, ' ').split('\r\n')) {
    const i = line.indexOf(':');
    head.set(line.slice(0, i).toLowerCase(), line.slice(i + 1).trim());
  }
  return { head, body: mime.slice(cut + 4) };
}

describe('받는 사람 칸', () => {
  it('쉼표 · 세미콜론 · 줄바꿈 · 이름 붙은 주소를 주소 목록으로 — 같은 주소는 하나로', () => {
    expect(addressesOf('a@b.co, C@d.kr;e@f.com\n홍길동 <g@h.co>, a@B.CO', '받는 사람')).toEqual(['a@b.co', 'C@d.kr', 'e@f.com', 'g@h.co']);
    expect(addressesOf(['x@y.com', ' mailto:z@y.com '], '참조')).toEqual(['x@y.com', 'z@y.com']);
    expect(addressesOf(undefined, '참조')).toEqual([]);
    expect(addressesOf(42, '참조')).toEqual([]);
  });

  it('틀린 주소는 그 주소를 짚어 던진다', () => {
    expect(() => addressesOf('홍길동', '받는 사람')).toThrow('받는 사람 주소가 틀렸습니다: 홍길동');
    expect(() => addressesOf('a@b', '받는 사람')).toThrow('a@b');
    expect(() => addressesOf('ok@x.com, a@@b.com', '참조')).toThrow('참조 주소가 틀렸습니다: a@@b.com');
    expect(isMailAddress('first.last+tag@sub.example.co.kr')).toBe(true);
    expect(isMailAddress('.a@b.com')).toBe(false);
    expect(isMailAddress('a..b@c.com')).toBe(false);
  });
});

describe('머리말 낱말', () => {
  it('ASCII 는 그대로, 한글은 낱말로 — 풀면 원문이고 한 낱말은 75자 안', () => {
    expect(headerText('Invoice 2026-11')).toBe('Invoice 2026-11');
    const subject = '[한백] 11월 기성 청구 — 군산 더샵 디오션시티 외 3곳 · 세금계산서 첨부'.repeat(3);
    const v = headerText(subject);
    expect(v).toMatch(/^=\?UTF-8\?B\?/);
    for (const line of v.split('\r\n')) expect(line.trim().length).toBeLessThanOrEqual(75);
    expect(decodeHeader(v)).toBe(subject);
  });

  it('값의 줄바꿈은 공백으로 편다 — 머리말을 덧붙여 넣지 못한다', () => {
    expect(headerText('hi\r\nBcc: evil@x.com')).toBe('hi Bcc: evil@x.com');
  });
});

describe('메일 짓기', () => {
  const base = {
    fromName: '한백', from: 'hanbaekevc@gmail.com', to: ['a@b.co', 'c@d.kr'], cc: [] as string[],
    subject: '11월 기성 청구', body: '안녕하세요.\n한백입니다.\n\n첨부 확인 부탁드립니다.',
    attachments: [], date: new Date('2026-11-03T05:00:00Z'),
  };

  it('첨부 없이 — 줄 끝은 CRLF 뿐, 머리말과 본문이 원문으로 풀린다', () => {
    const mime = buildMime(base);
    expect(mime.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    const { head, body } = parse(mime);
    expect(decodeHeader(head.get('from')!)).toBe('한백 <hanbaekevc@gmail.com>');
    expect(head.get('to')).toBe('a@b.co, c@d.kr');
    expect(head.has('cc')).toBe(false);
    expect(decodeHeader(head.get('subject')!)).toBe('11월 기성 청구');
    expect(head.get('date')).toBe('Tue, 03 Nov 2026 05:00:00 GMT');
    expect(head.get('content-type')).toBe('text/plain; charset=UTF-8');
    expect(Buffer.from(body.replace(/\r\n/g, ''), 'base64').toString('utf8')).toBe(base.body.replace(/\n/g, '\r\n'));
  });

  it('첨부가 있으면 multipart — 한글 파일 이름이 풀리고 내용이 바이트 그대로, 줄은 짧다', () => {
    const pdf = new Uint8Array(5000).map((_, i) => (i * 37) % 256);
    const mime = buildMime({
      ...base, cc: ['e@f.com'], boundary: '=_hanbaek_test',
      attachments: [
        { name: '거래명세서_2026-11-10_에코일렉_영업비 1차 (최종 확정본).pdf', contentType: 'application/pdf', data: pdf },
        { name: 'memo "v2".txt', contentType: 'bad type', data: new TextEncoder().encode('메모') },
      ],
    });
    for (const line of mime.split('\r\n')) expect(line.length).toBeLessThanOrEqual(78);
    const { head } = parse(mime);
    expect(head.get('cc')).toBe('e@f.com');
    expect(head.get('content-type')).toBe('multipart/mixed; boundary="=_hanbaek_test"');

    const parts = mime.split('--=_hanbaek_test').slice(1, -1);
    expect(parts).toHaveLength(3);
    const file = parse(parts[1].replace(/^\r\n/, ''));
    expect(file.head.get('content-type')).toMatch(/^application\/pdf; name="/);
    const name = /filename="(.*)"$/.exec(file.head.get('content-disposition')!)![1];
    expect(decodeHeader(name)).toBe('거래명세서_2026-11-10_에코일렉_영업비 1차 (최종 확정본).pdf');
    expect(new Uint8Array(Buffer.from(file.body.replace(/\r\n/g, ''), 'base64'))).toEqual(pdf);

    const memo = parse(parts[2].replace(/^\r\n/, ''));
    expect(memo.head.get('content-type')).toBe('application/octet-stream; name="memo \\"v2\\".txt"');
  });
});

describe('토큰 잠그기', () => {
  it('같은 열쇠로만 풀린다 — 열쇠가 다르거나 글이 바뀌면 null', () => {
    const sealed = seal('1//refresh-token-abc', 'secret-one-0123456789');
    expect(sealed).toMatch(/^v1\./);
    expect(sealed).not.toContain('refresh-token');
    expect(unseal(sealed, 'secret-one-0123456789')).toBe('1//refresh-token-abc');
    expect(unseal(sealed, 'secret-two-0123456789')).toBeNull();
    const parts = sealed.split('.');
    parts[2] = parts[2].slice(0, -2) + (parts[2].endsWith('AA') ? 'BB' : 'AA');
    expect(unseal(parts.join('.'), 'secret-one-0123456789')).toBeNull();
    expect(unseal('garbage', 'secret-one-0123456789')).toBeNull();
    expect(seal('x', 'k')).not.toBe(seal('x', 'k')); // 매번 새 iv
  });
});

describe('구글 연결', () => {
  afterEach(() => vi.restoreAllMocks());

  it('동의 화면 주소 — 갱신 토큰을 받는 두 값과 보내기 범위 · 확인값', () => {
    const u = new URL(gmailAuthUrl({ clientId: 'cid', redirectUri: 'http://localhost:3123/api/agents/gmail/callback', state: 'st' }));
    expect(u.origin + u.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(u.searchParams.get('access_type')).toBe('offline');
    expect(u.searchParams.get('prompt')).toBe('consent');
    expect(u.searchParams.get('scope')?.split(' ')).toContain('https://www.googleapis.com/auth/gmail.send');
    expect(u.searchParams.get('state')).toBe('st');
    expect(u.searchParams.get('redirect_uri')).toBe('http://localhost:3123/api/agents/gmail/callback');
  });

  it('id_token 의 주소 — 확인 안 된 주소 · 깨진 토큰은 null', () => {
    const tok = (p: object) => `h.${Buffer.from(JSON.stringify(p)).toString('base64url')}.s`;
    expect(emailOfIdToken(tok({ email: 'hanbaekevc@gmail.com', email_verified: true }))).toBe('hanbaekevc@gmail.com');
    expect(emailOfIdToken(tok({ email: 'x@y.com', email_verified: false }))).toBeNull();
    expect(emailOfIdToken('nope')).toBeNull();
  });

  it('돌아갈 화면은 에이전트 화면 안만 — 밖으로 내보내지 않는다', () => {
    expect(mailBackOf('/admin/agents/op-sk')).toBe('/admin/agents/op-sk');
    expect(mailBackOf('/admin/agents')).toBe('/admin/agents');
    for (const bad of ['https://evil.com', '//evil.com', '/admin/agents/../accounts', '/projects', null]) {
      expect(mailBackOf(bad)).toBe('/admin/agents');
    }
    expect(withMailNote('/admin/agents', 'mail_error', '다시 눌러 주세요')).toBe(`/admin/agents?mail_error=${encodeURIComponent('다시 눌러 주세요').replace(/%20/g, '+')}`);
  });

  it('구글의 거절은 사람 말로 — 권한이 풀림 · 한도 · 권한 없음 · 주소 거절', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(humanGoogleError(new GoogleError(400, 'invalid_grant', 'Token has been expired or revoked.')).message).toContain('「Gmail 연결」을 다시');
    expect(humanGoogleError(new GoogleError(403, 'PERMISSION_DENIED', 'Daily Limit Exceeded')).message).toContain('보낼 수 있는 양');
    expect(humanGoogleError(new GoogleError(429, 'RESOURCE_EXHAUSTED', 'User-rate limit exceeded')).message).toContain('보낼 수 있는 양');
    expect(humanGoogleError(new GoogleError(403, 'PERMISSION_DENIED', 'Request had insufficient authentication scopes.')).message).toContain('보내기 권한');
    expect(humanGoogleError(new GoogleError(400, 'INVALID_ARGUMENT', 'Invalid To header')).message).toBe('구글이 이 메일을 받지 않았습니다 — Invalid To header');
    expect(humanGoogleError(new GoogleError(503, 'UNAVAILABLE', 'x')).message).toContain('(503)');
    expect(humanGoogleError(new Error('이미 사람 말')).message).toBe('이미 사람 말');
  });
});

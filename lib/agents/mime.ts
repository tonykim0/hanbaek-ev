/**
 * 메일 한 통을 글자로 짓는다 (순수 — test/agents-mail.test.ts 가 본다). Gmail 의 올리기(message/rfc822)에 그대로 실린다
 * (lib/agents/gmail). 받는 사람 칸을 주소 목록으로 고르는 일도 여기서 한다 — 저장소와 화면이 같은 판정을 쓴다.
 *
 * 한글은 머리말에 그대로 못 싣는다 — 제목 · 보내는 이름 · 첨부 이름은 RFC 2047 낱말(=?UTF-8?B?…?=)로, 본문과 첨부는 base64 로
 * 76자마다 줄을 바꿔 싣는다. 줄 끝은 CRLF 이고, 한 줄이 998자를 넘지 않는다(RFC 5322). 머리말 값의 줄바꿈은 공백으로 펴서
 * 머리말을 덧붙여 넣는 길(헤더 주입)을 막는다.
 */

export const MAIL_LIMITS = {
  /** 받는 사람 + 참조 */
  recipients: 20,
  subject: 200,
  body: 20000,
  files: 10,
  /** 첨부 합계 — Gmail 이 보내는 메일 한 통의 첨부 한도 */
  attachBytes: 25 * 1024 * 1024,
} as const;

/** 메일 주소 한 개 — 이름 없이 주소만. 흔한 모양만 받는다(따옴표 · 꺾쇠 · 공백 없는 것, 도메인에 점 하나 이상) */
const ADDR_RE = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export function isMailAddress(s: string): boolean {
  return s.length <= 254 && ADDR_RE.test(s);
}

/**
 * 받는 사람 칸 → 주소 목록. 쉼표 · 세미콜론 · 줄바꿈 · 공백으로 나눈 글이나 글의 배열을 받는다. 「홍길동 <a@b.co>」처럼 이름이
 * 붙어 오면 꺾쇠 안의 주소만 쓴다. 같은 주소(대소문자만 다른 것 포함)는 하나로 줄인다. 틀린 것이 하나라도 있으면 그 주소를
 * 짚어 던진다 — what 은 「받는 사람」 · 「참조」.
 */
export function addressesOf(input: unknown, what: string): string[] {
  const raw = Array.isArray(input)
    ? input.filter((v): v is string => typeof v === 'string').join(',')
    : typeof input === 'string' ? input : '';
  const text = raw.replace(/[^<>,;\n]*<\s*([^<>\s]*)\s*>/g, ',$1,');
  const out: string[] = [];
  const seen = new Set<string>();
  for (const piece of text.split(/[\s,;]+/)) {
    const a = piece.trim().replace(/^mailto:/i, '');
    if (!a) continue;
    if (!isMailAddress(a)) throw new Error(`${what} 주소가 틀렸습니다: ${a.slice(0, 80)}`);
    const key = a.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(a);
  }
  return out;
}

/**
 * 머리말 값 하나 — 보이는 ASCII 만이면 그대로, 아니면 UTF-8 낱말 여럿. 한 낱말은 원문 39바이트까지라 64자다(base64 52자 +
 * 표지 12자) — 「\tfilename="」 뒤에 서도 한 줄이 78자 안이다. 글자 하나를 두 낱말로 쪼개지 않는다. 낱말 사이는 접은 줄(CRLF + 공백)이다.
 */
export function headerText(s: string): string {
  const flat = s.replace(/[\r\n\t]+/g, ' ');
  if (/^[\x20-\x7e]*$/.test(flat) && !flat.includes('=?')) return flat;
  const words: string[] = [];
  let cur = '';
  for (const ch of flat) {
    if (cur && Buffer.byteLength(cur + ch, 'utf8') > 39) {
      words.push(cur);
      cur = '';
    }
    cur += ch;
  }
  if (cur) words.push(cur);
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w, 'utf8').toString('base64')}?=`).join('\r\n ');
}

/** 머리말 인자의 따옴표 안 값 — ASCII 면 따옴표 · 역빗금을 막고, 아니면 낱말로(따옴표 안에서 접는다) */
function quotedParam(s: string): string {
  const v = headerText(s);
  return v.includes('=?') ? v.replace(/\r\n /g, '\r\n\t') : v.replace(/["\\]/g, '\\$&');
}

/** base64 를 76자 줄로 */
function wrap76(b64: string): string {
  return (b64.match(/.{1,76}/g) ?? []).join('\r\n');
}

const TYPE_RE = /^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]*$/;

export interface MailAttachment {
  name: string;
  contentType: string | null;
  data: Uint8Array;
}

export interface MailInput {
  /** 보내는 이름 — 받는 사람의 메일함에 이 이름으로 선다 */
  fromName: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  body: string;
  attachments: MailAttachment[];
  /** 시험이 고정한다 */
  date?: Date;
  boundary?: string;
}

/** 메일 한 통 — 첨부가 없으면 글 한 덩이, 있으면 multipart/mixed */
export function buildMime(m: MailInput): string {
  const head = [
    `From: ${headerText(m.fromName)} <${m.from}>`,
    `To: ${m.to.join(',\r\n ')}`,
    ...(m.cc.length ? [`Cc: ${m.cc.join(',\r\n ')}`] : []),
    `Subject: ${headerText(m.subject)}`,
    `Date: ${(m.date ?? new Date()).toUTCString()}`,
    'MIME-Version: 1.0',
  ];
  const text = [
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    wrap76(Buffer.from(m.body.replace(/\r?\n/g, '\r\n'), 'utf8').toString('base64')),
  ];
  if (m.attachments.length === 0) return `${[...head, ...text].join('\r\n')}\r\n`;

  /* 「=_」는 base64 에 나오지 않는다 — 경계 글이 본문 속에서 우연히 나올 수 없다 */
  const b = m.boundary ?? `=_hanbaek_${globalThis.crypto.randomUUID().replace(/-/g, '')}`;
  return [
    ...head,
    `Content-Type: multipart/mixed; boundary="${b}"`,
    '',
    `--${b}`,
    ...text,
    ...m.attachments.flatMap((a) => {
      const name = quotedParam(a.name);
      const type = a.contentType && TYPE_RE.test(a.contentType) ? a.contentType : 'application/octet-stream';
      return [
        `--${b}`,
        `Content-Type: ${type};\r\n\tname="${name}"`,
        `Content-Disposition: attachment;\r\n\tfilename="${name}"`,
        'Content-Transfer-Encoding: base64',
        '',
        wrap76(Buffer.from(a.data).toString('base64')),
      ];
    }),
    `--${b}--`,
    '',
  ].join('\r\n');
}

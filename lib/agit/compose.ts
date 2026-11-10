/**
 * 아지트 쓰는 칸 — 열린구매 글을 채우고 「작성하기」를 누른다(puppeteer 탭 하나). 한백의 아지트 로그인이 든 탭을 받는다.
 * 서버(lib/agit/agit-web — 정산 담당이 올린다 · 한백 2026-11-10 「에이전트가 직접 하게끔 하고싶어」)와 예비 길(scripts/agit-post.ts —
 * Claude Code 가 한백의 맥 전용 크롬에서)이 같이 쓴다 — 두 벌을 두지 않는다.
 *
 * 차례(11-08 · 09 에 손으로 11/10 글을 쓰며 확인한 길 · 11-09 시험 글로 한백의 글과 HTML 뼈대를 견줬다):
 *   글양식 단추(구매요청간소화 · 긴급구매요청 — 글 머리의 빨간 꼬리표와 요청 글을 세운다) → 엑셀 캡처를 먼저 붙여 넣어 아지트가 준 그림 id 를
 *   받고 → 본문을 통째로 HTML 로 붙여 넣는다(lib/agit/editor-doc — 구매 내역 자리에 그 그림) → 긴급 글이면 「cc」 뒤에 @@team.finance 를
 *   멘션 고르기로 → zip 을 첨부 파일 칸에 → 요청 담당을 콘솔의 「요청 담당」 그대로 → 다 대 보고(하나라도 틀리면 올리지 않는다) → 「작성하기」.
 * 붙여 넣기는 브라우저 안에서 붙여 넣기 사건을 만든다(시스템 클립보드를 안 쓴다 — 머리 없는 서버 브라우저에서도 같다).
 * ★아지트 화면이 바뀌면 SEL 을 고친다★.
 */
import type { ElementHandle, Page } from 'puppeteer-core';
import { agitEditorDocOf, CC_MARK, IMG_MARK, withUploadedImage } from './editor-doc';

/** 열린구매 그룹 */
export const AGIT_GROUP = 'https://team-hanbaek.agit.io/g/300450579';

/** 아지트 쓰는 칸의 고르개 — 화면이 바뀌면 여기만 고친다 */
export const SEL = {
  templates: '.template-message-form__templates',
  form: '.message-form-group__body',
  editor: '.message-form-group__body .ProseMirror',
  templateLabel: '.message-form-group__body .template-message-form__selected > span',
  assigneeInput: '.message-form-group__body .template-message-form__assignees .multi-value-input__input',
  assigneeLabel: '.message-form-group__body .template-message-form__assignees .multi-value-input__label',
  assigneeText: '.message-form-group__body .template-message-form__assignees .multi-value-input__label-text',
  assigneeOption: '.message-form-group__body .template-message-form__assignees .mention-autocomplete__list li',
  fileInput: '.message-form-group__body .message-form > input[type=file], .message-form-group__body .message-form input.attachments-box__file-input',
  submit: '.message-form-group__body button.message-form-submit-control__submit-button',
} as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 아지트가 로그인 화면으로 보냈다 — 쥔 로그인이 풀렸다(서버) · 한백이 로그인할 차례다(맥) */
export class AgitSignedOut extends Error {
  constructor() {
    super('아지트 로그인이 풀렸습니다 — 정산 담당 화면의 「아지트 계정」에서 다시 연결해 주세요.');
    this.name = 'AgitSignedOut';
  }
}

/** 지금 탭이 아지트 로그인 화면인가 */
export const onAgitLogin = (page: Page): boolean => {
  try {
    return new URL(page.url()).pathname.startsWith('/login');
  } catch {
    return false;
  }
};

/**
 * 그룹 벽을 열고 글양식을 고른다 — 로그인 화면으로 가면 signIn 을 부른다(맥: 한백이 로그인할 때까지 기다린다). 없으면 AgitSignedOut.
 */
export async function openCompose(page: Page, template: string, signIn?: () => Promise<void>): Promise<void> {
  await page.goto(`${AGIT_GROUP}/wall`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  if (onAgitLogin(page)) {
    if (!signIn) throw new AgitSignedOut();
    await signIn();
    await page.goto(`${AGIT_GROUP}/wall`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    if (onAgitLogin(page)) throw new AgitSignedOut();
  }
  await page.waitForSelector(SEL.templates, { timeout: 30_000 }).catch(() => {
    throw new Error('아지트 열린구매 그룹의 쓰는 칸이 안 열린다 — 그룹에 들어가 있는 계정인지 · 아지트 화면이 바뀌었는지 봐 주세요.');
  });
  await page.evaluate((sel: string, name: string) => {
    const box = document.querySelector(sel)!;
    const el = [...box.querySelectorAll('*')].find((e) => e.children.length === 0 && (e.textContent ?? '').trim() === name) as HTMLElement | undefined;
    if (!el) throw new Error(`글양식 「${name}」 단추가 없다`);
    el.click();
  }, SEL.templates, template);
  await page.waitForSelector(SEL.editor, { timeout: 30_000 });
  await sleep(1500);
}

/** 쓰는 칸 전체를 고른다 — 편집 명령으로(맥은 단축키가 렌더러에 안 간다 · 리눅스 서버는 Ctrl) */
async function selectAll(page: Page): Promise<void> {
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.focus(SEL.editor);
  await page.keyboard.down(mod);
  await page.keyboard.press('KeyA', { commands: ['SelectAll'] });
  await page.keyboard.up(mod);
  await sleep(200);
}

/** 쓰는 칸에 붙여 넣는다 — html 이나 파일(그림) 하나 */
async function paste(page: Page, what: { html: string } | { file: { b64: string; name: string; type: string } }): Promise<void> {
  await page.evaluate((sel: string, w: { html?: string; file?: { b64: string; name: string; type: string } }) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error('쓰는 칸이 없다');
    const dt = new DataTransfer();
    if (w.html !== undefined) {
      dt.setData('text/html', w.html);
      dt.setData('text/plain', w.html.replace(/<[^>]+>/g, '\n'));
    } else if (w.file) {
      const bytes = Uint8Array.from(atob(w.file.b64), (c) => c.charCodeAt(0));
      dt.items.add(new File([bytes], w.file.name, { type: w.file.type }));
    }
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, SEL.editor, 'html' in what ? { html: what.html } : { file: what.file });
}

/** 담당 칸의 지금 사람들 */
const assigneesNow = (page: Page) => page.evaluate((sel: string) =>
  [...document.querySelectorAll(sel)].map((e) => (e.textContent ?? '').trim()), SEL.assigneeText);

/** 화면에 뜬 것 중 글자가 든 첫 칸을 기다렸다가 누른다 */
async function clickWhenShown(page: Page, selector: string, text: string, what: string, exclude: string | null = null): Promise<void> {
  const handle = await page.waitForFunction((sel: string, t: string, ex: string | null) =>
    [...document.querySelectorAll(sel)].find((x) => (x as HTMLElement).offsetParent !== null
      && (x.textContent ?? '').includes(t) && !(ex && x.closest(ex))) ?? null,
  { timeout: 15_000, polling: 300 }, selector, text, exclude).catch(() => null);
  const el = handle?.asElement() as ElementHandle<Element> | null | undefined;
  if (!el) throw new Error(`${what} 후보에 ${text} 가 안 나온다`);
  await el.click();
}

/** 요청 담당을 콘솔의 「요청 담당」 그대로 — 글양식이 미리 넣은 사람이 다르면 빼고 모자란 사람은 넣는다 */
async function setAssignees(page: Page, want: readonly string[]): Promise<void> {
  for (const extra of (await assigneesNow(page)).filter((x) => !want.includes(x))) {
    await page.evaluate((sel: string, name: string) => {
      const label = [...document.querySelectorAll(sel)].find((l) => (l.querySelector('.multi-value-input__label-text')?.textContent ?? '').trim() === name);
      (label?.querySelector('.multi-value-input__label-delete-button') as HTMLElement | null)?.click();
    }, SEL.assigneeLabel, extra);
    await sleep(500);
  }
  for (const id of want) {
    if ((await assigneesNow(page)).includes(id)) continue;
    await page.click(SEL.assigneeInput);
    await page.type(SEL.assigneeInput, id, { delay: 60 });
    await clickWhenShown(page, SEL.assigneeOption, id, '요청 담당');
    await sleep(600);
  }
  const now = await assigneesNow(page);
  if (now.length !== want.length || want.some((x) => !now.includes(x))) throw new Error(`요청 담당이 맞지 않는다 — ${now.join(', ')}`);
}

/** 긴급 글 — 「cc §CC§」 자리 표를 지우고 그 자리에 팀 멘션을 멘션 고르기로 넣는다 */
async function putCc(page: Page, alias: string): Promise<void> {
  await page.evaluate((sel: string, mark: string) => {
    const root = document.querySelector(sel)!;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const i = (n.textContent ?? '').indexOf(mark);
      if (i < 0) continue;
      const range = document.createRange();
      range.setStart(n, i);
      range.setEnd(n, i + mark.length);
      const s = window.getSelection()!;
      s.removeAllRanges();
      s.addRange(range);
      return;
    }
    throw new Error('cc 자리 표가 없다');
  }, SEL.editor, CC_MARK);
  await sleep(300);
  await page.keyboard.press('Backspace');
  await page.keyboard.type(`@@${alias}`, { delay: 90 });
  await clickWhenShown(page, 'li, [role=option]', alias, 'cc 멘션', '.template-message-form__assignees');
  await sleep(800);
}

export interface ComposeCheck {
  template: string;
  assignees: string[];
  images: Array<{ id: string | null; loaded: boolean }>;
  h1: number;
  quotes: number;
  bold: number;
  zip: boolean;
  mention: boolean;
  /** 틀린 것 — 하나라도 있으면 올리지 않는다 */
  bad: string[];
}

/** 쓰는 칸을 대 본다 — 하나라도 틀리면 bad 에 */
async function checkCompose(page: Page, want: { template: string; assignees: readonly string[]; subject: string; zip: string; cc: boolean }): Promise<ComposeCheck> {
  const got = await page.evaluate((s: typeof SEL, w: { subject: string; zip: string }, marks: string[]) => {
    const body = document.querySelector(s.form) as HTMLElement;
    const pm = document.querySelector(s.editor) as HTMLElement;
    return {
      template: (document.querySelector(s.templateLabel)?.textContent ?? '').trim(),
      images: [...pm.querySelectorAll('img.ProseMirror__image')].map((i) => ({
        id: i.getAttribute('data-image_id'), loaded: (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0,
      })),
      subject: pm.innerText.includes(w.subject),
      zip: body.innerText.includes(w.zip.replace(/\.zip$/, '')),
      marks: marks.some((m) => pm.innerText.includes(m)),
      mention: Boolean(pm.querySelector('.ProseMirror__mention, a[href*="/parties/"]')),
      h1: pm.querySelectorAll('h1').length,
      quotes: pm.querySelectorAll('blockquote').length,
      bold: pm.querySelectorAll('strong').length,
    };
  }, SEL, { subject: want.subject, zip: want.zip }, [IMG_MARK, CC_MARK]);
  const assignees = await assigneesNow(page);
  const bad = [
    got.template !== want.template && `글양식 ${got.template || '없음'}`,
    (assignees.length !== want.assignees.length || want.assignees.some((x) => !assignees.includes(x))) && `요청 담당 ${assignees.join(',')}`,
    (got.images.length !== 1 || !got.images[0].id || !got.images[0].loaded) && `그림 ${JSON.stringify(got.images)}`,
    !got.subject && '공사명이 없다',
    !got.zip && '첨부 zip 이 안 붙었다',
    got.marks && '자리 표가 남았다',
    want.cc && !got.mention && 'cc 멘션이 없다',
  ].filter((x): x is string => Boolean(x));
  return {
    template: got.template, assignees, images: got.images, h1: got.h1, quotes: got.quotes, bold: got.bold, zip: got.zip, mention: got.mention, bad,
  };
}

export interface ComposeInput {
  /** 글양식 — 구매요청간소화 · 긴급구매요청(lib/agit/post agitTemplateOf) */
  template: string;
  /** 요청 담당 아지트 ID */
  assignees: readonly string[];
  /** 글(마크다운 — 콘솔이 지은 그대로) */
  text: string;
  /** 공사명 — 쓰는 칸 · 올린 글을 알아보는 표지 */
  title: string;
  /** 엑셀 캡처 — 구매 내역 자리의 그림 */
  png: { bytes: Uint8Array; name: string };
  /** 첨부 zip — 디스크의 파일(파일 칸에 그대로 올린다) */
  zip: { path: string; name: string };
  /** 시험 표시 — 첫 줄 끝에 */
  mark?: string | null;
  /** 긴급 글의 cc 멘션을 넣지 않는다 — 시험(한백 「Skip the finance mention」) */
  noCc?: boolean;
  log?: (line: string) => void;
}

/**
 * 열어 둔 쓰는 칸(openCompose)을 채우고 대 본다 — 그림 · 본문 · cc · zip · 요청 담당. 틀린 것이 있으면 check.bad 에 담아 돌려준다(부른 쪽이
 * 올리지 않는다).
 */
export async function fillCompose(page: Page, input: ComposeInput): Promise<ComposeCheck> {
  const log = input.log ?? (() => {});
  /* 캡처를 먼저 올려 그림 id 를 받는다 */
  await selectAll(page);
  await paste(page, { file: { b64: Buffer.from(input.png.bytes).toString('base64'), name: input.png.name, type: 'image/png' } });
  const img = await (await page.waitForFunction((sel: string) => {
    const i = document.querySelector(`${sel} img.ProseMirror__image[data-image_id]`) as HTMLImageElement | null;
    const src = i?.getAttribute('src') ?? '';
    return i && i.getAttribute('data-image_id') && src && !/^(blob|data):/.test(src) && i.complete && i.naturalWidth > 0
      ? { src, id: i.getAttribute('data-image_id')! } : null;
  }, { timeout: 90_000, polling: 500 }, SEL.editor).catch(() => {
    throw new Error('엑셀 캡처가 아지트에 안 올라간다(90초)');
  })).jsonValue() as { src: string; id: string };
  log(`[그림] 올림 · id ${img.id}`);

  /* 본문 — 그림 자리에 그 그림, 긴급 글의 cc 는 자리 표로 두고 멘션으로 바꾼다 */
  let source = input.text;
  if (input.mark) source = source.replace(/^([^\n]*)/, `$1 ${input.mark}`);
  if (input.noCc) source = source.replace(/\ncc \[@@[^\n]*$/, '\ncc (재무팀 멘션 자리 — 시험 글이라 부르지 않음)');
  const doc = agitEditorDocOf(source);
  if (!doc.image) throw new Error('글에 엑셀 캡처 자리가 없다');
  await selectAll(page);
  await paste(page, { html: withUploadedImage(doc.html, img) });
  await sleep(1500);
  if (doc.cc) await putCc(page, doc.cc);

  /* 첨부 zip · 요청 담당 */
  const box = (await page.$(SEL.fileInput)) as ElementHandle<HTMLInputElement> | null;
  if (!box) throw new Error('첨부 파일 칸이 없다');
  await box.uploadFile(input.zip.path);
  await page.waitForFunction((sel: string, name: string) => {
    const body = document.querySelector(sel) as HTMLElement | null;
    const busy = document.querySelectorAll(`${sel} [class*=progress], ${sel} [class*=uploading]`).length;
    return Boolean(body?.innerText.includes(name)) && busy === 0;
  }, { timeout: 120_000, polling: 1000 }, SEL.form, input.zip.name.replace(/\.zip$/, '')).catch(() => {
    throw new Error('첨부 zip 이 아지트에 안 올라간다(120초)');
  });
  log('[첨부] zip 붙음');
  await setAssignees(page, input.assignees);

  const check = await checkCompose(page, {
    template: input.template, assignees: input.assignees, subject: input.title, zip: input.zip.name, cc: Boolean(doc.cc),
  });
  log(`[쓰는 칸] 글양식 ${check.template} · 담당 ${check.assignees.join(', ')} · 머리 ${check.h1} · 상자 ${check.quotes} · 굵게 ${check.bold}`
    + ` · 그림 ${check.images.length} · zip ${check.zip ? '붙음' : '없음'}${doc.cc ? ` · cc 멘션 ${check.mention ? '있음' : '없음'}` : ''}`);
  return check;
}

/**
 * 「작성하기」를 누르고 새 글의 주소를 기다린다. ★누른 뒤에 멈추면 올라갔을 수 있다★ — 부른 쪽은 onSubmit 뒤의 실패를 「아지트에 올라갔는지
 * 먼저 확인」으로 남긴다(두 번 올리지 않게).
 */
export async function submitCompose(page: Page, title: string, opts: { onSubmit?: () => void; timeoutMs?: number } = {}): Promise<{ url: string; id: string }> {
  const before = new Set(await page.evaluate(() => [...document.querySelectorAll('a[href*="/wall/"]')]
    .map((x) => /\/wall\/(\d+)/.exec(x.getAttribute('href') ?? '')?.[1]).filter(Boolean) as string[]));
  await page.click(SEL.submit);
  opts.onSubmit?.();
  const id = await (await page.waitForFunction((seen: string[], subject: string) => {
    for (const x of document.querySelectorAll('a[href*="/wall/"]')) {
      const found = /\/wall\/(\d+)(?:$|[?#])/.exec(x.getAttribute('href') ?? '')?.[1];
      if (!found || seen.includes(found)) continue;
      /* 시각 고리는 글 머리(wall-message__meta)에 있다 — 본문(.marked)이 든 가장 가까운 윗칸이 그 글이다 */
      let holder = x.parentElement;
      while (holder && !holder.querySelector('.marked')) holder = holder.parentElement;
      if (holder?.innerText.includes(subject)) return found;
    }
    return null;
  }, { timeout: opts.timeoutMs ?? 60_000, polling: 1000 }, [...before], title).catch(() => {
    throw new Error('「작성하기」 뒤에 새 글이 안 보인다');
  })).jsonValue() as string;
  return { url: `${AGIT_GROUP}/wall/${id}`, id };
}

/** 시험(올리지 않음) 뒤 — 쓰는 칸을 비운다(아지트가 쓰던 글을 남겨 두지 않게) */
export async function clearCompose(page: Page): Promise<void> {
  await selectAll(page).catch(() => undefined);
  await page.keyboard.press('Backspace').catch(() => undefined);
  await sleep(500);
}

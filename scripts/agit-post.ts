/**
 * 아지트 열린구매 글을 ★한백의 아지트 계정으로★ 올린다 — Claude Code 가 한백의 맥에서 돌린다.
 * (한백 2026-11-09 「evcharging bot으로 올리니까 내가 내용수정도 안되고, 첨부파일은 링크가 아니라 첨부파일로 꼭 올려야 할 것 같아」 →
 *  「Claude Code posts it」 — 봇(그룹 웹훅) 글은 한백이 고칠 수 없고 파일을 붙일 수 없다. 콘솔 서버는 한백의 아지트 로그인을 쥐지 않는다)
 *
 * 한백이 Claude Code 에 「11월 25일 열린구매 올려」라고 하면:
 *   npx tsx scripts/agit-post.ts 2026-11-25
 * 1. 전용 크롬 창(프로필 ~/hanbaek-backups/agit-browser · 9335 포트 — 떠 있으면 붙고 없으면 띄운다)에서 콘솔과 아지트에 로그인돼 있는지 본다.
 *    안 돼 있으면 한백이 그 창에서 로그인할 때까지 기다린다(★비밀번호는 Claude 가 받지 않는다★).
 * 2. 콘솔(한백의 로그인)에서 그 결제일의 초안을 찾고(GET /api/agit/posts?payDate=) 「올리는 중」으로 세운다(POST /api/agit/posts/[id] —
 *    ★그때 금액으로 다시 지어 초안과 다르면 올리지 않는다★: 초안을 고쳐 두고 멈춘다 → 한백에게 바뀐 금액을 말하고 다시 시키라고 한다).
 * 3. 첨부 zip 을 받는다(GET …/files — 구매요청간소화 엑셀 · 캡처 · 거래명세서 PDF · 세금계산서).
 * 4. 아지트 열린구매 그룹의 쓰는 칸: 글양식(구매요청간소화 · 긴급구매요청) → 캡처를 먼저 올려 그림 id 를 받고 → 본문을 통째로 붙여 넣는다
 *    (lib/agit/editor-doc — # 머리 · > 회색 상자 · *굵게* · 고리 · 구매 내역 자리에 그 그림) → 긴급 글이면 「cc」 뒤에 @@team.finance 를
 *    멘션 고르기로 넣는다 → zip 을 첨부 파일로 → 요청 담당을 콘솔의 「요청 담당」 그대로 → 다 맞는지 대 보고 「작성하기」.
 * 5. 새 글의 주소를 콘솔에 남긴다(POST …/finish — 카드가 「올림」 · 상신 할 일이 끝나고 대화에 한 줄). 못 올렸으면 까닭을 남긴다(「못 올림」).
 *
 * 옵션: --dry 쓰는 칸만 채우고 올리지 않는다(콘솔도 「올리는 중」으로 세우지 않는다 · 쓰는 칸은 그대로 둔다) · --console <주소>(기본 운영) ·
 *       --cdp <주소>(이미 떠 있는 브라우저에 붙는다) · --mark <글>(시험 표시를 첫 줄 끝에) · --no-cc(긴급 글의 cc 멘션을 넣지 않는다 — 시험).
 * ★시험할 때 재무팀을 부르지 않는다★(한백 「Skip the finance mention」) — 긴급 글 시험은 --no-cc 나 --dry 로.
 * 쓰는 칸 다루기는 11-08 · 09 에 손으로 11/10 글을 쓰며 확인한 길이다(글양식 단추 · ProseMirror 붙여넣기 · 그림 붙여넣기 · 파일 input · 담당 칸).
 * 아지트 화면이 바뀌면 이 파일의 고르개(SEL)를 고친다.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer, { type Browser, type ElementHandle, type Page } from 'puppeteer-core';
import JSZip from 'jszip';
import { agitEditorDocOf, CC_MARK, IMG_MARK, withUploadedImage } from '../lib/agit/editor-doc';

const GROUP = 'https://team-hanbaek.agit.io/g/300450579';
const CDP_PORT = 9335;
const PROFILE = process.env.AGIT_BROWSER_PROFILE || join(homedir(), 'hanbaek-backups', 'agit-browser');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

/** 아지트 쓰는 칸의 고르개 — 화면이 바뀌면 여기만 고친다 */
const SEL = {
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

interface Args { payDate: string; dry: boolean; console: string; cdp: string | null; mark: string | null; noCc: boolean }

function argsOf(argv: string[]): Args {
  const payDate = argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
  if (!payDate) throw new Error('사용: npx tsx scripts/agit-post.ts <결제일 YYYY-MM-DD> [--dry] [--console 주소] [--cdp 주소] [--mark 글] [--no-cc]');
  const val = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
  };
  return {
    payDate, dry: argv.includes('--dry'), console: (val('--console') ?? 'https://hanbaek-re.vercel.app').replace(/\/+$/, ''),
    cdp: val('--cdp'), mark: val('--mark'), noCc: argv.includes('--no-cc'),
  };
}

/** 전용 크롬 — 떠 있으면 붙고, 없으면 띄운다(창은 남는다 — 다음에 로그인을 다시 안 해도 되게) */
async function browserOf(cdp: string | null): Promise<Browser> {
  const url = cdp ?? `http://127.0.0.1:${CDP_PORT}`;
  try {
    return await puppeteer.connect({ browserURL: url, defaultViewport: null });
  } catch {
    if (cdp) throw new Error(`브라우저에 붙지 못했다 — ${cdp}`);
  }
  mkdirSync(PROFILE, { recursive: true });
  spawn(CHROME, [`--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${PROFILE}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], {
    detached: true, stdio: 'ignore',
  }).unref();
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    try {
      return await puppeteer.connect({ browserURL: url, defaultViewport: null });
    } catch { /* 아직 안 떴다 */ }
  }
  throw new Error('크롬을 띄우지 못했다');
}

/** 이 일만의 새 탭 — 한백이 그 창에서 보던 탭은 건드리지 않는다 */
const tabOf = (browser: Browser): Promise<Page> => browser.newPage();

/** 그 주소를 열고, 로그인 화면이면 한백이 로그인할 때까지 기다린다 */
async function openSignedIn(page: Page, url: string, who: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  if (!page.url().includes('/login')) return;
  console.log(`[대기] ${who} 로그인 — 띄운 크롬 창에서 로그인해 주세요(비밀번호는 Claude 가 받지 않습니다)`);
  await page.bringToFront();
  const t0 = Date.now();
  while (page.url().includes('/login')) {
    if (Date.now() - t0 > 15 * 60_000) throw new Error(`${who} 로그인을 15분 기다렸습니다`);
    await sleep(2000);
  }
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
}

/** 콘솔 API — 한백의 로그인(그 탭의 쿠키)으로 */
async function api<T>(page: Page, path: string, body?: unknown): Promise<{ status: number; json: T }> {
  return page.evaluate(async (p: string, b: string | null) => {
    const res = await fetch(p, b === null ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: b });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  }, path, body === undefined ? null : JSON.stringify(body)) as Promise<{ status: number; json: T }>;
}

/** 콘솔의 첨부 zip — 바이트와 이름 */
async function zipOf(page: Page, id: string): Promise<{ bytes: Buffer; name: string }> {
  const got = await page.evaluate(async (path: string) => {
    const res = await fetch(path);
    if (!res.ok) return { error: `${res.status} ${(await res.text()).slice(0, 200)}` };
    const buf = new Uint8Array(await res.arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { b64: btoa(s), disposition: res.headers.get('Content-Disposition') ?? '' };
  }, `/api/agit/posts/${id}/files`);
  if ('error' in got) throw new Error(`첨부 zip 을 받지 못했다 — ${got.error}`);
  const name = /filename\*=UTF-8''([^;]+)/.exec(got.disposition)?.[1];
  return { bytes: Buffer.from(got.b64, 'base64'), name: name ? decodeURIComponent(name) : `열린구매 첨부.zip` };
}

/** 쓰는 칸 전체를 고른다 — 맥은 단축키가 렌더러에 안 가서 편집 명령으로 */
async function selectAll(page: Page): Promise<void> {
  await page.focus(SEL.editor);
  await page.keyboard.down('Meta');
  await page.keyboard.press('KeyA', { commands: ['SelectAll'] });
  await page.keyboard.up('Meta');
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

/** 쓰는 칸을 대 본다 — 하나라도 틀리면 올리지 않는다 */
async function checkCompose(page: Page, want: { template: string; assignees: string[]; subject: string; zip: string; cc: boolean }) {
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
  ].filter(Boolean);
  return { ...got, assignees, bad: bad as string[] };
}

async function main() {
  const a = argsOf(process.argv.slice(2));
  const dir = join(tmpdir(), 'agit-post', a.payDate);
  mkdirSync(dir, { recursive: true });
  const browser = await browserOf(a.cdp);
  const consoleTab = await tabOf(browser);
  await openSignedIn(consoleTab, `${a.console}/admin/agents/settlement`, '콘솔');

  /* 1. 올릴 초안 */
  const found = await api<{ post: { id: string; body: string; title: string; status: string; urgent: string | null } | null; template: string | null; assignees: string[]; error?: string }>(
    consoleTab, `/api/agit/posts?payDate=${a.payDate}`
  );
  if (found.status !== 200) throw new Error(`초안을 찾지 못했다 — ${found.json.error ?? found.status}`);
  const draft = found.json.post;
  if (!draft) throw new Error(`${a.payDate} 의 아지트 글 초안이 없다 — 정산 담당에게 초안을 올려 달라고 해 주세요`);
  console.log(`[초안] ${draft.title}${draft.urgent ? ' · 긴급' : ''} · ${draft.status}`);

  /* 2. 「올리는 중」 — 그때 금액으로 다시 지어 견준다(다르면 콘솔이 초안을 고쳐 두고 422) */
  let template = found.json.template ?? '구매요청간소화';
  let assignees = found.json.assignees;
  let text = draft.body;
  let claimed = false;
  let submitted = false;
  if (!a.dry) {
    const c = await api<{ post?: { body: string; assignees: string[] }; template?: string; assignees?: string[]; error?: string }>(
      consoleTab, `/api/agit/posts/${draft.id}`, { seen: draft.body }
    );
    if (c.status === 422 && /바뀌었습니다/.test(c.json.error ?? '')) {
      console.log(`[멈춤] ${c.json.error} — 카드의 고친 글을 한백에게 보이고 다시 시킨다`);
      process.exitCode = 2;
      await browser.disconnect();
      return;
    }
    if (c.status !== 200 || !c.json.post) throw new Error(`올리기 시작을 못 했다 — ${c.json.error ?? c.status}`);
    claimed = true;
    template = c.json.template ?? template;
    assignees = c.json.assignees ?? assignees;
    text = c.json.post.body;
  }

  try {
    if (assignees.length === 0) throw new Error('요청 담당 미지정 — 콘솔 정산 담당 화면의 「요청 담당」에 아지트 ID 를 넣어 주세요');
    /* 3. 첨부 zip · 그 안의 캡처 */
    const zip = await zipOf(consoleTab, draft.id);
    const zipPath = join(dir, zip.name);
    writeFileSync(zipPath, zip.bytes);
    const unzipped = await JSZip.loadAsync(zip.bytes);
    const pngEntry = Object.values(unzipped.files).find((f) => !f.dir && f.name.endsWith('.png'));
    if (!pngEntry) throw new Error('첨부 zip 에 엑셀 캡처(png)가 없다');
    const png = await pngEntry.async('nodebuffer');
    const pngName = pngEntry.name.split('/').pop()!;
    console.log(`[파일] ${zip.name} (${Math.round(zip.bytes.length / 1024)}KB) · 캡처 ${pngName}`);

    /* 4. 아지트 쓰는 칸 */
    const agit = await tabOf(browser);
    agit.on('dialog', (d) => { void d.accept(); });
    await openSignedIn(agit, `${GROUP}/wall`, '아지트');
    await agit.bringToFront();
    await agit.waitForSelector(SEL.templates, { timeout: 30_000 });
    await agit.evaluate((sel: string, name: string) => {
      const box = document.querySelector(sel)!;
      const el = [...box.querySelectorAll('*')].find((e) => e.children.length === 0 && (e.textContent ?? '').trim() === name) as HTMLElement | undefined;
      if (!el) throw new Error(`글양식 「${name}」 단추가 없다`);
      el.click();
    }, SEL.templates, template);
    await agit.waitForSelector(SEL.editor, { timeout: 30_000 });
    await sleep(1500);

    /* 캡처를 먼저 올려 그림 id 를 받는다 */
    await selectAll(agit);
    await paste(agit, { file: { b64: png.toString('base64'), name: pngName, type: 'image/png' } });
    const img = await (await agit.waitForFunction((sel: string) => {
      const i = document.querySelector(`${sel} img.ProseMirror__image[data-image_id]`) as HTMLImageElement | null;
      const src = i?.getAttribute('src') ?? '';
      return i && i.getAttribute('data-image_id') && src && !/^(blob|data):/.test(src) && i.complete && i.naturalWidth > 0
        ? { src, id: i.getAttribute('data-image_id')! } : null;
    }, { timeout: 120_000, polling: 500 }, SEL.editor)).jsonValue() as { src: string; id: string };
    console.log(`[그림] 올림 · id ${img.id}`);

    /* 본문 — 그림 자리에 그 그림, 긴급 글의 cc 는 자리 표로 두고 멘션으로 바꾼다 */
    let source = text;
    if (a.mark) source = source.replace(/^([^\n]*)/, `$1 ${a.mark}`);
    if (a.noCc) source = source.replace(/\ncc \[@@[^\n]*$/, '\ncc (재무팀 멘션 자리 — 시험 글이라 부르지 않음)');
    const doc = agitEditorDocOf(source);
    if (!doc.image) throw new Error('글에 엑셀 캡처 자리가 없다');
    await selectAll(agit);
    await paste(agit, { html: withUploadedImage(doc.html, img) });
    await sleep(1500);
    if (doc.cc) await putCc(agit, doc.cc);

    /* 첨부 zip · 요청 담당 */
    const input = (await agit.$(SEL.fileInput)) as ElementHandle<HTMLInputElement> | null;
    if (!input) throw new Error('첨부 파일 칸이 없다');
    await input.uploadFile(zipPath);
    await agit.waitForFunction((sel: string, name: string) => {
      const body = document.querySelector(sel) as HTMLElement | null;
      const busy = document.querySelectorAll(`${sel} [class*=progress], ${sel} [class*=uploading]`).length;
      return Boolean(body?.innerText.includes(name)) && busy === 0;
    }, { timeout: 180_000, polling: 1000 }, SEL.form, zip.name.replace(/\.zip$/, ''));
    console.log('[첨부] zip 붙음');
    await setAssignees(agit, assignees);

    /* 대 보고 올린다 */
    const check = await checkCompose(agit, { template, assignees, subject: draft.title, zip: zip.name, cc: Boolean(doc.cc) });
    await agit.screenshot({ path: join(dir, 'compose.png') as `${string}.png`, fullPage: false });
    console.log(`[쓰는 칸] 글양식 ${check.template} · 담당 ${check.assignees.join(', ')} · 머리 ${check.h1} · 상자 ${check.quotes} · 굵게 ${check.bold}`
      + ` · 그림 ${check.images.length} · zip ${check.zip ? '붙음' : '없음'}${doc.cc ? ` · cc 멘션 ${check.mention ? '있음' : '없음'}` : ''} · 화면 ${join(dir, 'compose.png')}`);
    if (check.bad.length) throw new Error(`쓰는 칸이 맞지 않아 올리지 않았다 — ${check.bad.join(' · ')}`);
    if (a.dry) {
      console.log('[시험] --dry — 올리지 않았다(쓰는 칸은 그대로 둔다)');
      await browser.disconnect();
      return;
    }

    const before = new Set(await agit.evaluate(() => [...document.querySelectorAll('a[href*="/wall/"]')]
      .map((x) => /\/wall\/(\d+)/.exec(x.getAttribute('href') ?? '')?.[1]).filter(Boolean) as string[]));
    await agit.click(SEL.submit);
    submitted = true;
    const newId = await (await agit.waitForFunction((seen: string[], subject: string) => {
      for (const x of document.querySelectorAll('a[href*="/wall/"]')) {
        const id = /\/wall\/(\d+)(?:$|[?#])/.exec(x.getAttribute('href') ?? '')?.[1];
        if (!id || seen.includes(id)) continue;
        /* 시각 고리는 글 머리(wall-message__meta)에 있다 — 본문(.marked)이 든 가장 가까운 윗칸이 그 글이다 */
        let holder = x.parentElement;
        while (holder && !holder.querySelector('.marked')) holder = holder.parentElement;
        if (holder?.innerText.includes(subject)) return id;
      }
      return null;
    }, { timeout: 60_000, polling: 1000 }, [...before], draft.title)).jsonValue() as string;
    const url = `${GROUP}/wall/${newId}`;
    console.log(`[올림] ${url}`);

    /* 5. 콘솔에 남긴다 */
    const done = await api<{ post?: { status: string }; error?: string }>(consoleTab, `/api/agit/posts/${draft.id}/finish`, { ok: true, url });
    claimed = false;
    if (done.status !== 200) throw new Error(`아지트에는 올렸는데 콘솔에 남기지 못했다(${url}) — ${done.json.error ?? done.status}`);
    console.log('[콘솔] 올림으로 남김 — 상신 할 일 끝남');
    /* 한백이 바로 보게 — 올린 글을 그 탭에 연다. 콘솔 탭은 닫는다 */
    await agit.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
    await consoleTab.close().catch(() => undefined);
    await browser.disconnect();
  } catch (e) {
    /* 「작성하기」를 누른 뒤에 멈췄으면 올라갔을 수 있다 — 다시 시키기 전에 아지트를 먼저 본다(두 번 올리지 않게) */
    const why = `${submitted ? '「작성하기」를 누른 뒤 멈춤 — 아지트에 올라갔는지 먼저 확인 · ' : ''}${e instanceof Error ? e.message : String(e)}`;
    if (claimed) {
      await api(consoleTab, `/api/agit/posts/${draft.id}/finish`, { ok: false, error: why.slice(0, 400) }).catch(() => undefined);
    }
    await browser.disconnect();
    throw new Error(why);
  }
}

main().catch((e) => {
  console.error('[agit-post]', e instanceof Error ? e.message : String(e));
  process.exit(1);
});

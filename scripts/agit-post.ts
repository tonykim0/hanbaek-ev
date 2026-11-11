/**
 * ★예비 길★ — 아지트 열린구매 글을 한백의 맥 전용 크롬에서 ★한백의 아지트 계정으로★ 올린다(Claude Code 가 돌린다).
 * 보통은 콘솔이 올린다(한백 2026-11-10 「에이전트가 직접 하게끔 하고싶어」 — 정산 담당의 agit_publish · 카드의 「승인하고 올리기」 →
 * app/api/agit/publish · 서버 브라우저가 연결한 한백의 아지트 로그인으로). 이 스크립트는 콘솔이 못 올리는 날(아지트가 서버 로그인을 막는 등)에
 * 쓴다 — 쓰는 칸을 채우는 차례는 콘솔과 같은 lib/agit/compose 다(두 벌을 두지 않는다).
 * (11-09 「evcharging bot으로 올리니까 내가 내용수정도 안되고, 첨부파일은 링크가 아니라 첨부파일로 꼭 올려야 할 것 같아」 → 「Claude Code posts it」
 *  이 이 스크립트의 시작이었다)
 *
 * 한백이 Claude Code 에 「11월 25일 열린구매 올려」라고 했고 콘솔이 못 올리면:
 *   npx tsx scripts/agit-post.ts 2026-11-25            (그날의 글 전부 — 영업비 · 시공비 따로, 영업비 먼저)
 *   npx tsx scripts/agit-post.ts 2026-11-25 시공비     (한 구분만)
 *   npx tsx scripts/agit-post.ts 2026-11-30 위탁운영수수료   (플러그링크 위탁운영수수료 글 — 그 지급 요청일 · lib/agit/fee)
 * 글은 결제일 × 구분마다 하나다 — 아래 2~5 를 글마다 한다. 한 글이 금액이 바뀌었거나 못 올라가도 다음 글은 올린다(끝에 모아 말한다).
 * 1. 전용 크롬 창(프로필 ~/hanbaek-backups/agit-browser · 9335 포트 — 떠 있으면 붙고 없으면 띄운다)에서 콘솔과 아지트에 로그인돼 있는지 본다.
 *    안 돼 있으면 한백이 그 창에서 로그인할 때까지 기다린다(★비밀번호는 Claude 가 받지 않는다★).
 * 2. 콘솔(한백의 로그인)에서 그 결제일의 초안을 찾고(GET /api/agit/posts?payDate=) 「올리는 중」으로 세운다(POST /api/agit/posts/[id] —
 *    ★그때 금액으로 다시 지어 초안과 다르면 올리지 않는다★: 초안을 고쳐 두고 멈춘다 → 한백에게 바뀐 금액을 말하고 다시 시키라고 한다).
 * 3. 첨부 zip 을 받는다(GET …/files — 구매요청간소화 엑셀 · 캡처 · 거래명세서 PDF · 세금계산서).
 * 4. 아지트 열린구매 그룹의 쓰는 칸을 채운다(lib/agit/compose — 글양식 · 캡처 그림 · 본문 · cc · zip · 요청 담당 · 대 보기) → 「작성하기」.
 * 5. 새 글의 주소를 콘솔에 남긴다(POST …/finish — 카드가 「올림」 · 상신 할 일이 끝나고 대화에 한 줄). 못 올렸으면 까닭을 남긴다(「못 올림」).
 *
 * 종료: 0 다 올림 · 2 금액이 바뀐 글이 있음(콘솔이 초안을 고쳐 둠 — 한백에게 새 금액을 말하고 다시 시키게) · 3 초안이 없는 구분이 있음(정산 담당에게
 *       초안을 시키게) · 1 못 올린 글이 있음(까닭 — 「작성하기를 누른 뒤 멈춤」이면 아지트에 올라갔는지 먼저 본다). 여럿이면 1 > 2 > 3.
 * 옵션: --dry 쓰는 칸만 채우고 올리지 않는다(콘솔도 「올리는 중」으로 세우지 않는다 · 쓰는 칸은 그대로 둔다) · --console <주소>(기본 운영) ·
 *       --cdp <주소>(이미 떠 있는 브라우저에 붙는다) · --mark <글>(시험 표시를 첫 줄 끝에) · --no-cc(긴급 글의 cc 멘션을 넣지 않는다 — 시험).
 * ★시험할 때 재무팀을 부르지 않는다★(한백 「Skip the finance mention」) — 긴급 글 시험은 --no-cc 나 --dry 로.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer-core';
import JSZip from 'jszip';
import { fillCompose, openCompose, submitCompose } from '../lib/agit/compose';

const CDP_PORT = 9335;
const PROFILE = process.env.AGIT_BROWSER_PROFILE || join(homedir(), 'hanbaek-backups', 'agit-browser');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 글의 구분 — 위탁운영수수료 글(lib/agit/fee)은 그 지급 요청일로 찾는다 */
type Kind = '영업비' | '시공비' | '위탁운영수수료';
const KINDS: readonly Kind[] = ['영업비', '시공비', '위탁운영수수료'];

interface Args {
  payDate: string; kind: Kind | null; dry: boolean; console: string; cdp: string | null; mark: string | null; noCc: boolean;
}

function argsOf(argv: string[]): Args {
  const payDate = argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
  if (!payDate) {
    throw new Error('사용: npx tsx scripts/agit-post.ts <결제일 YYYY-MM-DD> [영업비|시공비|위탁운영수수료] [--dry] [--console 주소] [--cdp 주소] [--mark 글] [--no-cc]');
  }
  const kind = (argv.find((a) => (KINDS as readonly string[]).includes(a)) as Kind | undefined) ?? null;
  const val = (name: string) => {
    const i = argv.indexOf(name);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
  };
  return {
    payDate, kind, dry: argv.includes('--dry'), console: (val('--console') ?? 'https://hanbaek-re.vercel.app').replace(/\/+$/, ''),
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

/** 로그인 화면이면 한백이 로그인할 때까지 기다린다 */
async function waitSignIn(page: Page, who: string): Promise<void> {
  console.log(`[대기] ${who} 로그인 — 띄운 크롬 창에서 로그인해 주세요(비밀번호는 Claude 가 받지 않습니다)`);
  await page.bringToFront();
  const t0 = Date.now();
  while (page.url().includes('/login')) {
    if (Date.now() - t0 > 15 * 60_000) throw new Error(`${who} 로그인을 15분 기다렸습니다`);
    await sleep(2000);
  }
}

/** 그 주소를 열고, 로그인 화면이면 한백이 로그인할 때까지 기다린다 */
async function openSignedIn(page: Page, url: string, who: string): Promise<void> {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  if (!page.url().includes('/login')) return;
  await waitSignIn(page, who);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
}

/** 콘솔 API — 한백의 로그인(그 탭의 쿠키)으로 */
async function api<T>(page: Page, path: string, body?: unknown): Promise<{ status: number; json: T }> {
  return page.evaluate(async (p: string, b: string | null) => {
    const res = await fetch(p, b === null ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: b });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  }, path, body === undefined ? null : JSON.stringify(body)) as Promise<{ status: number; json: T }>;
}

/** 콘솔의 첨부 zip(part 를 주면 그것만 — png 엑셀 캡처) — 바이트와 이름 */
async function zipOf(page: Page, id: string, part?: 'png'): Promise<{ bytes: Buffer; name: string }> {
  const got = await page.evaluate(async (path: string) => {
    const res = await fetch(path);
    if (!res.ok) return { error: `${res.status} ${(await res.text()).slice(0, 200)}` };
    const buf = new Uint8Array(await res.arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    return { b64: btoa(s), disposition: res.headers.get('Content-Disposition') ?? '' };
  }, `/api/agit/posts/${id}/files${part ? `?part=${part}` : ''}`);
  if ('error' in got) throw new Error(`첨부 ${part ?? 'zip'} 을 받지 못했다 — ${got.error}`);
  const name = /filename\*=UTF-8''([^;]+)/.exec(got.disposition)?.[1];
  return { bytes: Buffer.from(got.b64, 'base64'), name: name ? decodeURIComponent(name) : part ? `엑셀 캡처.${part}` : '열린구매 첨부.zip' };
}

interface Draft { id: string; kind: Kind; body: string; title: string; status: string; urgent: string | null }

/** 글 하나의 끝 — 올림(주소) · 금액 바뀜 · 시험(--dry) · 못 올림(까닭) */
type Outcome =
  | { kind: Kind; ok: true; url: string; tab: Page }
  | { kind: Kind; ok: false; changed: true; why: string }
  | { kind: Kind; ok: false; dry: true; tab: Page }
  | { kind: Kind; ok: false; why: string };

/** 글 하나를 올린다 — 「올리는 중」 → zip → 쓰는 칸 → 작성하기 → 콘솔에 주소. 아지트 탭은 새로 연다(한백이 보던 탭은 건드리지 않는다) */
async function postOne(a: Args, browser: Browser, consoleTab: Page, draft: Draft, found: { template: string; assignees: string[] }): Promise<Outcome> {
  const dir = join(tmpdir(), 'agit-post', `${a.payDate}-${draft.kind}`);
  mkdirSync(dir, { recursive: true });
  console.log(`\n[초안] ${draft.kind} · ${draft.title}${draft.urgent ? ' · 긴급' : ''} · ${draft.status}`);

  /* 「올리는 중」 — 그때 금액으로 다시 지어 견준다(다르면 콘솔이 초안을 고쳐 두고 422) */
  let template = found.template;
  let assignees = found.assignees;
  let text = draft.body;
  let claimed = false;
  let submitted = false;
  if (!a.dry) {
    const c = await api<{ post?: { body: string; assignees: string[] }; template?: string; assignees?: string[]; error?: string }>(
      consoleTab, `/api/agit/posts/${draft.id}`, { seen: draft.body }
    );
    if (c.status === 422 && /바뀌었습니다/.test(c.json.error ?? '')) {
      console.log(`[멈춤] ${draft.kind} — ${c.json.error} — 카드의 고친 글을 한백에게 보이고 다시 시킨다`);
      return { kind: draft.kind, ok: false, changed: true, why: c.json.error ?? '금액이 바뀌었습니다' };
    }
    if (c.status !== 200 || !c.json.post) return { kind: draft.kind, ok: false, why: `올리기 시작을 못 했다 — ${c.json.error ?? c.status}` };
    claimed = true;
    template = c.json.template ?? template;
    assignees = c.json.assignees ?? assignees;
    text = c.json.post.body;
  }

  try {
    if (assignees.length === 0) throw new Error('요청 담당 미지정 — 콘솔 정산 담당 화면의 「요청 담당」에 아지트 ID 를 넣어 주세요');
    /* 첨부 zip · 그 안의 캡처 */
    const zip = await zipOf(consoleTab, draft.id);
    const zipPath = join(dir, zip.name);
    writeFileSync(zipPath, zip.bytes);
    const unzipped = await JSZip.loadAsync(zip.bytes);
    const pngEntry = Object.values(unzipped.files).find((f) => !f.dir && f.name.endsWith('.png'));
    /* 위탁운영수수료 zip 에는 캡처가 없다(한백의 5차 zip 그대로) — 따로 받는다 */
    const shot = pngEntry
      ? { bytes: await pngEntry.async('nodebuffer'), name: pngEntry.name.split('/').pop()! }
      : await zipOf(consoleTab, draft.id, 'png');
    const png = shot.bytes;
    const pngName = shot.name;
    console.log(`[파일] ${zip.name} (${Math.round(zip.bytes.length / 1024)}KB) · 캡처 ${pngName}`);

    /* 아지트 쓰는 칸 — 차례는 콘솔이 올릴 때와 같다(lib/agit/compose) */
    const agit = await tabOf(browser);
    agit.on('dialog', (d) => { void d.accept(); });
    await agit.bringToFront();
    await openCompose(agit, template, () => waitSignIn(agit, '아지트'));
    const check = await fillCompose(agit, {
      template, assignees, text, title: draft.title, png: { bytes: png, name: pngName }, zip: { path: zipPath, name: zip.name },
      mark: a.mark, noCc: a.noCc, log: (line) => console.log(line),
    });
    await agit.screenshot({ path: join(dir, 'compose.png') as `${string}.png`, fullPage: false });
    console.log(`[화면] ${join(dir, 'compose.png')}`);
    if (check.bad.length) throw new Error(`쓰는 칸이 맞지 않아 올리지 않았다 — ${check.bad.join(' · ')}`);
    if (a.dry) {
      console.log(`[시험] --dry — ${draft.kind} 글은 올리지 않았다(쓰는 칸은 그대로 둔다)`);
      return { kind: draft.kind, ok: false, dry: true, tab: agit };
    }

    const { url } = await submitCompose(agit, draft.title, { onSubmit: () => { submitted = true; } });
    console.log(`[올림] ${draft.kind} — ${url}`);

    /* 콘솔에 남긴다 */
    const done = await api<{ post?: { status: string }; error?: string }>(consoleTab, `/api/agit/posts/${draft.id}/finish`, { ok: true, url });
    claimed = false;
    if (done.status !== 200) throw new Error(`아지트에는 올렸는데 콘솔에 남기지 못했다(${url}) — ${done.json.error ?? done.status}`);
    console.log(`[콘솔] ${draft.kind} 글 올림으로 남김`);
    return { kind: draft.kind, ok: true, url, tab: agit };
  } catch (e) {
    /* 「작성하기」를 누른 뒤에 멈췄으면 올라갔을 수 있다 — 다시 시키기 전에 아지트를 먼저 본다(두 번 올리지 않게) */
    const why = `${submitted ? '「작성하기」를 누른 뒤 멈춤 — 아지트에 올라갔는지 먼저 확인 · ' : ''}${e instanceof Error ? e.message : String(e)}`;
    if (claimed) {
      await api(consoleTab, `/api/agit/posts/${draft.id}/finish`, { ok: false, error: why.slice(0, 400) }).catch(() => undefined);
    }
    console.error(`[못 올림] ${draft.kind} — ${why}`);
    return { kind: draft.kind, ok: false, why };
  }
}

async function main() {
  const a = argsOf(process.argv.slice(2));
  const browser = await browserOf(a.cdp);
  const consoleTab = await tabOf(browser);
  await openSignedIn(consoleTab, `${a.console}/admin/agents/settlement`, '콘솔');

  /* 올릴 초안 — 구분마다 하나(영업비 먼저) · 초안이 없는 구분(missing) */
  const found = await api<{
    posts?: { post: Draft; template: string }[]; missing?: Kind[]; assignees?: string[]; error?: string;
  }>(consoleTab, `/api/agit/posts?payDate=${a.payDate}${a.kind ? `&kind=${encodeURIComponent(a.kind)}` : ''}`);
  if (found.status !== 200) throw new Error(`초안을 찾지 못했다 — ${found.json.error ?? found.status}`);
  const posts = found.json.posts ?? [];
  const missing = found.json.missing ?? [];
  for (const k of missing) console.log(`[빠짐] ${a.payDate} ${k} 글 초안이 없다 — 정산 담당에게 「${k} 열린구매 초안」을 올려 달라고 한 뒤 다시 시킨다`);
  if (posts.length === 0) {
    await browser.disconnect();
    if (missing.length) {
      process.exitCode = 3;
      return;
    }
    throw new Error(`${a.payDate}${a.kind ? ` ${a.kind}` : ''} 의 올릴 아지트 글이 없다(이미 올렸거나 지급이 없다)`);
  }

  const outs: Outcome[] = [];
  for (const { post, template } of posts) {
    outs.push(await postOne(a, browser, consoleTab, post, { template, assignees: found.json.assignees ?? [] }));
  }

  /* 한백이 바로 보게 — 올린 글을 그 탭에 연다(마지막 탭만 남기고 앞의 아지트 탭은 닫는다). --dry 면 쓰는 칸들을 그대로 둔다 */
  const shown = outs.filter((o): o is Extract<Outcome, { url: string }> => o.ok);
  for (const o of shown.slice(0, -1)) await o.tab.close().catch(() => undefined);
  const last = shown.at(-1);
  if (last) await last.tab.goto(last.url, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
  if (!a.dry) await consoleTab.close().catch(() => undefined);
  await browser.disconnect();

  console.log('\n[끝]');
  for (const o of outs) {
    console.log(`  ${o.kind}: ${o.ok ? `올림 ${o.url}` : 'dry' in o ? '시험(올리지 않음)' : 'changed' in o ? `멈춤 — ${o.why}` : `못 올림 — ${o.why}`}`);
  }
  for (const k of missing) console.log(`  ${k}: 초안 없음`);
  const failed = outs.some((o) => !o.ok && !('dry' in o) && !('changed' in o));
  const changed = outs.some((o) => 'changed' in o);
  process.exitCode = failed ? 1 : changed ? 2 : missing.length ? 3 : 0;
}

main().catch((e) => {
  console.error('[agit-post]', e instanceof Error ? e.message : String(e));
  process.exit(1);
});

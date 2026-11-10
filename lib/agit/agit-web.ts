/**
 * 아지트에 한백의 계정으로 — 로그인(연결)과 글 올리기를 서버 브라우저가 한다. [서버 전용]
 * (한백 2026-11-10 「에이전트가 직접 하게끔 하고싶어」 — 정산 담당이 올린다. 11-09 의 Claude Code 길은 한백이 콘솔 밖으로 나가야 했다)
 *
 * 로그인: 아지트 로그인 화면(이메일 또는 아지트 ID · 비밀번호 — 보통 폼, 브라우저 쪽 암호화 없음 · 2026-11-10 공개 화면으로 확인)에 서버
 * 브라우저가 한백이 콘솔에 넣은 값을 넣고 「로그인」을 누른다. 되면 열린구매 그룹의 쓰는 칸이 열리는지까지 보고 쿠키만 돌려준다 —
 * ★비밀번호는 여기서 쓰고 버린다★(돌려주지도 남기지도 · 로그에 찍지도 않는다). 틀리면 로그인 화면의 오류 글(.ag__error-message ·
 * 알림 창)을 그대로 전한다.
 * 올리기: 쥔 쿠키를 심은 브라우저로 쓰는 칸을 채워 올린다(lib/agit/compose — 맥의 예비 길과 같은 차례). 로그인 화면으로 가면
 * AgitSignedOut — 부른 쪽이 연결을 「풀림」으로 적는다. 다 하면 그 브라우저의 쿠키를 돌려준다(아지트가 바꿔 준 것을 이어 쥔다).
 * 브라우저 이름은 늘 같다(lib/agit/chromium AGIT_USER_AGENT) — 로그인 때와 올릴 때가 다르면 아지트가 다른 기기로 볼 수 있다.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Browser, Page } from 'puppeteer-core';
import { AGIT_USER_AGENT, launchChromium } from './chromium';
import {
  AGIT_GROUP, SEL, clearCompose, fillCompose, onAgitLogin, openCompose, submitCompose, type ComposeCheck, type ComposeInput,
} from './compose';
import { AGIT_LOGIN_COOKIE, AGIT_TEAM_ORIGIN, agitCookiesOf, cookieParamsOf, mergeAgitCookies, type AgitCookie } from './session';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 「작성하기」를 누르기 전에 이만큼 지났으면 누르지 않는다 — 함수가 끝까지(300초) 살아 새 글 주소를 받게 */
const SUBMIT_BY_MS = 210_000;

async function agitTab(browser: Browser, cookies?: readonly AgitCookie[]): Promise<Page> {
  const page = await browser.newPage();
  await page.setUserAgent(AGIT_USER_AGENT);
  await page.setViewport({ width: 1440, height: 1000 });
  page.on('dialog', (d) => { void d.accept(); });
  if (cookies?.length) await browser.setCookie(...cookieParamsOf(cookies));
  return page;
}

const cookiesNow = async (browser: Browser): Promise<AgitCookie[]> => agitCookiesOf(await browser.cookies());

/** 로그인 화면에 뜬 오류 글 — 폼 밑 글 · 알림 창 */
const loginErrorOf = (page: Page): Promise<string> => page.evaluate(() => {
  const shown = (el: Element) => (el as HTMLElement).offsetParent !== null || getComputedStyle(el).position === 'fixed';
  const texts = [...document.querySelectorAll('.ag__error-message, .alert-view__msg, .alert-view__title')]
    .filter(shown).map((e) => (e.textContent ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  return [...new Set(texts)].join(' · ').slice(0, 200);
});

/**
 * 아지트에 로그인해 본다 — 되면 열린구매 그룹의 쓰는 칸까지 열어 보고 쿠키를 돌려준다. 안 되면 사람 말로 던진다(아지트의 오류 글을 담아).
 */
export async function agitLogin(input: { login: string; password: string }): Promise<{ cookies: AgitCookie[] }> {
  const browser = await launchChromium();
  try {
    const page = await agitTab(browser);
    await page.goto(`${AGIT_TEAM_ORIGIN}/login`, { waitUntil: 'networkidle2', timeout: 30_000 });
    await page.waitForSelector('#email', { timeout: 15_000 }).catch(() => {
      throw new Error('아지트 로그인 화면이 바뀌었습니다 — 이메일 칸을 못 찾았습니다.');
    });
    await page.type('#email', input.login, { delay: 25 });
    await page.type('#password', input.password, { delay: 25 });
    /* 「로그인」 단추는 두 칸이 차면 화면이 연다 */
    await page.waitForFunction(() => !(document.querySelector('.ag__submit') as HTMLInputElement | null)?.disabled, { timeout: 5_000 })
      .catch(() => undefined);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30_000 }).catch(() => null),
      page.click('.ag__submit'),
    ]);
    await sleep(1500);
    if (onAgitLogin(page)) {
      /* 아지트의 말은 마침표로 끝난다(「…잘못되었습니다.」 — 11-10 프리뷰) — 우리 마침표와 겹치지 않게 뗀다 */
      const said = (await loginErrorOf(page).catch(() => '')).replace(/[.。\s]+$/, '');
      throw new Error(`아지트에 로그인하지 못했습니다 — ${said || '이메일(아지트 ID)과 비밀번호를 확인해 주세요'}.`);
    }
    /* 열린구매 그룹에 글을 쓸 수 있는 계정인지 — 쓰는 칸이 열려야 한다 */
    await page.goto(`${AGIT_GROUP}/wall`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    if (onAgitLogin(page)) throw new Error('로그인한 뒤에도 아지트가 로그인 화면으로 보냅니다 — 잠시 뒤 다시 연결해 주세요.');
    await page.waitForSelector(SEL.templates, { timeout: 30_000 }).catch(() => {
      throw new Error('로그인은 됐는데 열린구매 그룹의 쓰는 칸이 안 열립니다 — 그 그룹에 든 계정인지 봐 주세요.');
    });
    const cookies = await cookiesNow(browser);
    if (!cookies.length) throw new Error('로그인은 됐는데 아지트가 로그인 쿠키를 주지 않았습니다.');
    return { cookies };
  } finally {
    await browser.close().catch(() => undefined);
  }
}

export type PostAsHanbaekInput = Omit<ComposeInput, 'zip' | 'png'> & {
  cookies: readonly AgitCookie[];
  png: { bytes: Uint8Array; name: string };
  zip: { bytes: Uint8Array; name: string };
  /** 시험 — 쓰는 칸만 채우고 화면을 찍은 뒤 비운다(올리지 않는다) */
  dry?: boolean;
  /** 「작성하기」를 누른 순간 — 그 뒤의 실패는 올라갔을 수 있다 */
  onSubmit?: () => void;
  /** 이 일이 시작된 때(ms) — 함수의 남은 시간을 셈한다. 빼면 지금 */
  startedAt?: number;
};

export type PostAsHanbaekResult =
  | { dry: false; url: string; id: string; cookies: AgitCookie[] }
  | { dry: true; check: ComposeCheck; shot: Uint8Array; cookies: AgitCookie[] };

/** 쥔 로그인으로 쓰는 칸을 채워 올린다(dry 면 채워 보기만). 로그인 화면으로 가면 AgitSignedOut */
export async function postAsHanbaek(input: PostAsHanbaekInput): Promise<PostAsHanbaekResult> {
  const startedAt = input.startedAt ?? Date.now();
  const dir = await mkdtemp(join(tmpdir(), 'agit-post-'));
  const zipPath = join(dir, input.zip.name);
  await writeFile(zipPath, input.zip.bytes);
  const browser = await launchChromium();
  try {
    const page = await agitTab(browser, input.cookies);
    await openCompose(page, input.template);
    const check = await fillCompose(page, { ...input, zip: { path: zipPath, name: input.zip.name } });
    if (input.dry) {
      const shot = await page.screenshot({ type: 'png', fullPage: false });
      await clearCompose(page);
      return { dry: true, check, shot, cookies: mergeAgitCookies(input.cookies, await cookiesNow(browser)) };
    }
    if (check.bad.length) throw new Error(`쓰는 칸이 맞지 않아 올리지 않았습니다 — ${check.bad.join(' · ')}`);
    if (Date.now() - startedAt > SUBMIT_BY_MS) {
      throw new Error('시간이 모자라 「작성하기」 전에 멈췄습니다(아지트에 안 올라갔습니다) — 다시 올려 주세요.');
    }
    const posted = await submitCompose(page, input.title, { onSubmit: input.onSubmit, timeoutMs: 60_000 });
    return { dry: false, ...posted, cookies: mergeAgitCookies(input.cookies, await cookiesNow(browser)) };
  } finally {
    await browser.close().catch(() => undefined);
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/** 쥔 쿠키에 로그인 쿠키가 있는가 — 없으면 연결이 덜 됐다 */
export const hasAgitLogin = (cookies: readonly AgitCookie[]): boolean => cookies.some((c) => c.name === AGIT_LOGIN_COOKIE);

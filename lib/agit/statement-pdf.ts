/**
 * 거래명세서 PDF (서버 전용) — 콘솔의 거래명세서 화면(/payments/statement)을 서버의 브라우저가 열어 그대로 PDF 로 저장한다.
 * (한백 2026-11-08 「개별 파일로 하나의 zip으로 다운받아서 올려」 — 지금까지 한백이 그 화면을 브라우저로 「PDF 저장」해 zip 에 넣었다.)
 *
 * ★두 벌을 그리지 않는다★ — 명세서의 모양은 StatementView 하나다(인쇄 규칙 print:hidden 까지). 서버가 같은 화면을 인쇄 매체로 연다.
 * 브라우저: Vercel(리눅스)은 @sparticuz/chromium, 로컬(맥)은 설치된 크롬(CHROME_PATH 로 바꾼다).
 * 로그인: 누른 한백의 쿠키를 ★그 콘솔 주소에만★ 심는다 — 글꼴 CDN 같은 다른 곳의 요청에는 안 실린다.
 * 글꼴은 화면과 같은 Pretendard(CDN)다 — 다 받을 때까지 기다린다(networkidle0 · document.fonts.ready).
 * 열리지 않으면(로그인으로 튕김 · 4xx · 시간 초과) 사람 말로 던진다 — zip 을 반쪽으로 내주지 않는다.
 * 같은 브라우저로 구매요청간소화 엑셀의 캡처(PNG)도 찍는다(lib/agit/purchase-image 의 HTML — 한백 「중간에 엑셀파일 스크린샷 찍은것도
 * 파일로 올려야해」). 띄우는 데 몇 초라 한 번 띄워 둘 다 짓는다.
 */
import type { Browser } from 'puppeteer-core';

const LOCAL_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PAGE_TIMEOUT_MS = 30_000;

/** 쿠키 머리 → 이름 · 값 쌍 */
export function cookiePairs(header: string | null | undefined): Array<{ name: string; value: string }> {
  if (!header) return [];
  return header.split(';').map((part) => {
    const i = part.indexOf('=');
    return i > 0 ? { name: part.slice(0, i).trim(), value: part.slice(i + 1).trim() } : null;
  }).filter((p): p is { name: string; value: string } => Boolean(p?.name));
}

async function launch(): Promise<Browser> {
  const puppeteer = (await import('puppeteer-core')).default;
  if (process.platform === 'linux') {
    const chromium = (await import('@sparticuz/chromium')).default;
    return puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true });
  }
  return puppeteer.launch({ executablePath: process.env.CHROME_PATH || LOCAL_CHROME, headless: true });
}

/**
 * 거래명세서 여러 장과 엑셀 캡처 — paths 는 콘솔 안의 경로(statementPathOf), origin 은 지금 요청이 온 콘솔 주소, html 은 캡처할 표.
 * 브라우저는 한 번 띄워 차례로 연다(띄우는 데 몇 초 — 장마다 띄우지 않는다).
 */
export async function renderAgitFiles(input: {
  origin: string; cookie: string | null; paths: string[]; html: string | null;
}): Promise<{ pdfs: Uint8Array[]; image: Uint8Array | null }> {
  if (input.paths.length === 0 && !input.html) return { pdfs: [], image: null };
  const origin = new URL(input.origin);
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1240, height: 1754 });
    const cookies = cookiePairs(input.cookie).map((c) => ({
      ...c, domain: origin.hostname, path: '/', secure: origin.protocol === 'https:', httpOnly: true,
    }));
    if (cookies.length) await page.browserContext().setCookie(...cookies);
    /*
     * 프리뷰는 Vercel 배포 보호가 서버 브라우저의 요청도 막는다(vercel.com 로그인으로 넘긴다). 프로젝트에 자동화 우회 열쇠가 있으면
     * 콘솔 주소로 가는 요청에만 그 머리를 단다 — 글꼴 CDN 같은 다른 곳에는 안 실린다. 운영 주소는 보호가 없어 머리가 있어도 무해하다.
     */
    const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
    if (bypass) {
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const same = new URL(req.url()).origin === origin.origin;
        void req.continue(same ? { headers: { ...req.headers(), 'x-vercel-protection-bypass': bypass } } : undefined);
      });
    }
    const out: Uint8Array[] = [];
    for (const path of input.paths) {
      const res = await page.goto(new URL(path, origin).toString(), { waitUntil: 'networkidle0', timeout: PAGE_TIMEOUT_MS });
      const at = new URL(page.url());
      if (at.origin !== origin.origin) throw new Error(`거래명세서를 열 수 없습니다 — ${at.hostname} 로 넘어갔습니다(배포 보호).`);
      if (at.pathname.startsWith('/login')) throw new Error('거래명세서를 열 수 없습니다 — 로그인이 풀렸습니다. 다시 로그인해 주세요.');
      if (!res || res.status() >= 400) throw new Error(`거래명세서를 열 수 없습니다(${res?.status() ?? '응답 없음'}).`);
      await page.evaluate(() => document.fonts.ready.then(() => true));
      await page.emulateMediaType('print');
      /* 배경은 빼고 — 브라우저의 「PDF 저장」 기본값과 같다(화면 바탕색이 종이 테두리로 남지 않게) */
      out.push(await page.pdf({ format: 'A4', printBackground: false, preferCSSPageSize: true }));
      await page.emulateMediaType('screen');
    }
    /* 엑셀 캡처 — 콘솔 화면이 아니라 우리가 지은 표다(쿠키 · 우회 머리가 필요 없다). 또렷하게 두 배로 찍는다 */
    let image: Uint8Array | null = null;
    if (input.html) {
      const shot = await browser.newPage();
      await shot.setViewport({ width: 1400, height: 800, deviceScaleFactor: 2 });
      await shot.setContent(input.html, { waitUntil: 'load', timeout: PAGE_TIMEOUT_MS });
      /* 글꼴(CDN 의 나눠 받는 조각)이 다 올 때까지 */
      await shot.waitForNetworkIdle({ idleTime: 300, timeout: PAGE_TIMEOUT_MS }).catch(() => {});
      await shot.evaluate(() => document.fonts.ready.then(() => true));
      const table = await shot.$('#sheet');
      if (!table) throw new Error('엑셀 캡처를 그리지 못했습니다.');
      image = await table.screenshot({ type: 'png' });
    }
    return { pdfs: out, image };
  } finally {
    await browser.close().catch(() => {});
  }
}

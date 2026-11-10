/**
 * 서버 브라우저 (서버 전용) — 거래명세서 PDF · 엑셀 캡처(lib/agit/statement-pdf)와 아지트 글 올리기 · 로그인(lib/agit/agit-web)이 같이 띄운다.
 * Vercel(리눅스)은 @sparticuz/chromium, 로컬(맥)은 설치된 크롬(CHROME_PATH 로 바꾼다). 띄운 브라우저는 부른 쪽이 닫는다.
 * 압축본은 next.config 의 outputFileTracingIncludes 로 그 라우트들에만 싣는다(띄우는 라우트를 늘리면 거기도 더한다).
 */
import type { Browser } from 'puppeteer-core';

const LOCAL_CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export async function launchChromium(): Promise<Browser> {
  const puppeteer = (await import('puppeteer-core')).default;
  if (process.platform === 'linux') {
    const chromium = (await import('@sparticuz/chromium')).default;
    return puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true });
  }
  return puppeteer.launch({ executablePath: process.env.CHROME_PATH || LOCAL_CHROME, headless: true });
}

/**
 * 아지트를 여는 서버 브라우저의 이름 — 머리 없는 크롬의 표지(HeadlessChrome)를 빼고 보통 크롬으로. 로그인과 올리기가 늘 같은 이름이다
 * (아지트가 로그인을 브라우저 이름에 묶어 두었어도 풀리지 않게).
 */
export const AGIT_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * 카카오 우편번호(주소 검색) 스크립트는 t1.kakaocdn.net 에서 받는다 — 카카오가 옛 주소 t1.daumcdn.net(그리고 *.daumcdn.net)을
 * 2026-11-30 까지만 두고 닫는다고 알렸다(카카오 우편번호 공지 #1562 · 한백 2026-11-14 「주소검색 누르면 이거 나오는데 이거 대응해줘」).
 * 닫힌 뒤에는 스크립트가 안 와서 주소 검색이 「불러오지 못했습니다」로 멈춘다. 옛 주소가 복사돼 다시 들어오지 않게 본다.
 */
import { readdirSync, readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { findSources } from './fs';

describe('카카오 CDN — daumcdn.net 을 쓰지 않는다', () => {
  it('화면 · 라이브러리 · 정적 HTML 에 daumcdn.net 주소가 없다', () => {
    const html = readdirSync('public', { recursive: true, encoding: 'utf8' })
      .filter((f) => f.endsWith('.html') || f.endsWith('.js'))
      .map((f) => `public/${f}`);
    const files = [...findSources('app'), ...findSources('components'), ...findSources('lib'), ...html, 'next.config.mjs', 'middleware.ts'];
    // 주소로 쓴 것만 — 「//…daumcdn.net」. 까닭을 적은 주석의 낱말(옛 주소 이름)은 잡지 않는다
    const stale = files.filter((f) => /\/\/[a-z0-9.-]*daumcdn\.net/i.test(readFileSync(f, 'utf8')));
    expect(stale).toEqual([]);
  });

  it('주소 검색은 t1.kakaocdn.net 의 postcode.v2.js 를 받는다', () => {
    const src = readFileSync('components/contracts/AddressSearchButton.tsx', 'utf8');
    expect(src).toContain('https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js');
  });
});

/**
 * 아지트 쓰는 칸에 붙여 넣을 HTML(lib/agit/editor-doc) — 콘솔의 글(아지트 마크다운)을 한백이 쓰는 칸에서 쓴 것과 같은 꼴로.
 * 한백 2026-11-09 「evcharging bot으로 올리니까 내가 내용수정도 안되고, 첨부파일은 링크가 아니라 첨부파일로」 → 「Claude Code posts it」.
 * 쓰는 칸이 이 HTML 을 받아 # 머리 · 회색 상자 · 굵게 · 고리로 바꾸는 것은 11-08 · 09 에 실제 쓰는 칸에서 확인했다(scripts/agit-post.ts).
 */
import { describe, expect, it } from 'vitest';
import { CC_MARK, IMG_MARK, agitEditorDocOf, agitWallOf, withUploadedImage } from '@/lib/agit/editor-doc';
import { agitPostOf, type AgitBatch } from '@/lib/agit/post';

const URL_ = 'https://hanbaek-re.vercel.app';
const batches: AgitBatch[] = [
  { org: '이브이솔루션 (영업)', kind: '영업비', total: 4_900_000, invoice: false, lines: [{ projectId: 'a', label: '1차', amount: 4_900_000, qty: 1 }] },
  { org: '에코일렉', kind: '영업비', total: 96_460_000, invoice: false, lines: [{ projectId: 'b', label: '1차', amount: 96_460_000, qty: 1 }] },
];

describe('쓰는 칸 HTML', () => {
  it('보통 글 — 해시태그 줄 · 머리 · 회색 상자 · 굵게 · 고리 · 구매 내역 자리에 그림 표', () => {
    const doc = agitEditorDocOf(agitPostOf('2026-11-10', batches, URL_).text);
    expect(doc.image).toBe(true);
    expect(doc.cc).toBeNull();
    expect(doc.html).toBe([
      '<p>#구매요청간소화</p>',
      '<h1>배경</h1>',
      '<blockquote><p><strong>- 공사명 :</strong> 26년 10월 전기차 충전 인프라 구축사업 영업위탁 수수료 1차</p>',
      '<p><strong>- 상황설명 :</strong> 26년 10월 동안 진행된 전기차 충전기 설치 영업에 대한 영업위탁 수수료 1차</p></blockquote>',
      '<h1>구매 내역</h1>',
      `<p>${IMG_MARK}</p>`,
      '<h1>기한</h1>',
      '<blockquote><p>정기결제일 11월 10일</p></blockquote>',
      '<h1><strong>청구 금액</strong></h1>',
      '<blockquote><p>부가세 전 101,360,000</p><p>부가세 포함 111,496,000</p></blockquote>',
      '<h1>참고자료</h1>',
      '<blockquote><p>거래명세서 내역</p>',
      `<p><a href="${URL_}/payments/statement?org=${encodeURIComponent('에코일렉')}&amp;date=2026-11-10&amp;kind=${encodeURIComponent('영업비')}">에코일렉</a></p>`,
      `<p><a href="${URL_}/payments/statement?org=${encodeURIComponent('이브이솔루션 ')}%28${encodeURIComponent('영업')}%29&amp;date=2026-11-10&amp;kind=${encodeURIComponent('영업비')}">이브이솔루션 (영업)</a></p></blockquote>`,
    ].join(''));
  });

  it('긴급 글 — 제목의 해시태그 고리 · 굵은 머리 줄 · 그림은 지급요청 품목 상자 안 · cc 는 멘션 자리 표로', () => {
    const doc = agitEditorDocOf(agitPostOf('2026-11-10', batches, URL_, '세금계산서 발행 지연\n협력사 업무 지연').text);
    expect(doc.cc).toBe('team.finance');
    expect(doc.html.startsWith('<h1>[긴급] 26년 10월 전기차 충전 인프라 구축사업 영업위탁 수수료 1차 <a href="https://team-hanbaek.agit.io/search?q=%23')).toBe(true);
    expect(doc.html).toContain('<blockquote><p><strong>지급 요청일: [긴급] 2026. 11. 10 (화요일)</strong></p></blockquote><p><strong>1. 구매사유</strong></p>');
    expect(doc.html).toContain(`<p><strong>부가세 전</strong> 101,360,000 / <strong>부가세 포함</strong> 111,496,000</p><p>${IMG_MARK}</p></blockquote>`);
    expect(doc.html).toContain('<p><strong>3. 긴급사유 기재</strong></p><blockquote><p>세금계산서 발행 지연</p><p>협력사 업무 지연</p></blockquote>');
    expect(doc.html.endsWith(`<p>cc ${CC_MARK}</p>`)).toBe(true);
    expect(doc.html).not.toContain('team.finance'); // 멘션은 쓰는 칸의 멘션 고르기로 — 글자 고리로 붙이지 않는다
  });

  it('글자는 가린다 · 고리 글자의 \\ 가림은 푼다', () => {
    const doc = agitEditorDocOf('# A <b> & "c"\n> [갑\\[1\\]](https://x.test/?a=1&b=2)');
    expect(doc.html).toBe('<h1>A &lt;b&gt; &amp; &quot;c&quot;</h1><blockquote><p><a href="https://x.test/?a=1&amp;b=2">갑[1]</a></p></blockquote>');
    expect(doc.image).toBe(false);
  });

  it('올린 그림을 자리에 넣는다 · 자리가 없거나 둘이면 던진다', () => {
    const doc = agitEditorDocOf(agitPostOf('2026-11-10', batches, URL_).text);
    const html = withUploadedImage(doc.html, { src: 'https://k.kakaocdn.net/dna/x/y"z', id: '340460050' });
    expect(html).toContain('<h1>구매 내역</h1><p><img class="ProseMirror__image" src="https://k.kakaocdn.net/dna/x/y&quot;z" data-image_id="340460050" data-deleted="false"></p><h1>기한</h1>');
    expect(html).not.toContain(IMG_MARK);
    expect(() => withUploadedImage('<p>x</p>', { src: 'a', id: '1' })).toThrow(/자리가 없습니다/);
    expect(() => agitEditorDocOf('![a](b)\n![a](b)')).toThrow(/둘이다/);
  });
});

describe('올린 글 주소', () => {
  it('https://<팀>.agit.io/g/<그룹>/wall/<글> 만 받는다', () => {
    expect(agitWallOf('https://team-hanbaek.agit.io/g/300450579/wall/365223421')).toEqual({
      url: 'https://team-hanbaek.agit.io/g/300450579/wall/365223421', id: '365223421',
    });
    expect(agitWallOf(' https://team-hanbaek.agit.io/g/1/wall/2/ ')?.url).toBe('https://team-hanbaek.agit.io/g/1/wall/2');
    for (const bad of ['http://team-hanbaek.agit.io/g/1/wall/2', 'https://evil.com/g/1/wall/2', 'https://agit.io.evil.com/g/1/wall/2',
      'https://team-hanbaek.agit.io/g/1/wall/x', 'https://team-hanbaek.agit.io/g/1', 'https://u:p@team-hanbaek.agit.io/g/1/wall/2', 'x']) {
      expect(agitWallOf(bad), bad).toBeNull();
    }
  });
});

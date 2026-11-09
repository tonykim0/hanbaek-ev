/**
 * 아지트 글 쓰는 칸(ProseMirror)에 붙여 넣을 HTML — 콘솔이 지은 글(아지트 마크다운 · lib/agit/post)을 한백이 쓰는 칸에서 쓴 것과 같은 꼴로 옮긴다. [순수]
 * (한백 2026-11-09 「evcharging bot으로 올리니까 내가 내용수정도 안되고, 첨부파일은 링크가 아니라 첨부파일로 꼭 올려야 할 것 같아」 →
 *  「Claude Code posts it」 — 봇 글은 한백이 고칠 수 없고 파일을 못 붙인다. 그래서 Claude Code 가 한백의 아지트 로그인으로 쓰는 칸에 써서
 *  올린다: scripts/agit-post.ts)
 *
 * 줄마다: # 머리 → <h1> · > 줄(이어진 것) → <blockquote><p>… · *굵게* → <strong> · [글](주소) → <a> · 그 밖 → <p>.
 * 엑셀 캡처 자리(![구매요청간소화 엑셀](올릴 때 붙는 엑셀 캡처))는 「§IMG§」 한 줄이 된다 — 쓰는 칸에 그림을 먼저 올리고(아지트가 그 그림에
 * image_id 를 준다) withUploadedImage 로 그 자리에 넣어 통째로 붙여 넣는다(11-08 · 09 손으로 한 길 — 그림을 자리에 바로 붙이면 쓰는 칸 전체가
 * 그림 하나로 바뀌었다).
 * cc 줄(긴급 글)은 「cc §CC§」로 남긴다 — 멘션은 쓰는 칸의 멘션 고르기(@@ 를 치고 고른다)로 넣어야 한백이 쓴 것과 같은 멘션이 되고 재무팀을
 * 부른다. 글자 고리로 붙여 넣은 것이 부르는지는 모른다(시험에서 재무팀을 부르지 않았다 — 한백 「Skip the finance mention」).
 */

/** 엑셀 캡처가 설 자리 표 */
export const IMG_MARK = '§IMG§';
/** cc 멘션이 설 자리 표 */
export const CC_MARK = '§CC§';

export interface AgitEditorDoc {
  /** 붙여 넣을 HTML — 그림 자리 표 · cc 자리 표가 들어 있다 */
  html: string;
  /** 그림 자리가 있는가(하나뿐이다) */
  image: boolean;
  /** cc 로 부를 팀 멘션 별칭(「team.finance」) — 없으면 null */
  cc: string | null;
}

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** 마크다운 고리 글자의 \ 가림을 푼다(lib/agit/post mdText 의 반대) */
const unescapeMd = (s: string): string => s.replace(/\\([\\[\]*_`])/g, '$1');
/** 글자 — 가리고 *굵게* 만 <strong> 으로 */
const styled = (s: string): string => esc(s).replace(/\*([^*\n]+?)\*/g, '<strong>$1</strong>');

const LINK = /\[((?:\\.|[^\]\\])*)\]\(([^)\s]+)\)/g;

/** 한 줄 안 — 고리와 글자를 갈라 고리는 <a>, 글자는 굵게만 */
function inline(line: string): string {
  const out: string[] = [];
  let last = 0;
  for (const m of line.matchAll(LINK)) {
    out.push(styled(line.slice(last, m.index)));
    out.push(`<a href="${esc(m[2])}">${esc(unescapeMd(m[1]))}</a>`);
    last = (m.index ?? 0) + m[0].length;
  }
  out.push(styled(line.slice(last)));
  return out.join('');
}

const IMAGE_LINE = /^!\[[^\]]*\]\([^)]*\)$/;
const CC_LINE = /^cc \[@@([A-Za-z0-9._-]+)\]\([^)]+\)$/;

export function agitEditorDocOf(text: string): AgitEditorDoc {
  const html: string[] = [];
  let quote: string[] = [];
  let image = false;
  let cc: string | null = null;
  const flush = () => {
    if (quote.length) html.push(`<blockquote>${quote.join('')}</blockquote>`);
    quote = [];
  };
  const imageMark = () => {
    if (image) throw new Error('엑셀 캡처 자리가 둘이다');
    image = true;
    return `<p>${IMG_MARK}</p>`;
  };
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd();
    if (line.startsWith('> ') || line === '>') {
      const body = line.slice(2).trim();
      quote.push(IMAGE_LINE.test(body) ? imageMark() : `<p>${inline(body)}</p>`);
      continue;
    }
    flush();
    if (!line.trim()) continue;
    const ccm = CC_LINE.exec(line);
    if (ccm) {
      cc = ccm[1];
      html.push(`<p>cc ${CC_MARK}</p>`);
    } else if (IMAGE_LINE.test(line)) {
      html.push(imageMark());
    } else if (line.startsWith('# ')) {
      html.push(`<h1>${inline(line.slice(2))}</h1>`);
    } else {
      html.push(`<p>${inline(line)}</p>`);
    }
  }
  flush();
  return { html: html.join(''), image, cc };
}

/** 쓰는 칸에 먼저 올린 그림을 그림 자리에 넣는다 — 그 자리가 없으면 던진다 */
export function withUploadedImage(html: string, img: { src: string; id: string }): string {
  const mark = `<p>${IMG_MARK}</p>`;
  if (!html.includes(mark)) throw new Error('글에 엑셀 캡처 자리가 없습니다.');
  return html.replace(mark, () => `<p><img class="ProseMirror__image" src="${esc(img.src)}" data-image_id="${esc(img.id)}" data-deleted="false"></p>`);
}

/**
 * 올린 글의 아지트 주소 — https://<팀>.agit.io/g/<그룹>/wall/<글> 만. 맞으면 다듬은 주소와 글 id, 아니면 null.
 * Claude Code 가 올린 뒤 콘솔에 남기는 주소다(app/api/agit/posts/[id]/finish) — 카드의 「아지트에서 보기」가 이리로 간다.
 */
export function agitWallOf(raw: string): { url: string; id: string } | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.agit\.io$/.test(url.hostname) || url.port || url.username) return null;
  const m = /^\/g\/(\d+)\/wall\/(\d+)\/?$/.exec(url.pathname);
  if (!m) return null;
  return { url: `https://${url.hostname}/g/${m[1]}/wall/${m[2]}`, id: m[2] };
}

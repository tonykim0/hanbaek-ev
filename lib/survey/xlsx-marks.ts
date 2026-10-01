/**
 * 사진 위 표시 → 엑셀 도형 (한백 「엑셀 위에 올라가면 엑셀에서도 또 조정 가능한 거지?」 2026-10-01).
 *
 * 처음에는 표시를 사진에 합쳐 구웠다 — 받은 엑셀에서는 고칠 수 없었다. 제출본들은 표시가 엑셀 도형이다
 * (도면의 하늘색 충전기 네모·빨간 배선·라벨 상자가 하나하나 도형). 그래서 플러그링크 엑셀에는 표시를
 * ★엑셀 도형으로★ 얹는다: 번호 원(글자 든 타원) · 기호(네모·대각선 네모·겹동그라미·동그라미) · 선
 * (자유형, 끝 화살표·점선) · 동그라미 · 네모 · 글상자 · 거점 라벨(상자 둘의 묶음).
 *
 * ★사진과 한 묶음(그룹)이다★ — 엑셀은 사진을 칸 모서리에 맞춰 늘리므로(xlsx-kit addPicture fill) 표시를
 * 따로 두면 칸 크기 어림의 오차만큼 사진과 어긋난다. 묶음 안에 두면 사진과 같이 늘고 같이 움직인다.
 * 엑셀에서 묶음 안의 도형을 눌러 하나씩 옮기고 늘리고 돌릴 수 있다(묶음 풀기도 된다).
 *
 * 자리·크기·회전은 화면과 같은 상자(annot boxOf)에서 나온다 — 화면에서 늘리고 돌린 그대로다.
 * 사진을 칸 비율로 잘랐으면(srcRect) 잘린 바깥의 표시는 뺀다(칸 밖으로 떠 나가지 않게).
 */
import {
  INK, RED, SYM_COLOR, YELLOW, boxOf, lineKindOf, lineWidthOf, textLayout, type Annot, type NumStyle,
} from './annot';

/** 사진이 서식 칸에 보이는 틀(EMU)과 잘린 몫 */
export interface Frame { cx: number; cy: number; crop: { l: number; t: number; r: number; b: number } }

const hex = (c: string) => c.replace('#', '').toUpperCase();
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fill = (c: string | null) => (c ? `<a:solidFill><a:srgbClr val="${hex(c)}"/></a:solidFill>` : '<a:noFill/>');
const ln = (w: number, c: string | null, extra = '') =>
  c ? `<a:ln w="${Math.max(3175, Math.round(w))}">${fill(c)}${extra}</a:ln>` : '<a:ln><a:noFill/></a:ln>';
const FONTS = '<a:latin typeface="맑은 고딕"/><a:ea typeface="맑은 고딕"/>';

function run(text: string, sizePt: number, color: string, bold = true): string {
  const sz = Math.max(100, Math.round(sizePt * 100));
  return `<a:r><a:rPr lang="ko-KR" altLang="en-US" sz="${sz}" b="${bold ? 1 : 0}">${fill(color)}${FONTS}</a:rPr><a:t>${esc(text)}</a:t></a:r>`;
}

function txBody(lines: string[], sizePt: number, color: string): string {
  const ps = lines.map((l) => `<a:p><a:pPr algn="ctr"/>${run(l, sizePt, color)}</a:p>`).join('');
  return `<xdr:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="ctr" rtlCol="0"/><a:lstStyle/>${ps}</xdr:txBody>`;
}

/**
 * 표시들의 도형 XML — 묶음 안 좌표(0~cx, 0~cy EMU). id 는 부르는 쪽이 준다(그림 안에서 겹치면 안 된다).
 * @param img 사진 픽셀 크기(표시 좌표의 바탕)
 */
export function marksXml(marks: Annot[], img: { width: number; height: number }, frame: Frame, style: NumStyle, nextId: () => number): string {
  const { width: W, height: H } = img;
  const u = Math.max(W, H);
  const { l, t, r, b } = frame.crop;
  // 사진 픽셀 → 묶음 EMU. 칸 비율로 잘랐으니 가로세로 배율이 같다(가로로 잰다)
  const k = frame.cx / (W * (1 - l - r));
  const X = (px: number) => (px - W * l) * k;
  const Y = (py: number) => (py - H * t) * k;
  const lw = lineWidthOf(u) * k;
  const out: string[] = [];
  let n = 0;

  const shape = (name: string, x: number, y: number, w: number, h: number, rot: number, geom: string, paint: string, body = '') => {
    const id = nextId();
    const rotA = rot ? ` rot="${Math.round(rot * 60000)}"` : '';
    return `<xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="${id}" name="${esc(name)} ${id}"/><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr><a:xfrm${rotA}><a:off x="${Math.round(x)}" y="${Math.round(y)}"/><a:ext cx="${Math.max(1, Math.round(w))}" cy="${Math.max(1, Math.round(h))}"/></a:xfrm>${geom}${paint}</xdr:spPr>${body}</xdr:sp>`;
  };
  const prst = (p: string, adj = '') => `<a:prstGeom prst="${p}"><a:avLst>${adj}</a:avLst></a:prstGeom>`;
  const inside = (cx: number, cy: number) => cx >= -1 && cy >= -1 && cx <= frame.cx + 1 && cy <= frame.cy + 1;

  for (const a of marks) {
    if (a.t === 'num') n += 1;
    if (a.t === 'line') {
      if (a.pts.length < 2) continue;
      const pts = a.pts.map((p) => ({ x: X(p.x * W), y: Y(p.y * H) }));
      const x1 = Math.min(...pts.map((p) => p.x)); const y1 = Math.min(...pts.map((p) => p.y));
      const w = Math.max(1, Math.max(...pts.map((p) => p.x)) - x1); const h = Math.max(1, Math.max(...pts.map((p) => p.y)) - y1);
      if (!inside(x1 + w / 2, y1 + h / 2)) continue;
      const P = (p: { x: number; y: number }) => `<a:pt x="${Math.round(p.x - x1)}" y="${Math.round(p.y - y1)}"/>`;
      const path = `<a:moveTo>${P(pts[0])}</a:moveTo>${pts.slice(1).map((p) => `<a:lnTo>${P(p)}</a:lnTo>`).join('')}`;
      const geom = `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst><a:path w="${Math.round(w)}" h="${Math.round(h)}">${path}</a:path></a:pathLst></a:custGeom>`;
      const kind = lineKindOf(a);
      const extra = (kind === 'dash' ? '<a:prstDash val="dash"/>' : '') + '<a:round/>'
        + (kind === 'arrow' ? '<a:tailEnd type="triangle" w="med" len="med"/>' : '');
      out.push(shape(kind === 'wire' ? '배선 경로' : kind === 'dash' ? '점선' : '화살표', x1, y1, w, h, 0, geom, `<a:noFill/>${ln(lw, RED, extra)}`));
      continue;
    }
    const bx = boxOf(a, W, H);
    const cx = X(bx.cx); const cy = Y(bx.cy); const w = bx.w * k; const h = bx.h * k;
    if (!inside(cx, cy)) continue;
    const x = cx - w / 2; const y = cy - h / 2;
    if (a.t === 'num') {
      const rr = w / 2;
      const pt = (rr * 1.15) / 12700; // 글자 크기(em) — 화면과 같은 값
      const paint = style === 'yellow' ? `${fill('#ffff00')}${ln(rr * 0.08, '#1f2937')}` : `<a:noFill/>${ln(rr * 0.14, RED)}`;
      out.push(shape('번호', x, y, w, h, bx.r, prst('ellipse'), paint, txBody([String(n)], pt, style === 'yellow' ? INK : RED)));
    } else if (a.t === 'sym') {
      const thin = ln(Math.max(9525, u * 0.0014 * k), INK);
      if (a.k === 'charger') {
        out.push(shape('충전기', x, y, w, h, bx.r, prst('rect'), `${fill(SYM_COLOR.charger)}${thin}`));
      } else if (a.k === 'panelNew' || a.k === 'panelOld') {
        // 네모 + 대각선을 도형 하나로 — 하나로 옮기고 돌린다(범례 그림의 꼴)
        const W1 = Math.round(w); const H1 = Math.round(h);
        const geom = `<a:custGeom><a:avLst/><a:gdLst/><a:ahLst/><a:cxnLst/><a:rect l="0" t="0" r="r" b="b"/><a:pathLst>`
          + `<a:path w="${W1}" h="${H1}"><a:moveTo><a:pt x="0" y="0"/></a:moveTo><a:lnTo><a:pt x="${W1}" y="0"/></a:lnTo><a:lnTo><a:pt x="${W1}" y="${H1}"/></a:lnTo><a:lnTo><a:pt x="0" y="${H1}"/></a:lnTo><a:close/></a:path>`
          + `<a:path w="${W1}" h="${H1}" fill="none"><a:moveTo><a:pt x="0" y="0"/></a:moveTo><a:lnTo><a:pt x="${W1}" y="${H1}"/></a:lnTo></a:path>`
          + `</a:pathLst></a:custGeom>`;
        out.push(shape(a.k === 'panelNew' ? '충전기 분전반' : '기존 분전반', x, y, w, h, bx.r, geom, `${fill(SYM_COLOR[a.k])}${thin}`));
      } else if (a.k === 'pole') {
        const d = Math.min(w, h);
        out.push(shape('전신주', cx - d / 2, cy - d / 2, d, d, bx.r, prst('donut', '<a:gd name="adj" fmla="val 22000"/>'), `<a:noFill/>${ln(d * 0.09, RED)}`));
      } else {
        const d = Math.min(w, h) * 0.8;
        out.push(shape('IP 전주', cx - d / 2, cy - d / 2, d, d, bx.r, prst('ellipse'), `${fill(SYM_COLOR.ipPole)}${thin}`));
      }
    } else if (a.t === 'oval') {
      out.push(shape('동그라미', x, y, w, h, bx.r, prst('ellipse'), `<a:noFill/>${ln(lw, RED)}`));
    } else if (a.t === 'box') {
      out.push(shape('네모', x, y, w, h, bx.r, prst('rect'), `<a:noFill/>${ln(lw, YELLOW)}`));
    } else {
      // 글상자 · 거점 라벨 — 라벨은 위(빨강)·아래(검정) 상자 둘을 묶음으로(제출본 도면의 꼴)
      const L = textLayout(a, u);
      const pt = (L.fs * k) / 12700;
      const thin = ln(Math.max(9525, u * 0.0012 * k), INK);
      const parts: string[] = [];
      let top = y;
      if (L.head.length) {
        parts.push(shape('라벨', x, top, w, L.headH * k, 0, prst('rect'), `${fill('#ffffff')}${thin}`, txBody(L.head, pt, RED)));
        top += L.headH * k;
      }
      if (L.body.length) {
        parts.push(shape(a.t === 'label' ? '라벨' : '글상자', x, top, w, L.bodyH * k, 0, prst('rect'), `${fill('#ffffff')}${thin}`, txBody(L.body, pt, INK)));
      }
      if (parts.length === 1 && !bx.r) { out.push(parts[0]); continue; }
      const id = nextId();
      const rotA = bx.r ? ` rot="${Math.round(bx.r * 60000)}"` : '';
      const xf = `<a:off x="${Math.round(x)}" y="${Math.round(y)}"/><a:ext cx="${Math.round(w)}" cy="${Math.round(h)}"/>`;
      out.push(`<xdr:grpSp><xdr:nvGrpSpPr><xdr:cNvPr id="${id}" name="거점 라벨 ${id}"/><xdr:cNvGrpSpPr/></xdr:nvGrpSpPr><xdr:grpSpPr><a:xfrm${rotA}>${xf}<a:chOff x="${Math.round(x)}" y="${Math.round(y)}"/><a:chExt cx="${Math.round(w)}" cy="${Math.round(h)}"/></a:xfrm></xdr:grpSpPr>${parts.join('')}</xdr:grpSp>`);
    }
  }
  return out.join('');
}

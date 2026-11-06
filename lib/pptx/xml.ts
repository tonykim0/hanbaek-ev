/**
 * 파워포인트 모양을 XML 글로 짓는다 — 글상자 · 그림 · 표. [순수]
 *
 * 태양광 제안서(lib/solar/proposal)가 사업자의 틀에 넣는 것들이다. 받은 사람이 고칠 수 있게(한백 2026-11-06 「수정가능하게」)
 * 글은 글상자 · 표의 글로, 숫자 표는 그림이 아니라 파워포인트 표(a:tbl)로 넣는다 — 구글 프레젠테이션으로 열어도 표로 남는다.
 * 단위는 EMU(1pt = 12,700 · 1cm = 360,000). 글자 크기는 pt.
 */
import { xmlSafe } from '@/lib/survey/xml-safe';

export const EMU_PER_PT = 12_700;
export const P_NS = 'http://schemas.openxmlformats.org/presentationml/2006/main';
export const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
export const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

export const esc = (s: string): string =>
  xmlSafe(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export type Box = { x: number; y: number; w: number; h: number };
export type Align = 'l' | 'ctr' | 'r';

/** 글 한 토막 — 색은 「1F3A5F」처럼 # 없이 */
export type Run = { text: string; size?: number; bold?: boolean; color?: string; font?: string };
/**
 * 글줄 한 덩이 — bullet 이 있으면 그 글자로 내어 쓴다(글은 indentPt 만큼 들어간 자리에서 시작). bullet 없이 indentPt 만 주면
 * 글머리 없는 줄이 글머리 줄의 글과 같은 자리에서 시작한다. lineSpacingPt 는 줄 높이를 pt 로 못 박는다(원본 쪽 그림의 줄과 맞출 때).
 */
export type Para = {
  runs: Run[];
  align?: Align;
  bullet?: string;
  indentPt?: number;
  spaceBeforePt?: number;
  lineSpacingPct?: number;
  lineSpacingPt?: number;
};

/** 글 하나를 한 줄 덩이로 — 줄바꿈(\n)마다 덩이를 나눈다 */
export const paras = (text: string, style: Omit<Run, 'text'> = {}, align?: Align): Para[] =>
  text.split('\n').map((line) => ({ runs: [{ ...style, text: line }], align }));

const fill = (color?: string) => (color ? `<a:solidFill><a:srgbClr val="${color}"/></a:solidFill>` : '');

/**
 * 글꼴 — pitchFamily 34(가변폭 · 고딕 계열)를 같이 적는다. 받은 컴퓨터에 그 글꼴이 없을 때 렌더러가 고딕으로 갈음하게 하는 실마리다
 * (2026-11-06 — 「맑은 고딕」 · 「Noto Sans KR」이 없는 맥의 Quick Look 이 실마리 없는 글을 명조로 그렸다). charset -127 은 한글.
 */
const fontXml = (f: string) =>
  `<a:latin typeface="${esc(f)}" pitchFamily="34" charset="0"/><a:ea typeface="${esc(f)}" pitchFamily="34" charset="-127"/><a:cs typeface="${esc(f)}" pitchFamily="34" charset="0"/>`;

function rPr(r: Omit<Run, 'text'>, tag: 'a:rPr' | 'a:endParaRPr' = 'a:rPr'): string {
  const font = r.font ? fontXml(r.font) : '';
  const attrs = [`lang="ko-KR"`, `altLang="en-US"`, r.size ? `sz="${Math.round(r.size * 100)}"` : '', r.bold ? 'b="1"' : r.bold === false ? 'b="0"' : '', 'dirty="0"']
    .filter(Boolean)
    .join(' ');
  return `<${tag} ${attrs}>${fill(r.color)}${font}</${tag}>`;
}

export function paraXml(p: Para): string {
  const indent = Math.round((p.indentPt ?? (p.bullet ? 13.5 : 0)) * EMU_PER_PT);
  const ppr = [
    p.align ? `algn="${p.align}"` : '',
    indent ? `marL="${indent}" indent="${p.bullet ? -indent : 0}"` : '',
  ].filter(Boolean).join(' ');
  const inner = [
    p.lineSpacingPt
      ? `<a:lnSpc><a:spcPts val="${Math.round(p.lineSpacingPt * 100)}"/></a:lnSpc>`
      : p.lineSpacingPct
        ? `<a:lnSpc><a:spcPct val="${Math.round(p.lineSpacingPct * 1000)}"/></a:lnSpc>`
        : '',
    p.spaceBeforePt ? `<a:spcBef><a:spcPts val="${Math.round(p.spaceBeforePt * 100)}"/></a:spcBef>` : '',
    p.bullet ? `<a:buFontTx/><a:buChar char="${esc(p.bullet)}"/>` : '<a:buNone/>',
  ].join('');
  const runs = p.runs.filter((r) => r.text !== '').map((r) => `<a:r>${rPr(r)}<a:t>${esc(r.text)}</a:t></a:r>`).join('');
  const end = p.runs[0] ? rPr({ ...p.runs[0] }, 'a:endParaRPr') : '';
  return `<a:p><a:pPr ${ppr}>${inner}</a:pPr>${runs}${end}</a:p>`;
}

export type TextOpts = {
  /** 바탕색 — 없으면 투명 */
  fillColor?: string;
  anchor?: 't' | 'ctr' | 'b';
  /** 안쪽 여백(EMU) — 기본 0(틀의 자리에 글자를 맞춰 얹는다) */
  inset?: number;
  /** 줄 바꿈 — 기본 켬 */
  wrap?: boolean;
  /** 글이 넘치면 글자를 줄인다(파워포인트가 연 뒤 맞춘다) */
  shrink?: boolean;
};

/** 글상자 하나 */
export function textBoxXml(id: number, name: string, box: Box, ps: Para[], o: TextOpts = {}): string {
  const inset = o.inset ?? 0;
  const body = `<a:bodyPr wrap="${o.wrap === false ? 'none' : 'square'}" lIns="${inset}" tIns="${inset}" rIns="${inset}" bIns="${inset}" anchor="${o.anchor ?? 'ctr'}" rtlCol="0">${
    o.shrink ? '<a:normAutofit/>' : '<a:noAutofit/>'
  }</a:bodyPr>`;
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${esc(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${Math.round(box.x)}" y="${Math.round(box.y)}"/><a:ext cx="${Math.round(box.w)}" cy="${Math.round(box.h)}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${o.fillColor ? fill(o.fillColor) : '<a:noFill/>'}</p:spPr>` +
    // 글 몸통에는 덩이가 하나는 있어야 한다(스키마) — 글 없는 칸(가는 선 · 바탕)은 빈 덩이 하나. 없으면 파워포인트가 「복구」를 묻는다
    `<p:txBody>${body}<a:lstStyle/>${ps.length ? ps.map(paraXml).join('') : '<a:p/>'}</p:txBody></p:sp>`
  );
}

/**
 * 채운 네모(글 없음) — 가는 선 · 띠. 글상자로 그리면 맥 미리보기가 1pt 안팎의 채움을 안 그렸다(2026-11-07) — 글 몸통 없는 모양으로.
 */
export function rectXml(id: number, name: string, box: Box, fillColor: string): string {
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${esc(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${Math.round(box.x)}" y="${Math.round(box.y)}"/><a:ext cx="${Math.round(box.w)}" cy="${Math.round(box.h)}"/></a:xfrm>` +
    `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fill(fillColor)}<a:ln><a:noFill/></a:ln></p:spPr></p:sp>`
  );
}

/**
 * 그림 하나 — rid 는 그 슬라이드 관계의 그림 자리. 그림은 이미 자리 비율로 잘라 넣는다(늘이지 않게).
 * round 를 주면 모서리를 둥글린다(roundRect 의 adj — 짧은 변에 대한 10만분율). 모양에 그림을 채우는 것(sp 의 blipFill)보다 그림(pic)에
 * 모양을 씌우는 쪽이 구글 프레젠테이션으로 열어도 그림으로 남는다.
 */
export function pictureXml(id: number, name: string, rid: string, box: Box, round?: number): string {
  const geom = round ? `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${Math.round(round)}"/></a:avLst></a:prstGeom>` : '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
  return (
    `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${esc(name)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
    `<p:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
    `<p:spPr><a:xfrm><a:off x="${Math.round(box.x)}" y="${Math.round(box.y)}"/><a:ext cx="${Math.round(box.w)}" cy="${Math.round(box.h)}"/></a:xfrm>` +
    `${geom}</p:spPr></p:pic>`
  );
}

/* --------------------------------------------------------------------- 표 */

export type Cell = {
  text: string;
  fill?: string;
  color?: string;
  bold?: boolean;
  size?: number;
  align?: Align;
  /** 가로로 몇 칸을 합치나(그 뒤 칸은 hMerge 로 비운다) */
  span?: number;
};

export type TableOpts = {
  font: string;
  size: number;
  /** 칸 테두리 색 · 굵기(EMU) */
  border: { color: string; w: number };
  /** 칸 안쪽 여백(EMU) — 좌우 · 위아래 */
  margin?: { x: number; y: number };
};

function cellXml(c: Cell | null, o: TableOpts): string {
  const m = o.margin ?? { x: 45_720, y: 22_860 };
  const ln = (tag: string) =>
    `<a:${tag} w="${o.border.w}" cap="flat" cmpd="sng" algn="ctr"><a:solidFill><a:srgbClr val="${o.border.color}"/></a:solidFill><a:prstDash val="solid"/></a:${tag}>`;
  const borders = ['lnL', 'lnR', 'lnT', 'lnB'].map(ln).join('');
  if (!c) {
    // 합쳐진 칸의 뒤쪽 — 글은 비우고 자리만
    return `<a:tc hMerge="1"><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="ko-KR"/></a:p></a:txBody><a:tcPr>${borders}</a:tcPr></a:tc>`;
  }
  const run: Run = { text: c.text, size: c.size ?? o.size, bold: c.bold, color: c.color, font: o.font };
  return (
    `<a:tc${c.span && c.span > 1 ? ` gridSpan="${c.span}"` : ''}><a:txBody><a:bodyPr/><a:lstStyle/>${paraXml({ runs: [run], align: c.align ?? 'ctr' })}</a:txBody>` +
    `<a:tcPr marL="${m.x}" marR="${m.x}" marT="${m.y}" marB="${m.y}" anchor="ctr">${borders}${c.fill ? fill(c.fill) : '<a:noFill/>'}</a:tcPr></a:tc>`
  );
}

/**
 * 표 하나(graphicFrame) — rows 의 칸 수는 cols 와 같아야 한다(span 으로 합친 칸은 그만큼 센다). 줄 높이는 최소값이라
 * 글이 길면 파워포인트가 늘린다.
 */
export function tableXml(id: number, name: string, box: Box, cols: number[], rowHeights: number[], rows: Cell[][], o: TableOpts): string {
  const grid = cols.map((w) => `<a:gridCol w="${Math.round(w)}"/>`).join('');
  const trs = rows
    .map((row, i) => {
      const tcs: string[] = [];
      for (const c of row) {
        tcs.push(cellXml(c, o));
        for (let k = 1; k < (c.span ?? 1); k++) tcs.push(cellXml(null, o));
      }
      if (tcs.length !== cols.length) throw new Error(`표 「${name}」 ${i + 1}째 줄의 칸 수(${tcs.length})가 열 수(${cols.length})와 다릅니다.`);
      return `<a:tr h="${Math.round(rowHeights[i] ?? rowHeights[rowHeights.length - 1])}">${tcs.join('')}</a:tr>`;
    })
    .join('');
  return (
    `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="${esc(name)}"/><p:cNvGraphicFramePr><a:graphicFrameLocks noGrp="1"/></p:cNvGraphicFramePr><p:nvPr/></p:nvGraphicFramePr>` +
    `<p:xfrm><a:off x="${Math.round(box.x)}" y="${Math.round(box.y)}"/><a:ext cx="${Math.round(box.w)}" cy="${Math.round(box.h)}"/></p:xfrm>` +
    `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr/><a:tblGrid>${grid}</a:tblGrid>${trs}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`
  );
}

/** 이름표 꼴의 둥근 네모(「지분 양도」 같은 꼬리표) — 바탕색 위 글 한 줄 */
export function tagXml(id: number, name: string, box: Box, text: string, o: { fillColor: string; color: string; size: number; font: string; bold?: boolean }): string {
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${esc(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr><a:xfrm><a:off x="${Math.round(box.x)}" y="${Math.round(box.y)}"/><a:ext cx="${Math.round(box.w)}" cy="${Math.round(box.h)}"/></a:xfrm>` +
    `<a:prstGeom prst="roundRect"><a:avLst/></a:prstGeom>${fill(o.fillColor)}<a:ln><a:noFill/></a:ln></p:spPr>` +
    `<p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="ctr"><a:noAutofit/></a:bodyPr><a:lstStyle/>` +
    `${paraXml({ runs: [{ text, size: o.size, bold: o.bold ?? true, color: o.color, font: o.font }], align: 'ctr' })}</p:txBody></p:sp>`
  );
}

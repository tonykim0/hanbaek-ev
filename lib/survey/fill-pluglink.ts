/**
 * 플러그링크 실사보고서 v22 — 실사개요 · 전경사진 · 도면 · 거점별 사진대지 · 공사내역서(입력).
 *
 * 서식은 플러그링크가 준 빈 서식 그대로다(public/survey/pluglink-v22.xlsx). ★채우는 규칙은 서식
 * 안의 「작성 가이드」 글상자에 적힌 것을 따른다★ — 사업명은 「현장명 + 플러그링크 충전인프라
 * 구축사업」, 통신은 충전기 6기당 1개, 예상용량은 (신규+교체)×7, 추가 배선·배관은 1차측
 * 기본공사 70m 를 넘는 길이다. 금액은 서식의 수식이 계산한다(공사내역서(출력)·일위대가) —
 * 우리는 수량만 넣고, 열 때 다시 계산하게 한다(lib/survey/xlsx-kit save).
 *
 * 거점은 6개까지다 — 실사개요의 거점 표(1안)가 여섯 줄이다. 사진은 거점마다 몇 장이든 된다 — 사진대지
 * 시트를 늘린다(appendRowBlock).
 */
import JSZip from 'jszip';
import { Workbook } from './xlsx-kit';
import type { PreparedImage } from './docx-kit';
import { PL_MAX_SPOTS, PL_PHOTO_SLOTS, photoCaption, plFixture, plModemOf, plQtyOf, subKey, type PlForm, type PlSpot } from './spec';

const S = {
  overview: '2. 실사개요',
  photo: '3. 전경사진',
  plan: '3. 도면',
  sheet: '4. 사진대지',
  cost: '5. 공사내역서(입력)',
} as const;

/** 1차측 기본공사 — 이 길이를 넘는 만큼이 추가 배선·배관이다(공사내역서 가이드 5·6) */
const BASE_LEN = 70;
/** 배선 SIZE(sq) → 공사내역서(입력) 줄 */
const CABLE_ROW: Record<number, number> = { 6: 10, 10: 11, 16: 12, 25: 13, 35: 14, 50: 15, 70: 16, 95: 17, 120: 18, 150: 19 };
/** 배관 SIZE(mm, 아연도) → 줄 */
const PIPE_ROW: Record<number, number> = { 16: 20, 22: 21, 28: 22, 36: 23, 42: 24, 54: 25, 70: 26, 82: 27, 104: 28 };
/**
 * 사진대지의 사진 짝 — 첫 짝이 6행에서 시작하고 짝마다 25줄(사진 칸 23줄 + 설명 2줄). 칸은 A·M 열,
 * 설명은 사진 밑 줄의 D·P. 서식에는 여섯 짝이 있고 넘치면 마지막 짝을 베껴 늘린다.
 * 쪽은 두 짝마다 넘어간다(서식의 손 나눔이 55행 — 제출본들도 55·105·155·205 로 이었다).
 */
const FIRST_PAIR = 6;
const PAIR_H = 25;
const TEMPLATE_PAIRS = 6;
/** 인쇄 영역은 적어도 넷째 짝까지 — 서식의 인쇄 영역이 그렇다 */
const MIN_PAIRS = 4;
const pairTop = (p: number) => FIRST_PAIR + PAIR_H * p;

const amp = (s: string) => /(\d+)\s*A/i.exec(s)?.[1] ?? '';
const n = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));

export interface PlResult { blob: Blob | Uint8Array; warnings: string[] }

export async function fillPluglinkSurvey(
  form: PlForm,
  images: { overview?: PreparedImage; plan?: PreparedImage; spots: Record<string, Record<string, PreparedImage | undefined>> },
  template: ArrayBuffer | Uint8Array
): Promise<PlResult> {
  if (form.spots.length === 0) throw new Error('거점을 하나 이상 넣어주세요.');
  if (form.spots.length > PL_MAX_SPOTS) {
    throw new Error(`실사개요 거점 표는 ${PL_MAX_SPOTS}거점까지입니다 — 나눠서 두 부로 만들어 주세요.`);
  }
  const warnings: string[] = [];
  const zip = await JSZip.loadAsync(template);
  const wb = await Workbook.open(zip);
  for (const name of Object.values(S)) {
    if (!wb.hasSheet(name)) throw new Error(`서식에 「${name}」 시트가 없습니다 — 서식이 바뀌었는지 확인이 필요합니다.`);
  }

  // ── 사진대지 시트를 거점 수만큼 — 값을 넣기 전에 복제한다(빈 원본을 베낀다)
  const sheetOf = (i: number) => (form.spots.length > 1 ? `${S.sheet} ${i + 1}거점` : S.sheet);
  if (form.spots.length > 1) {
    wb.renameSheet(S.sheet, sheetOf(0));
    for (let i = 1; i < form.spots.length; i++) await wb.cloneSheet(sheetOf(0), sheetOf(i));
  }

  const totalQty = form.spots.reduce((a, s) => a + plQtyOf(s), 0);
  const totalNew = form.spots.reduce((a, s) => a + (s.qty ?? 0), 0);
  const totalRepl = form.spots.reduce((a, s) => a + (s.replQty ?? 0), 0);
  const sum = (f: (s: PlSpot) => number | null) => form.spots.reduce((a, s) => a + (f(s) ?? 0), 0);
  /* 한전에서 새로 끌어오는 거점이 있으면 계통연계 견적을 넣는다(제출본: 분전반 「한전인입」 = Yes) */
  const kepco = form.spots.some((s) => s.inlet === '한전인입');
  const panelOf = (s: PlSpot) => (s.inlet === '한전인입' ? '한전인입' : s.panelName);

  // ── 2. 실사개요
  const ov = S.overview;
  await wb.set(ov, 'B3', `${form.siteName} 플러그링크 충전인프라 구축사업`);
  await wb.set(ov, 'I3', `현장실사자 : ${form.surveyor.trim()}`);
  await wb.set(ov, 'D4', form.surveyDate);
  // 연락처/팩스 칸은 「T 전화 / F 팩스」 꼴이다(서식 예시 · 제출본)
  await wb.set(ov, 'L4', form.siteTel.trim() ? `T ${form.siteTel.trim().replace(/^T\s*/i, '')}` : '');
  await wb.set(ov, 'D5', form.siteName);
  await wb.set(ov, 'L5', `신규 (   ${totalNew || ' '}   )기, 교체 (   ${totalRepl || ' '}   )기`);
  await wb.set(ov, 'D6', form.address);
  await wb.set(ov, 'L6', form.existing.trim());
  for (let i = 0; i < PL_MAX_SPOTS; i++) {
    const r = 11 + i;
    const s = form.spots[i];
    if (!s) {
      // 서식의 예시 숫자(1·2·3·4)가 첫 줄에 박혀 있다 — 빈 줄에 남기지 않는다
      for (const c of ['Q', 'R', 'S', 'T']) await wb.set(ov, `${c}${r}`, '');
      continue;
    }
    await wb.set(ov, `B${r}`, s.location);
    await wb.set(ov, `F${r}`, plQtyOf(s) || '');
    await wb.set(ov, `G${r}`, 7);
    const kind = (s.qty ?? 0) > 0 && (s.replQty ?? 0) > 0 ? '신규·교체' : (s.replQty ?? 0) > 0 ? '교체' : '신규';
    await wb.set(ov, `H${r}`, kind);
    await wb.set(ov, `I${r}`, panelOf(s));
    // 한전인입이면 차단기 칸은 서식의 빈 꼴(「P A」)을 그대로 둔다 — 제출본들이 그렇게 냈다
    if (s.inlet === '분전반') {
      if (s.mainBreaker.trim()) await wb.set(ov, `J${r}`, s.mainBreaker.trim());
      if (s.inletBreaker.trim()) await wb.set(ov, `L${r}`, s.inletBreaker.trim());
    }
    await wb.set(ov, `M${r}`, s.pipeSize ?? '');
    await wb.set(ov, `N${r}`, s.pipeLen ?? '');
    await wb.set(ov, `O${r}`, s.cableSize ?? '');
    await wb.set(ov, `P${r}`, s.cableLen ?? '');
    await wb.set(ov, `Q${r}`, plModemOf(s) || '');
    await wb.set(ov, `R${r}`, plFixture(s, s.stand));
    await wb.set(ov, `S${r}`, plFixture(s, s.canopy));
    await wb.set(ov, `T${r}`, plFixture(s, s.bollard));
  }
  if (form.siteNote.trim()) await wb.set(ov, 'A25', form.siteNote.trim());

  // ── 3. 전경사진 · 3. 도면
  if (images.overview) {
    await wb.set(S.photo, 'A4', '');
    await wb.addPicture(S.photo, 'A4:O48', images.overview, 'fill');
  }
  if (images.plan) {
    /*
     * 서식 도면 칸에는 「이렇게 그려라」 예시(하늘색 충전기 줄·빨간 배선·라벨 상자·분전반 그림)가 박혀 있다.
     * 평면도를 넣으면 그림 뒤로 숨지만 그림이 칸보다 좁으면 가장자리로 비친다 — 걷는다. 범례(22열~ ·
     * 40행~)와 칸 밖의 작성 가이드(25열)는 둔다.
     */
    await wb.removeAnchors(S.plan, (col, row) => col < 21 && row >= 3 && row <= 50);
    await wb.set(S.plan, 'A4', '');
    await wb.addPicture(S.plan, 'A4:X50', images.plan);
  }
  await addLegend(wb, form.planMarks);
  await wb.set(S.plan, 'R51', form.spots.map((s) => s.location.trim()).filter(Boolean).join(' / '));
  await wb.set(S.plan, 'R53', `충전기 ${totalQty}대 / 통신함 ${sum(plModemOf)}대`);

  // ── 4. 사진대지 — 거점마다 한 장
  for (let i = 0; i < form.spots.length; i++) {
    const s = form.spots[i];
    const sh = sheetOf(i);
    await wb.set(sh, 'D3', s.location);
    await wb.set(sh, 'L3', panelOf(s));
    await wb.set(sh, 'T3', `신규(   ${n(s.qty)}   )기, 교체(   ${n(s.replQty)}   )기`);
    await wb.set(sh, 'D4', `1차측 메인 (   ${amp(s.mainBreaker)}   )A / 사용 차단기 (   ${amp(s.inletBreaker)}   )A`);
    await wb.set(sh, 'L4', `배관(   ${n(s.pipeLen)}   )m, 배선(   ${n(s.cableLen)}   )m`);
    await wb.set(sh, 'T4', `(   ${plModemOf(s) || ' '}   )기`);
    await wb.set(sh, 'D5', s.note);

    // 넣은 사진만 칸 순서대로 — 빈 칸은 건너뛰고 두 장씩 짝을 채운다
    const imgs = images.spots[s.id] ?? {};
    const photos: Array<{ img: PreparedImage; caption: string }> = [];
    for (const sl of PL_PHOTO_SLOTS) {
      const keys: string[] = [];
      for (let k = 0; k < (sl.multi ?? 1); k++) if (imgs[subKey(sl.key, k)]) keys.push(subKey(sl.key, k));
      keys.forEach((key, k) => photos.push({ img: imgs[key]!, caption: photoCaption(sl, k, keys.length) }));
    }
    const pairs = Math.max(MIN_PAIRS, Math.ceil(photos.length / 2));
    if (pairs > TEMPLATE_PAIRS) {
      await wb.appendRowBlock(sh, pairTop(TEMPLATE_PAIRS - 1), pairTop(TEMPLATE_PAIRS) - 1, pairs - TEMPLATE_PAIRS);
    }
    for (let k = 0; k < Math.max(pairs, TEMPLATE_PAIRS) * 2; k++) {
      const top = pairTop(Math.floor(k / 2));
      const left = k % 2 === 0;
      const anchor = `${left ? 'A' : 'M'}${top}`;
      const caption = `${left ? 'D' : 'P'}${top + 23}`;
      // 「사진 첨부(공란 시 내용 삭제)」 — 넣었든 안 넣었든 이 글은 지운다(서식의 지시다)
      await wb.set(sh, anchor, '');
      const p = photos[k];
      if (!p) {
        await wb.set(sh, caption, '');
        continue;
      }
      // 칸을 꽉 채운다 — 비율이 다르면 자른다(표시는 남긴다, xlsx-kit addPicture fill)
      await wb.addPicture(sh, `${anchor}:${left ? 'L' : 'X'}${top + 22}`, p.img, 'fill');
      await wb.set(sh, caption, p.caption);
    }
    const lastRow = pairTop(pairs) - 1;
    wb.setPrintArea(sh, `$A$1:$X$${lastRow}`);
    const breaks: number[] = [];
    for (let r = pairTop(2) - 1; r < lastRow; r += PAIR_H * 2) breaks.push(r);
    await wb.setRowBreaks(sh, breaks);
  }

  // ── 5. 공사내역서(입력) — 수량만. 금액은 수식이 계산한다
  const co = S.cost;
  await wb.set(co, 'D3', totalNew || '');
  await wb.set(co, 'D4', totalRepl || '');
  await wb.set(co, 'D5', sum((s) => plFixture(s, s.canopy)) || '');
  await wb.set(co, 'D6', sum((s) => plFixture(s, s.stand)) || '');
  await wb.set(co, 'D7', sum((s) => plFixture(s, s.bollard)) || '');
  if (form.roadCutM) {
    await wb.set(co, 'D8', form.roadCutM);
    if (form.roadCutPrice !== null) await wb.set(co, 'H8', form.roadCutPrice);
  }
  if (form.digM) {
    await wb.set(co, 'D9', form.digM);
    if (form.digPrice !== null) await wb.set(co, 'H9', form.digPrice);
  }
  const cable = new Map<number, number>();
  const pipe = new Map<number, number>();
  for (const s of form.spots) {
    const tag = form.spots.length > 1 ? `${form.spots.indexOf(s) + 1}거점 · ` : '';
    const over = (len: number | null) => Math.max(0, (len ?? 0) - BASE_LEN);
    if (over(s.cableLen) > 0) {
      const row = s.cableSize ? CABLE_ROW[s.cableSize] : undefined;
      if (row) cable.set(row, (cable.get(row) ?? 0) + over(s.cableLen));
      else warnings.push(`${tag}배선 SIZE ${s.cableSize ?? '(비어 있음)'}sq 는 공사내역서에 줄이 없어 추가 배선 ${over(s.cableLen)}m 를 넣지 못했습니다`);
    }
    if (over(s.pipeLen) > 0) {
      const row = s.pipeSize ? PIPE_ROW[s.pipeSize] : undefined;
      if (row) pipe.set(row, (pipe.get(row) ?? 0) + over(s.pipeLen));
      else warnings.push(`${tag}배관 SIZE ${s.pipeSize ?? '(비어 있음)'}mm 는 공사내역서에 줄이 없어 추가 배관 ${over(s.pipeLen)}m 를 넣지 못했습니다`);
    }
  }
  for (const [row, m] of cable) await wb.set(co, `D${row}`, m);
  for (const [row, m] of pipe) await wb.set(co, `D${row}`, m);
  /*
   * 기타비용 — 29~38행(사양·수량·단가). 29행은 서식에 「인건비 250,000」이 박혀 있다.
   * 줄 순서대로 채우고, 단가를 비우면 그 줄의 서식 단가를 둔다. 수량이 없는 줄은 건너뛴다.
   */
  const etc = form.etc.filter((e) => e.spec.trim() && e.qty);
  if (etc.length > 10) warnings.push(`기타비용은 10줄까지 들어갑니다 — ${etc.length - 10}줄을 넣지 못했습니다`);
  for (const [i, e] of etc.slice(0, 10).entries()) {
    const r = 29 + i;
    await wb.set(co, `F${r}`, e.spec.trim());
    await wb.set(co, `D${r}`, e.qty);
    if (e.price !== null) await wb.set(co, `H${r}`, e.price);
  }
  await wb.set(co, 'D40', totalQty * 7 || '');
  await wb.set(co, 'D41', kepco ? 'Yes' : 'No');
  // 계통타입 — 공중이 대부분이고 지중이 있다(제출본 349곳 중 지중공급 9곳)
  await wb.set(co, 'D42', form.gridType);
  await wb.set(co, 'D46', form.spots.length);
  await wb.set(co, 'D47', totalQty || '');
  await wb.set(co, 'D48', form.safetyCheck ? 'Yes' : 'No');

  await wb.save();
  const opts = { compression: 'DEFLATE' as const };
  const blob = typeof window !== 'undefined'
    ? await zip.generateAsync({ ...opts, type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    : await zip.generateAsync({ ...opts, type: 'uint8array' });
  return { blob, warnings };
}

/**
 * 도면 범례 늘리기 — 서식 범례는 충전기·충전기 분전반·기존 분전반 셋이다. 전신주·IP 전주를 찍었으면
 * 그 둘을 범례 바로 위에 같은 꼴로 더한다(제출본 41곳이 범례에 이 둘을 더해 냈다 — 빨간 겹동그라미 ·
 * 파란 동그라미). 자리는 서식 범례 상자(22~24열, 40~49행)에 맞췄다.
 */
async function addLegend(wb: Workbook, marks: PlForm['planMarks']): Promise<void> {
  const used = (['pole', 'ipPole'] as const).filter((k) => marks.some((m) => m.t === 'sym' && m.k === k));
  if (used.length === 0) return;
  const LEGEND_TOP = 39; // 서식 범례 상자의 첫 행(0부터)
  const top = LEGEND_TOP - (used.length * 2 + 1);
  const para = (t: string) => t
    ? `<a:p><a:r><a:rPr lang="ko-KR" altLang="en-US" sz="1200" b="1"/><a:t>${t}</a:t></a:r></a:p>`
    : '<a:p><a:endParaRPr lang="ko-KR" altLang="en-US" sz="1200" b="1"/></a:p>';
  const paras = [para(''), ...used.flatMap((k) => [para(k === 'pole' ? ' 전신주' : ' IP 전주'), para('')])];
  const id = (n: number) => 6000 + n;
  await wb.addAnchorXml(S.plan, `<xdr:twoCellAnchor><xdr:from><xdr:col>21</xdr:col><xdr:colOff>415636</xdr:colOff><xdr:row>${top}</xdr:row><xdr:rowOff>51955</xdr:rowOff></xdr:from><xdr:to><xdr:col>23</xdr:col><xdr:colOff>433681</xdr:colOff><xdr:row>${LEGEND_TOP - 1}</xdr:row><xdr:rowOff>190000</xdr:rowOff></xdr:to><xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="${id(0)}" name="범례 더함"/><xdr:cNvSpPr txBox="1"/></xdr:nvSpPr><xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:schemeClr val="lt1"/></a:solidFill><a:ln w="9525"><a:solidFill><a:sysClr val="windowText" lastClr="000000"/></a:solidFill></a:ln></xdr:spPr><xdr:txBody><a:bodyPr vertOverflow="clip" horzOverflow="clip" wrap="square" rtlCol="0" anchor="t"/><a:lstStyle/>${paras.join('')}</xdr:txBody></xdr:sp><xdr:clientData/></xdr:twoCellAnchor>`);
  for (const [i, k] of used.entries()) {
    const row = top + 1 + i * 2;
    const geom = k === 'pole'
      ? '<a:prstGeom prst="donut"><a:avLst><a:gd name="adj" fmla="val 18000"/></a:avLst></a:prstGeom><a:noFill/><a:ln w="22225"><a:solidFill><a:srgbClr val="FF0000"/></a:solidFill></a:ln>'
      : '<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="0000FF"/></a:solidFill><a:ln w="9525"><a:solidFill><a:sysClr val="windowText" lastClr="000000"/></a:solidFill></a:ln>';
    await wb.addAnchorXml(S.plan, `<xdr:twoCellAnchor><xdr:from><xdr:col>22</xdr:col><xdr:colOff>560000</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>20000</xdr:rowOff></xdr:from><xdr:to><xdr:col>23</xdr:col><xdr:colOff>142300</xdr:colOff><xdr:row>${row + 1}</xdr:row><xdr:rowOff>28385</xdr:rowOff></xdr:to><xdr:sp macro="" textlink=""><xdr:nvSpPr><xdr:cNvPr id="${id(i + 1)}" name="범례 ${k === 'pole' ? '전신주' : 'IP 전주'}"/><xdr:cNvSpPr/></xdr:nvSpPr><xdr:spPr>${geom}</xdr:spPr></xdr:sp><xdr:clientData/></xdr:twoCellAnchor>`);
  }
}

export const plSurveyFileName = (siteName: string) =>
  `${siteName.trim() || '현장'}_실사보고서 (사진대지).xlsx`;

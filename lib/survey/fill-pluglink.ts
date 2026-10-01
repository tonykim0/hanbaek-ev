/**
 * 플러그링크 실사보고서 v22 — 실사개요 · 전경사진 · 도면 · 거점별 사진대지 · 공사내역서(입력).
 *
 * 서식은 플러그링크가 준 빈 서식 그대로다(public/survey/pluglink-v22.xlsx). ★채우는 규칙은 서식
 * 안의 「작성 가이드」 글상자에 적힌 것을 따른다★ — 사업명은 「현장명 + 플러그링크 충전인프라
 * 구축사업」, 통신은 충전기 6기당 1개, 예상용량은 (신규+교체)×7, 추가 배선·배관은 1차측
 * 기본공사 70m 를 넘는 길이다. 금액은 서식의 수식이 계산한다(공사내역서(출력)·일위대가) —
 * 우리는 수량만 넣고, 열 때 다시 계산하게 한다(lib/survey/xlsx-kit save).
 *
 * 거점은 6개까지다 — 실사개요의 거점 표(1안)가 여섯 줄이다.
 */
import JSZip from 'jszip';
import { Workbook } from './xlsx-kit';
import type { PreparedImage } from './docx-kit';
import { PL_PHOTO_SLOTS, plFixture, plModemOf, plQtyOf, type PlForm, type PlSpot } from './spec';

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
/** 사진대지의 사진 짝 — 시작 줄. 칸은 A·M 열에서 23줄, 설명은 그 밑 줄의 D·P */
const PAIR_ROWS = [6, 31, 56, 81, 106, 131];
const MAX_SPOTS = 6;

const amp = (s: string) => /(\d+)\s*A/i.exec(s)?.[1] ?? '';
const n = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));

export interface PlResult { blob: Blob | Uint8Array; warnings: string[] }

export async function fillPluglinkSurvey(
  form: PlForm,
  images: { overview?: PreparedImage; plan?: PreparedImage; spots: Record<string, Record<string, PreparedImage | undefined>> },
  template: ArrayBuffer | Uint8Array
): Promise<PlResult> {
  if (form.spots.length === 0) throw new Error('거점을 하나 이상 넣어주세요.');
  if (form.spots.length > MAX_SPOTS) {
    throw new Error(`실사개요 거점 표는 ${MAX_SPOTS}거점까지입니다 — 나눠서 두 부로 만들어 주세요.`);
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
  await wb.set(ov, 'L4', form.siteTel);
  await wb.set(ov, 'D5', form.siteName);
  await wb.set(ov, 'L5', `신규 (   ${totalNew || ' '}   )기, 교체 (   ${totalRepl || ' '}   )기`);
  await wb.set(ov, 'D6', form.address);
  await wb.set(ov, 'L6', form.existing.trim());
  for (let i = 0; i < MAX_SPOTS; i++) {
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
    await wb.addPicture(S.photo, 'A4:O48', images.overview);
  }
  if (images.plan) {
    await wb.set(S.plan, 'A4', '');
    await wb.addPicture(S.plan, 'A4:X50', images.plan);
  }
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

    const imgs = images.spots[s.id] ?? {};
    let lastPair = 3; // 서식의 인쇄 영역이 넷째 짝까지다
    for (let k = 0; k < PL_PHOTO_SLOTS.length; k++) {
      const pair = Math.floor(k / 2);
      const left = k % 2 === 0;
      const top = PAIR_ROWS[pair];
      const anchor = `${left ? 'A' : 'M'}${top}`;
      const caption = `${left ? 'D' : 'P'}${top + 23}`;
      const img = imgs[PL_PHOTO_SLOTS[k].key];
      // 「사진 첨부(공란 시 내용 삭제)」 — 넣었든 안 넣었든 이 글은 지운다(서식의 지시다)
      await wb.set(sh, anchor, '');
      if (!img) {
        await wb.set(sh, caption, '');
        continue;
      }
      await wb.addPicture(sh, `${anchor}:${left ? 'L' : 'X'}${top + 22}`, img);
      await wb.set(sh, caption, PL_PHOTO_SLOTS[k].label);
      lastPair = Math.max(lastPair, pair);
    }
    wb.setPrintArea(sh, `$A$1:$X$${PAIR_ROWS[lastPair] + 24}`);
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
  // 계통타입 — 제출본 8건이 모두 공중공급이다. 지중은 받은 파일에서 고친다
  await wb.set(co, 'D42', '공중공급');
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

export const plSurveyFileName = (siteName: string) =>
  `${siteName.trim() || '현장'}_실사보고서 (사진대지).xlsx`;

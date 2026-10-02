/**
 * 현대엔지니어링 실사보고서(사진대지) — [별지 1] 사진대지 + [별지 2] 사전체크리스트를 거점마다.
 *
 * ★서식은 계약서 서식 안의 빈 별지다★ (public/hec/template.docx). 운영사에 내는 「실사보고서
 * (사진대지)」가 바로 그 두 별지라, 따로 서식을 두면 계약서 쪽만 고쳐지고 갈린다. 그래서 계약서
 * 서식에서 두 별지를 잘라 내 거점 수만큼 복제하고, 나머지 계약서 본문은 버린다.
 *
 * ★칸은 자리로 찾는다★ — 이 별지에는 이름표(SDT)가 없다. 표의 줄·칸 자리와 줄 높이(사진 줄은
 * 4500 트윕)로 찾고, 서식의 모양이 예상과 다르면(사진 칸이 일곱이 아니거나 체크리스트 줄 수가
 * 다르면) ★멈춘다★ — 칸이 하나 밀리면 사진이 남의 이름 밑에 들어간다.
 */
import JSZip from 'jszip';
import {
  HEC_CHECKS, HEC_PHOTO_SLOTS, fastOf, slowOf,
  type SurveyForm, type SurveySpot,
} from './spec';
import {
  ImageRegistry, PHOTO_ROW_MIN, W_NS, cellWidth, cellsOf, finishDocx, pageBreak, photoCellsOf, putImage,
  rowHeight, rowsOf, setCellText, textOf, type PreparedImage,
} from './docx-kit';
import { surveyFileName } from './pack';
/** 칸 안 여백(트윕) — 사진이 칸 선에 붙지 않게 */
const PAD = 180;

/** 잘라 낸 별지 둘 — 복제의 원본이다 */
interface Blocks { a: Element[]; b: Element[]; sectPr: Element | null }

const isEmptyParagraph = (e: Element) =>
  e.localName === 'p' && textOf(e).trim() === '' && e.getElementsByTagNameNS(W_NS, 'drawing').length === 0;

const hasPageBreak = (e: Element) => {
  const brs = e.getElementsByTagNameNS(W_NS, 'br');
  for (let i = 0; i < brs.length; i++) {
    if ((brs[i].getAttributeNS(W_NS, 'type') ?? brs[i].getAttribute('w:type')) === 'page') return true;
  }
  return e.getElementsByTagNameNS(W_NS, 'pageBreakBefore').length > 0;
};

/** 끝의 빈 문단을 걷는다 — 쪽 나눔을 따로 넣으므로 남기면 빈 쪽이 생긴다 */
function trimTail(list: Element[]): Element[] {
  const out = [...list];
  while (out.length && isEmptyParagraph(out[out.length - 1])) out.pop();
  return out;
}

function cutBlocks(body: Element): Blocks {
  const kids = Array.from(body.childNodes).filter((n): n is Element => n.nodeType === 1);
  const at = (label: string) => kids.findIndex((k) => k.localName === 'p' && textOf(k).trim() === label);
  const a0 = at('[별지 1]');
  const b0 = at('[별지 2]');
  if (a0 < 0 || b0 < 0 || b0 < a0) throw new Error('서식에서 [별지 1]·[별지 2]를 찾지 못했습니다.');
  let b1 = kids.findIndex((k, i) => i > b0 && hasPageBreak(k));
  if (b1 < 0) b1 = kids.findIndex((k) => k.localName === 'sectPr');
  if (b1 < 0) b1 = kids.length;
  const sectPr = kids.find((k) => k.localName === 'sectPr') ?? null;
  return { a: trimTail(kids.slice(a0, b0)), b: trimTail(kids.slice(b0, b1)), sectPr };
}

const tablesIn = (els: Element[]) => els.filter((e) => e.localName === 'tbl');

const counts = (slow: number | null, fast: number | null) =>
  `(완속) ${slow ? slow : '  '} 기, (급속) ${fast ? fast : '  '} 기`;

function koDate(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일` : '';
}

/** [별지 1] 한 벌을 채운다 */
function fillPhotoSheet(
  els: Element[], spot: SurveySpot, n: number,
  images: Record<string, PreparedImage | undefined>, reg: ImageRegistry
): void {
  const [head, ...photoTables] = tablesIn(els);
  if (!head || photoTables.length === 0) throw new Error('[별지 1] 표 모양이 예상과 다릅니다.');

  const hr = rowsOf(head);
  if (hr.length < 5) throw new Error('[별지 1] 머리 표의 줄 수가 예상과 다릅니다.');
  setCellText(cellsOf(hr[0])[0], `${n} 거점 사전현장 컨설팅 결과보고서 사진 대지`);
  // 전원 공급방식 — 고른 쪽 줄에 거점의 합을 적는다. 다른 줄은 서식 그대로(빈 칸) 둔다
  const total = { slow: slowOf(spot), fast: fastOf(spot) };
  const [kepco, split] = [cellsOf(hr[2]), cellsOf(hr[3])];
  if (kepco.length < 4 || split.length < 4) throw new Error('[별지 1] 대수 칸이 예상과 다릅니다.');
  setCellText((spot.powerType === '한전' ? kepco : split)[1], counts(total.slow, total.fast));
  // 충전기 설치 Type — 벽부형 줄·스탠드형 줄
  setCellText(kepco[3], counts(spot.wallSlow, spot.wallFast));
  setCellText(split[3], counts(spot.standSlow, spot.standFast));
  setCellText(cellsOf(hr[4])[0], `상세 위치 : ${spot.location}`);

  // 사진 칸 — 사진 줄의 칸을 위에서 아래·왼쪽에서 오른쪽 순서로 모은다
  const photoCells = photoTables.flatMap((t) => photoCellsOf(rowsOf(t)));
  // 첫 사진 줄 바로 밑이 원경·근경 이름 줄 — 그 사이 칸에 전주번호·차단기 스펙을 적는다
  let specRow: Element | null = null;
  for (const rows of photoTables.map(rowsOf)) {
    const i = rows.findIndex((r, k) => rowHeight(r) >= PHOTO_ROW_MIN && rows[k + 1] && cellsOf(rows[k + 1]).length === 4);
    if (i >= 0) { specRow = rows[i + 1]; break; }
  }
  // 마지막 줄의 둘째 칸은 비어 있는 자리다(CCTV 옆) — 일곱 칸까지만 쓴다
  if (photoCells.length < HEC_PHOTO_SLOTS.length) {
    throw new Error(`[별지 1] 사진 칸이 ${photoCells.length}개입니다 — 서식이 바뀌었는지 확인이 필요합니다.`);
  }
  HEC_PHOTO_SLOTS.forEach((slot, i) => {
    const img = images[slot.key];
    if (!img) return;
    const { tc, h } = photoCells[i];
    putImage(tc, img, reg, cellWidth(tc) - PAD * 2, h - PAD * 2);
  });
  if (specRow) {
    const c = cellsOf(specRow);
    if (spot.farSpec.trim()) setCellText(c[1], spot.farSpec.trim());
    if (spot.nearSpec.trim()) setCellText(c[3], spot.nearSpec.trim());
  }
}

/** [별지 2] 한 벌을 채운다 */
function fillChecklist(els: Element[], spot: SurveySpot, n: number, form: SurveyForm): void {
  const [head, ...checkTables] = tablesIn(els);
  if (!head || checkTables.length !== HEC_CHECKS.length) {
    throw new Error('[별지 2] 표 모양이 예상과 다릅니다.');
  }
  const hr = rowsOf(head);
  const r0 = cellsOf(hr[0]);
  const r1 = cellsOf(hr[1]);
  if (r0.length < 5 || r1.length < 3) throw new Error('[별지 2] 머리 표가 예상과 다릅니다.');
  setCellText(r0[1], koDate(form.surveyDate));
  setCellText(r0[r0.length - 1], `${slowOf(spot) || '  '} 기`);
  setCellText(r1[1], form.spots.length > 1 ? `${form.siteName} (${n}거점 ${spot.location})` : form.siteName);
  setCellText(r1[r1.length - 1], `${fastOf(spot) || '  '} 기`);

  HEC_CHECKS.forEach((group, gi) => {
    // 머리 두 줄(점검내용 · 확인/미확인)을 넘기고 항목 줄만
    const rows = rowsOf(checkTables[gi]).slice(2);
    if (rows.length !== group.items.length) {
      throw new Error(`[별지 2] 「${group.group}」 항목이 ${rows.length}줄입니다 — 서식이 바뀌었는지 확인이 필요합니다.`);
    }
    group.items.forEach((item, i) => {
      const c = cellsOf(rows[i]);
      const v = spot.checks[item.key] ?? { ok: true, note: '' };
      setCellText(c[1], v.ok ? 'O' : '');
      setCellText(c[2], v.ok ? '' : 'X');
      const note = v.note.trim();
      if (note) {
        const preset = textOf(c[3]).trim();
        // 서식에 박힌 기준(「KS A 3011 표5」 등)은 지우지 않는다 — 협력사의 말을 덧붙인다
        setCellText(c[3], preset ? `${preset}\n${note}` : note);
      }
    });
  });
}

/**
 * 채운 실사보고서를 돌려준다.
 * @param template public/hec/template.docx 의 내용 — 부르는 쪽이 받아 온다(브라우저는 fetch)
 * @param images 거점 id → 칸 key → 줄여 구운 사진
 */
export async function fillHecSurvey(
  form: SurveyForm,
  images: Record<string, Record<string, PreparedImage | undefined>>,
  template: ArrayBuffer | Uint8Array
): Promise<Blob | Uint8Array> {
  if (form.spots.length === 0) throw new Error('거점을 하나 이상 넣어주세요.');
  const zip = await JSZip.loadAsync(template);
  const xml = await zip.file('word/document.xml')!.async('string');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const body = doc.getElementsByTagNameNS(W_NS, 'body')[0];
  const blocks = cutBlocks(body);
  const reg = new ImageRegistry(zip);

  const out: Element[] = [];
  form.spots.forEach((spot, i) => {
    const n = i + 1;
    if (i > 0) out.push(pageBreak(doc));
    const a = blocks.a.map((e) => e.cloneNode(true) as Element);
    fillPhotoSheet(a, spot, n, images[spot.id] ?? {}, reg);
    out.push(...a, pageBreak(doc));
    const b = blocks.b.map((e) => e.cloneNode(true) as Element);
    fillChecklist(b, spot, n, form);
    out.push(...b);
  });

  // 본문을 갈아 끼운다 — 계약서 본문은 버리고 쪽 설정(sectPr)만 남긴다
  return finishDocx(zip, doc, out, blocks.sectPr, reg);
}

export const hecSurveyFileName = (siteName: string) => surveyFileName(siteName, 'docx');

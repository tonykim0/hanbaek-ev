/**
 * 사전 현장 컨설팅 사진 대장 — SK일렉링크 양식. ★나이스인프라도 이 양식을 쓴다★ (한백 지시
 * 2026-10-01 「표준양식이 없어서」).
 *
 * 서식(public/survey/ledger.docx)은 SK 양식에서 예시 값을 걷어 낸 거점 한 벌이다:
 * 머리(「사전 현장 컨설팅 사진 대장 - N거점」) · 빈 줄 · 표. 표는 이렇게 생겼다 —
 *   0 설치장소(주소) | 값
 *   1 전력인입점 사진                (머리)
 *   2 사진 | 사진                    (높은 줄)
 *   3 판넬 설명 한 줄
 *   4 설치 예정 주차면 사진          (머리)
 *   5 전면 | 측면
 *   6 사진 | 사진                    (높은 줄)
 *   7 설치기수 N기 / 위치
 * 거점마다 이 한 벌을 복제해 채운다. 모양이 다르면 멈춘다(lib/survey/fill-hec 와 같은 이유).
 */
import JSZip from 'jszip';
import { LEDGER_PHOTO_SLOTS, type SurveyForm, type SurveySpot } from './spec';
import {
  ImageRegistry, W_NS, cellWidth, cellsOf, childrenNamed, putImage, rowHeight, rowsOf,
  setCellText, textOf, unlockDocument, type PreparedImage,
} from './docx-kit';

const PHOTO_ROW_MIN = 3000;
const PAD = 160;

/** 다음 거점은 새 쪽에서 — 표가 쪽을 거의 채우므로 쪽 나눔 문단을 따로 두면 빈 쪽이 생길 수 있다 */
function breakBefore(p: Element): void {
  const doc = p.ownerDocument;
  let pPr = childrenNamed(p, 'pPr')[0];
  if (!pPr) { pPr = doc.createElementNS(W_NS, 'w:pPr'); p.insertBefore(pPr, p.firstChild); }
  if (childrenNamed(pPr, 'pageBreakBefore').length === 0) {
    pPr.insertBefore(doc.createElementNS(W_NS, 'w:pageBreakBefore'), pPr.firstChild);
  }
}

function setParagraphText(p: Element, text: string): void {
  // 문단도 칸과 같은 셈으로 바꾼다 — 첫 글줄에 적고 나머지는 비운다
  const runs = childrenNamed(p, 'r');
  const ts = runs.flatMap((r) => Array.from(r.getElementsByTagNameNS(W_NS, 't')));
  if (ts.length === 0) throw new Error('사진 대장 머리 글이 예상과 다릅니다.');
  ts.forEach((t, i) => { t.textContent = i === 0 ? text : ''; });
}

function fillOne(
  [head, gap, table]: Element[], address: string, spot: SurveySpot, n: number,
  images: Record<string, PreparedImage | undefined>, reg: ImageRegistry
): Element[] {
  setParagraphText(head, `사전 현장 컨설팅 사진 대장 - ${n}거점`);
  if (n > 1) breakBefore(head);
  const rows = rowsOf(table);
  if (rows.length < 8) throw new Error('사진 대장 표의 줄 수가 예상과 다릅니다.');
  setCellText(cellsOf(rows[0])[1], address.trim()); // 거점마다 같은 현장 주소(spec SurveyForm.address)
  setCellText(cellsOf(rows[3])[0], spot.panelNote.trim());
  const where = spot.location.trim();
  setCellText(cellsOf(rows[7])[0], `설치기수 ${spot.qty ?? '  '}기${where ? ` / ${where}` : ''}`);

  const photoCells = rows
    .filter((r) => rowHeight(r) >= PHOTO_ROW_MIN)
    .flatMap((r) => cellsOf(r).map((tc) => ({ tc, h: rowHeight(r) })));
  if (photoCells.length !== LEDGER_PHOTO_SLOTS.length) {
    throw new Error(`사진 대장 사진 칸이 ${photoCells.length}개입니다 — 서식이 바뀌었는지 확인이 필요합니다.`);
  }
  LEDGER_PHOTO_SLOTS.forEach((slot, i) => {
    const img = images[slot.key];
    if (!img) return;
    const { tc, h } = photoCells[i];
    putImage(tc, img, reg, cellWidth(tc) - PAD * 2, h - PAD * 2);
  });
  return [head, gap, table];
}

export async function fillLedgerSurvey(
  form: SurveyForm,
  images: Record<string, Record<string, PreparedImage | undefined>>,
  template: ArrayBuffer | Uint8Array
): Promise<Blob | Uint8Array> {
  if (form.spots.length === 0) throw new Error('거점을 하나 이상 넣어주세요.');
  const zip = await JSZip.loadAsync(template);
  const doc = new DOMParser().parseFromString(await zip.file('word/document.xml')!.async('string'), 'application/xml');
  const body = doc.getElementsByTagNameNS(W_NS, 'body')[0];
  const kids = Array.from(body.childNodes).filter((n): n is Element => n.nodeType === 1);
  const proto = kids.filter((k) => k.localName !== 'sectPr').slice(0, 3);
  const sectPr = kids.find((k) => k.localName === 'sectPr') ?? null;
  if (proto.length !== 3 || proto[2].localName !== 'tbl' || !textOf(proto[0]).includes('사진 대장')) {
    throw new Error('사진 대장 서식 모양이 예상과 다릅니다.');
  }
  const reg = new ImageRegistry(zip);
  const out = form.spots.flatMap((spot, i) =>
    fillOne(proto.map((e) => e.cloneNode(true) as Element), form.address, spot, i + 1, images[spot.id] ?? {}, reg));

  for (const k of Array.from(body.childNodes)) body.removeChild(k);
  for (const e of out) body.appendChild(e);
  if (sectPr) body.appendChild(sectPr);
  zip.file('word/document.xml', new XMLSerializer().serializeToString(doc));
  await reg.flush();
  await unlockDocument(zip);
  const opts = { compression: 'DEFLATE' as const };
  return typeof window !== 'undefined'
    ? zip.generateAsync({ ...opts, type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' })
    : zip.generateAsync({ ...opts, type: 'uint8array' });
}

export const ledgerSurveyFileName = (siteName: string) =>
  `${siteName.trim() || '현장'}_실사보고서 (사진대지).docx`;

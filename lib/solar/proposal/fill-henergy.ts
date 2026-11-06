/**
 * 에이치에너지 솔라쉐어 2.0 제안서 — 사업자가 준 고객용 틀(「01. 솔라쉐어 제안서_SAMPLE_….pptx」, 구글 프레젠테이션에서 내보낸 12장)에
 * 7장 「솔라쉐어2.0 맞춤 제안」만 채운다. [브라우저]
 *
 * 그 장의 글상자 열한 개(Google Shape 90~100 — 고객명 · 두 지급 방식의 금액 · 용량)와 오른쪽 사진(101)이 자리다. 나머지 장은 한 장짜리
 * 그림이다. 「= (기본 + 이벤트) x … x 5년치」 같은 식과 각주는 바탕 그림에 박혀 있다 — 조건이 바뀌면 에이치에너지가 새 틀을 내고
 * 한백이 그것을 올리며 조건도 고친다(둘이 같이 간다). 사진 자리에는 그 현장의 가배치 그림을 넣는다(견본은 남의 지붕 사진이다).
 * 금액 표기는 그 틀의 것 — 만원 소수 한 자리(아래 버림) · 억 묶음(lib/solar/proposal/calc manwonText).
 */
import { Deck } from '@/lib/pptx/deck';
import { capacityKw, kwText, manwonText, solarShare } from './calc';
import type { FillArgs } from './fill-common';

const S = (n: number) => `Google Shape;${n};p21`;

export async function fillHenergy({ template, terms, input }: FillArgs): Promise<Blob | Uint8Array> {
  const deck = await Deck.open(template);
  const kw = capacityKw(input.panels, terms.moduleWatt);
  const r = solarShare(kw, terms);
  const s = await deck.slide(7);
  s.setText(S(90), input.customer);
  /*
   * 「임대 제안서」(91)는 틀 그대로지만 칸이 글에 꼭 맞아(103pt) 글꼴(Noto Sans KR)이 없는 컴퓨터에서는 「임대 제안 / 서」로 접혔다 —
   * 칸만 넓힌다(오른쪽은 빈 자리다).
   */
  const title = s.boxOf(S(91));
  s.setBox(S(91), { ...title, w: title.w * 2 });
  s.setText(S(92), manwonText(r.prepay.year1));
  s.setText(S(93), manwonText(r.annual.year1));
  s.setText(S(94), `${kwText(kw)} kW`);
  s.setText(S(95), `${kwText(kw)} kW`);
  s.setText(S(96), manwonText(r.prepay.y6to20));
  s.setText(S(97), manwonText(r.annual.y6to20));
  s.setText(S(98), manwonText(r.annual.y2to5));
  // 두 방식의 20년 합계는 지금 조건에서 같다(kW × 95만원) — 조건이 바뀌어 갈리면 둘 다 적는다
  const same = Math.floor(r.prepay.total / 1000) === Math.floor(r.annual.total / 1000);
  s.setText(S(99), same ? manwonText(r.prepay.total) : `${manwonText(r.prepay.total)} / ${manwonText(r.annual.total)}`);
  s.setText(S(100), `${kwText(kw)} kW`);
  /*
   * 사진 자리 — 견본 사진(101)은 바탕 그림에 박힌 같은 사진 위에 조금 작게 얹혀 있다(바탕 쪽이 좌우로 2~10만 EMU 넓다). 그대로
   * 갈면 남의 지붕이 테두리로 비친다 — 바탕 사진의 자리(바탕 그림에서 쟀다: 가로 1053~1542 · 세로 254~722 / 1600×903)로 넓혀 덮는다.
   */
  const slot = { x: 6_014_000, y: 1_443_000, w: 2_808_000, h: 2_674_000 };
  s.setBox(S(101), slot);
  const pic = await input.image(slot.w / slot.h, true);
  s.setPicture(S(101), pic.bytes, 'jpeg');
  return deck.save();
}

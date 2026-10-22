/**
 * 서식과 열쇠가 어긋나지 않았는가 — ★이 그물이 서식을 저장소에 둔 이유다★.
 *
 * 치환 열쇠는 서식에 적힌 샘플 값(「(주)무창」·「352.95」)이다. 서식을 새로 받아 바꿔 끼우면
 * 열쇠가 안 걸리고, 그러면 ★고객 이름만 바뀐 남의 회사 수치가 든 제안서★가 나간다. 사람은
 * 앞장만 보고 보낸다.
 *
 * 서식이 Blob 에 있었다면 이 검사를 못 한다(시험이 네트워크를 타야 한다). 저장소에 두니
 * 서식과 열쇠가 한 커밋에서 같이 움직이고, 어긋나면 여기서 빨개진다.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { beforeAll, describe, expect, it } from 'vitest';
import { PROPOSAL_CONST, SAMPLE, replacementsOf } from '@/lib/solar/fill-proposal';
import { TEMPLATE_PATH } from '@/lib/solar/template';

const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';

let text = '';
let tableRows = 0;

beforeAll(async () => {
  const g = globalThis as unknown as Record<string, unknown>;
  g.DOMParser = DOMParser;
  g.XMLSerializer = XMLSerializer;

  const buf = readFileSync(path.join(process.cwd(), 'public', TEMPLATE_PATH));
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  const parts: string[] = [];
  for (const n of names) {
    const xml = await zip.file(n)!.async('string');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const ts = doc.getElementsByTagNameNS(A, 't');
    for (let i = 0; i < ts.length; i += 1) parts.push(ts[i].textContent ?? '');

    /* 손익표가 23줄(머리 2 + 20년 + 합계)인지 — 줄 수가 바뀌면 표를 덜 쓰거나 넘친다 */
    for (const tbl of Array.from(doc.getElementsByTagNameNS(A, 'tbl'))) {
      const rows = Array.from(tbl.getElementsByTagNameNS(A, 'tr'));
      /* ★첫 「칸」만 본다★ — 줄을 통째로 이으면 '년도발전량[kWh]…' 이 되어 안 걸린다 */
      const cell = rows[0]?.getElementsByTagNameNS(A, 'tc')[0];
      const first = cell
        ? Array.from(cell.getElementsByTagNameNS(A, 't')).map((t) => t.textContent ?? '').join('').trim()
        : '';
      if (first === '년도') tableRows = rows.length;
    }
  }
  text = parts.join('');
});

describe('서식이 있고 읽힌다', () => {
  it('슬라이드에서 글자가 나온다', () => {
    expect(text.length).toBeGreaterThan(1000);
  });
});

describe('★치환 열쇠가 서식에 다 있다★', () => {
  /* 샘플 현장으로 열쇠를 만들어, 그 「찾을 글자」가 서식에 실제로 있는지 본다 */
  const keys = Object.keys(
    replacementsOf({
      customer: 'X', address: 'Y', region: 'Z', capacityKw: 1, selfUseKwh: 1,
    })
  );

  it.each(keys)('서식에 「%s」가 있다', (k) => {
    expect(text.includes(k)).toBe(true);
  });
});

describe('★상수도 서식의 글과 같다★ — 화면이 말하는 전제와 서식이 달라지면 안 된다', () => {
  it('임대단가 140원/kWh', () => {
    expect(text).toContain(`${PROPOSAL_CONST.leaseRate}원/kWh`);
  });

  it('기존 전력량 단가 174.8원/kWh', () => {
    expect(text).toContain(`${PROPOSAL_CONST.gridRate}원/kWh`);
  });

  it('계약기간 20년', () => {
    expect(text).toContain(`${PROPOSAL_CONST.years}년`);
  });

  it('발전시간 3.6 시간', () => {
    expect(text).toContain(`${PROPOSAL_CONST.hoursPerDay} 시간`);
  });
});

describe('★20년 손익표의 모양★', () => {
  it('23줄이다 — 머리 둘 + 20년 + 합계', () => {
    expect(tableRows).toBe(2 + PROPOSAL_CONST.years + 1);
  });
});

describe('샘플 값이 서로 맞는다', () => {
  it('샘플 용량과 장수가 모듈 출력으로 떨어진다', () => {
    expect(SAMPLE.moduleCount * PROPOSAL_CONST.moduleWatt).toBe(
      Math.round(SAMPLE.capacityKw * 1000)
    );
  });
});

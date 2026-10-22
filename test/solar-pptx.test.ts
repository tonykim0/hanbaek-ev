/**
 * 제안서 서식의 글자 바꾸기 — ★조각난 글자를 못 잡으면 샘플 값이 그대로 나간다★.
 *
 * 파워포인트·구글 슬라이드는 한 문단을 run 여럿으로 가른다(글꼴이 바뀌거나 맞춤법 검사가
 * 지나가기만 해도). 「352.95kW」가 세 조각이면 조각 하나만 보는 치환은 아무것도 못 바꾸고,
 * 그러면 고객 이름만 바뀐 ★남의 회사 수치가 든 제안서★가 나간다. 그 자리를 여기서 못 박는다.
 *
 * node 에는 DOMParser 가 없어 xmldom 을 꽂는다(이 저장소에서 DOM 을 보는 첫 시험이다).
 */
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { beforeAll, describe, expect, it } from 'vitest';
import { applyAll, fillSlideXml, orderOf } from '@/lib/solar/pptx-kit';

beforeAll(() => {
  const g = globalThis as unknown as Record<string, unknown>;
  g.DOMParser = DOMParser;
  g.XMLSerializer = XMLSerializer;
});

const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';

/** 슬라이드 한 장 — 문단마다 run 을 원하는 대로 쪼갠다 */
const slide = (paras: string[][]): string =>
  `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="${A}">`
  + '<p:cSld><p:spTree>'
  + paras
    .map(
      (runs) =>
        '<a:p>'
        + runs.map((t) => `<a:r><a:rPr lang="ko-KR"/><a:t>${t}</a:t></a:r>`).join('')
        + '<a:endParaRPr lang="ko-KR"/></a:p>'
    )
    .join('')
  + '</p:spTree></p:cSld></p:sld>';

const textIn = (xml: string): string[] => {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const ps = Array.from(doc.getElementsByTagName('a:p'));
  return ps.map((p) =>
    Array.from(p.getElementsByTagName('a:t')).map((t) => t.textContent ?? '').join('')
  );
};

const R = { '(주)무창': '(주)한백', '352.95': '410.80' };

describe('열쇠 차례 — 긴 것부터', () => {
  it('짧은 열쇠가 긴 열쇠를 먼저 먹지 않는다', () => {
    const r = { '352.95': 'A', '352.95kW': 'B' };
    expect(orderOf(r)[0]).toBe('352.95kW');
    expect(applyAll('설비 352.95kW 입니다', r)).toBe('설비 B 입니다');
  });

  it('빈 열쇠는 무시한다 — 모든 자리에 걸려 글이 터진다', () => {
    expect(applyAll('가나다', { '': 'X', 나: 'Y' })).toBe('가Y다');
  });

  it('없는 열쇠는 아무것도 안 바꾼다', () => {
    expect(applyAll('가나다', { 라: 'X' })).toBe('가나다');
  });
});

describe('run 안에서 바뀔 때 — 글자 모양이 남는다', () => {
  it('한 조각에 다 든 글은 그 자리에서 바뀐다', () => {
    const { xml, hits } = fillSlideXml(slide([['(주)무창 제안서']]), R);
    expect(hits).toBe(1);
    expect(textIn(xml)).toEqual(['(주)한백 제안서']);
  });

  it('★run 수가 그대로다★ — 합치지 않았다는 뜻이고, 굵은 글씨·색이 살아남는다', () => {
    const { xml } = fillSlideXml(slide([['앞 ', '(주)무창', ' 뒤']]), R);
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    expect(doc.getElementsByTagName('a:r')).toHaveLength(3);
    expect(textIn(xml)).toEqual(['앞 (주)한백 뒤']);
  });
});

describe('★조각을 넘나드는 글★ — 여기가 핵심이다', () => {
  it('세 조각에 쪼개진 숫자도 바꾼다', () => {
    const { xml, hits } = fillSlideXml(slide([['설비 ', '352', '.95', 'kW']]), R);
    expect(hits).toBe(1);
    expect(textIn(xml)).toEqual(['설비 410.80kW']);
  });

  it('합칠 때 첫 조각의 글자 모양을 쓴다', () => {
    const xmlIn =
      `<p:sld xmlns:p="x" xmlns:a="${A}"><a:p>`
      + '<a:r><a:rPr lang="ko-KR" b="1"/><a:t>352</a:t></a:r>'
      + '<a:r><a:rPr lang="ko-KR"/><a:t>.95</a:t></a:r>'
      + '<a:endParaRPr lang="ko-KR"/></a:p></p:sld>';
    const { xml } = fillSlideXml(xmlIn, R);
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const rs = doc.getElementsByTagName('a:r');
    expect(rs).toHaveLength(1);
    expect(rs[0].getElementsByTagName('a:rPr')[0].getAttribute('b')).toBe('1');
    expect(textIn(xml)).toEqual(['410.80']);
  });

  it('★문단 끝 모양(endParaRPr) 앞에 넣는다★ — 뒤에 붙이면 줄이 하나 더 생긴 것처럼 보인다', () => {
    const { xml } = fillSlideXml(slide([['352', '.95']]), R);
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const kids = Array.from(doc.getElementsByTagName('a:p')[0].childNodes)
      .filter((n) => n.nodeType === 1)
      .map((n) => (n as unknown as { nodeName: string }).nodeName);
    expect(kids).toEqual(['a:r', 'a:endParaRPr']);
  });

  it('앞뒤 공백이 지워지지 않게 xml:space 를 박는다', () => {
    const { xml } = fillSlideXml(slide([['352', '.95', ' 규모 ']]), R);
    expect(xml).toContain('xml:space="preserve"');
    expect(textIn(xml)).toEqual(['410.80 규모 ']);
  });
});

describe('안 걸렸을 때 — 조용히 넘어가지 않는다', () => {
  it('열쇠가 하나도 안 걸리면 hits 0 이고 XML 을 안 건드린다', () => {
    const was = slide([['아무 상관 없는 글']]);
    const { xml, hits } = fillSlideXml(was, R);
    expect(hits).toBe(0);
    expect(xml).toBe(was);
  });

  it('바꿀 것이 없으면 열쇠가 없어도 그대로다', () => {
    const was = slide([['(주)무창']]);
    expect(fillSlideXml(was, {}).hits).toBe(0);
  });

  it('여러 문단 중 걸린 것만 센다', () => {
    const { hits } = fillSlideXml(slide([['(주)무창'], ['상관 없음'], ['352.95']]), R);
    expect(hits).toBe(2);
  });
});

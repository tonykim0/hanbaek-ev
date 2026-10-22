/**
 * 제안서 채우기 — ★서식의 샘플 값이 남으면 남의 회사 수치가 고객에게 간다★.
 *
 * 그 사고를 막는 자리가 셋이다: 긴 열쇠부터 바꾸기(주소 안의 「아산」) · 손익표를 자리로
 * 쓰기(숫자가 우연히 겹친다) · 안 걸린 열쇠를 돌려주기(서식이 바뀌면 조용히 샘플이 남는다).
 */
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  econRowCells, econTotalCells, fillEconTableXml, moduleCountOf,
  numbersOf, proposalFileName, regionOf, replacementsOf, SAMPLE, type ProposalInput,
} from '@/lib/solar/fill-proposal';
import { applyAll, orderOf } from '@/lib/solar/pptx-kit';
import { eokLabel, thousand } from '@/lib/solar/econ';

beforeAll(() => {
  const g = globalThis as unknown as Record<string, unknown>;
  g.DOMParser = DOMParser;
  g.XMLSerializer = XMLSerializer;
});

/** 협력사 회의 Agenda 21차 12쪽의 현장 — 650W × 136장 = 88.4kW 로 적혀 있다 */
const SEUNGJIN: ProposalInput = {
  customer: '(주)승진패키지',
  address: '경기도 광주시 초월읍 현산로 341-32',
  region: '광주',
  capacityKw: 88.4,
  selfUseKwh: 96_000,
};

describe('입력에서 유도되는 값', () => {
  it('★장수가 Agenda 와 같다★ — 88.4kW 는 650W 136장이다', () => {
    expect(moduleCountOf(88.4)).toBe(136);
    expect(moduleCountOf(180.7)).toBe(278);
    expect(moduleCountOf(SAMPLE.capacityKw)).toBe(SAMPLE.moduleCount);
  });

  it('발전량·초과율·경제성이 용량에서 따라온다', () => {
    const n = numbersOf(SEUNGJIN);
    expect(Math.round(n.genKwh)).toBe(116_158);
    expect(n.excessRatio).toBeCloseTo(0.1735, 4);
    expect(n.rows).toHaveLength(20);
  });

  it('쓸 수 있는 양보다 적게 지으면 초과가 0이다', () => {
    const n = numbersOf({ ...SEUNGJIN, capacityKw: 20 });
    expect(n.excessKwh).toBe(0);
    expect(n.excessRatio).toBe(0);
  });
});

describe('★긴 열쇠부터★ — 주소 안의 지역이 두 번 바뀌지 않는다', () => {
  const r = replacementsOf({ ...SEUNGJIN, region: '아산', address: '충남 아산시 선장면 199' });

  it('주소가 지역보다 먼저 걸린다', () => {
    const keys = orderOf(r);
    expect(keys.indexOf(SAMPLE.address)).toBeLessThan(keys.indexOf(SAMPLE.region));
  });

  it('서식의 주소 줄은 통째로 바뀌고 그 안의 「아산」은 다시 안 건드려진다', () => {
    expect(applyAll(SAMPLE.address, r)).toBe('충남 아산시 선장면 199');
  });

  it('요약 문장의 「아산 (주)무창 사이트」는 둘 다 바뀐다', () => {
    const out = applyAll(`${SAMPLE.region} ${SAMPLE.customer} 사이트`, r);
    expect(out).toBe('아산 (주)승진패키지 사이트');
  });

  it('용량은 소수 두 자리로 적는다 — 서식이 「352.95」 꼴이다', () => {
    expect(applyAll('최대 설치 용량 352.95kW 규모로', replacementsOf(SEUNGJIN)))
      .toBe('최대 설치 용량 88.40kW 규모로');
  });
});

describe('손익표 줄 만들기', () => {
  const n = numbersOf(SEUNGJIN);

  it('한 줄이 여덟 칸이고 세 자리마다 쉼표가 붙는다', () => {
    expect(econRowCells(n.rows[0]))
      .toEqual(['1', '116,158', '96,000', '20,158', '16,262', '16,781', '2,272', '2,791']);
  });

  it('합계 줄의 첫 칸은 「합 계」다 — 서식의 표기 그대로', () => {
    const t = econTotalCells(n.rows);
    expect(t[0]).toBe('합 계');
    expect(t).toHaveLength(8);
  });

  it('★합계가 머리의 누적과 맞는다★ — 표와 요약이 다른 말을 하면 안 된다', () => {
    const t = econTotalCells(n.rows);
    expect(t[7]).toBe('222,257');
    /* 표의 마지막 칸(천원)과 2번 요약에 적히는 「억」이 같은 돈이어야 한다 */
    expect(eokLabel(n.total)).toBe('2.22억 원');
    expect(thousand(n.total)).toBe(222_257);
  });
});

/** 23줄 8칸 — 서식의 그 표와 같은 모양 */
const econTable = (rows: number): string => {
  const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const cell = (t: string) =>
    `<a:tc><a:txBody><a:p><a:r><a:rPr lang="ko-KR"/><a:t>${t}</a:t></a:r>`
    + '<a:endParaRPr lang="ko-KR"/></a:p></a:txBody></a:tc>';
  const row = (vals: string[]) => `<a:tr>${vals.map(cell).join('')}</a:tr>`;
  const head = ['년도', '발전량[kWh]', '자가소비량[kWh]', '초과발전량[kWh]', 'A', 'B', 'C', 'D'];
  const body = Array.from({ length: rows }, () => row(['x', 'x', 'x', 'x', 'x', 'x', 'x', 'x']));
  return `<p:sld xmlns:p="x" xmlns:a="${A}"><a:tbl>`
    + row(head) + row(head.map(() => '')) + body.join('')
    + '</a:tbl></p:sld>';
};

describe('손익표를 자리로 다시 쓴다', () => {
  const n = numbersOf(SEUNGJIN);

  it('머리 두 줄은 그대로 두고 21줄(20년 + 합계)을 쓴다', () => {
    const { xml, rows } = fillEconTableXml(econTable(21), n);
    expect(rows).toBe(21);
    expect(xml).toContain('116,158');
    expect(xml).toContain('222,257');
    expect(xml).toContain('년도');
  });

  it('★그 표가 없으면 아무것도 안 한다★ — 엉뚱한 표를 덮지 않는다', () => {
    const other = econTable(21).replace('>년도<', '>구분<');
    const { xml, rows } = fillEconTableXml(other, n);
    expect(rows).toBe(0);
    expect(xml).toBe(other);
  });

  it('줄이 모자라는 서식에서는 있는 만큼만 쓰고 멈춘다', () => {
    expect(fillEconTableXml(econTable(5), n).rows).toBe(5);
  });
});

describe('주소에서 지역 뽑기 — 요약 문장이 「<지역> <고객사> 사이트」로 쓴다', () => {
  it('도 + 시', () => {
    expect(regionOf(SAMPLE.address)).toBe(SAMPLE.region);
    expect(regionOf('경기도 광주시 초월읍 현산로 341-32')).toBe('광주');
  });

  it('군·구도 같다', () => {
    expect(regionOf('전북 완주군 봉동읍 과학로 1')).toBe('완주');
    expect(regionOf('서울 강남구 테헤란로 1')).toBe('강남');
  });

  it('★광역시는 두 글자다★ — 「부산광역시 … 사이트」는 문장이 안 된다', () => {
    expect(regionOf('부산광역시 강서구 녹산산단로 1')).toBe('부산');
    expect(regionOf('세종특별자치시 한누리대로 2130')).toBe('세종');
  });

  it('못 뽑으면 비운다 — 사람이 적는다(단추가 막는다)', () => {
    expect(regionOf('')).toBe('');
    expect(regionOf('공장 부지')).toBe('');
  });
});

describe('받는 파일 이름', () => {
  it('고객사명이 앞에 온다', () => {
    expect(proposalFileName('(주)승진패키지')).toBe('(주)승진패키지 솔라쉐어바로 제안서.pptx');
  });

  it('이름이 비면 「제안」으로 — 이름 없는 파일을 만들지 않는다', () => {
    expect(proposalFileName('  ')).toBe('제안 솔라쉐어바로 제안서.pptx');
  });
});

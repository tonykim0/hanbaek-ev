/**
 * 여러 현장의 같은 서류를 zip 하나로 — lib/agents/bundle (한백 2026-11-05 「콘솔 프로젝트마다 저장되어있는 파일을 한꺼번에 불러와서
 * 압축해서 이메일로 보내고 싶은데」). 서류 칸 찾기 · zip 안의 이름 · 첨부냐 링크냐 · 담당에게 돌려줄 말.
 */
import { describe, expect, it } from 'vitest';
import {
  attachable, bundleEntryName, bundleLinkLines, bundleText, bundleZipName, docSlotOf, packSites, partBytesOf, sizeText,
  type BundleResult, type DocSlot,
} from '@/lib/agents/bundle';
import { toolsOf } from '@/lib/agents/brain';
import type { Agent } from '@/types/agents';

const APPROVAL: DocSlot = { table: 'contract', key: 'approval', name: '설치승인서 (현대엔지니어링)' };

describe('서류 칸 찾기 (docSlotOf)', () => {
  it('괄호를 뺀 이름 · 키로 찾는다 — 설치승인서는 계약 서류의 approval', () => {
    expect(docSlotOf('설치승인서')).toEqual(APPROVAL);
    expect(docSlotOf(' approval ')).toEqual(APPROVAL);
    expect(docSlotOf('설치승인서(현대엔지니어링)')).toEqual(APPROVAL);
  });

  it('공정 서류도 찾는다 — 괄호까지 같은 이름이 먼저(「견적서」는 발주 견적서, 「견적서 (SK)」는 SK 것)', () => {
    expect(docSlotOf('견적서')).toMatchObject({ table: 'process', key: 'orderQuote' });
    expect(docSlotOf('견적서 (SK)')).toMatchObject({ table: 'process', key: 'skQuote' });
    expect(docSlotOf('행위신고')).toMatchObject({ table: 'process', key: 'notify' });
  });

  it('없거나 비면 까닭을 돌려준다', () => {
    expect(docSlotOf('없는서류이름')).toEqual({ error: expect.stringContaining('서류 칸을 찾지 못했다') });
    expect(docSlotOf('  ')).toEqual({ error: '서류 이름이 비었다.' });
  });
});

describe('zip 안의 이름 · zip 이름', () => {
  it('「관리번호 현장 - 서류」에 원래 확장자 — 한 현장에 여럿이면 (2), 못 쓰는 글자는 걷는다', () => {
    const used = new Set<string>();
    const site = { mgmtNo: 'HB-2026-270', name: '호남신학대학교' };
    expect(bundleEntryName(site, APPROVAL, '승인서.PPTX', used)).toBe('HB-2026-270 호남신학대학교 - 설치승인서.pptx');
    expect(bundleEntryName(site, APPROVAL, '승인서2.pptx', used)).toBe('HB-2026-270 호남신학대학교 - 설치승인서 (2).pptx');
    expect(bundleEntryName({ mgmtNo: null, name: 'A/B 아파트' }, APPROVAL, '확장자없음', used)).toBe('A B 아파트 - 설치승인서');
  });

  it('zip 이름은 짧은 서류 이름과 현장 수 — 나뉘었으면 몇 번째 묶음인지', () => {
    expect(bundleZipName(APPROVAL, 16)).toBe('설치승인서 16개소.zip');
    expect(bundleZipName(APPROVAL, 16, { index: 1, total: 1 })).toBe('설치승인서 16개소.zip');
    expect(bundleZipName(APPROVAL, 4, { index: 2, total: 4 })).toBe('설치승인서 4개소 (2).zip');
  });
});

describe('첨부냐 링크냐 (attachable · bundleLinkLines)', () => {
  it('메일 한 통의 첨부 합계 25MB 까지는 첨부, 넘으면 링크', () => {
    expect(attachable(25 * 1024 * 1024)).toBe(true);
    expect(attachable(25 * 1024 * 1024 + 1)).toBe(false);
    expect(attachable(20 * 1024 * 1024, 6 * 1024 * 1024)).toBe(false);
  });

  it('링크 줄은 크기와 zip 이름 · 주소', () => {
    expect(bundleLinkLines({ name: '설치승인서 16개소.zip', url: 'https://blob/x.zip', size: 40 * 1048576 }))
      .toBe('\n\n첨부 파일이 커서(40.0MB) 내려받기 링크로 보내드립니다.\n설치승인서 16개소.zip: https://blob/x.zip');
    expect(sizeText(340 * 1024)).toBe('340KB');
  });
});

describe('한 통에 들어갈 만큼씩 나누기 (packSites · partBytesOf) — 「B로하자」', () => {
  const MB = 1024 * 1024;

  it('현장을 쪼개지 않고 차례대로, 한 묶음이 상한(99%) 안에 들게', () => {
    /* 현대 16개소 62.6MB 와 비슷한 꼴 — 현장마다 약 4MB, 상한 20MB → 넷 */
    const sizes = Array.from({ length: 16 }, () => 3.9 * MB);
    const parts = packSites(sizes, 20 * MB);
    expect(parts.map((p) => p.length)).toEqual([5, 5, 5, 1]);
    expect(parts.flat()).toEqual(sizes.map((_, i) => i));
  });

  it('한 현장만으로 상한을 넘으면 그 현장 혼자 한 묶음 — 앞뒤는 그대로', () => {
    expect(packSites([2 * MB, 30 * MB, 2 * MB], 20 * MB)).toEqual([[0], [1], [2]]);
    expect(packSites([], 20 * MB)).toEqual([]);
  });

  it('상한은 기본 20MB, 한백이 정하면 5~25MB 안에서', () => {
    expect(partBytesOf(null)).toBe(20 * MB);
    expect(partBytesOf(10)).toBe(10 * MB);
    expect(partBytesOf(100)).toBe(25 * MB);
    expect(partBytesOf(1)).toBe(5 * MB);
  });
});

describe('담당에게 돌려줄 말 (bundleText)', () => {
  const part = (id: string, name: string, size: number, sites: string[], over = false) => ({
    id, zip: { name, url: 'u', size, contentType: 'application/zip' },
    sites: sites.map((n, i) => ({ mgmtNo: `HB-2026-${270 + i}`, name: n, files: 1 })), over,
  });
  const b: BundleResult = {
    slot: APPROVAL,
    limit: 20 * 1048576,
    parts: [part('p1', '설치승인서 2개소 (1).zip', 18 * 1048576, ['호남신학대학교', '단관청솔8차']), part('p2', '설치승인서 1개소 (2).zip', 30 * 1048576, ['효정아파트'], true)],
    missing: ['HB-2026-265'],
    unknown: ['HB-2026-999'],
    otherCpo: ['HB-2026-100'],
  };

  it('묶음마다 id · zip · 크기 · 든 현장, 넘친 묶음은 링크로 — 뺀 것도 다 말한다', () => {
    const t = bundleText(b);
    expect(t).toContain('설치승인서 3곳을 한 통 20.0MB 안으로 2묶음으로 나눴다');
    expect(t).toContain('묶음 1/2 (id=p1) 「설치승인서 2개소 (1).zip」 18.0MB — 2곳: HB-2026-270 호남신학대학교, HB-2026-271 단관청솔8차');
    expect(t).toContain('묶음 2/2 (id=p2)');
    expect(t).toContain('첨부로 못 붙는다. 이 묶음은 link_bundle_ids 로');
    expect(t).toContain('그 칸에 파일이 없어 뺀 현장: HB-2026-265');
    expect(t).toContain('찾지 못한 관리번호: HB-2026-999');
    expect(t).toContain('다른 운영사 현장이라 뺀 것: HB-2026-100');
    expect(bundleText({ ...b, parts: [b.parts[0]], missing: [], unknown: [], otherCpo: [] })).toContain('한 묶음으로 묶었다');
  });
});

describe('도구 — 전기차 담당만 묶고, 묶음은 draft_mail 에 id 로 붙인다', () => {
  const HEC: Agent = { id: 'op-hec', kind: 'operator', biz: 'ev', cpo: '현대엔지니어링', company: null, name: '현대엔지니어링 담당' };
  const names = (tools: unknown[]) => tools.map((t) => (t as { name: string }).name);
  const draftOf = (tools: unknown[]) =>
    tools.find((t) => (t as { name: string }).name === 'draft_mail') as { input_schema: { properties: Record<string, unknown> } };

  it('묶는 손이 이어지면 bundle_site_docs 가 서고 draft_mail 에 attach_bundle_ids · link_bundle_ids, 아니면 없다', () => {
    const bundle = async () => { throw new Error('x'); };
    const tools = toolsOf(HEC, { bundleSiteDocs: bundle });
    expect(names(tools)).toContain('bundle_site_docs');
    expect(Object.keys(draftOf(tools).input_schema.properties)).toEqual(
      expect.arrayContaining(['attach_bundle_ids', 'link_bundle_ids']),
    );
    expect(names(toolsOf(HEC, {}))).not.toContain('bundle_site_docs');
    expect('attach_bundle_ids' in draftOf(toolsOf(HEC, {})).input_schema.properties).toBe(false);
  });
});

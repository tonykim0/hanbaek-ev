/**
 * 여러 현장의 같은 서류를 zip 하나로 — lib/agents/bundle (한백 2026-11-05 「콘솔 프로젝트마다 저장되어있는 파일을 한꺼번에 불러와서
 * 압축해서 이메일로 보내고 싶은데」). 서류 칸 찾기 · zip 안의 이름 · 첨부냐 링크냐 · 담당에게 돌려줄 말.
 */
import { describe, expect, it } from 'vitest';
import {
  attachable, bundleEntryName, bundleLinkLines, bundleSummary, bundleZipName, docSlotOf, sizeText, type BundleResult, type DocSlot,
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

  it('zip 이름은 짧은 서류 이름과 현장 수', () => {
    expect(bundleZipName(APPROVAL, 16)).toBe('설치승인서 16개소.zip');
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

describe('담당에게 돌려줄 말 (bundleSummary)', () => {
  const b: BundleResult = {
    slot: APPROVAL,
    zip: { name: '설치승인서 2개소.zip', url: 'u', size: 3 * 1048576, contentType: 'application/zip' },
    included: [{ mgmtNo: 'HB-2026-270', name: '호남신학대학교', files: 2 }, { mgmtNo: 'HB-2026-271', name: '단관청솔8차', files: 1 }],
    missing: ['HB-2026-265'],
    unknown: ['HB-2026-999'],
    otherCpo: ['HB-2026-100'],
  };

  it('묶은 곳 · 파일 수 · 크기와, 뺀 현장 · 찾지 못한 번호 · 다른 운영사를 다 말한다', () => {
    const s = bundleSummary(b, 'attach');
    expect(s).toContain('설치승인서 2곳 · 파일 3개를 「설치승인서 2개소.zip」(3.0MB)로 묶어 첨부로 붙였다');
    expect(s).toContain('그 칸에 파일이 없어 뺀 현장: HB-2026-265');
    expect(s).toContain('찾지 못한 관리번호: HB-2026-999');
    expect(s).toContain('다른 운영사 현장이라 뺀 것: HB-2026-100');
    expect(bundleSummary({ ...b, missing: [], unknown: [], otherCpo: [] }, 'link')).toContain('25MB 를 넘어 본문 끝에 내려받기 링크로 달았다');
  });
});

describe('도구 — 전기차 담당의 draft_mail 에만 site_docs', () => {
  const HEC: Agent = { id: 'op-hec', kind: 'operator', biz: 'ev', cpo: '현대엔지니어링', company: null, name: '현대엔지니어링 담당' };
  const draftOf = (tools: unknown[]) =>
    tools.find((t) => (t as { name: string }).name === 'draft_mail') as { input_schema: { properties: Record<string, unknown> } };

  it('묶는 손이 이어지면 site_docs 가 서고, 아니면 없다', () => {
    const bundle = async () => { throw new Error('x'); };
    expect('site_docs' in draftOf(toolsOf(HEC, { bundleSiteDocs: bundle })).input_schema.properties).toBe(true);
    expect('site_docs' in draftOf(toolsOf(HEC, {})).input_schema.properties).toBe(false);
  });
});

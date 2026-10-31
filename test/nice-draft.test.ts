/**
 * 나이스인프라 계약서 초안(워드) — 한백 지시 2026-10-31 「계약서 접수할 때 계약서 초안 워드파일 올릴 수 있도록 따로 칸
 * 만들어주고 필수값으로」.
 *
 * ★이 칸이 생긴 뒤에 내는 계약만 필수다★ — 그전에 낸 나이스 현장에 소급해 걸면 계약 확인과 영업비 지급조건이 한꺼번에
 * 막힌다. 접수 ZIP 안의 워드는 판독을 안 타고 운영사로 이 칸에 간다(그전에는 ZIP 에서 꺼내지도 않았다).
 */
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { DOC_KEYS, evaluateDocs, submittedOnOf, type DocContext } from '@/lib/doc-rules';
import { kindOfCategory, wordCategory } from '@/lib/doc-category-map';
import { isKnownDocKind } from '@/lib/data/assemble';
import { contractStateOf } from '@/lib/stage';
import { extractAndHashFromZipBuffer } from '@/lib/files';
import { buildUploadItems } from '@/lib/notion';
import type { ProjectDocument } from '@/types/project';

const ctx = (over: Partial<DocContext>): DocContext => ({
  cpo: '나이스인프라', contractParty: '입주자대표회의', bldgType: '공동주택',
  hasMotherSeparation: false, preInstall: '없음', bizType: '자체투자', submittedOn: null,
  ...over,
});
const draftOf = (c: DocContext) => evaluateDocs(c).find((d) => d.key === 'contractDraft')!;

describe('칸 — 나이스인프라만, 계약서 바로 밑', () => {
  it('★접수 전 나이스 현장에는 필수다★ — 접수 화면도 같은 판정을 본다(submittedOn 없음)', () => {
    expect(draftOf(ctx({}))).toMatchObject({ req: 'm', label: '계약서 초안 (워드)', ext: '.docx' });
  });

  it('계약서 바로 밑에 선다 — 순서가 곧 화면이다', () => {
    const keys = evaluateDocs(ctx({})).map((d) => d.key);
    expect(keys.indexOf('contractDraft')).toBe(keys.indexOf('contract') + 1);
  });

  it('다른 운영사·운영사 모름에는 해당없음이다', () => {
    expect(draftOf(ctx({ cpo: '플러그링크' })).req).toBe('o');
    expect(draftOf(ctx({ cpo: 'SK일렉링크' })).req).toBe('o');
    expect(draftOf(ctx({ cpo: null })).req).toBe('o');
  });

  it('올리고 뺄 수 있는 종류다 — 정의에 더하면 문도 안다', () => {
    expect(DOC_KEYS).toContain('contractDraft');
    expect(isKnownDocKind('contractDraft')).toBe(true);
  });
});

describe('★그전에 낸 현장에 소급하지 않는다★', () => {
  it('11월 1일부터 낸 계약은 필수 · 그전에 낸 계약은 조건부(있으면 받는다)', () => {
    expect(draftOf(ctx({ submittedOn: '2026-11-01' })).req).toBe('m');
    expect(draftOf(ctx({ submittedOn: '2026-11-20' })).req).toBe('m');
    expect(draftOf(ctx({ submittedOn: '2026-10-31' })).req).toBe('c');
    expect(draftOf(ctx({ submittedOn: '2026-09-02' })).req).toBe('c');
  });

  it('접수 선언 없이 확인만 찍힌 옛 현장은 확인일로 본다', () => {
    expect(submittedOnOf({ contractSubmittedAt: null, contractConfirmedAt: '2026-08-24' })).toBe('2026-08-24');
    expect(submittedOnOf({ contractSubmittedAt: '2026-11-03', contractConfirmedAt: '2026-11-05' })).toBe('2026-11-03');
    expect(submittedOnOf({ contractSubmittedAt: null, contractConfirmedAt: null })).toBeNull();
  });

  /* 나머지 필수 칸은 다 찼고 초안만 없는 나이스 현장 */
  const docsBut = (c: DocContext): ProjectDocument[] => evaluateDocs(c)
    .filter((d) => d.req === 'm' && d.key !== 'contractDraft')
    .map((d) => ({
      kind: d.key, files: [], filename: `${d.key}.pdf`, blobUrl: `https://blob/${d.key}.pdf`,
      status: 'uploaded', rejectReason: null, uploadedBy: null, uploadedAt: null,
    }) as unknown as ProjectDocument);
  const stateOf = (c: DocContext) => contractStateOf({ docCtx: c, documents: docsBut(c), lines: [{ pricingRuleId: 'r1' }] });

  it('새로 내는 계약은 초안 없이 「다 냈다」가 안 된다 — 접수·계약 확인·영업비 지급조건이 같이 본다', () => {
    const s = stateOf(ctx({}));
    expect(s.docsFilled).toBe(false);
    expect(s.ready).toBe(false);
    expect(s.payoutDocsMissing).toEqual(['계약서 초안 (워드)']);
  });

  it('그전에 낸 계약은 초안이 없어도 계약 확인·지급이 막히지 않는다', () => {
    const s = stateOf(ctx({ submittedOn: '2026-10-15' }));
    expect(s.docsFilled).toBe(true);
    expect(s.ready).toBe(true);
    expect(s.payoutDocsMissing).toEqual([]);
  });
});

describe('접수 ZIP 안의 워드 — 판독 없이 운영사로 칸을 정한다', () => {
  it('나이스 접수의 워드는 초안 칸 · 다른 운영사·운영사 모름은 기타(버리지 않는다)', () => {
    expect(wordCategory(['나이스인프라'])).toBe('계약서 초안');
    expect(wordCategory(['플러그링크'])).toBe('기타');
    expect(wordCategory([])).toBe('기타');
    expect(wordCategory(null)).toBe('기타');
    expect(kindOfCategory('계약서 초안')).toBe('contractDraft');
  });

  it('★ZIP 에서 워드를 꺼낸다★ — 그전에는 통과 형식에 없어 소리 없이 빠졌다', async () => {
    const zip = new JSZip();
    zip.file('계약서(초안).docx', Buffer.from('PK-word'));
    zip.file('옛 양식.doc', Buffer.from('word97'));
    const files = await extractAndHashFromZipBuffer(await zip.generateAsync({ type: 'nodebuffer' }));
    expect(files.map((f) => [f.name, f.mimeType])).toEqual([
      ['계약서(초안).docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      ['옛 양식.doc', 'application/msword'],
    ]);
  });

  it('나이스 묶음의 워드는 초안 칸에 표준 이름으로 붙는다 — 확장자는 그대로', async () => {
    const word = { name: '계약서(초안).docx', buffer: Buffer.from('PK-word'), hash: 'h', mimeType: 'application/msword' };
    const meta = (cpo: string) => ({ 현장명: '광양 예구', 건축물유형: '공동주택', CPO: [cpo], files: [] }) as never;
    const [nice] = await buildUploadItems([word], meta('나이스인프라'));
    expect(nice).toMatchObject({ category: '계약서 초안', standardName: '광양 예구_계약서초안.docx' });
    const [other] = await buildUploadItems([word], meta('플러그링크'));
    expect(other.category).toBe('기타');
  });
});

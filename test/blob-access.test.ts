/**
 * 파일 문의 판정 — 화면에서 그 파일이 보이는 사람만 받는다(lib/blob/access 머리말). 공개 저장소일 때는 주소를 아는
 * 누구나 받았다 — 이 표가 그 구멍을 막는 자리다.
 */
import { describe, expect, it } from 'vitest';
import { canReadFile, fileScopeOf, type FileViewer } from '@/lib/blob/access';

const admin: FileViewer = { id: 'admin', role: 'admin', org: null };
const viewer: FileViewer = { id: 'finance', role: 'viewer', org: null };
const eco: FileViewer = { id: 'ecoelec', role: 'salesCons', org: '에코일렉', solar: true };
const navy: FileViewer = { id: 'navy', role: 'cons', org: '네이비인프라' };
const orgless: FileViewer = { id: 'nobody', role: 'sales', org: null };

const ecoSite = { project: { salesOrg: '에코일렉', gcOrg: '대상' } };

const can = (v: FileViewer, path: string, facts = {}) => canReadFile(v, fileScopeOf(path), facts);

describe('현장 서류 projects/<현장>/', () => {
  it('한백(관리자 · 열람 전용)은 DB 없이도', () => {
    expect(can(admin, 'projects/HB-2026-1/contract-1.pdf')).toBe(true);
    expect(can(viewer, 'projects/HB-2026-1/contract-1.pdf')).toBe(true);
  });
  it('그 현장의 영업사 · 시공사만', () => {
    expect(can(eco, 'projects/HB-2026-1/contract-1.pdf', ecoSite)).toBe(true);
    expect(can(navy, 'projects/HB-2026-1/contract-1.pdf', ecoSite)).toBe(false);
  });
  it('없는 현장 · 소속 없는 계정은 못 받는다', () => {
    expect(can(eco, 'projects/HB-2026-1/contract-1.pdf', { project: null })).toBe(false);
    expect(can(orgless, 'projects/HB-2026-1/contract-1.pdf', { project: { salesOrg: null, gcOrg: null } })).toBe(false);
  });
});

describe('내 것만 — 임시 자리 · 실사 저장본', () => {
  it('올린 계정만 — 한백도 남의 저장본은 못 받는다', () => {
    expect(can(eco, 'intake-stage/ecoelec/zip-1.zip')).toBe(true);
    expect(can(navy, 'intake-stage/ecoelec/zip-1.zip')).toBe(false);
    expect(can(eco, 'survey-drafts/ecoelec/d1/a.jpg')).toBe(true);
    expect(can(admin, 'survey-drafts/ecoelec/d1/a.jpg')).toBe(false);
  });
});

describe('협력사 서류 · 세금계산서', () => {
  it('사업자등록증 · 통장사본 — 그 협력사와 한백(재무팀 열람 전용 포함)', () => {
    const path = 'partner-docs/ecoelec-bankbook-AbC.pdf';
    expect(can(viewer, path)).toBe(true);
    expect(can(eco, path, { partnerOwner: 'ecoelec' })).toBe(true);
    expect(can(navy, path, { partnerOwner: 'ecoelec' })).toBe(false);
    expect(can(eco, path, { partnerOwner: null })).toBe(false);
  });
  it('세금계산서 — 그 계산서의 협력사와 한백', () => {
    expect(can(eco, 'tax-invoices/u.pdf', { invoiceOrg: '에코일렉' })).toBe(true);
    expect(can(navy, 'tax-invoices/u.pdf', { invoiceOrg: '에코일렉' })).toBe(false);
    expect(can(orgless, 'tax-invoices/u.pdf', { invoiceOrg: null })).toBe(false);
  });
});

describe('그 밖의 자리', () => {
  it('에이전트 파일은 관리자만 — 열람 전용도 아니다', () => {
    expect(can(admin, 'agent-files/settlement/x/a.pdf')).toBe(true);
    expect(can(viewer, 'agent-files/settlement/x/a.pdf')).toBe(false);
    expect(can(eco, 'agent-files/settlement/x/a.pdf')).toBe(false);
  });
  it('공지 파일 — 로그인한 사람, 태양광 공지면 태양광을 보는 사람', () => {
    expect(can(navy, 'notice-files/n1-x.pdf', { noticeBiz: 'ev' })).toBe(true);
    expect(can(navy, 'notice-files/n1-x.pdf', { noticeBiz: 'solar' })).toBe(false);
    expect(can(eco, 'notice-files/n1-x.pdf', { noticeBiz: 'solar' })).toBe(true);
  });
  it('자료실 — 전기차는 누구나, 태양광은 태양광을 보는 사람', () => {
    expect(can(navy, 'materials/nice/sales/a.pdf')).toBe(true);
    expect(can(navy, 'solar-materials/a.pdf')).toBe(false);
    expect(can(eco, 'solar-materials/a.pdf')).toBe(true);
  });
  it('태양광 현장 — 한백과 그 현장의 협력사(태양광 참여)', () => {
    expect(can(eco, 'solar-sites/SL-2026-1/a.pdf', { solarSiteOrg: '에코일렉' })).toBe(true);
    expect(can({ ...eco, solar: false }, 'solar-sites/SL-2026-1/a.pdf', { solarSiteOrg: '에코일렉' })).toBe(false);
    expect(can(navy, 'solar-sites/SL-2026-1/a.pdf', { solarSiteOrg: '에코일렉' })).toBe(false);
  });
  it('제안서 틀은 한백만 · 보관본 · 모르는 자리는 관리자만', () => {
    expect(can(viewer, 'solar-proposals/t/1.pptx')).toBe(true);
    expect(can(eco, 'solar-proposals/t/1.pptx')).toBe(false);
    expect(can(viewer, 'materials-archive/a.pdf')).toBe(false);
    expect(can(admin, 'materials-archive/a.pdf')).toBe(true);
    expect(can(admin, 'form-import-1.pdf')).toBe(true);
    expect(can(eco, 'form-import-1.pdf')).toBe(false);
  });
});

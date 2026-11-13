/**
 * 파일 문(/api/files)의 판정 — 누가 어느 파일을 받는가. 순수(시험은 test/blob-access.test.ts).
 *
 * 공개 저장소일 때는 주소를 아는 사람이 다 받았다. 이제 파일마다 ★그 파일이 붙은 자리를 볼 수 있는 사람만★ 받는다 —
 * 화면에서 그 파일이 보이는 사람과 같게 맞췄다(경로의 첫 마디가 자리를 말한다):
 *
 *   projects/<현장>/            그 현장을 보는 사람(lib/roles canAccessProject — 한백 · 영업사 · 시공사)
 *   intake-stage/<계정>/        올린 계정만(접수 · PDF 분할 · 양식 판독의 임시 자리)
 *   survey-drafts/<계정>/       저장한 계정만(실사보고서 임시 저장 — store/survey-drafts 와 같다)
 *   partner-docs/<계정>-<종류>  그 협력사 · 한백(관리자 · 열람 전용 — 재무팀이 지급 전에 본다)
 *   tax-invoices/<id>           한백 · 그 계산서의 협력사(tax_invoices.org)
 *   agent-files/                한백 관리자만(AI에이전트 화면이 관리자만이다)
 *   notice-files/<공지>         로그인한 사람 — 태양광 공지면 태양광을 보는 사람(lib/biz seesSolar)
 *   materials/                  로그인한 사람(전기차 자료실)
 *   solar-materials/            태양광을 보는 사람(태양광 자료실)
 *   solar-sites/<현장>/         한백 · 그 현장의 협력사(lib/data/solar-sites 와 같다)
 *   solar-proposals/            한백(관리자 · 열람 전용 — 사업자 자료)
 *   그 밖(보관본 *-archive/ · 옮기기 표지 · 옛 루트 파일)   한백 관리자만
 *
 * DB 를 봐야 아는 것(현장의 소속 · 계산서의 협력사 · 공지의 사업 · 태양광 현장의 소속 · 협력사 서류의 주인)은
 * 라우트가 읽어 넘긴다(lib/data/file-scope).
 */
import type { Role } from '@/lib/roles';
import { canAccessProject, isHanbaek } from '@/lib/roles';

export type FileViewer = { id: string; role: Role; org: string | null; solar?: boolean };

/** 경로가 말하는 자리 — DB 를 봐야 판정이 끝나는 것은 열쇠를 같이 준다 */
export type FileScope =
  | { kind: 'project'; projectId: string }
  | { kind: 'own'; ownerId: string }
  | { kind: 'partnerDoc' }
  | { kind: 'taxInvoice' }
  | { kind: 'agent' }
  | { kind: 'notice' }
  | { kind: 'everyone' }
  | { kind: 'solar' }
  | { kind: 'solarSite'; siteId: string }
  | { kind: 'hanbaek' }
  | { kind: 'admin' };

export function fileScopeOf(path: string): FileScope {
  const [top, second] = path.split('/');
  switch (top) {
    case 'projects':
      return second ? { kind: 'project', projectId: second } : { kind: 'admin' };
    case 'intake-stage':
    case 'survey-drafts':
      return second ? { kind: 'own', ownerId: second } : { kind: 'admin' };
    case 'partner-docs':
      return { kind: 'partnerDoc' };
    case 'tax-invoices':
      return { kind: 'taxInvoice' };
    case 'agent-files':
      return { kind: 'agent' };
    case 'notice-files':
      return { kind: 'notice' };
    case 'materials':
      return { kind: 'everyone' };
    case 'solar-materials':
      return { kind: 'solar' };
    case 'solar-sites':
      return second ? { kind: 'solarSite', siteId: second } : { kind: 'admin' };
    case 'solar-proposals':
      return { kind: 'hanbaek' };
    default:
      return { kind: 'admin' };
  }
}

/** DB 에서 읽어 온 그 파일의 자리 — 못 찾았으면 null(그 자리는 한백만 받는다) */
export type FileFacts = {
  project?: { salesOrg: string | null; gcOrg: string | null } | null;
  /** 협력사 서류의 주인 계정 */
  partnerOwner?: string | null;
  /** 세금계산서의 협력사 */
  invoiceOrg?: string | null;
  /** 공지의 사업 */
  noticeBiz?: 'ev' | 'solar' | null;
  /** 태양광 현장의 협력사 */
  solarSiteOrg?: string | null;
};

/** 이 사람이 이 파일을 받는가 */
export function canReadFile(v: FileViewer, scope: FileScope, facts: FileFacts): boolean {
  const hanbaek = isHanbaek(v.role);
  const seesSolar = hanbaek || v.solar === true;
  switch (scope.kind) {
    case 'project':
      return hanbaek || (!!facts.project && canAccessProject(v.role, v.org, facts.project));
    case 'own':
      return v.id === scope.ownerId;
    case 'partnerDoc':
      return hanbaek || (!!facts.partnerOwner && facts.partnerOwner === v.id);
    case 'taxInvoice':
      return hanbaek || (!!v.org && !!facts.invoiceOrg && facts.invoiceOrg === v.org);
    case 'agent':
      return v.role === 'admin';
    case 'notice':
      return facts.noticeBiz === 'solar' ? seesSolar : true;
    case 'everyone':
      return true;
    case 'solar':
      return seesSolar;
    case 'solarSite':
      return hanbaek || (seesSolar && !!v.org && !!facts.solarSiteOrg && facts.solarSiteOrg === v.org);
    case 'hanbaek':
      return hanbaek;
    case 'admin':
      return v.role === 'admin';
  }
}

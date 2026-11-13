/**
 * 파일 문(/api/files)이 판정에 쓰는 DB 사실 — 그 파일이 붙은 자리(lib/blob/access 머리말).
 *
 * 경로만으로 주인을 알 수 없는 자리는 DB 에 적힌 주소에서 경로를 뽑아 견준다 — DB 에는 옛 공개 저장소의 주소와 새
 * 비공개 저장소의 주소가 섞여 있어 주소 문자열로는 못 찾는다. 협력사 서류 · 세금계산서 · 공지 · 태양광 현장은 모두
 * 수십 줄짜리 표라 통째로 읽어 견준다. 현장은 번호로 바로 찾는다.
 */
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { notices, partnerDetails, projects, solarSites, taxInvoices } from '@/lib/db/schema';
import { blobPathOf } from '@/lib/blob/path';
import type { FileFacts, FileScope } from '@/lib/blob/access';
import { isHanbaek, type Role } from '@/lib/roles';

const samePath = (url: string | null | undefined, path: string) => !!url && blobPathOf(url) === path;

/** 판정에 필요한 것만 읽는다 — 한백은 대부분 읽을 것이 없다 */
export async function fileFactsOf(scope: FileScope, path: string, role: Role): Promise<FileFacts> {
  const db = getDb();
  switch (scope.kind) {
    case 'project': {
      if (isHanbaek(role)) return {};
      const [p] = await db.select({ salesOrg: projects.salesOrg, gcOrg: projects.gcOrg }).from(projects).where(eq(projects.id, scope.projectId)).limit(1);
      return { project: p ?? null };
    }
    case 'partnerDoc': {
      if (isHanbaek(role)) return {};
      const rows = await db.select({ userId: partnerDetails.userId, a: partnerDetails.bizCertUrl, b: partnerDetails.bankbookUrl }).from(partnerDetails);
      return { partnerOwner: rows.find((r) => samePath(r.a, path) || samePath(r.b, path))?.userId ?? null };
    }
    case 'taxInvoice': {
      if (isHanbaek(role)) return {};
      const rows = await db.select({ org: taxInvoices.org, url: taxInvoices.blobUrl }).from(taxInvoices);
      return { invoiceOrg: rows.find((r) => samePath(r.url, path))?.org ?? null };
    }
    case 'notice': {
      const rows = await db.select({ biz: notices.biz, files: notices.files }).from(notices);
      const hit = rows.find((r) => (r.files ?? []).some((f) => samePath(f.url, path)));
      return { noticeBiz: hit ? (hit.biz === 'solar' ? 'solar' : 'ev') : null };
    }
    case 'solarSite': {
      if (isHanbaek(role)) return {};
      const [s] = await db.select({ org: solarSites.org }).from(solarSites).where(eq(solarSites.id, scope.siteId)).limit(1);
      return { solarSiteOrg: s?.org ?? null };
    }
    default:
      return {};
  }
}

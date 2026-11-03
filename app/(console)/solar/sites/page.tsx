/**
 * 태양광 현장관리 — 단계 칸의 보드(2026-11-03 시작). 처음에는 /solar 였는데, 같은 날 부지 검토가 들어와 첫 화면을 내주고
 * /solar/sites 로 옮겼다(/solar 는 첫 화면으로 보낸다).
 *
 * ★상담 접수★ (한백 지시 2026-11-03 「현장관리에서 상담 개소 접수 할 수 있도록」) — 현장은 상담 접수로 들어와 상담 칸에 선다.
 * 다음 칸(현장 확인 · 견적·계약 …)으로 넘어가는 일은 아직 없다 — 무엇이 끝나면 넘어가는지 정해지면 붙인다(lib/solar/stages 초안).
 * 한백은 전부, 태양광 참여 협력사는 제 소속의 현장만 본다(lib/data/solar-sites). 열람 전용에게는 접수 단추가 없다.
 */
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BtnLink, Tag } from '@/components/ui';
import { getSessionUser, viewerOf } from '@/lib/auth/session';
import { solarSiteStore } from '@/lib/data/solar-sites';
import { dayOf, elapsedLabel } from '@/lib/date';
import { canWrite, isHanbaek } from '@/lib/roles';
import { SITE_KIND_LABEL } from '@/lib/solar/sites';
import { SOLAR_STAGES } from '@/lib/solar/stages';

export const metadata = { title: '태양광 현장관리' };
export const dynamic = 'force-dynamic';

export default async function SolarSitesPage() {
  const session = await getSessionUser();
  if (!session) redirect('/login?next=/solar/sites');
  const sites = await solarSiteStore.list(viewerOf(session));
  const hanbaek = isHanbaek(session.role);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h1 className="text-h1 font-black text-slate-900">현장관리</h1>
        {canWrite(session.role) && (
          <BtnLink kind="do" size="md" href="/solar/sites/new">
            상담 접수
          </BtnLink>
        )}
      </div>
      {/* 전기차 보드와 같은 칸 모양 — 칸이 많아 좁은 화면에서는 옆으로 민다 */}
      <div className="-mx-5 overflow-x-auto px-5 pb-1 sm:-mx-7 sm:px-7">
        <div
          className="grid min-h-[24rem] gap-3"
          style={{ gridTemplateColumns: `repeat(${SOLAR_STAGES.length}, minmax(168px, 1fr))` }}
        >
          {SOLAR_STAGES.map((s) => {
            // 지금은 모든 현장이 상담이다 — 다음 칸으로 넘어가는 일이 아직 없다
            const here = s.key === 'consult' ? sites : [];
            return (
              <section key={s.key} aria-label={s.label} className="flex min-w-0 flex-col rounded-panel border border-slate-200 bg-slate-50/60 p-2.5">
                <header className="flex items-baseline justify-between gap-2 px-1.5 pb-2">
                  <h3 className="text-base font-black tracking-[-0.01em] text-slate-800">{s.label}</h3>
                  <span className={`text-lead font-black tabular-nums ${here.length ? 'text-slate-800' : 'text-slate-300'}`}>{here.length}</span>
                </header>
                {here.length === 0 ? (
                  <p className="flex flex-1 items-center justify-center rounded-box border border-dashed border-slate-200 text-tiny text-slate-400">
                    0건
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {here.map((site) => (
                      <li key={site.id}>
                        <Link
                          href={`/solar/sites/${site.id}`}
                          className="block rounded-box border border-slate-200 bg-white p-2.5 transition hover:border-brand-300 hover:bg-brand-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
                        >
                          <p className="truncate text-base font-bold text-slate-900">{site.name}</p>
                          <p className="mt-0.5 truncate text-tiny text-slate-500">{site.address}</p>
                          <p className="mt-1.5 flex flex-wrap items-center gap-1">
                            <Tag>{SITE_KIND_LABEL[site.kind]}</Tag>
                            {/* 한백은 전 현장을 본다 — 누구 현장인지 카드에 적는다. 협력사에게는 늘 자기라 안 적는다 */}
                            {hanbaek && <Tag tone={site.org ? 'mute' : 'stage'}>{site.org ?? '한백 직접'}</Tag>}
                            <span className="ml-auto text-micro font-semibold tabular-nums text-slate-500">
                              {elapsedLabel(dayOf(new Date(site.createdAt))) ?? ''}
                            </span>
                          </p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

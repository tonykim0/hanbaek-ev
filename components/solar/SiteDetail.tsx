'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge, Btn, BtnLink, Confirm, Empty, PANEL, TEXT } from '@/components/ui';
import { dayOf } from '@/lib/date';
import { draftOf, SITE_KIND_LABEL, type SolarSite } from '@/lib/solar/sites';
import SiteForm from './SiteForm';

/**
 * 태양광 현장 한 곳 — 평소엔 글자, 「수정」을 눌러야 입력칸(화면 규칙 4). 지우기는 반대쪽 끝(규칙 8)이고 되묻는다.
 * 부지 검토로 가는 길은 주소 · 설치 형태를 들고 간다(/solar/check?q=&mode=) — 상담하며 그 부지를 바로 본다.
 */
export default function SiteDetail({
  site,
  canEdit,
  isAdmin,
  orgs,
  createdByName,
}: {
  site: SolarSite;
  /** 한백 관리자 · 그 현장의 담당 협력사 */
  canEdit: boolean;
  isAdmin: boolean;
  orgs: string[];
  /** 접수한 사람 — 계정 이름(없으면 로그인 ID) */
  createdByName: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/solar/sites/${site.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        setError(b.error ?? '지우지 못했습니다.');
        return;
      }
      router.push('/solar/sites');
      router.refresh();
    } catch {
      setError('네트워크 오류입니다. 다시 시도해주세요.');
    } finally {
      setBusy(false);
    }
  }

  const review = `/solar/check?${new URLSearchParams({ q: site.address, mode: site.kind })}`;
  const facts: [string, React.ReactNode][] = [
    ['주소', site.address],
    ['설치 형태', SITE_KIND_LABEL[site.kind]],
    ['고객 담당자', site.customer ?? <Empty kind="wait" />],
    ['연락처', site.phone ?? <Empty kind="wait" />],
    ['담당 협력사', site.org ?? '한백 직접'],
    ['접수', `${dayOf(new Date(site.createdAt))} · ${createdByName}`],
  ];

  return (
    <div className="max-w-3xl">
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <h1 className="text-h1 font-black text-slate-900">{site.name}</h1>
        <Badge tone="stage">상담</Badge>
        <span className={`${TEXT.meta} tabular-nums`}>{site.id}</span>
      </div>

      <div className={`${PANEL} p-5`}>
        {editing ? (
          <SiteForm siteId={site.id} initial={draftOf(site)} orgs={orgs} isAdmin={isAdmin} onDone={() => setEditing(false)} />
        ) : (
          <>
            <dl className="grid grid-cols-[6.5rem_1fr] gap-x-4 gap-y-2.5">
              {facts.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className={TEXT.label}>{label}</dt>
                  <dd className={TEXT.body}>{value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 border-t border-slate-100 pt-4">
              <p className={TEXT.label}>상담 메모</p>
              <p className={`mt-1.5 whitespace-pre-line ${TEXT.body}`}>{site.memo ?? <Empty kind="wait" />}</p>
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              <BtnLink kind="do" size="md" href={review}>
                부지 검토
              </BtnLink>
              {canEdit && (
                <Btn kind="quiet" onClick={() => setEditing(true)}>
                  수정
                </Btn>
              )}
              {canEdit && (
                <span className="ml-auto">
                  <Btn kind="undo" onClick={() => setAsking(true)}>
                    현장 지우기
                  </Btn>
                </span>
              )}
            </div>
          </>
        )}
      </div>

      <Confirm
        open={asking}
        title={`${site.name} 을(를) 지울까요?`}
        detail={`${site.id} 의 상담 기록이 사라집니다. 번호는 다시 쓰지 않습니다.`}
        confirmLabel="지우기"
        busy={busy}
        busyLabel="지우는 중…"
        error={error}
        onConfirm={remove}
        onCancel={() => {
          setAsking(false);
          setError(null);
        }}
      />
    </div>
  );
}

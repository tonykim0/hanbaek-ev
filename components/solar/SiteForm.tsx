'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Btn, Choice, Err, FIELD, TEXT } from '@/components/ui';
import { SITE_DIRECT, SITE_KIND_LABEL, SITE_KINDS, SITE_LIMITS, type SiteDraft } from '@/lib/solar/sites';

/**
 * 상담 접수 · 고치기 폼 — 같은 칸, 같은 규칙(lib/solar/sites cleanSiteInput — 서버가 한 번 더 본다).
 *
 * 담당 협력사는 한백 관리자에게만 선다 — 협력사가 접수하면 제 소속이 담당이다(저장소가 정한다, 보낸 값을 안 본다).
 * 고르는 목록은 태양광 참여를 켠 협력사다(계정설정). 「한백 직접」은 한백이 손님을 바로 받은 현장이다.
 */
export default function SiteForm({
  siteId,
  initial,
  orgs,
  isAdmin,
  onDone,
}: {
  /** 있으면 고치기, 없으면 새 접수 */
  siteId?: string;
  initial: SiteDraft;
  /** 담당으로 고를 수 있는 협력사 — 한백 관리자에게만 */
  orgs: string[];
  isAdmin: boolean;
  /** 고치기를 마치면(또는 취소) — 글자로 돌아간다 */
  onDone?: () => void;
}) {
  const router = useRouter();
  const [d, setD] = useState<SiteDraft>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof SiteDraft>(k: K, v: SiteDraft[K]) => setD((x) => ({ ...x, [k]: v }));

  const missing = !d.name.trim() ? '현장명' : !d.address.trim() ? '주소' : !d.kind ? '설치 형태' : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (missing || busy) return;
    setBusy(true);
    setError(null);
    const body = {
      name: d.name,
      address: d.address,
      kind: d.kind,
      customer: d.customer,
      phone: d.phone,
      memo: d.memo,
      ...(isAdmin ? { org: d.org || null } : {}),
    };
    try {
      const res = await fetch(siteId ? `/api/solar/sites/${siteId}` : '/api/solar/sites', {
        method: siteId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const got = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!res.ok) {
        setError(got.error ?? (siteId ? '고치지 못했습니다.' : '접수하지 못했습니다.'));
        return;
      }
      if (siteId) {
        router.refresh();
        onDone?.();
      } else if (got.id) {
        // 접수한 현장으로 간다 — 적은 것을 바로 보고, 보드의 상담 칸에도 섰다
        router.push(`/solar/sites/${got.id}`);
        router.refresh();
      }
    } catch {
      setError('네트워크 오류입니다. 다시 시도해주세요.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} aria-label={siteId ? '현장 고치기' : '상담 접수'} className="grid gap-4">
      <Field label="현장명" need>
        <input className={FIELD} value={d.name} maxLength={SITE_LIMITS.name} placeholder="상호 · 건물명" onChange={(e) => set('name', e.target.value)} />
      </Field>
      <Field label="주소" need>
        <input className={FIELD} value={d.address} maxLength={SITE_LIMITS.address} placeholder="도로명 · 지번 주소" onChange={(e) => set('address', e.target.value)} />
      </Field>
      {/* 고르는 칩은 label 로 감싸지 않는다 — 이름을 누르면 첫 칩이 눌린다 */}
      <div role="group" aria-label="설치 형태" className="grid gap-1.5">
        <FieldName label="설치 형태" need />
        <div className="flex gap-1.5">
          {SITE_KINDS.map((k) => (
            <Choice key={k} on={d.kind === k} onClick={() => set('kind', k)}>
              {SITE_KIND_LABEL[k]}
            </Choice>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="고객 담당자">
          <input className={FIELD} value={d.customer} maxLength={SITE_LIMITS.customer} onChange={(e) => set('customer', e.target.value)} />
        </Field>
        <Field label="연락처">
          <input className={FIELD} value={d.phone} maxLength={SITE_LIMITS.phone} inputMode="tel" onChange={(e) => set('phone', e.target.value)} />
        </Field>
      </div>
      <Field label="상담 메모">
        <textarea className={`${FIELD} min-h-[6rem]`} value={d.memo} maxLength={SITE_LIMITS.memo} onChange={(e) => set('memo', e.target.value)} />
      </Field>
      {isAdmin && (
        <Field label="담당 협력사">
          <select className={`${FIELD} cursor-pointer`} value={d.org} onChange={(e) => set('org', e.target.value)}>
            <option value={SITE_DIRECT}>한백 직접</option>
            {orgs.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
            {/* 지금 담당이 참여를 끈 협력사여도 목록에서 사라지지 않게 — 그대로 두면 그대로다 */}
            {d.org && !orgs.includes(d.org) && <option value={d.org}>{d.org}</option>}
          </select>
        </Field>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {/* 못 하는 이유를 단추 이름에(화면 규칙 3) */}
        <Btn type="submit" disabled={!!missing} busy={busy} busyLabel={siteId ? '저장 중…' : '접수 중…'}>
          {missing ? `${missing} 필요` : siteId ? '저장' : '상담 접수'}
        </Btn>
        {onDone && (
          <Btn kind="quiet" onClick={onDone} disabled={busy}>
            취소
          </Btn>
        )}
        <Err>{error}</Err>
      </div>
    </form>
  );
}

function FieldName({ label, need = false }: { label: string; need?: boolean }) {
  return (
    <span className={TEXT.label}>
      {label}
      {need && <span className="ml-1 text-red-700">*</span>}
    </span>
  );
}

function Field({ label, need = false, children }: { label: string; need?: boolean; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <FieldName label={label} need={need} />
      {children}
    </label>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import { useAddressSearch, type PostcodeData } from '@/components/contracts/AddressSearchButton';
import { Btn, Choice, Empty, Err, FIELD, FIELD_BASE, TEXT } from '@/components/ui';
import { sizeLabel } from '@/lib/file-kind';
import { uploadSiteFile } from '@/lib/solar/site-upload';
import { SITE_KIND_LABEL, SITE_KINDS, SITE_LIMITS, type SiteDraft } from '@/lib/solar/sites';
import { uploadEach } from '@/lib/upload-each';

/**
 * 상담 접수 · 고치기 폼 — 같은 칸, 같은 규칙(lib/solar/sites cleanSiteInput — 서버가 한 번 더 본다).
 *
 * ★담당 협력사★ — 협력사의 폼에는 칸이 없다: 제 계정의 소속이 담당이다(저장소가 정한다 · 한백 지시 2026-11-03 「담당협력사는
 * 해당 계정으로 로그인한 협력사만 · 한백 직접은 없어」). 한백 관리자의 폼에만 칩으로 선다(`orgs` — 태양광 참여 협력사의 소속,
 * 11-04 「한백도 접수하게해줘」). 반드시 하나를 고른다 — 「한백 직접」은 없다. 고치기에서도 한백만 바꾼다.
 *
 * ★주소는 검색해서 고른다★ (같은 날 「계약서 작성할 때처럼 주소 검색하게」) — 계약서 양식과 같은 카카오(다음) 우편번호 검색
 * (components/contracts/AddressSearchButton 의 useAddressSearch)이 도로명주소를 넣는다. 칸은 열어 둔다(동 · 호 같은 꼬리를 붙이게).
 * 고른 주소에 건물명이 있고 현장명이 비어 있으면 그 이름을 현장명에 넣는다.
 *
 * ★파일★ (2026-11-03 「상담접수할 때 파일도 올릴 수 있도록」) — 접수할 때 고른 파일은 현장이 생긴 뒤에 한 장씩 올린다(자리가
 * 현장 번호 아래라 번호가 먼저 있어야 한다). 못 올린 장이 있어도 접수는 된 것이라 상세로 가서 그 수를 알린다(?unsent=) —
 * 거기서 다시 올린다. 고치기에는 이 칸이 없다 — 상세의 「파일」 구역이 그 자리다.
 */
export default function SiteForm({
  siteId,
  initial,
  orgs,
  onDone,
}: {
  /** 있으면 고치기, 없으면 새 접수 */
  siteId?: string;
  initial: SiteDraft;
  /** 한백 관리자에게만 — 담당으로 고를 태양광 참여 협력사의 소속. 없으면(협력사) 담당 칸을 그리지 않는다 */
  orgs?: readonly string[];
  /** 고치기를 마치면(또는 취소) — 글자로 돌아간다 */
  onDone?: () => void;
}) {
  const router = useRouter();
  const [d, setD] = useState<SiteDraft>(initial);
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<File[]>([]);
  const picker = useRef<HTMLInputElement>(null);
  const set = <K extends keyof SiteDraft>(k: K, v: SiteDraft[K]) => setD((x) => ({ ...x, [k]: v }));

  const onPicked = useCallback((address: string, data?: PostcodeData) => {
    setD((x) => ({ ...x, address, name: x.name.trim() || data?.buildingName?.trim() || x.name }));
  }, []);
  const search = useAddressSearch(onPicked);

  const picksOrg = orgs !== undefined;
  const missing = picksOrg && !d.org ? '담당 협력사' : !d.name.trim() ? '현장명' : !d.address.trim() ? '주소' : !d.kind ? '설치 형태' : null;

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
      // 담당은 한백만 보낸다 — 협력사가 보내면 저장소가 막는다(제 소속이 담당이다)
      ...(picksOrg ? { org: d.org } : {}),
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
        const id = got.id;
        const unsent = (await uploadEach(picked, (f, onPct) => uploadSiteFile(id, f, onPct), (i, n, pct) => setBusyLabel(`첨부파일 올리는 중 ${i + 1}/${n} · ${pct}%`))).failed.length;
        // 접수한 현장으로 간다 — 적은 것을 바로 보고, 보드의 상담 칸에도 섰다
        router.push(`/solar/sites/${got.id}${unsent ? `?unsent=${unsent}` : ''}`);
        router.refresh();
      }
    } catch {
      setError('네트워크 오류입니다. 다시 시도해주세요.');
    } finally {
      setBusy(false);
      setBusyLabel(null);
    }
  }

  return (
    <form onSubmit={submit} aria-label={siteId ? '현장 고치기' : '상담 접수'} className="grid gap-4">
      {picksOrg && (
        <div role="group" aria-label="담당 협력사" className="grid gap-1.5">
          <FieldName label="담당 협력사" need />
          {orgs.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {orgs.map((o) => (
                <Choice key={o} on={d.org === o} onClick={() => set('org', o)}>
                  {o}
                </Choice>
              ))}
            </div>
          ) : (
            // 고를 것이 없다 — 계정설정에서 협력사의 「태양광」을 켜야 담당이 된다
            <Empty kind="miss" label="태양광 참여 협력사 0곳" />
          )}
        </div>
      )}
      <Field label="현장명" need>
        <input className={FIELD} value={d.name} maxLength={SITE_LIMITS.name} placeholder="상호 · 건물명" onChange={(e) => set('name', e.target.value)} />
      </Field>
      {/* 주소 칸과 검색 단추 — 단추를 label 안에 두지 않는다(이름을 누르면 단추가 눌린다) */}
      <div className="grid gap-1.5">
        <FieldName label="주소" need />
        <div className="flex items-start gap-2">
          <input
            aria-label="주소"
            className={`${FIELD_BASE} min-w-0 flex-1`}
            value={d.address}
            maxLength={SITE_LIMITS.address}
            placeholder="「주소 검색」으로 도로명주소를 고르세요"
            onChange={(e) => set('address', e.target.value)}
          />
          <Btn kind="side" disabled={busy} busy={search.loading} busyLabel="여는 중…" onClick={() => void search.open()} className="shrink-0 whitespace-nowrap">
            주소 검색
          </Btn>
        </div>
        <Err>{search.error}</Err>
      </div>
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
      {!siteId && (
        <div role="group" aria-label="첨부파일" className="grid gap-1.5">
          <FieldName label="첨부파일" />
          <div>
            <Btn kind="side" size="sm" disabled={busy} onClick={() => picker.current?.click()}>
              파일 고르기
            </Btn>
            <input
              ref={picker}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                const list = [...(e.target.files ?? [])];
                e.target.value = '';
                setPicked((x) => [...x, ...list]);
              }}
            />
          </div>
          {picked.length > 0 && (
            <ul>
              {picked.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center gap-3 border-t border-slate-100 py-1.5 first:border-t-0">
                  <span className={`min-w-0 truncate ${TEXT.body}`}>{f.name}</span>
                  <span className={`shrink-0 tabular-nums ${TEXT.meta}`}>{sizeLabel(f.size)}</span>
                  <span className="ml-auto shrink-0">
                    <Btn kind="undo" size="sm" disabled={busy} onClick={() => setPicked((x) => x.filter((_, j) => j !== i))}>
                      빼기
                    </Btn>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {/* 못 하는 이유를 단추 이름에(화면 규칙 3) */}
        <Btn type="submit" disabled={!!missing} busy={busy} busyLabel={busyLabel ?? (siteId ? '저장 중…' : '접수 중…')}>
          {missing ? `${missing} 필요` : siteId ? '저장' : picked.length ? `상담 접수 · 첨부파일 ${picked.length}개` : '상담 접수'}
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

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Btn, Choice, Err, FIELD, Tag } from '@/components/ui';
import type { ProposalTemplate } from '@/lib/data/solar-proposals';
import { today } from '@/lib/date';
import type { LngLat } from '@/lib/solar/geo';
import { capacityKw, kwText } from '@/lib/solar/proposal/calc';
import { buildProposal, saveProposalTerms, uploadProposalTemplate } from '@/lib/solar/proposal/client';
import { proposalFileName, type ProposalInput } from '@/lib/solar/proposal/fill-common';
import { proposalLayout, type ProposalLayout } from '@/lib/solar/proposal/layout-rule';
import { missingTerms, PRODUCTS, productOf, TEMPLATES, TEMPLATE_KEYS, UPCOMING, type ProductKey, type TemplateKey, type TermField, type Terms } from '@/lib/solar/proposal/products';
import type { Report } from '@/lib/solar/types';
import { siteImager } from './proposal-image';
import { PANEL, TEXT } from './ui';
import { fetchRoofTrace, type RoofPlan } from './useRoofPlan';

const COMPANIES = Array.from(new Set([...PRODUCTS, ...UPCOMING].map((p) => p.company)));
type Phase = null | 'roofs' | 'build';
/** 마지막으로 쓴 영업사 · 연락처 — 이 브라우저에만(같은 사람이 제안서를 여러 장 짓는다). 못 읽으면 빈칸으로 시작한다 */
const SELLER_KEY = 'hb-proposal-seller';
function loadSeller(): { name: string; contact: string } {
  try {
    const v = JSON.parse(localStorage.getItem(SELLER_KEY) ?? 'null') as { name?: unknown; contact?: unknown } | null;
    return { name: typeof v?.name === 'string' ? v.name : '', contact: typeof v?.contact === 'string' ? v.contact : '' };
  } catch {
    return { name: '', contact: '' };
  }
}
function saveSeller(s: { name: string; contact: string }): void {
  try {
    localStorage.setItem(SELLER_KEY, JSON.stringify(s));
  } catch {
    // 저장소를 못 쓰는 브라우저 — 다음에 다시 적으면 된다
  }
}

/**
 * 제안서 — 부지 검토 결과(지붕형)에서 고객명 · 주소를 넣고 사업자 · 상품을 고르면 그 사업자의 틀에 현장 칸을 채운 PPTX 를 받는다
 * (한백 2026-11-06 「고객 주소랑 고객명 넣고, 사업자 선택하면 제안서가 자동생성되게」 · 「수정가능하게」).
 *
 * 용량은 지도에서 고른 AI 지붕에 그 사업자의 설계 기준(경사각 · 줄 간격 — 조건)으로 다시 깐 패널 장수 × 그 사업자의 모듈 출력이다
 * (lib/solar/proposal/layout-rule — 지도의 장수는 콘솔 기준이라 상품마다 다를 수 있다). 아직 AI 로 지붕을 안 찾았으면 먼저 찾는다(같은 단추).
 * 지도에서 지붕을 빼고 넣은 것이 그대로 실린다. 짓는 일은 브라우저가 한다(틀 파일을 받아 채운다) — 서버에는 아무것도 남지 않는다.
 * 한백의 눈(관리자 · 열람 전용)만 본다. 틀 올리기 · 조건 고치기는 한백 관리자만(밑의 「틀 · 조건」).
 */
export default function ProposalPanel({ report, plan, canManage }: { report: Report; plan: RoofPlan; canManage: boolean }) {
  const { place } = report;
  const [customer, setCustomer] = useState(place.buildingName ?? '');
  const [address, setAddress] = useState(place.roadAddress ?? place.jibunAddress ?? place.query);
  const [sellerName, setSellerName] = useState('');
  const [sellerContact, setSellerContact] = useState('');
  useEffect(() => {
    const s = loadSeller();
    setSellerName(s.name);
    setSellerContact(s.contact);
  }, []);
  const [product, setProduct] = useState<ProductKey | null>(null);
  const [templates, setTemplates] = useState<ProposalTemplate[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>(null);
  const [step, setStep] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch('/api/solar/proposals')
      .then(async (r) => {
        const b = (await r.json().catch(() => ({}))) as { templates?: ProposalTemplate[]; error?: string };
        if (!r.ok || !b.templates) throw new Error(b.error ?? `템플릿을 읽지 못했습니다 (${r.status})`);
        if (live) setTemplates(b.templates);
      })
      .catch((err) => live && setLoadError(err instanceof Error ? err.message : String(err)));
    return () => {
      live = false;
    };
  }, []);

  const templateOf = (key: TemplateKey) => templates?.find((t) => t.key === key) ?? null;
  const stateOf = (key: TemplateKey): string | null => {
    const t = templateOf(key);
    if (!t) return null;
    if (!t.file) return '템플릿 없음';
    return missingTerms(key, t.terms).length ? '조건 미지정' : null;
  };
  const chosen = product ? productOf(product) : null;
  const lat = report.map?.point.lat ?? 36.5;
  // 고른 상품의 사업자 기준으로 다시 깐 배치 — 단추 옆에 장수 · 용량을 보이고, 지을 때도 같은 셈을 한다
  const chosenTerms = chosen ? (templateOf(chosen.template)?.terms as Terms | undefined) : undefined;
  const termsReady = !!chosen && !!chosenTerms && !missingTerms(chosen.template, chosenTerms).length;
  const layoutFor = useCallback(
    (terms: Terms): ProposalLayout =>
      proposalLayout(
        plan.roofs.filter((r) => plan.selected.has(r.id)),
        plan.cuts.map((c) => c.polygons),
        plan.style,
        lat,
        terms,
      ),
    [plan.roofs, plan.selected, plan.cuts, plan.style, lat],
  );
  const preview = useMemo(() => (termsReady && plan.roofs.length ? layoutFor(chosenTerms!) : null), [termsReady, chosenTerms, plan.roofs.length, layoutFor]);
  // 못 짓는 까닭 — 위에서부터 처음 걸리는 것 하나를 단추에 적는다
  const blocker =
    ([
      [!templates, '템플릿 읽는 중'],
      [!customer.trim(), '고객명 없음'],
      [!address.trim(), '주소 없음'],
      [!sellerName.trim(), '영업사 없음'],
      [!sellerContact.trim(), '연락처 없음'],
      [!chosen, '상품 미선택'],
    ] as const).find(([hit]) => hit)?.[1] ??
    (chosen ? stateOf(chosen.template) : null) ??
    (!place.pnu ? '필지 없음' : null);

  // ── 짓기 — 지붕이 없으면 먼저 AI 로 찾고(그 뒤 배치가 다시 그려진 다음에) 짓는다 ───────
  const start = async () => {
    if (blocker || phase) return;
    setError(null);
    setDone(null);
    if (!plan.roofs.length) {
      setPhase('roofs');
      setStep('AI가 지붕 찾는 중…');
      try {
        plan.applyTrace(await fetchRoofTrace(place.pnu!));
      } catch (err) {
        setPhase(null);
        // 라우트의 실패 문구가 이미 「지붕을 찾지 못했습니다 — …」로 온다 — 두 번 붙이지 않는다
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg.startsWith('지붕을 찾지 못했습니다') ? msg : `지붕을 찾지 못했습니다 — ${msg}`);
        return;
      }
    }
    setPhase('build');
  };

  const building = useRef(false);
  const build = useCallback(async () => {
    if (!chosen || !templates || building.current) return;
    building.current = true;
    try {
      const template = templateOf(chosen.template)!;
      const lay = layoutFor(template.terms as Terms);
      if (!lay.count) throw new Error('고른 지붕에 패널이 없습니다 — 지도에서 지붕을 고르세요.');
      setStep('항공사진 받는 중…');
      const extent: LngLat[] = plan.roofs.filter((r) => plan.selected.has(r.id)).flatMap((r) => r.polygons.flatMap((poly) => poly[0] ?? []));
      const image = await siteImager(lay.quads, extent);
      const best = report.grid && report.grid.best !== null ? report.grid.rows[report.grid.best] : null;
      const input: ProposalInput = {
        customer: customer.trim(),
        address: address.trim(),
        panels: lay.count,
        mount: { style: plan.style, tiltDeg: lay.tiltDeg },
        shadeDeg: lay.shadeDeg,
        gridSpareKw: best?.spareKw ?? null,
        today: today(),
        seller: { name: sellerName.trim(), contact: sellerContact.trim() },
        image,
      };
      setStep(chosen.template === 'lumora-rent' ? '쪽 굽는 중…' : '제안서 짓는 중…');
      const blob = await buildProposal(chosen.key, template, input);
      const name = proposalFileName(input.customer, `${chosen.company} ${chosen.label}`, input.today);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      saveSeller(input.seller);
      const kw = capacityKw(lay.count, (template.terms.moduleWatt as number) ?? 0);
      setDone(`받았습니다 — ${name} · 패널 ${lay.count.toLocaleString()}장 · ${kwText(kw)} kW`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      building.current = false;
      setPhase(null);
      setStep('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 그때의 값으로 한 번
  }, [chosen, templates, plan, customer, address, sellerName, sellerContact, report, layoutFor]);

  // AI 로 지붕을 찾은 뒤 배치가 다시 그려지면(plan 이 바뀐다) 그 배치로 짓는다
  useEffect(() => {
    if (phase === 'build') void build();
  }, [phase, build]);

  return (
    <section className={PANEL} aria-label="제안서">
      <h2 className={`border-b border-slate-100 px-5 py-3 ${TEXT.head}`}>제안서</h2>
      <div className="space-y-4 px-5 py-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={TEXT.label}>고객명</span>
            <input value={customer} onChange={(e) => setCustomer(e.target.value)} maxLength={60} placeholder="(주)OO" className={`mt-1 ${FIELD}`} />
          </label>
          <label className="block">
            <span className={TEXT.label}>고객 주소</span>
            <input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} className={`mt-1 ${FIELD}`} />
          </label>
          <label className="block">
            <span className={TEXT.label}>영업사</span>
            <input value={sellerName} onChange={(e) => setSellerName(e.target.value)} maxLength={40} placeholder="(주)OO에너지" className={`mt-1 ${FIELD}`} />
          </label>
          <label className="block">
            <span className={TEXT.label}>연락처</span>
            <input
              value={sellerContact}
              onChange={(e) => setSellerContact(e.target.value)}
              maxLength={60}
              placeholder="홍길동 010-0000-0000"
              className={`mt-1 ${FIELD}`}
            />
          </label>
        </div>

        <div className="space-y-2">
          {COMPANIES.map((company) => (
            <div key={company} className="flex flex-wrap items-center gap-2">
              <span className={`w-24 shrink-0 ${TEXT.item}`}>{company}</span>
              {PRODUCTS.filter((p) => p.company === company).map((p) => {
                const s = stateOf(p.template);
                return (
                  <Choice key={p.key} on={product === p.key} onClick={() => setProduct(p.key)}>
                    {p.label}
                    {s && <span className="ml-1.5 font-normal text-amber-700">· {s}</span>}
                  </Choice>
                );
              })}
              {/* 템플릿을 아직 못 받은 상품 — 못 고르는 칩(lib/solar/proposal/products UPCOMING) */}
              {UPCOMING.filter((u) => u.company === company).map((u) => (
                <Choice key={u.label} on={false} disabled>
                  {u.label}
                  <span className="ml-1.5 font-normal">· {u.why}</span>
                </Choice>
              ))}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
          <Btn onClick={() => void start()} disabled={!!blocker} busy={phase !== null} busyLabel={step || '짓는 중…'}>
            {blocker ? `${blocker} — 제안서 불가` : '제안서 만들기 (PPTX)'}
          </Btn>
          {preview && preview.count > 0 && chosenTerms && (
            <span className={`tabular-nums ${TEXT.label}`}>
              패널 {preview.count.toLocaleString()}장 · {kwText(capacityKw(preview.count, chosenTerms.moduleWatt))} kW ·{' '}
              {plan.style === 'flush' ? '지붕면 부착형' : `경사 ${preview.tiltDeg}° · 음영각 ${preview.shadeDeg}°`}
            </span>
          )}
          <Err>{error ?? loadError}</Err>
          {done && <span className={TEXT.body}>{done}</span>}
        </div>

        {canManage && templates && <TemplateAdmin templates={templates} onChange={(t) => setTemplates((all) => all?.map((x) => (x.key === t.key ? t : x)) ?? null)} />}
      </div>
    </section>
  );
}

/** 조건 한 칸의 글 — 없으면 「—」, 0 이 콘솔 기본인 칸은 그 말 */
const termText = (f: TermField, v: unknown): string =>
  typeof v !== 'number' ? '—' : v === 0 && f.zeroText ? f.zeroText : `${v.toLocaleString('ko-KR')}${f.unit}`;

/** 틀 · 조건 — 한백 관리자. 틀마다 한 줄: 파일(올리기 · 바꾸기) · 조건(고치기) */
function TemplateAdmin({ templates, onChange }: { templates: ProposalTemplate[]; onChange: (t: ProposalTemplate) => void }) {
  return (
    <details className="border-t border-slate-100 pt-3">
      <summary className={`cursor-pointer ${TEXT.label}`}>템플릿 · 조건</summary>
      <ul className="mt-2 divide-y divide-slate-100">
        {TEMPLATE_KEYS.map((key) => (
          <TemplateRow key={key} template={templates.find((t) => t.key === key)!} onChange={onChange} />
        ))}
      </ul>
    </details>
  );
}

function TemplateRow({ template, onChange }: { template: ProposalTemplate; onChange: (t: ProposalTemplate) => void }) {
  const def = TEMPLATES[template.key];
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const upload = async (file: File) => {
    setError(null);
    setBusy('올리는 중…');
    try {
      onChange(await uploadProposalTemplate(template.key, file, (pct) => setBusy(`올리는 중 ${pct}%`)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
  };
  const openTerms = () => {
    setDraft(Object.fromEntries(def.terms.map((f) => [f.key, typeof template.terms[f.key] === 'number' ? String(template.terms[f.key]) : ''])));
    setError(null);
    setEditing(true);
  };
  const saveTerms = async () => {
    setError(null);
    setBusy('저장 중…');
    try {
      onChange(await saveProposalTerms(template.key, draft));
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };
  const missing = missingTerms(template.key, template.terms);

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className={TEXT.item}>
          {def.company} {def.title}
        </span>
        {template.file ? (
          <span className={TEXT.label}>
            {template.file.name} · {template.file.at.slice(0, 10)}
          </span>
        ) : (
          <Tag tone="warn">템플릿 없음</Tag>
        )}
        <input ref={fileRef} type="file" accept={def.file === 'pptx' ? '.pptx' : '.pdf'} className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
        <Btn size="sm" kind="quiet" onClick={() => fileRef.current?.click()} busy={busy?.startsWith('올리는') ?? false} busyLabel={busy ?? undefined}>
          {template.file ? '템플릿 바꾸기' : '템플릿 올리기'}
        </Btn>
        {!editing && (
          <Btn size="sm" kind="quiet" onClick={openTerms}>
            조건 고치기
          </Btn>
        )}
      </div>
      {!editing && (
        <p className={`mt-1 ${TEXT.body}`}>
          {missing.length === def.terms.length ? (
            <Tag tone="warn">조건 미지정</Tag>
          ) : (
            def.terms.map((f) => `${f.label} ${termText(f, template.terms[f.key])}`).join(' · ')
          )}
        </p>
      )}
      {editing && (
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {def.terms.map((f) => (
            <label key={f.key} className="block">
              <span className={TEXT.label}>
                {f.label} ({f.unit}
                {f.zeroText ? ` · 0 = ${f.zeroText}` : ''})
              </span>
              <input
                inputMode="decimal"
                value={draft[f.key] ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                className={`mt-1 tabular-nums ${FIELD}`}
              />
            </label>
          ))}
          <div className="flex items-center gap-2 sm:col-span-3">
            <Btn size="sm" onClick={() => void saveTerms()} busy={busy === '저장 중…'} busyLabel="저장 중…">
              저장
            </Btn>
            <Btn size="sm" kind="quiet" onClick={() => setEditing(false)}>
              취소
            </Btn>
          </div>
        </div>
      )}
      <Err className="mt-1 block">{error}</Err>
    </li>
  );
}

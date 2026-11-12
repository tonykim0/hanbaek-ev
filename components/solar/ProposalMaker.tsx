'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Btn, Choice, Err, FIELD, SectionHead } from '@/components/ui';
import { formatKoreanPhone } from '@/lib/contract-form';
import type { ProposalTemplate } from '@/lib/data/solar-proposals';
import { today } from '@/lib/date';
import { downloadBlob } from '@/lib/download';
import type { LngLat } from '@/lib/solar/geo';
import { capacityKw, kwText } from '@/lib/solar/proposal/calc';
import { proposalBlocker } from '@/lib/solar/proposal/blocker';
import { buildProposal, fetchProposalTemplates } from '@/lib/solar/proposal/client';
import { proposalFileName, storedSeller, type ProposalInput, type Seller } from '@/lib/solar/proposal/fill-common';
import { proposalLayout, type ProposalLayout } from '@/lib/solar/proposal/layout-rule';
import { siteQueryOf, traceKeyOf } from '@/lib/solar/parcels';
import { PARTIES, PARTY_LABEL, type Party } from '@/lib/solar/proposal/party';
import { missingTerms, PRODUCTS, productOf, TEMPLATES, termOf, UPCOMING, type ProductKey, type TemplateKey, type Terms } from '@/lib/solar/proposal/products';
import type { Report } from '@/lib/solar/types';
import { SearchBox } from './Checker';
import ParcelBar from './ParcelBar';
import { siteImager } from './proposal-image';
import ProposalTemplates from './ProposalTemplates';
import SiteMap from './SiteMap';
import { PANEL, TEXT } from './ui';
import { useRoofPlan } from './useRoofPlan';
import { useSiteReport } from './useSiteReport';

const COMPANIES = Array.from(new Set([...PRODUCTS, ...UPCOMING].map((p) => p.company)));

/** 마지막으로 쓴 영업사 · 담당자명 · 연락처 — 이 브라우저에만(같은 사람이 제안서를 여러 장 짓는다). 못 읽으면 빈칸으로 시작한다 */
const SELLER_KEY = 'hb-proposal-seller';
function loadSeller(): Seller {
  try {
    return storedSeller(JSON.parse(localStorage.getItem(SELLER_KEY) ?? 'null'));
  } catch {
    return storedSeller(null);
  }
}
function saveSeller(s: Seller): void {
  try {
    localStorage.setItem(SELLER_KEY, JSON.stringify(s));
  } catch {
    // 저장소를 못 쓰는 브라우저 — 다음에 다시 적으면 된다
  }
}

/**
 * 태양광 제안서 생성 — 제안서만 짓는 화면이다(한백 2026-11-08 「부지검토와 제안서 생성기능이 너무 겹치는데 따로따로 구분해줘. 부지검토는
 * 부지검토용으로만 제안서생성은 제안서 생성용으로만, 그리고 UXUI도 best practice인지 검토해봐. 너무 순서가 뒤죽박죽이야」).
 * 판정 · 검토 항목 · 상담 접수는 부지 검토에만 있다 — 그전에는 두 화면이 같은 결과 판(판정 · 콘솔 기준 용량)을 세웠고, 그 용량이
 * 제안서에 들어가는 용량(사업자 기준)과 달랐다.
 *
 * 위에서 아래로 짓는 차례 그대로다: 1 현장(주소로 불러온다) → 2 상품 → 3 패널 배치(지도 — 고른 상품의 사업자 기준으로 다시 깐 것을
 * 그린다, 지도의 장수가 제안서의 장수다) → 4 고객 · 영업사 → 만들기. 아직 못 하는 걸음은 머리만 서고 까닭을 곁글로 단다.
 * 템플릿 · 조건(한백 관리자)은 흐름 밖, 맨 아래 접힌 판. 상품 · 영업사는 현장을 바꿔도 남는다(같은 사람이 여러 현장을 짓는다).
 * 짓는 일은 브라우저가 한다 — 서버에 남는 것이 없다.
 */
export default function ProposalMaker({ mapKey, initialQ, canManage }: { mapKey: string | null; initialQ: string; canManage: boolean }) {
  // 들고 온 주소(부지 검토의 「이 부지로 제안서 만들기」)는 처음 한 번 불러온다
  const { report, busy: loading, error: loadFail, run: load, reload } = useSiteReport(initialQ.length >= 2 ? { q: initialQ, mode: 'roof' } : null);
  // 필지를 더하고 빼서 다시 불러온 부지의 주소 한 줄 — 검색창 글을 맞춘다(lib/solar/parcels)
  const [sync, setSync] = useState<{ q: string } | null>(null);
  const reparcel = async (q: string): Promise<string | null> => {
    const r = await reload('roof', q);
    if ('error' in r) return r.error;
    setSync({ q: siteQueryOf(r.report.place) });
    return null;
  };
  const [templates, setTemplates] = useState<ProposalTemplate[] | null>(null);
  const [templatesFail, setTemplatesFail] = useState<string | null>(null);
  const [product, setProduct] = useState<ProductKey | null>(null);
  const [seller, setSeller] = useState<Seller>({ company: '', person: '', phone: '' });
  useEffect(() => setSeller(loadSeller()), []);

  useEffect(() => {
    let live = true;
    fetchProposalTemplates()
      .then((t) => live && setTemplates(t))
      .catch((err) => live && setTemplatesFail(err instanceof Error ? err.message : String(err)));
    return () => {
      live = false;
    };
  }, []);

  /** 그 템플릿으로 못 짓는 까닭 — 칩 꼬리와 만들기 단추가 같이 쓴다 */
  const stateOf = (key: TemplateKey): string | null => {
    const t = templates?.find((x) => x.key === key);
    if (!t) return null;
    if (!t.file) return '템플릿 없음';
    return missingTerms(key, t.terms).length ? '조건 미지정' : null;
  };
  const place = report?.place;

  return (
    <div className="space-y-4">
      <SearchBox
        step={1}
        mode="roof"
        title="현장"
        sub="제안할 건물"
        placeholder="도로명·지번 주소 또는 건물명"
        initialQuery={initialQ}
        busy={loading}
        error={loadFail?.text ?? null}
        onRun={load}
        action="불러오기"
        busyAction="불러오는 중…"
        sync={sync}
      >
        {/* 불러온 현장 — 이름 · 도로명(대표 필지) · 지번. 지번 자리에서 필지를 더하고 뺀다(한 부지로 묶어 제안 — ParcelBar) */}
        {place && (
          <div className={`mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-slate-100 pt-3 ${TEXT.body}`}>
            <span className="font-bold text-slate-900">{place.buildingName ?? place.roadAddress ?? place.query}</span>
            {/* 도로명이 이미 굵은 이름이면(건물명 없음) 다시 적지 않는다(화면 규칙 5) */}
            {place.buildingName && place.roadAddress && <span className={TEXT.label}>{place.roadAddress} ·</span>}
            <ParcelBar place={place} busy={loading !== null} onChange={reparcel} />
          </div>
        )}
      </SearchBox>

      <section className={`${PANEL} space-y-3 p-5`} aria-label="상품">
        <SectionHead step={2} title="상품" />
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
              {/* 받을 것이 와야 짓는 상품(지금은 파워플래너 견본 받기 전 — 루모라 구독형 리스) — 못 고르는 칩(lib/solar/proposal/products UPCOMING) */}
              {UPCOMING.filter((u) => u.company === company).map((u) => (
                <Choice key={u.label} on={false} disabled>
                  {u.label}
                  <span className="ml-1.5 font-normal">· {u.why}</span>
                </Choice>
              ))}
            </div>
          ))}
        </div>
        <Err className="block">{templatesFail}</Err>
      </section>

      {report ? (
        <ProposalSite
          key={report.checkedAt}
          report={report}
          mapKey={mapKey}
          product={product}
          templates={templates}
          stateOf={stateOf}
          seller={seller}
          setSeller={setSeller}
        />
      ) : (
        <>
          <WaitingStep step={3} title="패널 배치" />
          <WaitingStep step={4} title="고객 · 영업사" />
        </>
      )}

      {canManage && templates && <ProposalTemplates templates={templates} onChange={(t) => setTemplates((all) => all?.map((x) => (x.key === t.key ? t : x)) ?? null)} />}
    </div>
  );
}

/** 현장을 불러오기 전의 걸음 — 머리만 서고 까닭을 곁글로(화면 규칙 3 · 6) */
function WaitingStep({ step, title }: { step: number; title: string }) {
  return (
    <section className={`${PANEL} px-5 py-3`} aria-label={title}>
      <SectionHead step={step} title={<span className="text-slate-500">{title}</span>} meta="현장 불러오기 전" />
    </section>
  );
}

/**
 * 불러온 현장 하나의 3 · 4 걸음 — 현장마다 새로 그린다(앞 현장에서 고른 지붕 · 고객명이 남지 않게, key = 검토 시각).
 * 현장을 불러오면 지도의 AI 패널배치가 저절로 한 번 돈다(SiteMap autoRun — 한백 2026-11-08 「AI로 패널배치기하기 클릭하지않으면 pptx에도
 * 안나타나네」). AI 를 부르는 길은 그것 하나다 — 만들기 단추가 따로 부르던 길은 걷었다(지도 단추가 「배치 중」으로 안 바뀌어 두 번 불렀다).
 * 짓기: 고른 상품의 사업자 기준으로 다시 깐 배치(지도에 그린 그것)로 짓는다.
 */
function ProposalSite({
  report,
  mapKey,
  product,
  templates,
  stateOf,
  seller,
  setSeller,
}: {
  report: Report;
  mapKey: string | null;
  product: ProductKey | null;
  templates: ProposalTemplate[] | null;
  stateOf: (key: TemplateKey) => string | null;
  seller: Seller;
  setSeller: (f: (s: Seller) => Seller) => void;
}) {
  const plan = useRoofPlan(report.map);
  const { place } = report;
  const [customer, setCustomer] = useState(place.buildingName ?? '');
  // 고객 주소 — 한 필지면 도로명, 여러 필지면 지번을 늘어놓은 한 줄(「…가나동 12, 12-3」 — lib/solar/parcels)
  const [address, setAddress] = useState(siteQueryOf(place));
  // 계약자 구분 — 그것을 받는 상품(모햇)만. 고객마다라 현장을 바꾸면 다시 고른다
  const [party, setParty] = useState<Party | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const setSellerField = (k: keyof Seller, v: string) => setSeller((s) => ({ ...s, [k]: v }));

  const chosen = product ? productOf(product) : null;
  const template = chosen ? (templates?.find((t) => t.key === chosen.template) ?? null) : null;
  const chosenTerms = template?.terms as Terms | undefined;
  const termsReady = !!chosen && !!chosenTerms && !missingTerms(chosen.template, chosenTerms).length;
  const lat = report.map?.point.lat ?? 36.5;
  // 고른 상품의 사업자 기준으로 다시 깐 배치 — 지도에 그리고(3 패널 배치), 지을 때도 같은 셈을 한다
  const layoutFor = useCallback(
    (terms: Terms): ProposalLayout =>
      proposalLayout(
        (plan?.roofs ?? []).filter((r) => plan?.selected.has(r.id)),
        (plan?.cuts ?? []).map((c) => c.polygons),
        plan?.style ?? 'tilted',
        lat,
        terms,
      ),
    [plan?.roofs, plan?.selected, plan?.cuts, plan?.style, lat],
  );
  const preview = useMemo(() => (termsReady && plan?.roofs.length ? layoutFor(chosenTerms!) : null), [termsReady, chosenTerms, plan?.roofs.length, layoutFor]);
  const previewLine =
    chosen && preview && preview.count > 0 && chosenTerms
      ? `${chosen.company} ${chosen.label} 기준 · 패널 ${preview.count.toLocaleString()}장 · ${kwText(capacityKw(preview.count, chosenTerms.moduleWatt))} kW · ${
          plan?.style === 'flush' ? '지붕면 부착형' : `경사 ${preview.tiltDeg}° · 음영각 ${preview.shadeDeg}°`
        }`
      : null;

  const partyNeeded = chosen?.party === true;

  // 못 짓는 까닭 — 화면 위에서부터(2 상품 → 3 배치 → 4 고객 · 영업사) 처음 걸리는 것 하나를 단추에 적는다
  const blocker = proposalBlocker({
    templatesLoaded: !!templates,
    productChosen: !!chosen,
    templateState: chosen ? stateOf(chosen.template) : null,
    pnu: traceKeyOf(place.parcels.map((x) => x.pnu)),
    hasPlan: !!plan,
    aiBusy,
    roofs: plan?.roofs.length ?? 0,
    selected: plan?.selected.size ?? 0,
    kw: preview && chosenTerms ? capacityKw(preview.count, chosenTerms.moduleWatt) : null,
    minKw: termOf(chosenTerms, 'minKw'),
    maxKw: chosen ? (TEMPLATES[chosen.template].maxKw ?? 0) : 0,
    customer,
    address,
    partyNeeded,
    party,
    seller,
  });

  const building = useRef(false);
  const build = async () => {
    if (blocker || !chosen || !template || !plan || building.current) return;
    building.current = true;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
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
        grid: report.grid,
        site: report.site,
        party: partyNeeded ? party : null,
        today: today(),
        seller: { company: seller.company.trim(), person: seller.person.trim(), phone: seller.phone },
        image,
      };
      setStep(chosen.template === 'lumora-rent' ? '쪽 굽는 중…' : '제안서 짓는 중…');
      const blob = await buildProposal(chosen.key, template, input);
      const name = proposalFileName(input.customer, `${chosen.company} ${chosen.label}`, input.today);
      downloadBlob(blob, name, 60_000);
      saveSeller(input.seller);
      const kw = capacityKw(lay.count, (template.terms.moduleWatt as number) ?? 0);
      setDone(`받았습니다 — ${name} · 패널 ${lay.count.toLocaleString()}장 · ${kwText(kw)} kW`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      building.current = false;
      setBusy(false);
      setStep('');
    }
  };

  return (
    <>
      {report.map ? (
        <SiteMap
          data={report.map}
          appKey={mapKey}
          plan={plan}
          ground={null}
          pnu={traceKeyOf(place.parcels.map((x) => x.pnu))}
          heading={{ step: 3, title: '패널 배치' }}
          panels={preview?.quads ?? null}
          note={previewLine}
          autoRun
          onAiBusy={setAiBusy}
        />
      ) : (
        <section className={`${PANEL} px-5 py-3`} aria-label="패널 배치">
          <SectionHead step={3} title="패널 배치" meta="지도 자료 없음" />
        </section>
      )}

      <section className={`${PANEL} space-y-4 p-5`} aria-label="제안서">
        <SectionHead step={4} title="고객 · 영업사" />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className={TEXT.label}>고객명</span>
            <input value={customer} onChange={(e) => setCustomer(e.target.value)} maxLength={60} placeholder="(주)OO" className={`mt-1 ${FIELD}`} />
          </label>
          <label className="block">
            <span className={TEXT.label}>고객 주소</span>
            <input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} className={`mt-1 ${FIELD}`} />
          </label>
        </div>
        {/* 계약자 구분 — 견본이 두 계약자를 한 판에 함께 쓰는 상품(모햇 — 참여지원금은 법인에게만)은 고른 계약자의 글만 남긴다 */}
        {partyNeeded && (
          <div className="flex flex-wrap items-center gap-2">
            <span className={`w-16 shrink-0 ${TEXT.label}`}>계약자</span>
            {PARTIES.map((x) => (
              <Choice key={x} on={party === x} onClick={() => setParty(x)}>
                {PARTY_LABEL[x]}
              </Choice>
            ))}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className={TEXT.label}>영업사</span>
            <input value={seller.company} onChange={(e) => setSellerField('company', e.target.value)} maxLength={40} placeholder="(주)OO에너지" className={`mt-1 ${FIELD}`} />
          </label>
          <label className="block">
            <span className={TEXT.label}>담당자명</span>
            <input value={seller.person} onChange={(e) => setSellerField('person', e.target.value)} maxLength={20} placeholder="홍길동" className={`mt-1 ${FIELD}`} />
          </label>
          <label className="block">
            <span className={TEXT.label}>연락처</span>
            {/* 숫자만 넣으면 하이픈이 저절로 — 계약서 작성과 같은 formatKoreanPhone(010 은 3-4-4) */}
            <input
              value={seller.phone}
              onChange={(e) => setSellerField('phone', formatKoreanPhone(e.target.value))}
              inputMode="numeric"
              maxLength={13}
              placeholder="010-0000-0000"
              className={`mt-1 tabular-nums ${FIELD}`}
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
          <Btn onClick={() => void build()} disabled={!!blocker} busy={busy} busyLabel={step || '짓는 중…'}>
            {blocker ? `${blocker} — 제안서 불가` : '제안서 만들기 (PPTX)'}
          </Btn>
          <Err>{error}</Err>
          {done && <span className={TEXT.body}>{done}</span>}
        </div>
      </section>
    </>
  );
}

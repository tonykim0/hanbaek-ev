'use client';

/**
 * 실사보고서(사진대지) 작성 화면 — 협력사가 포털에서 거점마다 값과 사진을 넣고 서식을 내려받는다.
 *
 * ★서버에 아무것도 안 보낸다★ — 사진은 브라우저 안에서 줄여(lib/survey/prepare-image) 서식에
 * 넣고 그 자리에서 내려받는다. 계약서 작성과 같은 길이다. 그래서 창을 닫으면 넣은 것이 사라진다 —
 * 임시 저장(클라우드 — 계정마다 여럿, lib/survey/use-draft)이 있고, 저장 뒤 바꾼 것을 두고 나가려 하면 묻는다.
 *
 * 화면은 운영사와 상관없이 하나다 — 거점·값·사진 칸. 칸 목록과 생성기만 운영사가 정한다.
 */
import { useMemo, useRef, useState } from 'react';
import { Section, contractInputClass } from '@/components/contracts/FormControls';
import { Alerts, Btn, Choice } from '@/components/ui';
import { downloadBlob } from '@/lib/download';
import { useSurveyDraft } from '@/lib/survey/use-draft';
import { newPhotos, usePlateReader, type PlateRead } from '@/lib/survey/use-plate';
import { nextId, num, today } from '@/lib/survey/form-utils';
import { DraftList, SurveyActions } from './DraftControls';
import { PhotoSlots } from './PhotoSlots';
import { prepareCollage, prepareImage } from '@/lib/survey/prepare-image';
import type { PreparedImage } from '@/lib/survey/docx-kit';
import type { NumStyle } from '@/lib/survey/annot';
import {
  HEC_CHECKS, fastOf, markStyleOf, newSpot, slotFiles, slowOf,
  type PhotoSlot, type SurveyCpo, type SurveyForm, type SurveySpot,
} from '@/lib/survey/spec';

export interface SurveyEditorProps {
  cpo: SurveyCpo;
  slots: PhotoSlot[];
  /**
   * 서식의 종류 — 받는 값이 갈린다.
   *   hec     전원 공급방식·설치 Type 별 대수·전주번호/차단기 스펙 + 사전체크리스트
   *   ledger  사진 대장(SK·나이스) — 설치장소(주소)·전력인입점 설명·설치기수
   */
  variant: 'hec' | 'ledger';
  /** 채운 서식을 돌려준다 — 운영사별 생성기 */
  build: (form: SurveyForm, images: Record<string, Record<string, PreparedImage | undefined>>) => Promise<Blob>;
  fileName: (siteName: string) => string;
}

/** 화면의 값 — ★한 덩이★다. 임시 저장이 「바뀐 것이 있나」를 덩이가 바뀌었는가로 본다(lib/survey/use-draft) */
type Form = Pick<SurveyForm, 'siteName' | 'surveyDate' | 'address' | 'spots'>;
type PlateField = 'farSpec' | 'nearSpec' | 'panelNote';

/**
 * 저장본 → 화면 값. 빠진 것은 기본값으로 채운다 — 옛 꼴의 저장본도 연다:
 * 거점마다 주소를 받던 때의 것은 첫 거점의 주소를 현장 주소로(2026-10-02 SurveyForm.address).
 */
function formOf(v: Partial<Form> | null | undefined): Form {
  const spots = Array.isArray(v?.spots) && v.spots.length ? v.spots : [newSpot(nextId())];
  return {
    siteName: typeof v?.siteName === 'string' ? v.siteName : '',
    surveyDate: typeof v?.surveyDate === 'string' ? v.surveyDate : today(),
    address: typeof v?.address === 'string' ? v.address : ((spots[0] as { address?: string }).address ?? ''),
    spots: spots.map((x) => ({ ...newSpot(x.id ?? nextId()), ...x })),
  };
}

export default function SurveyEditor({ cpo, slots, variant, build, fileName }: SurveyEditorProps) {
  const [form, setForm] = useState<Form>(() => formOf(null));
  const { siteName, surveyDate, address, spots } = form;
  const set = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }));
  const setSpots = (fn: (list: SurveySpot[]) => SurveySpot[]) => setForm((f) => ({ ...f, spots: fn(f.spots) }));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const style = markStyleOf(cpo);

  const photoCount = spots.reduce((n, s) => n + Object.values(s.photos).filter(Boolean).length, 0);
  const draft = useSurveyDraft(cpo, form, (v) => { const next = formOf(v); setForm(next); return next; }, siteName, busy !== null);

  /*
   * 사진에서 전력인입점 글자 읽기(lib/survey/use-plate) — 어느 사진이 어느 칸을 채우나:
   *   현대엔지니어링  책임분계점 원경 → 원경 칸 · 근경 → 근경 칸 (전주번호, 없으면 판넬명 + 차단기)
   *   SK·나이스       전력인입점 사진 1·2 → 전력인입점 칸 (전주번호, 없으면 「판넬명 판넬」)
   * 채울 때 다시 본다 — 그 사진이 아직 그 자리에 있고, 칸이 비었거나 전에 읽어 넣은 값 그대로일 때만.
   */
  const plate = usePlateReader();
  /* 읽기가 돌아올 때의 「지금」 — 상태 고치기 함수 안에서 빈 칸을 재면 늦게 돌아 판정이 어긋난다 */
  const spotsRef = useRef(spots);
  spotsRef.current = spots;
  const PLATE: Record<string, PlateField> = variant === 'hec'
    ? { far: 'farSpec', near: 'nearSpec' }
    : { inlet1: 'panelNote', inlet2: 'panelNote' };
  const plateText = (r: PlateRead): string | null => {
    if (r.pole) return r.pole;
    if (!r.panel) return null;
    return variant === 'hec' ? [r.panel, r.breaker].filter(Boolean).join(' ') : `${r.panel} 판넬`;
  };
  const patchSpot = (id: string, p: Partial<SurveySpot>) => {
    const before = spots.find((x) => x.id === id);
    if (before && p.photos) {
      for (const [key, file] of newPhotos(before.photos, p.photos, Object.keys(PLATE))) {
        const field = PLATE[key];
        const tag = `${id}:${field}`;
        plate.read(`${id}:${key}`, [tag], file, (r) => {
          const v = plateText(r);
          const now = spotsRef.current.find((x) => x.id === id);
          if (!v || !now || now.photos[key] !== file || !plate.canFill(tag, now[field])) return null;
          setSpots((list) => list.map((x) => (x.id === id ? { ...x, [field]: v } : x)));
          return { [tag]: v };
        });
      }
    }
    // 사람이 칸을 고치면 「사진에서 읽음」은 걷는다
    for (const f of ['farSpec', 'nearSpec', 'panelNote'] as const) if (f in p) plate.clear(`${id}:${f}`);
    setSpots((list) => list.map((s) => (s.id === id ? { ...s, ...p } : s)));
  };

  /* 확인할 것 — 막지 않는다. 빈 칸으로 내도 서식은 그 칸을 빈 채로 둔다 */
  const review = useMemo(() => {
    const out: string[] = [];
    if (variant === 'ledger' && !address.trim()) out.push('설치장소(주소)가 비어 있습니다');
    spots.forEach((s, i) => {
      const tag = spots.length > 1 ? `${i + 1}거점 · ` : '';
      if (variant === 'ledger') {
        if (!s.qty) out.push(`${tag}설치기수가 비어 있습니다`);
      } else {
        if (!s.location.trim()) out.push(`${tag}상세 위치가 비어 있습니다`);
        const qty = (s.wallSlow ?? 0) + (s.wallFast ?? 0) + (s.standSlow ?? 0) + (s.standFast ?? 0);
        if (qty === 0) out.push(`${tag}충전기 대수가 비어 있습니다`);
      }
      const empty = slots.filter((sl) => slotFiles(s.photos, sl).length === 0).map((sl) => sl.label);
      if (empty.length) out.push(`${tag}사진 ${empty.length}칸 비어 있음 — ${empty.join(', ')}`);
    });
    return out;
  }, [spots, slots, variant, address]);

  async function make() {
    setError(null);
    const total = photoCount;
    let done = 0;
    try {
      setBusy(total ? `사진 준비 중 0/${total}` : '만드는 중…');
      const images: Record<string, Record<string, PreparedImage | undefined>> = {};
      for (const s of spots) {
        images[s.id] = {};
        for (const sl of slots) {
          const list = slotFiles(s.photos, sl);
          if (list.length === 0) continue;
          if (sl.collage) {
            // 서식 칸이 하나뿐인 자리 — 여러 장을 한 장으로 모아 그 칸에 넣는다
            images[s.id][sl.key] = await prepareCollage(list.map(({ key, file }) => ({ file, marks: s.marks[key] ?? [] })), style, sl.aspect);
            done += list.length;
          } else {
            for (const { key, file } of list) {
              images[s.id][key] = await prepareImage(file, s.marks[key] ?? [], style);
              done += 1;
            }
          }
          setBusy(`사진 준비 중 ${done}/${total}`);
        }
      }
      setBusy('서식 채우는 중…');
      const out: SurveyForm = { cpo, siteName: siteName.trim(), surveyDate, address, spots };
      downloadBlob(await build(out, images), fileName(siteName));
    } catch (err) {
      setError((err as Error).message || '만들지 못했습니다.');
    } finally {
      setBusy(null);
    }
  }

  const canMake = siteName.trim() ? true as const : '현장명 미입력 — 만들 수 없음';
  const actions = <SurveyActions draft={draft} make={() => void make()} busy={busy} canMake={canMake} />;

  return (
    <div className="flex flex-col gap-5">
      <DraftList draft={draft} />
      {actions}
      <Section title="1. 현장">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">현장명<span className="ml-1 text-red-500">*</span></span>
            <input value={siteName} onChange={(e) => set({ siteName: e.target.value })} placeholder="광주 북구 각화센트럴파크서희스타힐스" className={contractInputClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">조사일</span>
            <input type="date" value={surveyDate} onChange={(e) => set({ surveyDate: e.target.value })} className={contractInputClass} />
          </label>
          {variant === 'ledger' && (
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-sm font-medium text-gray-700">설치장소(주소)</span>
              <input value={address} onChange={(e) => set({ address: e.target.value })} placeholder="경기도 수원시 영통구 삼성로 268번길 30" className={contractInputClass} />
            </label>
          )}
        </div>
      </Section>

      {spots.map((s, i) => (
        <SpotCard
          key={s.id}
          n={i + 1}
          spot={s}
          slots={slots}
          variant={variant}
          style={style}
          onChange={(p) => patchSpot(s.id, p)}
          plateNote={(field) => plate.note(`${s.id}:${field}`)}
          onRemove={spots.length > 1 ? () => setSpots((l) => l.filter((x) => x.id !== s.id)) : undefined}
        />
      ))}

      <div>
        <Btn kind="side" onClick={() => setSpots((l) => [...l, newSpot(nextId())])}>
          거점 추가
        </Btn>
      </div>

      {error && <Alerts tone="stop" title="만들지 못했습니다" items={[{ text: error }]} />}
      <Alerts tone="warn" title={`확인할 것 ${review.length}건`} items={review.map((text) => ({ text }))} />

      {actions}
    </div>
  );
}

function SpotCard({
  n, spot, slots, variant, style, onChange, plateNote, onRemove,
}: {
  n: number;
  spot: SurveySpot;
  slots: PhotoSlot[];
  variant: 'hec' | 'ledger';
  style: NumStyle;
  onChange: (p: Partial<SurveySpot>) => void;
  /** 사진에서 읽는 중·읽음 — 칸 이름 옆에 붙는다 */
  plateNote: (field: PlateField) => string;
  onRemove?: () => void;
}) {
  const [openChecks, setOpenChecks] = useState(false);
  const unchecked = Object.values(spot.checks).filter((c) => !c.ok).length;
  const qtyCell = (key: 'wallSlow' | 'wallFast' | 'standSlow' | 'standFast', label: string) => (
    <label className="flex items-center gap-2">
      <span className="w-10 text-sm text-gray-600">{label}</span>
      <input
        inputMode="numeric"
        value={spot[key] ?? ''}
        onChange={(e) => onChange({ [key]: num(e.target.value) } as Partial<SurveySpot>)}
        className={`${contractInputClass} !w-20 text-right`}
        placeholder="0"
      />
      <span className="text-sm text-gray-500">기</span>
    </label>
  );

  // 칸 목록은 통째로 넘기고 그릴 칸만 고른다 — 한꺼번에 고른 사진이 뒤 칸으로 흘러가게(PhotoSlots from·to)
  const photos = (from: number, to?: number) => (
    <PhotoSlots
      slots={slots}
      from={from}
      to={to}
      photos={spot.photos}
      marks={spot.marks}
      onChange={onChange}
      expected={variant === 'ledger' ? spot.qty : slowOf(spot) + fastOf(spot)}
      style={style}
    />
  );

  return (
    <Section title={`${n + 1}. ${n}거점`}>
      <div className="flex flex-col gap-5">
        {/*
          ★사진이 먼저, 글이 나중★(한백 「사진을 먼저 넣고 텍스트 입력 또는 수정이 나중에」 2026-10-02) — 전력인입점
          사진이 판넬명·전주번호 칸을 채우므로(위 PLATE) 그 사진 칸을 먼저 두고 그 칸을 바로 밑에 둔다. 나머지 사진과
          값이 그 뒤다. 사진은 워드 서식처럼 한 줄에 두 칸이다(PhotoSlots).
        */}
        {photos(0, 2)}
        {variant === 'ledger' ? (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">전력인입점 — 판넬·차단기<span className="font-bold text-brand-700">{plateNote('panelNote')}</span></span>
            <input value={spot.panelNote} onChange={(e) => onChange({ panelNote: e.target.value })} placeholder="사진을 넣으면 자동 입력 · 예) 지하1층 PK1-B1A 판넬 (메인 225A / 75A 차단기 신규설치)" className={contractInputClass} />
          </label>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">원경 — 전주번호 또는 차단기 스펙<span className="font-bold text-brand-700">{plateNote('farSpec')}</span></span>
              <input value={spot.farSpec} onChange={(e) => onChange({ farSpec: e.target.value })} placeholder="사진을 넣으면 자동 입력 · 예) 104동 공용분전반 350A" className={contractInputClass} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">근경 — 전주번호 또는 차단기 스펙<span className="font-bold text-brand-700">{plateNote('nearSpec')}</span></span>
              <input value={spot.nearSpec} onChange={(e) => onChange({ nearSpec: e.target.value })} placeholder="사진을 넣으면 자동 입력" className={contractInputClass} />
            </label>
          </div>
        )}
        {photos(2)}
        {variant === 'ledger' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">설치기수</span>
              <span className="flex items-center gap-2">
                <input inputMode="numeric" value={spot.qty ?? ''} onChange={(e) => onChange({ qty: num(e.target.value) })} placeholder="0" className={`${contractInputClass} !w-24 text-right`} />
                <span className="text-sm text-gray-500">기</span>
              </span>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">설치 위치</span>
              <input value={spot.location} onChange={(e) => onChange({ location: e.target.value })} placeholder="지하1층 15번 기둥 반대편" className={contractInputClass} />
            </label>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-sm font-medium text-gray-700">상세 위치</span>
              <input value={spot.location} onChange={(e) => onChange({ location: e.target.value })} placeholder="103동 앞 지상주차장" className={contractInputClass} />
            </label>
            <div>
              <span className="mb-1.5 block text-sm font-medium text-gray-700">전원 공급방식</span>
              <div className="flex gap-1.5">
                <Choice on={spot.powerType === '한전'} onClick={() => onChange({ powerType: '한전' })}>한전 별도수전</Choice>
                <Choice on={spot.powerType === '모자분리'} onClick={() => onChange({ powerType: '모자분리' })}>모자분리</Choice>
              </div>
            </div>
            <div>
              <span className="mb-1.5 block text-sm font-medium text-gray-700">충전기 설치 대수</span>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <span className="col-span-2 text-xs font-bold text-gray-500">벽부형</span>
                {qtyCell('wallSlow', '완속')}
                {qtyCell('wallFast', '급속')}
                <span className="col-span-2 mt-1 text-xs font-bold text-gray-500">스탠드형</span>
                {qtyCell('standSlow', '완속')}
                {qtyCell('standFast', '급속')}
              </div>
            </div>
          </div>
        )}

        {variant === 'hec' && (
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-gray-700">사전체크리스트</span>
              <span className={`text-sm font-bold ${unchecked ? 'text-amber-700' : 'text-brand-700'}`}>
                {unchecked ? `미확인(X) ${unchecked}항목` : '모두 확인(O)'}
              </span>
              <Btn size="sm" kind="quiet" onClick={() => setOpenChecks((o) => !o)}>
                {openChecks ? '접기' : '항목 보기'}
              </Btn>
            </div>
            {openChecks && (
              <div className="mt-2 flex flex-col gap-3">
                {HEC_CHECKS.map((g) => (
                  <div key={g.group}>
                    <p className="mb-1 text-xs font-bold text-gray-500">{g.group}</p>
                    <ul className="flex flex-col divide-y divide-slate-100 rounded-box border border-slate-200">
                      {g.items.map((it) => {
                        const v = spot.checks[it.key];
                        const set = (p: Partial<{ ok: boolean; note: string }>) =>
                          onChange({ checks: { ...spot.checks, [it.key]: { ...v, ...p } } });
                        return (
                          <li key={it.key} className="flex flex-wrap items-center gap-2 px-3 py-2">
                            <span className="min-w-0 flex-1 text-sm text-gray-700">{it.label}</span>
                            <Choice on={v.ok} onClick={() => set({ ok: true })}>확인 O</Choice>
                            <Choice on={!v.ok} onClick={() => set({ ok: false })}>미확인 X</Choice>
                            <input
                              value={v.note}
                              onChange={(e) => set({ note: e.target.value })}
                              placeholder="비고"
                              className={`${contractInputClass} !w-40`}
                            />
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {onRemove && (
          <div className="flex justify-end">
            <Btn size="sm" kind="undo" onClick={onRemove}>{n}거점 빼기</Btn>
          </div>
        )}
      </div>
    </Section>
  );
}

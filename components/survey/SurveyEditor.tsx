'use client';

/**
 * 실사보고서(사진대지) 작성 화면 — 협력사가 포털에서 거점마다 값과 사진을 넣고 서식을 내려받는다.
 *
 * ★서버에 아무것도 안 보낸다★ — 사진은 브라우저 안에서 줄여(lib/survey/prepare-image) 서식에
 * 넣고 그 자리에서 내려받는다. 계약서 작성과 같은 길이다. 그래서 창을 닫으면 넣은 것이 사라진다 —
 * 사진이 들어 있는 동안 나가려 하면 한 번 묻는다.
 *
 * 화면은 운영사와 상관없이 하나다 — 거점·값·사진 칸. 칸 목록과 생성기만 운영사가 정한다.
 */
import { useEffect, useMemo, useState } from 'react';
import { Section, contractInputClass } from '@/components/contracts/FormControls';
import { Alerts, Btn, Choice } from '@/components/ui';
import { useFileDragging } from '@/components/DocFiles';
import { downloadBlob } from '@/lib/download';
import { useLeaveGuard } from '@/lib/use-leave-guard';
import { prepareImage } from '@/lib/survey/prepare-image';
import type { PreparedImage } from '@/lib/survey/docx-kit';
import {
  HEC_CHECKS, newSpot, type PhotoSlot, type SurveyCpo, type SurveyForm, type SurveySpot,
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

export const today = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

let seq = 0;
export const nextId = () => `s${Date.now().toString(36)}${(seq += 1)}`;

export default function SurveyEditor({ cpo, slots, variant, build, fileName }: SurveyEditorProps) {
  const [siteName, setSiteName] = useState('');
  const [surveyDate, setSurveyDate] = useState(today);
  const [spots, setSpots] = useState<SurveySpot[]>(() => [newSpot(nextId())]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const photoCount = spots.reduce((n, s) => n + Object.values(s.photos).filter(Boolean).length, 0);
  useLeaveGuard(photoCount > 0 || busy !== null, '넣은 사진과 값은 저장되지 않습니다 — 나가면 사라집니다. 나가시겠습니까?');

  const patch = (id: string, p: Partial<SurveySpot>) =>
    setSpots((list) => list.map((s) => (s.id === id ? { ...s, ...p } : s)));

  /* 확인할 것 — 막지 않는다. 빈 칸으로 내도 서식은 그 칸을 빈 채로 둔다 */
  const review = useMemo(() => {
    const out: string[] = [];
    spots.forEach((s, i) => {
      const tag = spots.length > 1 ? `${i + 1}거점 · ` : '';
      if (variant === 'ledger') {
        if (!s.address.trim()) out.push(`${tag}설치장소(주소)가 비어 있습니다`);
        if (!s.qty) out.push(`${tag}설치기수가 비어 있습니다`);
      } else {
        if (!s.location.trim()) out.push(`${tag}상세 위치가 비어 있습니다`);
        const qty = (s.wallSlow ?? 0) + (s.wallFast ?? 0) + (s.standSlow ?? 0) + (s.standFast ?? 0);
        if (qty === 0) out.push(`${tag}충전기 대수가 비어 있습니다`);
      }
      const empty = slots.filter((sl) => !s.photos[sl.key]).map((sl) => sl.label);
      if (empty.length) out.push(`${tag}사진 ${empty.length}칸 비어 있음 — ${empty.join(', ')}`);
    });
    return out;
  }, [spots, slots, variant]);

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
          const f = s.photos[sl.key];
          if (!f) continue;
          images[s.id][sl.key] = await prepareImage(f);
          done += 1;
          setBusy(`사진 준비 중 ${done}/${total}`);
        }
      }
      setBusy('서식 채우는 중…');
      const form: SurveyForm = { cpo, siteName: siteName.trim(), surveyDate, spots };
      downloadBlob(await build(form, images), fileName(siteName));
    } catch (err) {
      setError((err as Error).message || '만들지 못했습니다.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Section title="1. 현장">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">현장명<span className="ml-1 text-red-500">*</span></span>
            <input value={siteName} onChange={(e) => setSiteName(e.target.value)} placeholder="광주 북구 각화센트럴파크서희스타힐스" className={contractInputClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">조사일</span>
            <input type="date" value={surveyDate} onChange={(e) => setSurveyDate(e.target.value)} className={contractInputClass} />
          </label>
        </div>
      </Section>

      {spots.map((s, i) => (
        <SpotCard
          key={s.id}
          n={i + 1}
          spot={s}
          slots={slots}
          variant={variant}
          onChange={(p) => patch(s.id, p)}
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

      <div className="flex flex-wrap items-center gap-3">
        <Btn onClick={() => void make()} busy={busy !== null} busyLabel={busy ?? undefined} disabled={!siteName.trim()}>
          {siteName.trim() ? '실사보고서 만들기' : '현장명 미입력 — 만들 수 없음'}
        </Btn>
      </div>
    </div>
  );
}

export function num(v: string): number | null {
  const n = Number(v.replace(/\D/g, ''));
  return v.trim() === '' || Number.isNaN(n) ? null : n;
}

function SpotCard({
  n, spot, slots, variant, onChange, onRemove,
}: {
  n: number;
  spot: SurveySpot;
  slots: PhotoSlot[];
  variant: 'hec' | 'ledger';
  onChange: (p: Partial<SurveySpot>) => void;
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

  return (
    <Section title={`${n + 1}. ${n}거점`}>
      <div className="flex flex-col gap-5">
        {variant === 'ledger' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-sm font-medium text-gray-700">설치장소(주소)</span>
              <input value={spot.address} onChange={(e) => onChange({ address: e.target.value })} placeholder="서울 노원구 동일로250길 18 / 103동 지상주차장" className={contractInputClass} />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-sm font-medium text-gray-700">전력인입점 — 판넬·차단기</span>
              <input value={spot.panelNote} onChange={(e) => onChange({ panelNote: e.target.value })} placeholder="지하1층 PK1-B1A 판넬 (메인 225A / 75A 차단기 신규설치)" className={contractInputClass} />
            </label>
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
        )}
        {variant === 'hec' && (
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
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">원경 — 전주번호 또는 차단기 스펙</span>
            <input value={spot.farSpec} onChange={(e) => onChange({ farSpec: e.target.value })} placeholder="104동 공용분전반 350A" className={contractInputClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">근경 — 전주번호 또는 차단기 스펙</span>
            <input value={spot.nearSpec} onChange={(e) => onChange({ nearSpec: e.target.value })} placeholder="전주번호 또는 차단기 스펙" className={contractInputClass} />
          </label>
        </div>
        )}

        <div>
          <span className="mb-2 block text-sm font-medium text-gray-700">사진</span>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {slots.map((sl, i) => (
              <PhotoBox
                key={sl.key}
                slot={sl}
                file={spot.photos[sl.key] ?? null}
                onFiles={(files) => {
                  /*
                   * ★여러 장이면 이 칸부터 빈 칸 순서대로★ — 현장 사진은 한꺼번에 고르는 일이 많다.
                   * 첫 장은 이 칸(채워져 있어도 바꾼다), 나머지는 뒤의 빈 칸에. 넘치는 장은 버린다.
                   */
                  const next = { ...spot.photos, [sl.key]: files[0] };
                  const rest = files.slice(1);
                  for (const later of slots.slice(i + 1)) {
                    if (rest.length === 0) break;
                    if (!next[later.key]) next[later.key] = rest.shift()!;
                  }
                  onChange({ photos: next });
                }}
                onClear={() => onChange({ photos: { ...spot.photos, [sl.key]: null } })}
              />
            ))}
          </div>
        </div>

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

/** 사진 칸 하나 — 누르면 고르고, 끌어다 놓아도 된다. 넣은 사진은 그 자리에서 보인다 */
export function PhotoBox({ slot, file, onFiles, onClear }: {
  slot: PhotoSlot;
  file: File | null;
  onFiles: (files: File[]) => void;
  onClear: () => void;
}) {
  const dragging = useFileDragging();
  const [over, setOver] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) { setUrl(null); return; }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const take = (list: File[]) => {
    const imgs = list.filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name));
    if (imgs.length) onFiles(imgs);
  };

  return (
    <div className="flex flex-col gap-1">
      <label
        onDragEnter={(e) => { e.preventDefault(); setOver(true); }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false); }}
        onDrop={(e) => { e.preventDefault(); setOver(false); take([...e.dataTransfer.files]); }}
        className={`relative flex aspect-[4/3] cursor-pointer items-center justify-center overflow-hidden rounded-box border-2 border-dashed transition ${
          over ? 'border-brand-500 bg-brand-50' : file ? 'border-brand-200 bg-white' : dragging ? 'border-slate-400 bg-white' : 'border-slate-200 bg-slate-50'
        }`}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={slot.label} className="h-full w-full object-contain" />
        ) : (
          <span className="px-3 text-center text-sm font-bold text-slate-400">
            {dragging ? '여기에 놓기' : '사진 고르기 · 끌어다 놓기'}
          </span>
        )}
        <input
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => { const picked = [...(e.target.files ?? [])]; e.target.value = ''; take(picked); }}
        />
      </label>
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 text-sm font-bold text-gray-800">
          {slot.label}
          {slot.hint && <span className="ml-1 text-xs font-normal text-gray-400">{slot.hint}</span>}
        </span>
        {file && (
          <button type="button" onClick={onClear} className="text-xs font-bold text-slate-400 hover:text-red-700">
            빼기
          </button>
        )}
      </div>
    </div>
  );
}

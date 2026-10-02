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
import { useEffect, useMemo, useRef, useState } from 'react';
import { Section, contractInputClass } from '@/components/contracts/FormControls';
import { Alerts, Btn, Choice } from '@/components/ui';
import { useFileDragging } from '@/components/DocFiles';
import { downloadBlob } from '@/lib/download';
import { useSurveyDraft } from '@/lib/survey/use-draft';
import { newPhotos, usePlateReader, type PlateRead } from '@/lib/survey/use-plate';
import { DraftList, SurveyActions } from './DraftControls';
import { prepareCollage, prepareImage } from '@/lib/survey/prepare-image';
import type { PreparedImage } from '@/lib/survey/docx-kit';
import { resolveLabels, type LineKind, type NumStyle } from '@/lib/survey/annot';
import MarkEditor, { AnnotCanvas, type SpotLabel } from './MarkEditor';
import {
  HEC_CHECKS, fastOf, markStyleOf, newSpot, slotFiles, slowOf, subKey,
  type Mark, type PhotoSlot, type SurveyCpo, type SurveyForm, type SurveySpot,
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
  const style = markStyleOf(cpo);

  const photoCount = spots.reduce((n, s) => n + Object.values(s.photos).filter(Boolean).length, 0);
  // 임시 저장 — 화면의 값 셋을 한 덩이로(어느 하나가 바뀌면 새 덩이다)
  const value = useMemo(() => ({ siteName, surveyDate, spots }), [siteName, surveyDate, spots]);
  const draft = useSurveyDraft(cpo, value, (v) => {
    setSiteName(v.siteName); setSurveyDate(v.surveyDate); setSpots(v.spots);
  }, siteName, busy !== null);

  const patch = (id: string, p: Partial<SurveySpot>) =>
    setSpots((list) => list.map((s) => (s.id === id ? { ...s, ...p } : s)));

  /*
   * 사진에서 전력인입점 글자 읽기(lib/survey/use-plate) — 어느 사진이 어느 칸을 채우나:
   *   현대엔지니어링  책임분계점 원경 → 원경 칸 · 근경 → 근경 칸 (전주번호, 없으면 판넬명 + 차단기)
   *   SK·나이스       전력인입점 사진 1·2 → 전력인입점 칸 (전주번호, 없으면 「판넬명 판넬」)
   * 빈 칸만 채운다.
   */
  const plate = usePlateReader();
  /* 읽기가 돌아올 때의 「지금」 — 상태 고치기 함수 안에서 빈 칸을 재면 늦게 돌아 판정이 어긋난다 */
  const spotsRef = useRef(spots);
  spotsRef.current = spots;
  const PLATE: Record<string, 'farSpec' | 'nearSpec' | 'panelNote'> = variant === 'hec'
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
        plate.read(`${id}:${field}`, file, (r) => {
          const v = plateText(r);
          const now = spotsRef.current.find((x) => x.id === id);
          if (!v || !now || now[field].trim()) return false;
          setSpots((list) => list.map((x) => (x.id === id && !x[field].trim() ? { ...x, [field]: v } : x)));
          return true;
        });
      }
    }
    // 사람이 칸을 고치면 「사진에서 읽음」은 걷는다
    for (const f of ['farSpec', 'nearSpec', 'panelNote'] as const) if (f in p) plate.clear(`${id}:${f}`);
    patch(id, p);
  };

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
      const empty = slots.filter((sl) => slotFiles(s.photos, sl).length === 0).map((sl) => sl.label);
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
          const list = slotFiles(s.photos, sl);
          if (list.length === 0) continue;
          if (sl.collage) {
            // 서식 칸이 하나뿐인 자리 — 여러 장을 한 장으로 모아 그 칸에 넣는다
            images[s.id][sl.key] = await prepareCollage(list.map(({ key, file }) => ({ file, marks: s.marks[key] ?? [] })), style);
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
      const form: SurveyForm = { cpo, siteName: siteName.trim(), surveyDate, spots };
      downloadBlob(await build(form, images), fileName(siteName));
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

export function num(v: string): number | null {
  const n = Number(v.replace(/\D/g, ''));
  return v.trim() === '' || Number.isNaN(n) ? null : n;
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
  plateNote: (field: 'farSpec' | 'nearSpec' | 'panelNote') => string;
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
              <span className="mb-1 block text-sm font-medium text-gray-700">전력인입점 — 판넬·차단기<span className="font-bold text-brand-700">{plateNote('panelNote')}</span></span>
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
            <span className="mb-1 block text-sm font-medium text-gray-700">원경 — 전주번호 또는 차단기 스펙<span className="font-bold text-brand-700">{plateNote('farSpec')}</span></span>
            <input value={spot.farSpec} onChange={(e) => onChange({ farSpec: e.target.value })} placeholder="104동 공용분전반 350A" className={contractInputClass} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">근경 — 전주번호 또는 차단기 스펙<span className="font-bold text-brand-700">{plateNote('nearSpec')}</span></span>
            <input value={spot.nearSpec} onChange={(e) => onChange({ nearSpec: e.target.value })} placeholder="전주번호 또는 차단기 스펙" className={contractInputClass} />
          </label>
        </div>
        )}

        <div>
          <span className="mb-2 block text-sm font-medium text-gray-700">사진</span>
          <PhotoSlots
            slots={slots}
            photos={spot.photos}
            marks={spot.marks}
            onChange={onChange}
            expected={variant === 'ledger' ? spot.qty : slowOf(spot) + fastOf(spot)}
            style={style}
          />
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

/**
 * 사진 칸 목록 — 칸마다 사진 한 장, 여러 장 칸(slot.multi)은 넣은 만큼 칸이 늘고 끝에 빈 칸 하나가 붙는다.
 *
 * ★여러 장을 한꺼번에 고르면★ 한 장 칸에서는 그 칸부터 뒤의 빈 한 장 칸 순서대로(현장 사진은 한꺼번에
 * 고르는 일이 많다), 여러 장 칸에서는 그 묶음에 다 넣는다 — 「인입라인에 고른 사진은 인입라인으로」.
 * 넘치는 장은 버린다. 여러 장 칸에서 하나를 빼면 뒤의 것이 당겨진다(서식에 빈 칸을 남기지 않는다).
 */
/** 표시 화면의 도구 — 플러그링크만 도면 기호·거점 라벨을 쓴다(MarkEditor) */
export interface MarkTools { legend?: boolean; labels?: SpotLabel[]; labelPick?: string; line?: LineKind; size?: number; large?: boolean }

export function PhotoSlots({ slots, photos, marks, onChange, expected, style, tools }: {
  slots: PhotoSlot[];
  photos: Record<string, File | null>;
  marks: Record<string, Mark[]>;
  onChange: (p: { photos: Record<string, File | null>; marks: Record<string, Mark[]> }) => void;
  expected?: number | null;
  style: NumStyle;
  tools?: MarkTools;
}) {
  /* 사진이 바뀐 자리의 표시는 걷는다 — 다른 사진 위의 자리는 뜻이 없다. 자리를 옮긴 사진은 표시도 같이 옮긴다 */
  const commit = (next: Record<string, File | null>, moved: Record<string, string> = {}) => {
    const m: Record<string, Mark[]> = {};
    for (const [k, f] of Object.entries(next)) {
      if (!f) continue;
      const from = moved[k] ?? k;
      if (photos[from] === f && marks[from]) m[k] = marks[from];
    }
    onChange({ photos: next, marks: m });
  };

  const putSingle = (i: number, files: File[]) => {
    const next = { ...photos, [slots[i].key]: files[0] };
    const rest = files.slice(1);
    for (const later of slots.slice(i + 1)) {
      if (rest.length === 0) break;
      if (!later.multi && !next[later.key]) next[later.key] = rest.shift()!;
    }
    commit(next);
  };

  const putMulti = (sl: PhotoSlot, pos: number, files: File[]) => {
    const have = slotFiles(photos, sl).map((x) => x.file);
    const list = [...have];
    list[pos] = files[0];
    list.push(...files.slice(1));
    const next = { ...photos };
    list.slice(0, sl.multi).forEach((f, i) => { next[subKey(sl.key, i)] = f; });
    commit(next);
  };

  const dropMulti = (sl: PhotoSlot, pos: number) => {
    const have = slotFiles(photos, sl);
    const next = { ...photos };
    const moved: Record<string, string> = {};
    have.forEach((_, i) => { next[subKey(sl.key, i)] = null; });
    have.filter((_, i) => i !== pos).forEach((x, i) => {
      next[subKey(sl.key, i)] = x.file;
      moved[subKey(sl.key, i)] = x.key;
    });
    commit(next, moved);
  };

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {slots.flatMap((sl, i) => {
        const box = (key: string, label: string, file: File | null, onFiles: (fs: File[]) => void, onClear: () => void, hint?: string) => (
          <PhotoBox
            key={key}
            slot={{ key, label, hint }}
            file={file}
            onFiles={onFiles}
            onClear={onClear}
            marks={marks[key] ?? []}
            onMarks={(m) => onChange({ photos, marks: { ...marks, [key]: m } })}
            expected={expected}
            style={style}
            tools={tools}
          />
        );
        if (!sl.multi) {
          return [box(sl.key, sl.label, photos[sl.key] ?? null, (fs) => putSingle(i, fs), () => commit({ ...photos, [sl.key]: null }), sl.hint)];
        }
        const max = sl.multi;
        const have = slotFiles(photos, sl);
        const label = (k: number) => (have.length + (have.length < max ? 1 : 0) > 1 ? `${sl.label} - ${k + 1}` : sl.label);
        const cells = have.map((x, k) =>
          box(x.key, label(k), x.file, (fs) => putMulti(sl, k, fs), () => dropMulti(sl, k), k === 0 ? sl.hint : undefined));
        if (have.length < max) {
          const k = have.length;
          cells.push(box(subKey(sl.key, k), label(k), null, (fs) => putMulti(sl, k, fs), () => undefined, k === 0 ? sl.hint : undefined));
        }
        return cells;
      })}
    </div>
  );
}

/** 사진 칸 하나 — 누르면 고르고, 끌어다 놓아도 된다. 넣은 사진은 그 자리에서 보인다 */
export function PhotoBox({ slot, file, onFiles, onClear, marks, onMarks, expected, style = 'red', tools }: {
  slot: PhotoSlot;
  file: File | null;
  onFiles: (files: File[]) => void;
  onClear: () => void;
  /** 사진 위 표시 — 주면 사진 위에 그릴 수 있다 */
  marks?: Mark[];
  onMarks?: (marks: Mark[]) => void;
  /** 그 거점의 설치 대수 — 찍은 번호 수와 견준다 */
  expected?: number | null;
  /** 번호 모양 — 서식이 정한다 */
  style?: NumStyle;
  /** 표시 화면의 도구 — 플러그링크의 도면 기호·거점 라벨 */
  tools?: MarkTools;
}) {
  const dragging = useFileDragging();
  const [over, setOver] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [aspect, setAspect] = useState(4 / 3);
  const [marking, setMarking] = useState(false);
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
          /* 번호는 사진 위 자리라 사진과 같은 틀(비율)에 얹는다 — object-contain 의 빈 띠에 뜨지 않게 */
          <span
            className="relative block"
            // 칸은 4:3 이다 — 그보다 넓은 사진은 폭을, 좁은(세로) 사진은 높이를 채운다
            style={aspect >= 4 / 3 ? { width: '100%', aspectRatio: String(aspect) } : { height: '100%', aspectRatio: String(aspect) }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={slot.label}
              onLoad={(e) => setAspect(e.currentTarget.naturalWidth / (e.currentTarget.naturalHeight || 1))}
              className="h-full w-full object-contain"
            />
            {marks && marks.length > 0 && <AnnotCanvas list={resolveLabels(marks, tools?.labels)} style={style} />}
          </span>
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
        {file && onMarks && (
          <button
            type="button"
            onClick={() => setMarking(true)}
            className={`text-xs font-bold ${marks?.length ? 'text-[#e11d2a]' : 'text-brand-700'} hover:underline`}
          >
            {marks?.length ? `표시 ${marks.length}개` : '표시하기'}
          </button>
        )}
        {file && (
          <button type="button" onClick={onClear} className="text-xs font-bold text-slate-400 hover:text-red-700">
            빼기
          </button>
        )}
      </div>
      {marking && file && onMarks && (
        <MarkEditor
          file={file}
          marks={marks ?? []}
          expected={expected}
          title={slot.label}
          style={style}
          {...tools}
          onClose={() => setMarking(false)}
          onDone={(m) => { onMarks(m); setMarking(false); }}
        />
      )}
    </div>
  );
}

'use client';

/**
 * 플러그링크 실사보고서 v22 작성 화면 — 실사개요·전경사진·도면·거점별 사진대지·공사내역서(입력).
 *
 * 사진대지 화면(SurveyEditor)과 같은 길이다 — 브라우저 안에서 사진을 줄여 서식에 넣고 내려받는다.
 * ★받는 칸은 실제 제출본이 채운 것만이다★ (lib/survey/spec 의 플러그링크 머리말 — 프로덕션 제출본
 * 8건에서 정하고 내 컴퓨터의 제출본 349곳으로 다시 봤다). 나머지(통신·기자재·계통연계·전기안전점검
 * 수량)는 셈한다.
 * 금액은 서식의 수식이 계산한다.
 */
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Section, contractInputClass } from '@/components/contracts/FormControls';
import { Alerts, Btn, Choice, Err, Picks } from '@/components/ui';
import { downloadBlob } from '@/lib/download';
import { useSurveyDraft } from '@/lib/survey/use-draft';
import { newPhotos, usePlateReader } from '@/lib/survey/use-plate';
import { dropSpotLabels, resolveLabels, type Annot, type SpotLabel } from '@/lib/survey/annot';
import { DraftList, SurveyActions } from './DraftControls';
import { prepareImage } from '@/lib/survey/prepare-image';
import type { PreparedImage } from '@/lib/survey/docx-kit';
import { fillPluglinkSurvey, plSurveyFileName } from '@/lib/survey/fill-pluglink';
import {
  PL_ETC_PRESETS, PL_MAX_SPOTS, PL_PHOTO_SLOTS, newPlSpot, plModemAuto, plQtyOf, plSpotLabels, slotFiles,
  type PhotoSlot, type PlEtc, type PlForm, type PlSpot,
} from '@/lib/survey/spec';
import { autoCrops, cropImage, cropMarks, markSig, planBitmap, type CropRect } from '@/lib/survey/plan-crop';
import { nextId, num, today } from '@/lib/survey/form-utils';
import { PhotoBox, PhotoSlots } from './PhotoSlots';
import PlanCrop from './PlanCrop';

const CABLE_SIZES = [6, 10, 16, 25, 35, 50, 70, 95, 120, 150];
const PIPE_SIZES = [16, 22, 28, 36, 42, 54, 70, 82, 104];

const OVERVIEW: PhotoSlot = { key: 'overview', label: '전경사진', hint: '로드뷰도 됨' };
const PLAN: PhotoSlot = { key: 'plan', label: '도면(주차장 평면도)', hint: '설치위치 표기' };

function Text({ label, value, onChange, placeholder, wide, req }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; wide?: boolean; req?: boolean;
}) {
  return (
    <label className={`block ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}{req && <span className="ml-1 text-red-500">*</span>}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={contractInputClass} />
    </label>
  );
}

function Num({ label, value, onChange, unit, placeholder }: {
  label: string; value: number | null; onChange: (v: number | null) => void; unit?: string; placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <span className="flex items-center gap-2">
        <input inputMode="numeric" value={value ?? ''} onChange={(e) => onChange(num(e.target.value))} placeholder={placeholder ?? '0'} className={`${contractInputClass} !w-28 text-right`} />
        {unit && <span className="text-sm text-gray-500">{unit}</span>}
      </span>
    </label>
  );
}

function SizePick({ label, value, sizes, unit, onChange }: {
  label: string; value: number | null; sizes: number[]; unit: string; onChange: (v: number | null) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} className={`${contractInputClass} !w-28`}>
        <option value="">선택</option>
        {sizes.map((s) => <option key={s} value={s}>{s}{unit}</option>)}
      </select>
    </label>
  );
}

/** 도면 확대도에 얹는 그 거점 라벨 — 왼쪽 위, 조금 작게 */
const zoomLabel = (n: number, labels: SpotLabel[]): Annot => {
  const L = labels[n - 1] ?? { head: [`${n}거점`], body: [] };
  return { t: 'label', spot: n, x: 0.22, y: 0.14, head: L.head, body: L.body, z: 0.8 };
};

const Grid = ({ children }: { children: ReactNode }) => <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;

const newPlForm = (): PlForm => ({
  siteName: '', surveyDate: today(), address: '', siteTel: '',
  surveyor: '', existing: '', siteNote: '',
  roadCutM: null, roadCutPrice: null, digM: null, digPrice: null,
  // 제출본에 나온 기타비용 둘 — 단가는 서식 값(인건비 250,000)과 제출본의 IP전주 값
  etc: [{ spec: '인건비', qty: null, price: 250000 }, { spec: 'IP전주', qty: null, price: 300000 }],
  gridType: '공중공급',
  safetyCheck: true,
  overview: null, plan: null, planMarks: [],
  spots: [newPlSpot(nextId())],
});

/** 저장본 → 화면 값 — 빠진 것은 기본값으로(옛 꼴·덜 저장된 저장본도 화면이 깨지지 않게) */
function plFormOf(v: Partial<PlForm> | null | undefined): PlForm {
  const base = newPlForm();
  const spots = Array.isArray(v?.spots) && v.spots.length ? v.spots : base.spots;
  return {
    ...base,
    ...v,
    etc: Array.isArray(v?.etc) ? v.etc : base.etc,
    planMarks: Array.isArray(v?.planMarks) ? v.planMarks : [],
    spots: spots.map((s) => ({ ...newPlSpot(s.id ?? nextId()), ...s })),
  };
}

export default function PluglinkEditor() {
  const [f, setF] = useState<PlForm>(newPlForm);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<string[] | null>(null);
  const set = (p: Partial<PlForm>) => setF((x) => ({ ...x, ...p }));
  const setSpot = (id: string, p: Partial<PlSpot>) =>
    setF((x) => ({ ...x, spots: x.spots.map((s) => (s.id === id ? { ...s, ...p } : s)) }));
  const setEtc = (i: number, p: Partial<PlEtc>) =>
    setF((x) => ({ ...x, etc: x.etc.map((e, k) => (k === i ? { ...e, ...p } : e)) }));

  const photoCount = (f.overview ? 1 : 0) + (f.plan ? 1 : 0)
    + f.spots.reduce((n, s) => n + Object.values(s.photos).filter(Boolean).length, 0);
  // 임시 저장 — 클라우드(lib/survey/use-draft). 저장 뒤 바꾼 것을 두고 나가려 하면 묻는다
  const draft = useSurveyDraft('pluglink', f, (v) => { const next = plFormOf(v); setF(next); return next; }, f.siteName, busy !== null);
  /** 거점 라벨 — 넣은 거점은 그 값으로, 그 뒤로 여섯 거점까지는 번호만(spec plSpotLabels) */
  const labels = useMemo(() => plSpotLabels(f.spots), [f.spots]);

  /*
   * 사진을 넣었을 때 저절로 되는 일 둘:
   *   ① 분전반 외부·내부 사진 → 분전반 이름(내부면 메인차단기도), 전주번호 사진 → 전주번호 — 사진의 글자를
   *      읽어 빈 칸만 채운다(lib/survey/use-plate)
   *   ② 도면 확대도 → 그 거점의 라벨(배선·배관 길이가 든 흰 상자)을 얹어 둔다. 거점 값에 묶여 있어 길이를
   *      고치면 따라 바뀐다(annot resolveLabels). 옮기거나 빼는 것은 표시하기에서.
   */
  const plate = usePlateReader();
  const fRef = useRef(f);
  fRef.current = f;
  const onSpotPhotos = (s: PlSpot, p: { photos: Record<string, File | null>; marks: Record<string, Annot[]> }) => {
    let marks = p.marks;
    const n = f.spots.indexOf(s) + 1;
    if (p.photos.zoom && p.photos.zoom !== s.photos.zoom && !marks.zoom?.length) {
      marks = { ...marks, zoom: [zoomLabel(n, labels)] };
    }
    for (const [key, file] of newPhotos(s.photos, p.photos, ['panelOut', 'panelIn', 'pole'])) {
      // 읽은 것 → 칸. 메인차단기는 외함 안을 찍은 사진에서만 — 바깥 사진의 숫자는 다른 차단기일 수 있다
      const fields: Array<'poleNo' | 'panelName' | 'mainBreaker'> =
        key === 'pole' ? ['poleNo'] : key === 'panelIn' ? ['poleNo', 'panelName', 'mainBreaker'] : ['poleNo', 'panelName'];
      const tag = (k: string) => `${s.id}:${k}`;
      plate.read(tag(key), fields.map(tag), file, (r, canFill) => {
        const now = fRef.current.spots.find((x) => x.id === s.id);
        if (!now || now.photos[key] !== file) return null;
        const got = { poleNo: r.pole, panelName: r.panel, mainBreaker: r.breaker };
        const fill: Partial<PlSpot> = {};
        const filled: Record<string, string> = {};
        for (const k of fields) {
          const v = got[k];
          if (v && canFill(tag(k), now[k] ?? '')) { fill[k] = v; filled[tag(k)] = v; }
        }
        if (Object.keys(fill).length === 0) return null;
        setF((x) => ({ ...x, spots: x.spots.map((y) => (y.id === s.id ? { ...y, ...fill } : y)) }));
        return filled;
      }, ['pole', 'panelOut', 'panelIn'].indexOf(key));
    }
    // 도면 확대도를 손으로 바꾸거나 뺐으면 도면에서 잘라 넣은 것이 아니다 — 다시 자르기에서 빠진다
    const zoomCrop = p.photos.zoom === s.photos.zoom ? s.zoomCrop : undefined;
    setSpot(s.id, { photos: p.photos, marks, zoomCrop });
  };

  /*
   * ③ 전체 도면 → 거점별 도면 확대도(lib/survey/plan-crop) — 도면 표시 창을 닫을 때마다(한백 2026-10-02):
   *   도면에 붙인 거점 라벨 수만큼 거점을 늘리고(줄이지는 않는다 — 값이 든 거점일 수 있다), 라벨마다 틀을 잡아
   *   자른 그림과 그 안의 표시를 그 거점의 도면 확대도로 넣는다. 손으로 넣은 확대도와, 넣은 뒤 표시를 고친
   *   확대도는 덮지 않는다(spec PlSpot.zoomCrop). 틀은 「범위 고치기」에서 사람이 다시 잡는다.
   */
  const [zooming, setZooming] = useState(0);
  const [zoomErr, setZoomErr] = useState<string | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  /** 비어 있거나, 도면에서 잘라 넣고 표시를 그대로 둔 확대도 — 다시 잘라도 되는 자리(plan-crop markSig) */
  const untouched = (s: PlSpot) => !s.photos.zoom || (!!s.zoomCrop && markSig(s.marks.zoom) === s.zoomCrop.sig);
  /*
   * 차례 — 도면을 빠르게 두 번 고치거나 그사이 거점을 빼면 앞 차례의 결과는 버린다(뒤 것이 먼저 끝나 옛 틀로
   * 덮이거나, 당겨진 거점에 남의 자리가 들어가던 것). 도면을 그대로 다시 닫았으면 다시 자르지 않는다 — 새 파일이
   * 생겨 「바뀐 것 있음」이 되고 저장할 때 확대도를 다시 올렸다.
   */
  const zoomGen = useRef(0);
  const lastZoomed = useRef<{ plan: File; sig: string } | null>(null);
  const zoomOf = async (bmp: ImageBitmap, planMarks: Annot[], n: number, rect: CropRect, manual: boolean, lbls: typeof labels) => {
    const file = await cropImage(bmp, rect, `도면확대도-${n}거점.jpg`);
    let marks = cropMarks(resolveLabels(planMarks, lbls), rect, bmp.width, bmp.height);
    // 그 거점 라벨이 틀 밖이면(범위를 옮겼으면) 하나 얹는다 — 도면 확대도를 손으로 넣을 때와 같다
    if (!marks.some((a) => a.t === 'label' && a.spot === n)) marks = [...marks, zoomLabel(n, lbls)];
    return { file, marks, crop: { rect, manual, sig: markSig(marks) } };
  };
  type Zoom = Awaited<ReturnType<typeof zoomOf>>;
  const putZooms = (gen: number, plan: File, planMarks: Annot[], made: Map<number, Zoom>, added: PlSpot[], force = false) =>
    setF((x) => {
      // 그새 다음 차례가 시작됐거나 도면·도면 표시가 바뀌었다
      if (gen !== zoomGen.current || x.plan !== plan || x.planMarks !== planMarks || made.size === 0) return x;
      const need = Math.max(0, ...made.keys());
      const list = x.spots.length < need ? [...x.spots, ...added.slice(0, need - x.spots.length)] : x.spots;
      return {
        ...x,
        spots: list.map((s, i) => {
          const z = made.get(i + 1);
          if (!z || (!force && !untouched(s))) return s;
          return { ...s, photos: { ...s.photos, zoom: z.file }, marks: { ...s.marks, zoom: z.marks }, zoomCrop: z.crop };
        }),
      };
    });
  /** 도면 그림을 한 번 읽어 거점마다 자른다 */
  async function cutZooms(gen: number, plan: File, jobs: (bmp: ImageBitmap) => Promise<Map<number, Zoom>>) {
    setZooming((n) => n + 1);
    setZoomErr(null);
    try {
      const bmp = await planBitmap(plan);
      try {
        return await jobs(bmp);
      } finally {
        bmp.close?.();
      }
    } catch (err) {
      if (gen === zoomGen.current) setZoomErr((err as Error).message || '도면 확대도를 만들지 못했습니다.');
      return null;
    } finally {
      setZooming((n) => n - 1);
    }
  }
  async function planToZooms(plan: File, planMarks: Annot[]) {
    const nums = [...new Set(planMarks.flatMap((a) => (a.t === 'label' && a.spot && a.spot <= PL_MAX_SPOTS ? [a.spot] : [])))];
    if (nums.length === 0) return;
    const cur = fRef.current.spots;
    const sig = markSig(planMarks);
    if (lastZoomed.current?.plan === plan && lastZoomed.current.sig === sig && nums.every((n) => cur[n - 1]?.photos.zoom)) return;
    const gen = ++zoomGen.current;
    const need = Math.max(...nums);
    const added = Array.from({ length: Math.max(0, need - cur.length) }, () => newPlSpot(nextId()));
    const spots = [...cur, ...added];
    const lbls = plSpotLabels(spots);
    const made = await cutZooms(gen, plan, async (bmp) => {
      const rects = autoCrops(resolveLabels(planMarks, lbls), bmp.width, bmp.height);
      const out = new Map<number, Zoom>();
      for (const n of nums) {
        if (gen !== zoomGen.current) break;
        const s = spots[n - 1];
        if (!untouched(s)) continue;
        const rect = s.zoomCrop?.manual ? s.zoomCrop.rect : rects.get(n);
        if (rect) out.set(n, await zoomOf(bmp, planMarks, n, rect, !!s.zoomCrop?.manual, lbls));
      }
      return out;
    });
    if (!made) return;
    putZooms(gen, plan, planMarks, made, added);
    lastZoomed.current = { plan, sig };
  }
  /**
   * 거점 빼기 — 라벨이 거점 번호에 묶여 있으니 도면·사진의 라벨 번호를 같이 당긴다(annot dropSpotLabels).
   * 도면에서 잘라 넣고 손대지 않은 확대도는 당긴 뒤에도 「손대지 않음」으로 남게 sig 를 새로 잰다. 돌던 자르기는 버린다.
   */
  const removeSpot = (i: number) => {
    zoomGen.current += 1;
    setF((x) => {
      const n = i + 1;
      const spots = x.spots.filter((_, k) => k !== i).map((s) => {
        const was = untouched(s) && !!s.zoomCrop;
        const marks = Object.fromEntries(Object.entries(s.marks).map(([k, m]) => [k, dropSpotLabels(m, n)]));
        const zoomCrop = s.zoomCrop && was ? { ...s.zoomCrop, sig: markSig(marks.zoom) } : s.zoomCrop;
        return { ...s, marks, zoomCrop };
      });
      return { ...x, planMarks: dropSpotLabels(x.planMarks, n), spots };
    });
  };

  /** 범위 고치기 — 사람이 잡은 틀이라 손댄 확대도도 그 틀로 다시 자른다 */
  async function recrop(i: number, rect: CropRect) {
    const plan = f.plan;
    if (!plan) return;
    const planMarks = f.planMarks;
    const gen = ++zoomGen.current;
    const made = await cutZooms(gen, plan, async (bmp) => new Map([[i + 1, await zoomOf(bmp, planMarks, i + 1, rect, true, labels)]]));
    if (made) putZooms(gen, plan, planMarks, made, [], true);
  }

  /* 확인할 것 — 가이드가 「필히 기입」이라 적은 것들. 막지는 않는다 */
  const review = useMemo(() => {
    const out: string[] = [];
    if (!f.address.trim()) out.push('주소가 비어 있습니다');
    if (!f.overview) out.push('전경사진이 비어 있습니다');
    if (!f.plan) out.push('도면이 비어 있습니다');
    f.spots.forEach((s, i) => {
      const tag = f.spots.length > 1 ? `${i + 1}거점 · ` : '';
      if (!s.location.trim()) out.push(`${tag}상세위치가 비어 있습니다`);
      if (plQtyOf(s) === 0) out.push(`${tag}대수(신규·교체)가 비어 있습니다`);
      if (s.inlet === '분전반' && !s.panelName.trim()) out.push(`${tag}분전반 이름이 비어 있습니다`);
      const must = ['place', 'panelOut', 'route'];
      const empty = PL_PHOTO_SLOTS.filter((sl) => must.includes(sl.key) && slotFiles(s.photos, sl).length === 0).map((sl) => sl.label);
      if (empty.length) out.push(`${tag}사진 비어 있음 — ${empty.join(', ')}`);
    });
    return out;
  }, [f]);

  async function make() {
    setError(null);
    setMade(null);
    let done = 0;
    const tick = () => { done += 1; setBusy(`사진 준비 중 ${done}/${photoCount}`); };
    try {
      setBusy(photoCount ? `사진 준비 중 0/${photoCount}` : '만드는 중…');
      const spots: Record<string, Record<string, PreparedImage | undefined>> = {};
      for (const s of f.spots) {
        spots[s.id] = {};
        for (const sl of PL_PHOTO_SLOTS) {
          for (const { key, file } of slotFiles(s.photos, sl)) {
            // 굽지 않는다 — 표시는 엑셀 도형으로 얹어 엑셀에서 다시 고친다(lib/survey/xlsx-marks)
            spots[s.id][key] = await prepareImage(file, resolveLabels(s.marks[key] ?? [], labels), 'red', false);
            tick();
          }
        }
      }
      const overview = f.overview ? await prepareImage(f.overview) : undefined;
      if (overview) tick();
      const plan = f.plan ? await prepareImage(f.plan, resolveLabels(f.planMarks, labels), 'red', false) : undefined;
      if (plan) tick();
      setBusy('서식 채우는 중…');
      const res = await fetch('/survey/pluglink-v22.xlsx');
      if (!res.ok) throw new Error(`서식을 불러오지 못했습니다 (${res.status})`);
      const out = await fillPluglinkSurvey({ ...f, siteName: f.siteName.trim() }, { overview, plan, spots }, await res.arrayBuffer());
      downloadBlob(out.blob as Blob, plSurveyFileName(f.siteName));
      setMade(out.warnings);
    } catch (err) {
      setError((err as Error).message || '만들지 못했습니다.');
    } finally {
      setBusy(null);
    }
  }

  const canMake = f.siteName.trim() ? true as const : '현장명 미입력 — 만들 수 없음';
  const actions = <SurveyActions draft={draft} make={() => void make()} busy={busy} canMake={canMake} />;

  return (
    <div className="flex flex-col gap-5">
      <DraftList draft={draft} />
      {actions}
      <Section title="1. 현장">
        <div className="flex flex-col gap-5">
          <Grid>
            <Text label="현장명" req wide value={f.siteName} onChange={(v) => set({ siteName: v })} placeholder="창동서울가든아파트" />
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">실사일</span>
              <input type="date" value={f.surveyDate} onChange={(e) => set({ surveyDate: e.target.value })} className={contractInputClass} />
            </label>
            <Text label="현장 연락처" value={f.siteTel} onChange={(v) => set({ siteTel: v })} placeholder="02-000-0000" />
            <Text label="주소" wide value={f.address} onChange={(v) => set({ address: v })} placeholder="서울특별시 도봉구 해등로 32" />
            <Text label="현장실사자" wide value={f.surveyor} onChange={(v) => set({ surveyor: v })} placeholder="한백 / 홍길동 / 010-0000-0000" />
            <Text label="기설치대수" wide value={f.existing} onChange={(v) => set({ existing: v })} placeholder="완속 8기" />
            <Text label="현장 특이사항" wide value={f.siteNote} onChange={(v) => set({ siteNote: v })} placeholder="터파기 구간, 기존 배관 이용 여부" />
          </Grid>
          <div className="grid items-start gap-x-3 gap-y-4 sm:grid-cols-2">
            <PhotoBox slot={OVERVIEW} file={f.overview} onFiles={(fs) => set({ overview: fs[0] })} onClear={() => set({ overview: null })} />
            <PhotoBox
              slot={PLAN}
              file={f.plan}
              onFiles={(fs) => set({ plan: fs[0], planMarks: [] })}
              onClear={() => set({ plan: null, planMarks: [] })}
              marks={f.planMarks}
              onMarks={(m) => { set({ planMarks: m }); if (f.plan) void planToZooms(f.plan, m); }}
              expected={f.spots.reduce((n, s) => n + plQtyOf(s), 0)}
              // 도면은 촘촘하다 — 작게로 열고, 선은 배선 경로부터(제출본 도면의 빨간 선은 화살표가 없다)
              tools={{ legend: true, labels, line: 'wire', size: 0.7, large: true }}
            />
          </div>
          {f.plan && (zooming > 0 || zoomErr || f.spots.some((s) => s.zoomCrop)) && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-gray-700">거점별 도면 확대도</span>
              {zooming > 0 ? (
                <span className="text-small font-bold text-brand-700">만드는 중…</span>
              ) : (
                f.spots.map((s, i) => s.zoomCrop && (
                  <span key={s.id} className="rounded-tag bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700">{i + 1}거점</span>
                ))
              )}
              <Btn size="sm" kind="quiet" disabled={zooming > 0} onClick={() => setAdjusting(true)}>범위 고치기</Btn>
              <Err>{zoomErr}</Err>
            </div>
          )}
          {adjusting && f.plan && (
            <PlanCrop
              file={f.plan}
              marks={resolveLabels(f.planMarks, labels)}
              spots={f.spots.map((_, i) => `${i + 1}거점`)}
              crops={f.spots.map((s) => s.zoomCrop?.rect)}
              onCrop={recrop}
              onClose={() => setAdjusting(false)}
            />
          )}
        </div>
      </Section>

      {f.spots.map((s, i) => (
        <Section key={s.id} title={`${i + 2}. ${i + 1}거점`}>
          <div className="flex flex-col gap-5">
            {/* 사진이 먼저 — 분전반·전주 사진이 아래 분전반 이름·전주번호 칸을 채운다(한백 2026-10-02) */}
            <div>
              <span className="mb-2 block text-sm font-medium text-gray-700">사진대지</span>
              <PhotoSlots
                slots={PL_PHOTO_SLOTS}
                photos={s.photos}
                marks={s.marks}
                onChange={(p) => onSpotPhotos(s, p)}
                expected={plQtyOf(s)}
                style="red"
                // 라벨은 거점 모두 — 도면 확대도에는 이웃 거점이 같이 찍힌다. 처음 고른 것은 이 거점
                tools={{ legend: true, labels, labelPick: `${i + 1}거점` }}
              />
            </div>
            <Grid>
              <Text label="상세위치" wide value={s.location} onChange={(v) => setSpot(s.id, { location: v })} placeholder="지하2층 102동 앞 G02기둥" />
              <Num label="신규" unit="기" value={s.qty} onChange={(v) => setSpot(s.id, { qty: v })} />
              <Num label="교체" unit="기" value={s.replQty} onChange={(v) => setSpot(s.id, { replQty: v })} />
              <div>
                <span className="mb-1.5 block text-sm font-medium text-gray-700">인입</span>
                <div className="flex gap-1.5">
                  <Choice on={s.inlet === '분전반'} onClick={() => setSpot(s.id, { inlet: '분전반' })}>분전반</Choice>
                  <Choice on={s.inlet === '한전인입'} onClick={() => setSpot(s.id, { inlet: '한전인입' })}>한전인입</Choice>
                </div>
              </div>
              {s.inlet === '한전인입' && (
                <Text
                  label={`전주번호${plate.note(`${s.id}:poleNo`)}`}
                  value={s.poleNo ?? ''}
                  onChange={(v) => { plate.clear(`${s.id}:poleNo`); setSpot(s.id, { poleNo: v }); }}
                  placeholder="2175G142 송정선 49R3"
                />
              )}
              {s.inlet === '분전반' && (
                <>
                  <Text
                    label={`분전반 이름${plate.note(`${s.id}:panelName`)}`}
                    value={s.panelName}
                    onChange={(v) => { plate.clear(`${s.id}:panelName`); setSpot(s.id, { panelName: v }); }}
                    placeholder="PM-305"
                  />
                  <Text
                    label={`메인차단기${plate.note(`${s.id}:mainBreaker`)}`}
                    value={s.mainBreaker}
                    onChange={(v) => { plate.clear(`${s.id}:mainBreaker`); setSpot(s.id, { mainBreaker: v }); }}
                    placeholder="4P 225A"
                  />
                  <Text label="사용 차단기" value={s.inletBreaker} onChange={(v) => setSpot(s.id, { inletBreaker: v })} placeholder="4P 75A" />
                  <span className="hidden lg:block" />
                </>
              )}
              <SizePick label="배관 SIZE" value={s.pipeSize} sizes={PIPE_SIZES} unit="mm" onChange={(v) => setSpot(s.id, { pipeSize: v })} />
              <Num label="배관 길이" unit="m" value={s.pipeLen} onChange={(v) => setSpot(s.id, { pipeLen: v })} />
              <SizePick label="배선 SIZE" value={s.cableSize} sizes={CABLE_SIZES} unit="sq" onChange={(v) => setSpot(s.id, { cableSize: v })} />
              <Num label="배선 길이" unit="m" value={s.cableLen} onChange={(v) => setSpot(s.id, { cableLen: v })} />
              <Num label="스탠드" unit="개" value={s.stand} onChange={(v) => setSpot(s.id, { stand: v })} placeholder={String(plQtyOf(s))} />
              <Num label="캐노피" unit="개" value={s.canopy} onChange={(v) => setSpot(s.id, { canopy: v })} placeholder={String(plQtyOf(s))} />
              <Num label="볼라드" unit="개" value={s.bollard} onChange={(v) => setSpot(s.id, { bollard: v })} placeholder={String(plQtyOf(s))} />
              {/* 통신 — 비우면 충전기 6기당 1개로 셈한다(그 값이 흐린 글자로 보인다). 현장에 따라 고친다 */}
              <Num label="통신" unit="개" value={s.modem ?? null} onChange={(v) => setSpot(s.id, { modem: v })} placeholder={String(plModemAuto(s))} />
              <Text label="특이사항" wide value={s.note} onChange={(v) => setSpot(s.id, { note: v })} />
            </Grid>
            {f.spots.length > 1 && (
              <div className="flex justify-end">
                <Btn size="sm" kind="undo" onClick={() => removeSpot(i)}>{i + 1}거점 빼기</Btn>
              </div>
            )}
          </div>
        </Section>
      ))}

      <div>
        <Btn kind="side" disabled={f.spots.length >= PL_MAX_SPOTS} onClick={() => set({ spots: [...f.spots, newPlSpot(nextId())] })}>
          {f.spots.length >= PL_MAX_SPOTS ? `실사개요는 ${PL_MAX_SPOTS}거점까지` : '거점 추가'}
        </Btn>
      </div>

      <Section title={`${f.spots.length + 2}. 추가 공사`}>
        <div className="flex flex-col gap-5">
          <Grid>
            <Num label="도로커팅" unit="m" value={f.roadCutM} onChange={(v) => set({ roadCutM: v })} />
            <Num label="도로커팅 단가" unit="원/m" value={f.roadCutPrice} onChange={(v) => set({ roadCutPrice: v })} placeholder="22000" />
            <Num label="땅파기" unit="m" value={f.digM} onChange={(v) => set({ digM: v })} />
            <Num label="땅파기 단가" unit="원/m" value={f.digPrice} onChange={(v) => set({ digPrice: v })} placeholder="20000" />
          </Grid>
          <div>
            <span className="mb-1.5 block text-sm font-medium text-gray-700">기타비용</span>
            <div className="flex flex-col gap-2">
              {f.etc.map((e, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <input value={e.spec} onChange={(ev) => setEtc(i, { spec: ev.target.value })} placeholder="항목(고소작업 등)" className={`${contractInputClass} !w-48`} />
                  <input inputMode="numeric" value={e.qty ?? ''} onChange={(ev) => setEtc(i, { qty: num(ev.target.value) })} placeholder="수량" className={`${contractInputClass} !w-20 text-right`} />
                  <span className="text-sm text-gray-500">×</span>
                  <input inputMode="numeric" value={e.price ?? ''} onChange={(ev) => setEtc(i, { price: num(ev.target.value) })} placeholder="단가" className={`${contractInputClass} !w-32 text-right`} />
                  <span className="text-sm text-gray-500">원</span>
                  {f.etc.length > 1 && (
                    <button type="button" onClick={() => set({ etc: f.etc.filter((_, k) => k !== i) })} className="text-xs font-bold text-slate-400 hover:text-red-700">빼기</button>
                  )}
                </div>
              ))}
              {f.etc.length < 10 && (
                <div className="flex flex-wrap items-center gap-2">
                  <Btn size="sm" kind="quiet" onClick={() => set({ etc: [...f.etc, { spec: '', qty: null, price: null }] })}>항목 추가</Btn>
                  <Picks
                    options={PL_ETC_PRESETS.map((p) => p.spec).filter((spec) => !f.etc.some((e) => e.spec.trim() === spec))}
                    onPick={(spec) => {
                      const p = PL_ETC_PRESETS.find((x) => x.spec === spec);
                      // 빈 줄이 있으면 거기에, 없으면 새 줄로
                      const blank = f.etc.findIndex((e) => !e.spec.trim());
                      const row = { spec, qty: null, price: p?.price ?? null };
                      set({ etc: blank >= 0 ? f.etc.map((e, k) => (k === blank ? row : e)) : [...f.etc, row] });
                    }}
                  />
                </div>
              )}
            </div>
          </div>
          {f.spots.some((s) => s.inlet === '한전인입') && (
            <div>
              <span className="mb-1.5 block text-sm font-medium text-gray-700">계통타입</span>
              <div className="flex gap-1.5">
                <Choice on={f.gridType === '공중공급'} onClick={() => set({ gridType: '공중공급' })}>공중공급</Choice>
                <Choice on={f.gridType === '지중공급'} onClick={() => set({ gridType: '지중공급' })}>지중공급</Choice>
              </div>
            </div>
          )}
          <div>
            <span className="mb-1.5 block text-sm font-medium text-gray-700">전기안전점검 수수료</span>
            <div className="flex gap-1.5">
              <Choice on={f.safetyCheck} onClick={() => set({ safetyCheck: true })}>포함</Choice>
              <Choice on={!f.safetyCheck} onClick={() => set({ safetyCheck: false })}>미포함</Choice>
            </div>
          </div>
        </div>
      </Section>

      {error && <Alerts tone="stop" title="만들지 못했습니다" items={[{ text: error }]} />}
      {made && made.length > 0 && <Alerts tone="warn" title={`만들었습니다 — 엑셀에서 확인할 것 ${made.length}건`} items={made.map((text) => ({ text }))} />}
      <Alerts tone="warn" title={`확인할 것 ${review.length}건`} items={review.map((text) => ({ text }))} />

      {actions}
    </div>
  );
}

'use client';

/**
 * 플러그링크 실사보고서 v22 작성 화면 — 실사개요·전경사진·도면·거점별 사진대지·공사내역서(입력).
 *
 * 사진대지 화면(SurveyEditor)과 같은 길이다 — 브라우저 안에서 사진을 줄여 서식에 넣고 내려받는다.
 * ★받는 칸은 실제 제출본이 채운 것만이다★ (lib/survey/spec 의 플러그링크 머리말 — 프로덕션 제출본
 * 8건에서 정했다). 나머지(통신·기자재·계통연계·계통타입·전기안전점검 수량)는 셈하거나 고정한다.
 * 금액은 서식의 수식이 계산한다.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Section, contractInputClass } from '@/components/contracts/FormControls';
import { Alerts, Btn, Choice } from '@/components/ui';
import { downloadBlob } from '@/lib/download';
import { useLeaveGuard } from '@/lib/use-leave-guard';
import { prepareImage } from '@/lib/survey/prepare-image';
import type { PreparedImage } from '@/lib/survey/docx-kit';
import { fillPluglinkSurvey, plSurveyFileName } from '@/lib/survey/fill-pluglink';
import {
  PL_PHOTO_SLOTS, newPlSpot, plModemOf, plQtyOf, type PhotoSlot, type PlEtc, type PlForm, type PlSpot,
} from '@/lib/survey/spec';
import { PhotoBox, nextId, num, today } from './SurveyEditor';

const CABLE_SIZES = [6, 10, 16, 25, 35, 50, 70, 95, 120, 150];
const PIPE_SIZES = [16, 22, 28, 36, 42, 54, 70, 82, 104];
const MAX_SPOTS = 6;

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

const Grid = ({ children }: { children: ReactNode }) => <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{children}</div>;

export default function PluglinkEditor() {
  const [f, setF] = useState<PlForm>(() => ({
    siteName: '', surveyDate: today(), address: '', siteTel: '',
    surveyor: '', existing: '', siteNote: '',
    roadCutM: null, roadCutPrice: null, digM: null, digPrice: null,
    // 제출본에 나온 기타비용 둘 — 단가는 서식 값(인건비 250,000)과 제출본의 IP전주 값
    etc: [{ spec: '인건비', qty: null, price: 250000 }, { spec: 'IP전주', qty: null, price: 250000 }],
    safetyCheck: true,
    overview: null, plan: null, planMarks: [],
    spots: [newPlSpot(nextId())],
  }));
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
  useLeaveGuard(photoCount > 0 || busy !== null, '넣은 사진과 값은 저장되지 않습니다 — 나가면 사라집니다. 나가시겠습니까?');

  /* 확인할 것 — 가이드가 「필히 기입」이라 적은 것들. 막지는 않는다 */
  const review = useMemo(() => {
    const out: string[] = [];
    if (!f.address.trim()) out.push('주소가 비어 있습니다');
    if (!f.overview) out.push('전경사진이 비어 있습니다');
    if (!f.plan) out.push('도면이 비어 있습니다');
    f.spots.forEach((s, i) => {
      const tag = f.spots.length > 1 ? `${i + 1}거점 · ` : '';
      if (!s.location.trim()) out.push(`${tag}상세위치가 비어 있습니다`);
      if (plQtyOf(s) === 0) out.push(`${tag}대수가 비어 있습니다`);
      if (s.inlet === '분전반' && !s.panelName.trim()) out.push(`${tag}분전반 이름이 비어 있습니다`);
      const must = ['place', 'panelOut', 'route1'];
      const empty = PL_PHOTO_SLOTS.filter((sl) => must.includes(sl.key) && !s.photos[sl.key]).map((sl) => sl.label);
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
          const file = s.photos[sl.key];
          if (!file) continue;
          spots[s.id][sl.key] = await prepareImage(file, s.marks[sl.key] ?? []);
          tick();
        }
      }
      const overview = f.overview ? await prepareImage(f.overview) : undefined;
      if (overview) tick();
      const plan = f.plan ? await prepareImage(f.plan, f.planMarks) : undefined;
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

  return (
    <div className="flex flex-col gap-5">
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
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <PhotoBox slot={OVERVIEW} file={f.overview} onFiles={(fs) => set({ overview: fs[0] })} onClear={() => set({ overview: null })} />
            <PhotoBox
              slot={PLAN}
              file={f.plan}
              onFiles={(fs) => set({ plan: fs[0], planMarks: [] })}
              onClear={() => set({ plan: null, planMarks: [] })}
              marks={f.planMarks}
              onMarks={(m) => set({ planMarks: m })}
              expected={f.spots.reduce((n, s) => n + plQtyOf(s), 0)}
            />
          </div>
        </div>
      </Section>

      {f.spots.map((s, i) => (
        <Section key={s.id} title={`${i + 2}. ${i + 1}거점`}>
          <div className="flex flex-col gap-5">
            <Grid>
              <Text label="상세위치" wide value={s.location} onChange={(v) => setSpot(s.id, { location: v })} placeholder="지하2층 102동 앞 G02기둥" />
              <Num label="대수" unit="기" value={s.qty} onChange={(v) => setSpot(s.id, { qty: v })} />
              <div>
                <span className="mb-1.5 block text-sm font-medium text-gray-700">인입</span>
                <div className="flex gap-1.5">
                  <Choice on={s.inlet === '분전반'} onClick={() => setSpot(s.id, { inlet: '분전반' })}>분전반</Choice>
                  <Choice on={s.inlet === '한전인입'} onClick={() => setSpot(s.id, { inlet: '한전인입' })}>한전인입</Choice>
                </div>
              </div>
              {s.inlet === '분전반' && (
                <>
                  <Text label="분전반 이름" value={s.panelName} onChange={(v) => setSpot(s.id, { panelName: v })} placeholder="PM-305" />
                  <Text label="메인차단기" value={s.mainBreaker} onChange={(v) => setSpot(s.id, { mainBreaker: v })} placeholder="4P 225A" />
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
              <div>
                <span className="mb-1 block text-sm font-medium text-gray-700">통신</span>
                <span className="block py-2 text-sm font-bold text-gray-700">{plModemOf(s)}개</span>
              </div>
              <Text label="특이사항" wide value={s.note} onChange={(v) => setSpot(s.id, { note: v })} />
            </Grid>
            <div>
              <span className="mb-2 block text-sm font-medium text-gray-700">사진대지</span>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {PL_PHOTO_SLOTS.map((sl, k) => (
                  <PhotoBox
                    key={sl.key}
                    slot={sl}
                    file={s.photos[sl.key] ?? null}
                    onFiles={(files) => {
                      // 여러 장이면 이 칸부터 빈 칸 순서대로(사진대지 화면과 같은 규칙)
                      const next = { ...s.photos, [sl.key]: files[0] };
                      const rest = files.slice(1);
                      for (const later of PL_PHOTO_SLOTS.slice(k + 1)) {
                        if (rest.length === 0) break;
                        if (!next[later.key]) next[later.key] = rest.shift()!;
                      }
                      const marks = { ...s.marks };
                      for (const key of Object.keys(next)) if (next[key] !== s.photos[key]) delete marks[key];
                      setSpot(s.id, { photos: next, marks });
                    }}
                    onClear={() => {
                      const marks = { ...s.marks };
                      delete marks[sl.key];
                      setSpot(s.id, { photos: { ...s.photos, [sl.key]: null }, marks });
                    }}
                    marks={s.marks[sl.key] ?? []}
                    onMarks={(m) => setSpot(s.id, { marks: { ...s.marks, [sl.key]: m } })}
                    expected={plQtyOf(s)}
                  />
                ))}
              </div>
            </div>
            {f.spots.length > 1 && (
              <div className="flex justify-end">
                <Btn size="sm" kind="undo" onClick={() => set({ spots: f.spots.filter((x) => x.id !== s.id) })}>{i + 1}거점 빼기</Btn>
              </div>
            )}
          </div>
        </Section>
      ))}

      <div>
        <Btn kind="side" disabled={f.spots.length >= MAX_SPOTS} onClick={() => set({ spots: [...f.spots, newPlSpot(nextId())] })}>
          {f.spots.length >= MAX_SPOTS ? `실사개요는 ${MAX_SPOTS}거점까지` : '거점 추가'}
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
                <div>
                  <Btn size="sm" kind="quiet" onClick={() => set({ etc: [...f.etc, { spec: '', qty: null, price: null }] })}>항목 추가</Btn>
                </div>
              )}
            </div>
          </div>
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

      <div className="flex flex-wrap items-center gap-3">
        <Btn onClick={() => void make()} busy={busy !== null} busyLabel={busy ?? undefined} disabled={!f.siteName.trim()}>
          {f.siteName.trim() ? '실사보고서 만들기' : '현장명 미입력 — 만들 수 없음'}
        </Btn>
      </div>
    </div>
  );
}

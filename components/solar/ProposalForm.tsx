'use client';

/**
 * 솔라쉐어바로 제안서 만들기 — 값 다섯을 적으면 서식 한 벌이 채워져 내려온다.
 *
 * ★우리 DB 에 아무것도 안 쓴다★ — 서식도 결과도 브라우저 안에서만 돈다(실사보고서와 같다).
 * 서버 라우트도 임시 저장도 없다. 쓰는 사람에게는 「적고 받는다」가 전부다.
 *
 * ★바뀌는 것과 상수를 갈라 둔다★ (한백 2026-10-22 「모든 가정과 발전량은 가정이라 그냥
 * 상수야 · 바뀌는 건 고객사 이름과 주소 등」). 전제는 보이되 못 고친다 — 안 보이면 무엇을
 * 전제로 한 수인지 모르고, 고칠 수 있으면 사람마다 다른 제안서가 나간다. 입력칸이 아니라
 * 글자인 것이 그 말이다(화면 규칙 4).
 *
 * ★유도된 값을 먼저 보여주고 내려준다★ — 제안서는 열어 보고 고치는 물건이 아니라 그대로
 * 고객에게 간다. 받기 전에 장수·누적이 말이 되는지 눈에 걸려야 한다.
 */
import { useMemo, useState } from 'react';
import { Btn, Err, FIELD, PANEL, TEXT, Val } from '@/components/ui';
import { downloadBlob } from '@/lib/download';
import { eokLabel, kwh, manLabel, pctLabel } from '@/lib/solar/econ';
import {
  PROPOSAL_CONST, fillProposal, numbersOf, proposalFileName, regionOf, selfUseKwhOf,
  type ProposalInput,
} from '@/lib/solar/fill-proposal';
import { loadTemplate } from '@/lib/solar/template';

/** 「352.95」·「322,730」 둘 다 받는다 — 붙여넣는 값에 쉼표가 섞인다 */
function num(v: string): number {
  const n = Number(v.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export default function ProposalForm() {
  const [customer, setCustomer] = useState('');
  const [address, setAddress] = useState('');
  const [regionEdit, setRegionEdit] = useState<string | null>(null);
  const [capacity, setCapacity] = useState('');
  const [selfUseEdit, setSelfUseEdit] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* 지역은 주소에서 따라온다 — 손으로 고치면 그 값이 이긴다(화면 규칙 7) */
  const region = regionEdit ?? regionOf(address);
  const capacityKw = num(capacity);

  /*
   * 연 소비가능 발전량도 용량에서 따라온다 (한백 지시 2026-10-22 「자동 계산되게 해놔야지」) —
   * 지역과 같은 결이다. 진짜 사용량을 알면 적어서 덮는다.
   */
  const selfUseAuto = capacityKw > 0 ? selfUseKwhOf(capacityKw) : 0;
  const selfUseKwh = selfUseEdit === null ? selfUseAuto : num(selfUseEdit);

  const input: ProposalInput = {
    customer: customer.trim(),
    address: address.trim(),
    region: region.trim(),
    capacityKw,
    selfUseKwh,
  };

  const n = useMemo(
    () => (capacityKw > 0 && selfUseKwh > 0 ? numbersOf({ ...input, capacityKw, selfUseKwh }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [capacityKw, selfUseKwh]
  );

  /* 못 하는 이유를 단추 이름에 적는다(화면 규칙 3) */
  const missing = !input.customer ? '고객사명 없음 — 제안서 생성 불가'
    : !input.address ? '주소 없음 — 제안서 생성 불가'
      : !input.region ? '지역 없음 — 제안서 생성 불가'
        : capacityKw <= 0 ? '설비용량 없음 — 제안서 생성 불가'
          : selfUseKwh <= 0 ? '연 소비가능 발전량 없음 — 제안서 생성 불가'
            : null;

  async function make() {
    setError(null);
    setBusy('서식 받는 중…');
    try {
      const buf = await loadTemplate();
      setBusy('채우는 중…');
      /* jszip 은 여기서만 쓴다 — 첫 화면에 싣지 않는다(실사보고서도 같은 길) */
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(buf);
      const r = await fillProposal(zip, input);

      /*
       * ★안 걸린 열쇠가 하나라도 있으면 안 내려준다★ — 치환 열쇠는 서식에 적힌 샘플 값
       * (무창 현장)이라, 안 걸렸다는 것은 그 자리에 남의 회사 수치가 그대로 남았다는 뜻이다.
       * 사람은 앞장의 고객 이름만 보고 보낸다.
       */
      if (r.missed.length > 0) {
        throw new Error(
          `서식이 바뀌었습니다 — ${r.missed.length}개 값이 안 바뀝니다(${r.missed[0]} 등). 그대로 보내면 다른 현장 수치가 남습니다.`
        );
      }
      if (r.econRows !== PROPOSAL_CONST.years + 1) {
        throw new Error(`20년 손익표를 ${r.econRows}줄만 썼습니다 — 서식의 표가 바뀌었습니다.`);
      }
      downloadBlob(r.file as Blob, proposalFileName(input.customer));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex max-w-[760px] flex-col gap-4">
      <section className={`${PANEL} p-5`}>
        <h2 className={`${TEXT.section} mb-4`}>현장</h2>
        <div className="flex flex-col gap-3">
          <Field label="고객사명">
            <input
              className={FIELD}
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              placeholder="(주)무창"
            />
          </Field>
          <Field label="사업 부지 주소">
            <input
              className={FIELD}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="충남 아산시 선장면 서부남로 199-32"
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="지역">
              <input
                className={FIELD}
                value={region}
                onChange={(e) => setRegionEdit(e.target.value)}
                placeholder="아산"
              />
            </Field>
            <Field label="설비용량 (kW)">
              <input
                className={`${FIELD} tabular-nums`}
                inputMode="decimal"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                placeholder="352.95"
              />
            </Field>
            <Field label="연 소비가능 발전량 (kWh)">
              <input
                className={`${FIELD} tabular-nums`}
                inputMode="numeric"
                value={selfUseEdit ?? (selfUseAuto ? selfUseAuto.toLocaleString('ko-KR') : '')}
                onChange={(e) => setSelfUseEdit(e.target.value)}
                placeholder="322,730"
              />
            </Field>
          </div>
        </div>
      </section>

      <section className={`${PANEL} p-5`}>
        <h2 className={`${TEXT.section} mb-4`}>제안서에 들어갈 값</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-5">
          <Out label="모듈" v={n && `${n.moduleCount.toLocaleString('ko-KR')}장`} />
          <Out label="연 발전량" v={n && `${kwh(n.genKwh)} kWh`} />
          <Out label="초과발전" v={n && pctLabel(n.excessRatio)} />
          <Out label="첫해 이득" v={n && manLabel(n.firstYear)} />
          <Out label={`${PROPOSAL_CONST.years}년 누적`} v={n && eokLabel(n.total)} />
        </dl>
      </section>

      <section className={`${PANEL} p-5`}>
        <h2 className={`${TEXT.section} mb-4`}>제안의 전제</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
          <Out label="설비임대단가" v={`${PROPOSAL_CONST.leaseRate}원/kWh`} />
          <Out label="기존 전력량 단가" v={`${PROPOSAL_CONST.gridRate}원/kWh`} />
          <Out label="상계단가" v={`${PROPOSAL_CONST.offsetRate}원/kWh`} />
          <Out label="발전시간" v={`${PROPOSAL_CONST.hoursPerDay}시간/일`} />
          <Out label="자가소비율" v={`${PROPOSAL_CONST.selfUseRate * 100}%`} />
          <Out label="전기요금 인상률" v={`연 ${PROPOSAL_CONST.escalation * 100}%`} />
          <Out label="설비효율 감소율" v={`연 ${PROPOSAL_CONST.decay * 100}%`} />
        </dl>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Btn onClick={() => void make()} disabled={!!missing} busy={!!busy} busyLabel={busy ?? ''}>
          {missing ?? '제안서 만들기'}
        </Btn>
        <Err>{error}</Err>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className={TEXT.label}>{label}</span>
      {children}
    </label>
  );
}

/** 빈 값도 자리를 지킨다 — 아직 적지 않은 것은 「—」다(화면 규칙 6·10) */
function Out({ label, v }: { label: string; v: string | null | false }) {
  return (
    <div className="min-w-0">
      <dt className={TEXT.label}>{label}</dt>
      <dd className="mt-0.5 text-lead tabular-nums">
        <Val value={v || null} when="wait" />
      </dd>
    </div>
  );
}

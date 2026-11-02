'use client';

/**
 * 운영사 기성관리 — 운영사에게서 받을 돈.
 *
 * 축은 차수와 트리거다. 조건(환경부 승인일·실착공일·준공마감일)이 차면 ★그 다음 달부터★ 한백이
 * 운영사에 청구하고(한백 2026-11-02), 청구한 돈이 들어오면 수금이다. 그래서 각 차수가 지금 어디까지
 * 왔는지가 합계보다 먼저 보여야 한다.
 *
 * 협력사 지급은 여기 없다. 별도 화면이다 — 두 방향을 한 표에 놓으면 상계해서 보는
 * 사람이 생기고, 「얼마 남았나」가 어느 쪽 이야기인지 매번 따져야 한다.
 *
 * ★말★ 들어오는 돈은 「수금」이다. 「회수」는 지급 원장에서 협력사에게 잘못 준 돈을
 * 돌려받는 뜻으로 이미 쓰고 있어서(PAYOUT_KINDS), 같은 글자가 정반대 방향을 가리켰다.
 * 합계의 이름은 회계 말이다(한백 지시 2026-11-02) — 총 기성액 · 수주잔고 · 청구 가능 · 미수금 ·
 * 수금 완료. 뜻과 셈은 lib/settlement receivableMoneyOf 한 곳이다.
 *
 * ★이 화면이 답해야 하는 질문★ (한백 2026-08-28 — UX 개선)
 *   지금 청구할 것이 무엇인가 · 무엇을 기다리는가 · 얼마가 안 들어왔나.
 * 전에는 전 현장이 저장소 순서로 쭉 나왔고 거를 자리도 정렬도 없었다. 무엇을 기다리는지도
 * 화면에 없었다(트리거 열을 걷으면서 정보까지 사라졌다). 그 셋을 메운다.
 * 첫 물음의 답은 체크로 바로 이어진다 — 청구 가능 줄을 체크해 청구일 하나로 기록한다(2026-11-02).
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { SettlementSummary } from '@/types/project';
import {
  claimMonthLabel, closeDateNeeded, receivableMoneyOf,
  safetyFeeApplies, safetyFeeDue, safetyFeeReceiptState, safetyFeeStateOf,
  STEP_LABEL, STEP_TONE,
} from '@/lib/settlement';
import { today } from '@/lib/date';
import {
  Badge, Blank, Btn, Confirm, Empty, Err, FIELD, FIELD_BASE, FIELD_CELL, Tag, Td, Th,
} from '@/components/ui';
import { DatePicker } from '@/components/DatePicker';
import { useAction } from '@/lib/use-action';
import CheckMenu from '@/components/CheckMenu';
import { Frame, SiteLink, Tile, won } from './parts';

/** 거르는 축 — 상태는 「그 현장에 그런 차수가 하나라도 있나」로 본다 */
type Flag = 'open' | 'scheduled' | 'unpaid' | 'done' | 'norule' | 'unpriced' | 'closemiss' | 'feeopen' | 'feemiss';
const FLAGS: Array<{ key: Flag; label: string }> = [
  { key: 'open', label: '청구 가능' },
  /* 조건이 이번 달에 찬 것 — 다음 달 1일에 청구 가능으로 넘어온다. 달 끝에 다음 청구를 미리 본다 */
  { key: 'scheduled', label: '청구 예정' },
  { key: 'unpaid', label: '미수금' },
  { key: 'done', label: '수금 완료' },
  { key: 'norule', label: '정산 규칙 미지정' },
  /*
   * ★정산 규칙이 있어도 라인에 단가가 없으면 금액이 안 선다★ (한백 지적 2026-10-02 「왜
   * 운영사기성관리에는 안뜬거야」). 정산 현황은 「단가 미지정 N건」을 세는데 이 표는 규칙만
   * 봐서, 사업구분을 바꾸는 중이던 현장(신정이펜하우스3단지)이 0원 줄로 말없이 서 있었다.
   * 판정은 정산 현황과 같다 — unpricedLines > 0 (한 라인이라도 비면 그만큼 적다).
   */
  { key: 'unpriced', label: '단가 미지정' },
  /*
   * ★할 일인데 이 표에서 찾을 길이 없었다★ (한백 지적 2026-09-15 「이게 할일인지 아닌지
   * 운영사 기성관리에는 뜨지 않아」). 그 줄의 차수 칸은 「대기 · 준공마감」이라 무엇을
   * 기다리는지는 적혀 있었지만, 그 날짜를 지금 한백이 넣어야 한다는 것은 어디에도 없었다.
   */
  { key: 'closemiss', label: '준공마감일 미지정' },
  /*
   * 수수료 두 축 — 대상 현장이 116곳이라 이 축이 없으면 「청구액을 안 적은 현장」을
   * 현장 상세를 하나씩 열어야 안다(한백 「이것도 수금 관리를 해야해」).
   * 주소 열쇠(feeopen)는 그대로 둔다 — 옛 링크가 같은 화면을 연다.
   */
  { key: 'feeopen', label: '점검수수료 청구 가능' },
  { key: 'feemiss', label: '점검수수료 미기재' },
];

/**
 * 정렬 — 기본은 청구 가능이 큰 것부터다.
 *
 * 그것이 이 화면을 여는 이유다: 「지금 청구할 돈이 어디 있나」. 예전 기본값은
 * 저장소 순서(현장 번호)였는데 그 순서는 이 질문과 아무 상관이 없다.
 */
type SortKey = 'open' | 'unpaid' | 'backlog' | 'plan' | 'name';
const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'open', label: '청구 가능 많은 순' },
  { key: 'unpaid', label: '미수금 많은 순' },
  { key: 'backlog', label: '수주잔고 많은 순' },
  { key: 'plan', label: '총 기성액 많은 순' },
  { key: 'name', label: '현장명' },
];

/** 이 줄을 청구하면 실리는 것 — 청구 가능 차수 + 청구 가능 점검수수료 */
type ClaimPart = 1 | 2 | 3 | 'fee';
function claimPartsOf(r: SettlementSummary): ClaimPart[] {
  const parts: ClaimPart[] = r.steps.filter((s) => s.state === 'open').map((s) => s.no);
  /* 게이트를 여기서도 본다 — 조립이 안 받는 운영사의 값을 null 로 보내지만 판정하는 자리마다 cpo 를 본다 */
  if (safetyFeeApplies(r.cpo) && safetyFeeStateOf(r) === 'open') parts.push('fee');
  return parts;
}

export default function ReceivableBoard({ rows, canEdit }: {
  rows: SettlementSummary[];
  /** 점검수수료·청구를 이 표에서 바로 적을 수 있나 — 한백 관리자만 (열람 전용은 읽기만) */
  canEdit: boolean;
}) {
  const sp = useSearchParams();
  const [q, setQ] = useState(() => sp.get('q') ?? '');
  const [flags, setFlags] = useState<Flag[]>(
    () => (sp.get('flag')?.split(',').filter(Boolean) ?? []) as Flag[]
  );
  /** 운영사·상태 모두 여럿 고른다 — 드롭다운 안에서 체크한다(한백 지시 2026-08-28) */
  const [cpos, setCpos] = useState<string[]>(() => sp.get('cpo')?.split(',').filter(Boolean) ?? []);
  const [sort, setSort] = useState<SortKey>(() => (sp.get('sort') as SortKey) ?? 'open');
  /** 청구할 줄 — 현장 id. 그 줄의 청구 가능 차수·수수료가 통째로 실린다 */
  const [picked, setPicked] = useState<Set<string>>(new Set());

  /* 걸린 것은 주소에 남긴다 — 링크로 보내면 같은 화면이 열린다(현장 보드와 같은 방식) */
  useEffect(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (flags.length) p.set('flag', flags.join(','));
    if (cpos.length) p.set('cpo', cpos.join(','));
    if (sort !== 'open') p.set('sort', sort);
    const qs = p.toString();
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  }, [q, flags, cpos, sort]);

  /** 목록에 실제로 있는 운영사만 고를 수 있게 한다 — 없는 값을 고르는 자리를 두지 않는다 */
  const cpoOptions = useMemo(
    () => [...new Set(rows.map((r) => r.cpo))].sort((a, b) => a.localeCompare(b, 'ko')),
    [rows]
  );

  /* 줄마다 돈 토막 — 셈은 lib/settlement 한 곳이다(정산현황·할 일과 같은 함수) */
  const moneyBy = useMemo(() => new Map(rows.map((r) => [r.id, receivableMoneyOf(r)])), [rows]);
  const m = (r: SettlementSummary) => moneyBy.get(r.id)!;

  const shown = useMemo(() => {
    const needle = q.trim();
    const mo = (r: SettlementSummary) => moneyBy.get(r.id)!;
    const passes = (r: SettlementSummary) => {
      if (needle && !r.name.includes(needle)) return false;
      if (cpos.length && !cpos.includes(r.cpo)) return false;
      // 상태끼리는 OR 다 — 「청구 가능이 있거나 미수금인 것」을 보고 싶을 때가 있다
      if (flags.length === 0) return true;
      return flags.some((f) =>
        f === 'open' ? claimPartsOf(r).length > 0
          : f === 'scheduled' ? r.steps.some((s) => s.state === 'scheduled')
            : f === 'unpaid' ? mo(r).unpaid > 0
              : f === 'done' ? r.planTotal > 0 && r.collectedTotal >= r.planTotal
                : f === 'feeopen' ? safetyFeeApplies(r.cpo) && safetyFeeStateOf(r) === 'open'
                  /* 준공완료 뒤에 청구액이 없는 것만 센다 — 준공 전에는 아직 올 때가 아니다 */
                  : f === 'feemiss' ? safetyFeeApplies(r.cpo) && r.safetyFee === null && safetyFeeDue(r.status)
                    /* 할 일 카드와 같은 함수를 본다 — 두 벌로 세면 배지와 표가 갈린다 */
                    : f === 'closemiss' ? closeDateNeeded(r.status, r.steps)
                      : f === 'unpriced' ? r.unpricedLines > 0
                        : r.ruleName === null
      );
    };
    const by: Record<SortKey, (a: SettlementSummary, b: SettlementSummary) => number> = {
      open: (a, b) => mo(b).claimable - mo(a).claimable,
      unpaid: (a, b) => mo(b).unpaid - mo(a).unpaid,
      backlog: (a, b) => mo(b).backlog - mo(a).backlog,
      plan: (a, b) => b.planTotal - a.planTotal,
      name: (a, b) => a.name.localeCompare(b.name, 'ko'),
    };
    /*
     * ★정산 규칙 미지정은 어떤 정렬에서도 맨 위다★ (한백 지시 2026-10-01). 규칙이 없으면 차수도
     * 금액도 없어 청구 가능·미수금이 0 으로 계산되고, 금액순 정렬에서는 늘 맨 아래로 가라앉았다 —
     * 가장 먼저 손대야 할 현장이 가장 안 보이는 자리에 있었다. 그 안끼리는 고른 정렬을 따른다.
     * ★단가 미지정도 같은 자리다★ (2026-10-02) — 금액이 안 서거나 모자라는 까닭이 같다.
     */
    const blocked = (r: SettlementSummary) => r.ruleName === null || r.unpricedLines > 0;
    const blockedFirst = (a: SettlementSummary, b: SettlementSummary) =>
      Number(!blocked(a)) - Number(!blocked(b));
    return rows.filter(passes).sort((a, b) => blockedFirst(a, b) || by[sort](a, b));
  }, [rows, q, flags, cpos, sort, moneyBy]);

  /*
   * 합계는 ★보고 있는 목록★의 합이다 — 거른 뒤에도 전체 합을 보여주면 화면의 숫자와 표가
   * 어긋나고, 「이 운영사에게 받을 돈」을 볼 방법이 없어진다. 전체는 줄 수로 적는다.
   */
  const money = useMemo(() => {
    const sum = (f: (x: ReturnType<typeof receivableMoneyOf>) => number) =>
      shown.reduce((n, r) => n + f(moneyBy.get(r.id)!), 0);
    return {
      plan: sum((x) => x.plan),
      backlog: sum((x) => x.backlog),
      claimable: sum((x) => x.claimable),
      feeClaimable: sum((x) => x.feeClaimable),
      scheduled: sum((x) => x.scheduled),
      unpaid: sum((x) => x.unpaid),
      shortfall: sum((x) => x.shortfall),
      collected: sum((x) => x.collected),
      /* 수금률에서 빼기 위해 따로 센다 — 수수료는 차수 진행률에 안 든다 */
      feePlan: sum((x) => x.feePlan),
      feeCollected: sum((x) => x.feeCollected),
    };
  }, [shown, moneyBy]);

  /*
   * ★수금률은 차수만 센다★ (한백 2026-09-06 「수금률에 포함시키지마」) — 분모·분자에서
   * 수수료를 뺀다. 그 돈은 준공완료 뒤 영수증으로 청구하는 차수 밖의 마지막 한 건이라
   * 차수 진행률에 섞으면 「기성이 어디까지 왔나」가 흐려진다. 현장 상세 기성 탭의
   * collectionRate 도 같은 규칙이다 — 두 화면이 같은 숫자를 봐야 한다.
   */
  const stepPlan = money.plan - money.feePlan;
  const stepCollected = money.collected - money.feeCollected;
  const rate = stepPlan > 0 ? Math.round((stepCollected / stepPlan) * 1000) / 10 : null;
  const active = flags.length + cpos.length + (q.trim() ? 1 : 0);

  /*
   * ★청구할 줄 고르기★ (한백 지시 2026-11-02) — 지급관리의 가확정과 같은 꼴이다: 체크 → 청구일 하나 → N곳.
   * 거른 줄은 안 실린다 — 안 보이는 것이 함께 나가면 합계가 거짓말이 된다. 머리 칸은 ★보이는★ 청구 가능 줄만.
   */
  const claimRows = canEdit ? shown.filter((r) => claimPartsOf(r).length > 0) : [];
  const chosen = claimRows.filter((r) => picked.has(r.id));
  const allPicked = claimRows.length > 0 && claimRows.every((r) => picked.has(r.id));
  const somePicked = !allPicked && claimRows.some((r) => picked.has(r.id));
  const toggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setPicked((prev) => {
      const next = new Set(prev);
      for (const r of claimRows) {
        if (allPicked) next.delete(r.id);
        else next.add(r.id);
      }
      return next;
    });

  return (
    <div>
      {/*
        * 다섯 숫자는 서로 관계가 있다 — 그 관계가 읽히게 놓는다 (한백 지시 2026-11-02 · 회계 말):
        *
        *   총 기성액 = 수주잔고 + 미수금 + 수금 완료
        *   청구 가능 ⊂ 수주잔고 (아직 청구 안 한 돈 중 지금 청구할 수 있는 것)
        *
        * 순서는 돈이 흘러가는 차례다: 총액 → 아직 청구 안 함 → ★지금 청구할 것★ → 청구했는데 안 들어옴 →
        * 들어옴. 「청구 가능」이 수주잔고 바로 뒤인 것은 그 안의 몫이라서다(부기가 「수주잔고 중」이라 말한다).
        * 예전 넷(총 받아야 할 돈 · 받을 수 있는 돈 · 수금 완료 · 미수금)은 청구를 기록하지 않던 때의 말이라
        * 「미수금」이 아직 조건도 안 찬 돈까지 담고 있었다.
        */}
      <section aria-label="기성 합계" className="mb-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <Tile label="총 기성액" value={money.plan}
            note={`현장 ${shown.length}건`} />
          <Tile label="수주잔고" value={money.backlog}
            note={money.backlog === 0 ? undefined : '아직 청구하지 않은 돈'} />
          {/*
            수수료는 트리거가 없어 금액을 적은 순간부터 이 칸에 든다 — 부기가 「조건이 찬
            차수」라고만 말하면 차수가 하나도 안 열린 현장에서 금액이 서는 것이 거짓말이 된다.
          */}
          <Tile label="청구 가능" value={money.claimable} tone="wait"
            note={[
              money.claimable > 0 ? '수주잔고 중' : '지금 청구할 것 없음',
              money.feeClaimable > 0 ? `점검수수료 ${won(money.feeClaimable)}원 포함` : null,
              money.scheduled > 0 ? `다음 달부터 ${won(money.scheduled)}원 더` : null,
            ].filter(Boolean).join(' · ')} />
          {/* 다 받은 목록에 부기가 뜨면 안 된다 — 0원에는 아무것도 달지 않는다 */}
          <Tile label="미수금" value={money.unpaid}
            note={money.unpaid === 0 ? undefined
              : money.shortfall > 0 ? `실수금 차액 ${won(money.shortfall)}원 포함` : '청구했는데 안 들어온 돈'} />
          {/* 수금률은 ★차수만★ 센다 (한백 2026-09-06) — 그래서 이름에 「차수」를 적는다 */}
          <Tile label="수금 완료" value={money.collected} tone="in"
            note={rate !== null ? `차수 수금률 ${rate}%` : undefined} />
        </div>
      </section>

      {/*
        * 위 줄은 「어느 현장을 찾나」 — 현장명과 정렬. 거르는 자리는 표 바로 위다.
        * ★폭은 FIELD 에 덧붙여 못 바꾼다★ — w-full 이 박혀 있어 뒤에 붙는 w-* 가 안 먹는다
        * (2026-08-28 실측, components/ui.tsx 의 설명). FIELD_BASE 를 쓰고 폭을 직접 준다.
        */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[180px] flex-1">
          <span className="sr-only">현장명 검색</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="현장명 검색"
            className={`${FIELD} bg-white`}
          />
        </label>
        <select
          aria-label="정렬"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className={`${FIELD_BASE} w-[190px] shrink-0 bg-white`}
        >
          {SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
      </div>

      {/*
        * 표 왼쪽 상단 — 거르는 자리. 노션처럼 접힌 드롭다운 안에서 체크한다(한백 지시
        * 2026-08-28): 상태 넷과 운영사 다섯을 칩으로 늘어놓으면 필터가 표보다 커진다.
        * 줄 수는 같은 줄에 붙고, 오른쪽 끝은 청구 막대다(지급관리의 가확정 막대와 같은 자리).
        */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <CheckMenu label="상태" options={FLAGS.map((f) => ({ value: f.key, label: f.label }))}
          picked={flags} onChange={(v) => setFlags(v as Flag[])} />
        <CheckMenu label="운영사" options={cpoOptions.map((c) => ({ value: c, label: c }))}
          picked={cpos} onChange={setCpos} width={200} />
        {active > 0 && (
          <button
            type="button"
            onClick={() => { setQ(''); setFlags([]); setCpos([]); }}
            className="rounded-ctl px-2.5 py-2 text-small font-semibold text-slate-500 transition hover:text-slate-800"
          >
            초기화
          </button>
        )}
        <p className="text-small font-semibold text-slate-500">
          {active > 0 ? (
            <>
              {shown.length}건 <span className="font-normal text-slate-500">/ 전체 {rows.length}건</span>
            </>
          ) : (
            <>전체 {rows.length}건</>
          )}
        </p>
        {claimRows.length > 0 && (
          <ClaimBar chosen={chosen} moneyOf={m} onDone={() => setPicked(new Set())} />
        )}
      </div>

      {/*
        * 정산 규칙 열은 표에서 뺐다(한백 확인 2026-08-23) — 규칙 이름은 차수·금액을 그대로
        * 풀어 쓴 긴 문자열이라 표에서 한 열을 통째로 먹으면서, 정작 표가 답해야 하는
        * 「어느 차수까지 왔고 얼마 남았나」와는 상관이 없다. 규칙은 현장 상세의 기성 탭에서 본다.
        *
        * ★세어서 띠로 알리던 것도 걷었다★ (한백 지시 2026-08-28) — 「정산 규칙이 없는 현장
        * 6건 — … 기성 탭에서 지정해야 합니다」는 안내문이었다(화면 규칙 2). 대신 그 사실을
        * 해당 줄에 꼬리표로 남긴다: 규칙이 없으면 차수가 전부 「해당없음」으로 보여서, 기성이
        * 원래 없는 현장과 계산이 안 되는 현장이 같아 보인다(화면 규칙 10).
        */}
      {shown.length === 0 ? (
        <Blank>{rows.length === 0 ? '현장 0건' : '걸린 조건에 맞는 현장 0건'}</Blank>
      ) : (
        <Frame min={canEdit ? '1180px' : '1140px'}>
          <thead className="border-b border-slate-100 bg-slate-50 text-tiny font-bold tracking-[0.06em] text-slate-500">
            <tr>
              {canEdit && (
                <Th className="w-10">
                  {claimRows.length > 0 && (
                    <input
                      type="checkbox"
                      aria-label={`청구 가능 ${claimRows.length}곳 모두 선택`}
                      title={allPicked ? '모두 풀기' : `청구 가능 ${claimRows.length}곳 모두 선택`}
                      checked={allPicked}
                      ref={(el) => { if (el) el.indeterminate = somePicked; }}
                      onChange={toggleAll}
                      className="h-4 w-4 accent-brand-600"
                    />
                  )}
                </Th>
              )}
              <Th left>현장</Th>
              {/* 차수 열의 값은 그 차수의 상태다. 금액과 트리거는 그 아래 딸린 값이다. */}
              <Th>1차</Th>
              <Th>2차</Th>
              <Th>3차</Th>
              {/*
                ★차수 다음의 마지막 수금단계★ (한백 2026-09-06 「맨 마지막에 수금 이외
                추가적인 수금단계로 카운트해」). 차수 셋과 나란히 서야 줄의 합이 눈으로 맞는다 —
                열이 없으면 「총 기성액」이 차수 셋의 합보다 큰 이유를 표에서 찾을 수 없다.
              */}
              <Th>점검수수료</Th>
              <Th money>총 기성액</Th>
              <Th money>청구 가능</Th>
              <Th money>미수금</Th>
              <Th money>수금 완료</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map((r) => {
              const x = m(r);
              const claimable = canEdit && claimPartsOf(r).length > 0;
              return (
              <tr
                key={r.id}
                className={`transition ${claimable && picked.has(r.id) ? 'bg-brand-50/60' : 'hover:bg-brand-50/40'}`}
              >
                {canEdit && (
                  <Td className={`border-l-[3px] ${claimable ? 'border-l-amber-400' : 'border-l-transparent'}`}>
                    {/* 청구할 것이 없는 줄에는 칸 자체가 비어 있다 — 눌리지 않는 체크박스보다 분명하다 */}
                    {claimable && (
                      <input
                        type="checkbox"
                        aria-label={`${r.name} 청구 선택`}
                        checked={picked.has(r.id)}
                        onChange={() => toggle(r.id)}
                        className="h-4 w-4 accent-brand-600"
                      />
                    )}
                  </Td>
                )}
                <Td left className="min-w-[13rem]">
                  <SiteLink id={r.id} name={r.name} tab="receivable" />
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-tiny text-slate-500">
                    <span>{r.cpo} · {r.qty}대 · {r.status}</span>
                    {r.ruleName === null && <Tag tone="warn">정산 규칙 미지정</Tag>}
                    {r.unpricedLines > 0 && <Tag tone="warn">단가 미지정</Tag>}
                    {/*
                      마지막 기성을 그 날짜 하나가 막고 있다 — 넣는 자리는 시공 탭 준공완료
                      구간이다(한백 지시 2026-09-15). 「정산 규칙 미지정」과 같은 꼴로 적는다.
                    */}
                    {closeDateNeeded(r.status, r.steps) && <Tag tone="warn">준공마감일 없음</Tag>}
                  </p>
                </Td>
                {([1, 2, 3] as const).map((no) => (
                  <StepCell key={no} step={r.steps.find((s) => s.no === no) ?? null} />
                ))}
                <FeeCell row={r} canEdit={canEdit} />
                <Td money className="font-bold text-slate-800">
                  {won(r.planTotal)}
                </Td>
                <Td money className="font-bold text-amber-800">
                  {x.claimable > 0 ? won(x.claimable) : <span className="text-slate-300">—</span>}
                </Td>
                <Td money className="font-bold text-slate-600">
                  {x.unpaid > 0 ? won(x.unpaid) : <span className="text-slate-300">—</span>}
                </Td>
                <Td money className="font-bold text-brand-800">
                  {r.collectedTotal > 0 ? won(r.collectedTotal) : <span className="text-slate-300">—</span>}
                </Td>
              </tr>
              );
            })}
          </tbody>
        </Frame>
      )}
    </div>
  );
}

/**
 * 청구 막대 — 체크한 줄들을 청구일 하나로 기록한다 (한백 지시 2026-11-02).
 *
 * 지급관리의 가확정 막대와 같은 자리·같은 꼴이다(표 오른쪽 위). 청구일은 오늘로 채워 연다 —
 * 실제로 청구서를 보낸 날을 적는 자리라 정기일 같은 후보가 없다. 금액은 받지 않는다(계획액이다).
 */
function ClaimBar({
  chosen, moneyOf, onDone,
}: {
  chosen: SettlementSummary[];
  moneyOf: (r: SettlementSummary) => ReturnType<typeof receivableMoneyOf>;
  onDone: () => void;
}) {
  const { busy, error, run } = useAction();
  const [at, setAt] = useState<string | null>(today());
  const sum = chosen.reduce((n, r) => n + moneyOf(r).claimable, 0);
  const items = chosen.flatMap((r) => claimPartsOf(r).map((part) => ({ projectId: r.id, part })));

  async function claim() {
    if (!at) return;
    const ok = await run({
      url: '/api/receivables/claim',
      body: { at, items },
      fail: '청구를 기록하지 못했습니다.',
    });
    if (ok) onDone();
  }

  return (
    <div className="ml-auto flex flex-wrap items-center justify-end gap-2.5">
      <span className="text-small font-bold text-slate-600">
        {chosen.length}곳 · <span className="tabular-nums">{won(sum)}</span>원
      </span>
      <DatePicker ariaLabel="청구일" value={at} onChange={setAt} disabled={busy} />
      <Btn disabled={chosen.length === 0 || !at} busy={busy} busyLabel="기록 중…" onClick={() => void claim()}>
        {chosen.length === 0 ? '줄을 체크해 청구 기록' : !at ? '청구일을 고르세요' : `${chosen.length}곳 청구 기록`}
      </Btn>
      <Err>{error}</Err>
    </div>
  );
}

/**
 * 점검수수료 한 칸 — 차수 다음의 마지막 수금단계 (한백 2026-09-06).
 *
 * 차수 칸(StepCell)과 같은 꼴이다: 상태가 값이고 금액이 그 아래 딸린다. 다른 점은 트리거가
 * 없다는 것뿐이다 — 준공완료 뒤 협력사 영수증으로 운영사에 청구하는 돈이라 여는 사건이 없다.
 *
 * 빈 값이 셋으로 갈린다(화면 규칙 10): 안 받는 운영사는 「해당없음」, 준공 전에는 「—」
 * (아직 올 때가 아님), 준공완료 뒤 금액이 없으면 노랑 「미지정」.
 */
function FeeCell({ row, canEdit }: { row: SettlementSummary; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  if (!safetyFeeApplies(row.cpo)) {
    return <Td><Empty kind="na" /></Td>;
  }

  /*
   * ★이 표의 첫 쓰기 자리다★ (한백 2026-09-06 「표에서 바로 적게해줘」). 대상이 116곳이라
   * 현장을 하나씩 열어 적는 것은 116번 건너가는 일이었다. 표의 칸은 「여러 건을 쭉 넣는
   * 자리」라 화면 규칙 4(평소엔 글자, 고칠 때만 입력칸)의 예외로 이미 적혀 있다.
   */
  if (editing) {
    return (
      <Td>
        <FeeEdit row={row} onDone={() => setEditing(false)} />
      </Td>
    );
  }

  /* 판정은 조립·상세와 같은 함수로 한다 — 표만 다른 셈을 쓰면 두 화면이 갈린다 */
  const state = safetyFeeStateOf(row);
  const receipt = safetyFeeReceiptState(row.safetyFeeReceiptStatus, row.safetyFeeReceiptCount);
  /* 지나온 날 — 수금이면 수금일, 미수면 청구일 */
  const when = state === 'collected' ? row.safetyFeeCollectedAt
    : state === 'claimed' ? `${row.safetyFeeClaimedAt} 청구` : null;
  return (
    <Td>
      {state === 'none' ? (
        <Empty kind={safetyFeeDue(row.status) ? 'miss' : 'wait'} />
      ) : (
        <>
          {/* 차수 칸과 같은 색·같은 말을 쓴다 — 같은 표에서 두 어휘를 두지 않는다 */}
          <Badge tone={STEP_TONE[state]}>{STEP_LABEL[state]}</Badge>
          <span className="mt-0.5 block text-tiny font-semibold tabular-nums text-slate-500">
            {won(row.safetyFee ?? 0)}
            {when && ` · ${when}`}
          </span>
        </>
      )}
      {/*
        영수증은 여기서 세기만 한다 — 파일은 현장 상세에서 받는다.
        ★0장도 적는다★ (2026-09-08) — 청구액을 적었는데 근거가 안 온 현장이 표에서
        빈 칸과 구별되지 않았다. 청구액이 없으면 아직 물을 일이 아니라 조용히 둔다.

        ★반려는 장수로 안 갈린다★ (2026-09-08 설계검증) — 반려는 파일을 지우지 않아서
        돌려보낸 한 장이 「영수증 1장」으로, 곧 청구 근거가 온 것처럼 서 있었다.
        반려는 청구액이 없어도 적는다 — 돌려보낸 서류는 그 자체로 사람이 볼 일이다.
      */}
      {receipt === 'arrived' ? (
        <span className="mt-0.5 block text-tiny font-semibold text-slate-500">
          영수증 {row.safetyFeeReceiptCount}장
        </span>
      ) : receipt === 'rejected' ? (
        <span className="mt-0.5 block text-tiny font-semibold text-red-700">영수증 반려</span>
      ) : row.safetyFee !== null && (
        <span className="mt-0.5 block text-tiny font-semibold text-amber-700">영수증 미제출</span>
      )}
      {canEdit && (
        <Btn size="sm" kind="quiet" className="mt-0.5" onClick={() => setEditing(true)}>
          {row.safetyFee === null ? '입력' : '수정'}
        </Btn>
      )}
    </Td>
  );
}

/**
 * 표 안에서 금액·수금일을 적는다 — 한 칸에서 두 사실을 받는다.
 *
 * ★금액과 수금일을 같이 보낸다★ (한백 2026-09-06 「금액과 수금일 동시에 입력해야만
 * 수금완료로 처리」). 수금일을 비우면 수금을 되돌린다(화면 규칙 7).
 *
 * ★수금일 칸은 청구한 수수료에만 선다★ (한백 결정 2026-11-02 — 수금은 청구 뒤에). 청구는 줄을 체크해
 * 청구 막대에서 한다 — 차수와 같은 자리다. 금액만 적고 저장하면 「청구 가능」이다.
 */
function FeeEdit({ row, onDone }: { row: SettlementSummary; onDone: () => void }) {
  const { busy, error, run } = useAction();
  /* 열 때의 값을 쥐고 있는다 — 사람이 만진 키만 보내기 위한 기준이다 */
  const [was] = useState({ fee: row.safetyFee, at: row.safetyFeeCollectedAt });
  const [amount, setAmount] = useState(row.safetyFee === null ? '' : String(row.safetyFee));
  const [at, setAt] = useState(row.safetyFeeCollectedAt);
  const [asking, setAsking] = useState(false);

  const wipes = amount === '' && (row.safetyFeeClaimedAt !== null || row.safetyFeeCollectedAt !== null);
  /* 수금일을 적을 수 있는 자리 — 청구했거나(미수) 이미 받은 것(옛 기록은 청구일이 없다) */
  const canCollect = row.safetyFeeClaimedAt !== null || row.safetyFeeCollectedAt !== null;

  /*
   * ★사람이 만진 키만 보낸다★ — 라우트·저장소는 「준 키만 고친다」로 서 있다
   * (금액과 수금일은 두 사실이고 적는 순서가 따로다). 둘을 늘 같이 보내면, 편집칸을
   * 열어 둔 사이 다른 자리에서 찍힌 수금일이 열 때의 값(null)으로 덮여 조용히 취소된다.
   */
  const patch = (): { amount?: number | null; collectedAt?: string | null } => {
    const next = amount === '' ? null : Number(amount);
    /* 금액을 지우는 것은 한 사실이다 — 저장소가 수금일도 같이 지운다 */
    if (next === null) return { amount: null };
    const out: { amount?: number | null; collectedAt?: string | null } = {};
    if (next !== was.fee) out.amount = next;
    if (at !== was.at) out.collectedAt = at;
    return out;
  };

  const send = (body: { amount?: number | null; collectedAt?: string | null }) =>
    void run({
      url: `/api/projects/${row.id}/settlement`,
      body: { safetyFee: body },
      fail: '점검수수료를 저장하지 못했습니다.',
    }).then((ok) => { if (ok) onDone(); });

  const save = () => {
    /* 수금 기록이 같이 사라지는 것은 되돌릴 수 없다 — 현장 상세와 같은 자리에서 묻는다 */
    if (wipes) { setAsking(true); return; }
    const body = patch();
    if (Object.keys(body).length === 0) { onDone(); return; } // 만진 것이 없으면 그냥 닫는다
    send(body);
  };

  return (
    <div className="flex flex-col items-stretch gap-1.5 text-left">
      {/*
        ★어느 현장에 적고 있는지 칸 안에서 보인다★ — 저장하면 정렬이 다시 계산돼 줄이
        위로 튄다(청구 가능에 이 금액이 든다). 116곳을 훑는 흐름에서 현장명이
        칸에 없으면 다음에 누른 「입력」이 방금 보던 현장이 아니다.
      */}
      <span className="truncate text-tiny font-bold text-slate-500">{row.name}</span>
      <input
        autoFocus
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') onDone(); }}
        placeholder="청구액"
        aria-label={`${row.name} 점검수수료`}
        className={`${FIELD_CELL} text-right tabular-nums`}
      />
      {/* 금액이 없으면 받을 것이 없고, 청구 전이면 아직 받을 때가 아니다 — 수금일 자리를 주지 않는다 */}
      {amount !== '' && canCollect && (
        <DatePicker value={at} onChange={setAt} disabled={busy} ariaLabel={`${row.name} 수수료 수금일`} />
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <Btn size="sm" busy={busy} busyLabel="저장 중…" onClick={save}>
          {amount === '' && row.safetyFee !== null ? '지우기' : '저장'}
        </Btn>
        <Btn size="sm" kind="quiet" disabled={busy} onClick={onDone}>취소</Btn>
      </div>
      <Err>{error}</Err>
      <Confirm
        open={asking}
        title="청구액을 지웁니다"
        detail={[
          row.safetyFeeClaimedAt && `${row.safetyFeeClaimedAt} 청구`,
          row.safetyFeeCollectedAt && `${row.safetyFeeCollectedAt} 수금`,
        ].filter(Boolean).join(' · ') + ' 기록도 같이 사라집니다'}
        confirmLabel="지우기"
        busy={busy}
        error={error}
        onConfirm={() => send({ amount: null })}
        onCancel={() => setAsking(false)}
      />
    </div>
  );
}

/**
 * 차수 한 칸 — 상태가 값이고, 금액과 트리거가 그 아래 딸린다.
 *
 * ★트리거를 되살렸다★ (한백 2026-08-28). 2026-08-23 에 트리거 「열」을 걷은 것은 맞았다 —
 * 매 줄 반복되는 열이 상태와 금액을 가렸다. 그런데 열을 걷으면서 정보까지 사라져서,
 * 청구 가능한 차수가 무엇으로 열렸는지 · 대기 중인 차수가 무엇을 기다리는지 이 화면에서
 * 알 수 없었다. 열이 아니라 그 칸의 부기로 되돌린다 — 금액 옆 한 마디다.
 *
 * 수금 완료는 트리거 대신 수금일을, 미수는 청구일을 적는다 — 끝난 단계에 조건을 다시 적을 이유가 없고,
 * 그때 궁금한 것은 「언제 청구했나 · 언제 들어왔나」다. 청구 예정은 언제부터 청구할 수 있는지를 적는다.
 */
function StepCell({
  step,
}: {
  step: Pick<SettlementSummary['steps'][number],
    'state' | 'planAmount' | 'trigger' | 'claimableFrom' | 'claimedAt' | 'collectedAt' | 'collectedAmount'> | null;
}) {
  // 규칙상 없는 차수는 배지가 아니라 빈 값이다(화면 규칙 10번)
  if (!step || step.state === 'na') {
    return (
      <Td>
        <Empty kind="na" />
      </Td>
    );
  }
  const note = step.state === 'collected' ? step.collectedAt
    : step.state === 'claimed' ? `${step.claimedAt} 청구`
      : step.state === 'scheduled' && step.claimableFrom ? `${claimMonthLabel(step.claimableFrom)}부터`
        : step.trigger;
  return (
    <Td className="whitespace-nowrap">
      <Badge tone={STEP_TONE[step.state]}>{STEP_LABEL[step.state]}</Badge>
      <p className="mt-0.5 text-tiny font-bold tabular-nums text-slate-700">
        {/* 수금 완료면 실제로 받은 돈을 적는다 — 계획액과 다르면 계획액을 곁에 (감사 L13) */}
        {step.state === 'collected' && step.collectedAmount !== null
          ? <>{won(step.collectedAmount)}{step.planAmount !== null && step.collectedAmount !== step.planAmount && <span className="ml-1 font-semibold text-slate-400">(계획 {won(step.planAmount)})</span>}</>
          : step.planAmount === null ? '—' : won(step.planAmount)}
        {note && <span className="ml-1 font-semibold text-slate-500">· {note}</span>}
      </p>
    </Td>
  );
}

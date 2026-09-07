'use client';

/**
 * 운영사 기성관리 — 운영사에게서 받을 돈.
 *
 * 축은 차수와 트리거다. 기성은 우리가 청구해서 받는 게 아니라 조건이 차면 열린다 —
 * 환경부 승인일·실착공일·준공마감일. 그래서 각 차수가 지금 어디까지 왔는지가
 * 합계보다 먼저 보여야 한다.
 *
 * 협력사 지급은 여기 없다. 별도 화면이다 — 두 방향을 한 표에 놓으면 상계해서 보는
 * 사람이 생기고, 「얼마 남았나」가 어느 쪽 이야기인지 매번 따져야 한다.
 *
 * ★말★ 들어오는 돈은 「수금」이다. 「회수」는 지급 원장에서 협력사에게 잘못 준 돈을
 * 돌려받는 뜻으로 이미 쓰고 있어서(PAYOUT_KINDS), 같은 글자가 정반대 방향을 가리켰다.
 *
 * ★이 화면이 답해야 하는 질문★ (한백 2026-08-28 — UX 개선)
 *   지금 청구할 것이 무엇인가 · 무엇을 기다리는가 · 얼마가 안 들어왔나.
 * 전에는 전 현장이 저장소 순서로 쭉 나왔고 거를 자리도 정렬도 없었다. 무엇을 기다리는지도
 * 화면에 없었다(트리거 열을 걷으면서 정보까지 사라졌다). 그 셋을 메운다.
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { SettlementSummary } from '@/types/project';
import {
  safetyFeeApplies, safetyFeeCollected, safetyFeeDue, safetyFeeOpen, STEP_LABEL, STEP_TONE,
} from '@/lib/settlement';
import { Badge, Blank, Btn, Empty, Err, FIELD, FIELD_BASE, FIELD_CELL, Tag, Td, Th } from '@/components/ui';
import { DatePicker } from '@/components/DatePicker';
import { useAction } from '@/lib/use-action';
import CheckMenu from '@/components/CheckMenu';
import { Frame, SiteLink, Tile, won } from './parts';

/** 거르는 축 — 상태는 「그 현장에 그런 차수가 하나라도 있나」로 본다 */
type Flag = 'open' | 'unpaid' | 'done' | 'norule' | 'feeopen' | 'feemiss';
const FLAGS: Array<{ key: Flag; label: string }> = [
  { key: 'open', label: '받을 수 있는 돈' },
  { key: 'unpaid', label: '미수금' },
  { key: 'done', label: '수금 완료' },
  { key: 'norule', label: '정산 규칙 미지정' },
  /*
   * 수수료 두 축 — 대상 현장이 116곳이라 이 축이 없으면 「청구액을 안 적은 현장」을
   * 현장 상세를 하나씩 열어야 안다(한백 「이것도 수금 관리를 해야해」).
   */
  { key: 'feeopen', label: '점검수수료 미수금' },
  { key: 'feemiss', label: '점검수수료 미기재' },
];

/**
 * 정렬 — 기본은 받을 수 있는 돈이 큰 것부터다.
 *
 * 그것이 이 화면을 여는 이유다: 「지금 받을 수 있는 돈이 어디 있나」. 예전 기본값은
 * 저장소 순서(현장 번호)였는데 그 순서는 이 질문과 아무 상관이 없다.
 */
type SortKey = 'open' | 'unpaid' | 'plan' | 'name';
const SORTS: Array<{ key: SortKey; label: string }> = [
  { key: 'open', label: '받을 수 있는 돈 많은 순' },
  { key: 'unpaid', label: '미수금 많은 순' },
  { key: 'plan', label: '총 받아야 할 돈 많은 순' },
  { key: 'name', label: '현장명' },
];

/*
 * 받을 수 있는 돈 — 조건이 찬 차수 + ★아직 안 받은 전기안전점검수수료★.
 * 수수료에는 트리거가 없다: 청구액을 적은 순간부터 받을 수 있다(lib/settlement safetyFeeOpen).
 * 그래서 「조건 대기」로 서는 일이 없고, planTotal 에 이미 들어 있으므로 여기서도 세야
 * 「총액 = 수금 완료 + 미수금」·「미수금 = 받을 수 있는 돈 + 조건 대기」 두 관계가 유지된다.
 */
/* 안 받는 운영사면 0 — 조립도 null 로 보내지만 판정하는 자리마다 cpo 를 같이 본다 */
const feeOpenOf = (r: SettlementSummary) => (safetyFeeApplies(r.cpo) ? safetyFeeOpen(r) : 0);
const feeGotOf = (r: SettlementSummary) => (safetyFeeApplies(r.cpo) ? safetyFeeCollected(r) : 0);

const openOf = (r: SettlementSummary) =>
  r.steps.filter((s) => s.state === 'open').reduce((n, s) => n + (s.planAmount ?? 0), 0)
  + feeOpenOf(r);
/*
 * 미수금 — 차수 몫과 수수료 몫을 ★따로 자른다★.
 *
 * 예전에는 planTotal − collectedTotal 을 통째로 Math.max(0, …) 했다. 초과수금 현장
 * (협의로 계획액보다 많이 받은 곳 — 실수금액에 상한이 없다)에서는 차수 쪽이 음수라,
 * 그 음수가 아직 안 받은 수수료를 삼켜 미수금이 0 으로 뜬다. 그러면 화면이 스스로 적어 둔
 * 「미수금 = 받을 수 있는 돈 + 조건 대기」가 깨진다 — 받을 수 있는 돈은 수수료를 세는데
 * 미수금은 0 이 된다. 차수 초과분이 수수료를 지우는 것은 다른 돈끼리의 상계다.
 */
const unpaidOf = (r: SettlementSummary) => {
  const feePlan = safetyFeeApplies(r.cpo) ? r.safetyFee ?? 0 : 0;
  const stepPlan = r.planTotal - feePlan;
  const stepCollected = r.collectedTotal - feeGotOf(r);
  return Math.max(0, stepPlan - stepCollected) + feeOpenOf(r);
};

export default function ReceivableBoard({ rows, canEdit }: {
  rows: SettlementSummary[];
  /** 점검수수료를 이 표에서 바로 적을 수 있나 — 한백 관리자만 (열람 전용은 읽기만) */
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

  const shown = useMemo(() => {
    const needle = q.trim();
    const passes = (r: SettlementSummary) => {
      if (needle && !r.name.includes(needle)) return false;
      if (cpos.length && !cpos.includes(r.cpo)) return false;
      // 상태끼리는 OR 다 — 「받을 수 있는 돈이 있거나 미수금인 것」을 보고 싶을 때가 있다
      if (flags.length === 0) return true;
      return flags.some((f) =>
        f === 'open' ? openOf(r) > 0
          : f === 'unpaid' ? unpaidOf(r) > 0
            : f === 'done' ? r.planTotal > 0 && r.collectedTotal >= r.planTotal
              : f === 'feeopen' ? feeOpenOf(r) > 0
                /* 준공완료 뒤에 청구액이 없는 것만 센다 — 준공 전에는 아직 올 때가 아니다 */
                : f === 'feemiss' ? safetyFeeApplies(r.cpo) && r.safetyFee === null && safetyFeeDue(r.status)
                  : r.ruleName === null
      );
    };
    const by: Record<SortKey, (a: SettlementSummary, b: SettlementSummary) => number> = {
      open: (a, b) => openOf(b) - openOf(a),
      unpaid: (a, b) => unpaidOf(b) - unpaidOf(a),
      plan: (a, b) => b.planTotal - a.planTotal,
      name: (a, b) => a.name.localeCompare(b.name, 'ko'),
    };
    return rows.filter(passes).sort(by[sort]);
  }, [rows, q, flags, cpos, sort]);

  /*
   * 합계는 ★보고 있는 목록★의 합이다 — 거른 뒤에도 전체 합을 보여주면 화면의 숫자와 표가
   * 어긋나고, 「이 운영사에게 받을 돈」을 볼 방법이 없어진다. 전체는 줄 수로 적는다.
   */
  const money = useMemo(() => {
    const sum = (f: (r: SettlementSummary) => number) => shown.reduce((n, r) => n + f(r), 0);
    return {
      plan: sum((r) => r.planTotal),
      collected: sum((r) => r.collectedTotal),
      open: sum(openOf),
      /* 그중 수수료 몫 — 차수가 안 열린 현장에서도 금액이 서는 이유다 */
      openFee: sum(feeOpenOf),
      /* 수금률에서 빼기 위해 따로 센다 — 수수료는 차수 진행률에 안 든다 */
      fee: sum((r) => (safetyFeeApplies(r.cpo) ? r.safetyFee ?? 0 : 0)),
      feeCollected: sum(feeGotOf),
      unpaid: sum(unpaidOf),
      /* 미수금에서 아직 조건이 안 찬 몫 — 총액의 나머지 한 토막이다 */
      waiting: Math.max(0, sum(unpaidOf) - sum(openOf)),
    };
  }, [shown]);

  /*
   * ★수금률은 차수만 센다★ (한백 2026-09-06 「수금률에 포함시키지마」) — 분모·분자에서
   * 수수료를 뺀다. 그 돈은 준공완료 뒤 영수증으로 청구하는 차수 밖의 마지막 한 건이라
   * 차수 진행률에 섞으면 「기성이 어디까지 왔나」가 흐려진다. 현장 상세 기성 탭의
   * collectionRate 도 같은 규칙이다 — 두 화면이 같은 숫자를 봐야 한다.
   */
  const stepPlan = money.plan - money.fee;
  const stepCollected = money.collected - money.feeCollected;
  const rate = stepPlan > 0 ? Math.round((stepCollected / stepPlan) * 1000) / 10 : null;
  const active = flags.length + cpos.length + (q.trim() ? 1 : 0);

  return (
    <div>
      {/*
        * 네 숫자는 서로 관계가 있다 — 그 관계가 읽히게 놓는다 (한백 지시 2026-08-28):
        *
        *   총 받아야 할 돈 = 수금 완료 + 미수금
        *   미수금          = 받을 수 있는 돈(조건이 찬 것) + 조건 대기
        *
        * 순서도 그 뜻대로다: 총액 → ★지금 받을 수 있는 것★ → 받은 것 → 남은 것.
        * 「받을 수 있는 돈」이 둘째인 이유는 그것이 이 화면을 여는 이유이기 때문이다.
        * 예전에는 「받을 기성 · 수금 · 미수금 · 청구 가능」 순으로 나란히만 놓여 있어,
        * 무엇이 무엇의 부분인지 읽히지 않았다. ★띠는 걷었다★ (한백 지시 2026-08-28) —
        * 관계는 이름과 순서, 그리고 부기(「조건 대기 X원 포함」)가 말한다.
        */}
      <section aria-label="기성 합계" className="mb-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile label="총 받아야 할 돈" value={money.plan}
            note={`현장 ${shown.length}건`} />
          {/*
            수수료는 트리거가 없어 청구액을 적은 순간부터 이 칸에 든다 — 부기가 「조건이 찬
            차수」라고만 말하면 차수가 하나도 안 열린 현장에서 금액이 서는 것이 거짓말이 된다.
          */}
          <Tile label="받을 수 있는 돈" value={money.open} tone="wait"
            note={money.open === 0 ? '조건이 찬 차수 없음'
              : money.openFee > 0
                ? `점검수수료 ${won(money.openFee)}원 포함`
                : '조건이 찬 차수'} />
          {/* 수금률은 ★차수만★ 센다 (한백 2026-09-06) — 그래서 이름에 「차수」를 적는다 */}
          <Tile label="수금 완료" value={money.collected} tone="in"
            note={rate !== null ? `차수 수금률 ${rate}%` : undefined} />
          {/* 다 받은 목록에 부기가 뜨면 안 된다 — 0원에는 아무것도 달지 않는다 */}
          <Tile label="미수금" value={money.unpaid}
            note={money.unpaid === 0 ? undefined
              : money.waiting > 0 ? `조건 대기 ${won(money.waiting)}원 포함` : '전부 받을 수 있음'} />
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
        * 줄 수는 같은 줄 오른쪽 끝이다.
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
        <p className="ml-auto text-small font-semibold text-slate-500">
          {active > 0 ? (
            <>
              {shown.length}건 <span className="font-normal text-slate-400">/ 전체 {rows.length}건</span>
            </>
          ) : (
            <>전체 {rows.length}건</>
          )}
        </p>
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
        <Frame min="1020px">
          <thead className="border-b border-slate-100 bg-slate-50 text-tiny font-bold tracking-[0.06em] text-slate-500">
            <tr>
              <Th left>현장</Th>
              {/* 차수 열의 값은 그 차수의 상태다. 금액과 트리거는 그 아래 딸린 값이다. */}
              <Th>1차</Th>
              <Th>2차</Th>
              <Th>3차</Th>
              {/*
                ★차수 다음의 마지막 수금단계★ (한백 2026-09-06 「맨 마지막에 수금 이외
                추가적인 수금단계로 카운트해」). 차수 셋과 나란히 서야 줄의 합이 눈으로 맞는다 —
                열이 없으면 「받아야 할 돈」이 차수 셋의 합보다 큰 이유를 표에서 찾을 수 없다.
              */}
              <Th>점검수수료</Th>
              <Th money>받아야 할 돈</Th>
              <Th money>수금 완료</Th>
              <Th money>미수금</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {shown.map((r) => (
              <tr key={r.id} className="transition hover:bg-brand-50/40">
                <Td left className="min-w-[13rem]">
                  <SiteLink id={r.id} name={r.name} tab="receivable" />
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-tiny text-slate-400">
                    <span>{r.cpo} · {r.qty}대 · {r.status}</span>
                    {r.ruleName === null && <Tag tone="warn">정산 규칙 미지정</Tag>}
                  </p>
                </Td>
                {([1, 2, 3] as const).map((no) => (
                  <StepCell key={no} step={r.steps.find((x) => x.no === no) ?? null} />
                ))}
                <FeeCell row={r} canEdit={canEdit} />
                <Td money className="font-bold text-slate-800">
                  {won(r.planTotal)}
                </Td>
                <Td money className="font-bold text-brand-800">
                  {r.collectedTotal > 0 ? won(r.collectedTotal) : <span className="text-slate-300">—</span>}
                </Td>
                <Td money className="font-bold text-slate-500">
                  {won(unpaidOf(r))}
                </Td>
              </tr>
            ))}
          </tbody>
        </Frame>
      )}
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

  const done = row.safetyFeeCollectedAt !== null;
  return (
    <Td>
      {row.safetyFee === null ? (
        <Empty kind={safetyFeeDue(row.status) ? 'miss' : 'wait'} />
      ) : (
        <>
          {/* 차수 칸과 같은 색·같은 말을 쓴다 — 같은 표에서 두 어휘를 두지 않는다 */}
          <Badge tone={STEP_TONE[done ? 'collected' : 'open']}>
            {STEP_LABEL[done ? 'collected' : 'open']}
          </Badge>
          <span className="mt-0.5 block text-tiny font-semibold tabular-nums text-slate-500">
            {won(row.safetyFee)}
            {done && ` · ${row.safetyFeeCollectedAt}`}
          </span>
        </>
      )}
      {/* 영수증은 여기서 세기만 한다 — 파일은 현장 상세에서 받는다 */}
      {row.safetyFeeReceiptCount > 0 && (
        <span className="mt-0.5 block text-tiny font-semibold text-slate-400">
          영수증 {row.safetyFeeReceiptCount}장
        </span>
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
 * 수금완료로 처리」) — 금액만 적고 저장하면 미수금이고, 둘을 채우면 수금 완료다.
 * 수금일을 비우면 수금을 되돌린다(화면 규칙 7).
 */
function FeeEdit({ row, onDone }: { row: SettlementSummary; onDone: () => void }) {
  const { busy, error, run } = useAction();
  const [amount, setAmount] = useState(row.safetyFee === null ? '' : String(row.safetyFee));
  const [at, setAt] = useState(row.safetyFeeCollectedAt);

  const save = () => void run({
    url: `/api/projects/${row.id}/settlement`,
    body: {
      safetyFee: {
        amount: amount === '' ? null : Number(amount),
        /* 금액을 지우면 저장소가 수금일도 같이 지운다 — 여기서 보내는 값은 무시된다 */
        collectedAt: amount === '' ? null : at,
      },
    },
    fail: '점검수수료를 저장하지 못했습니다.',
  }).then((ok) => { if (ok) onDone(); });

  return (
    <div className="flex flex-col items-stretch gap-1.5 text-left">
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
        placeholder="청구액"
        aria-label={`${row.name} 점검수수료`}
        className={`${FIELD_CELL} text-right tabular-nums`}
      />
      {/* 금액이 없으면 받을 것이 없다 — 수금일 자리를 주지 않는다 */}
      {amount !== '' && (
        <DatePicker value={at} onChange={setAt} disabled={busy} ariaLabel={`${row.name} 수수료 수금일`} />
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        <Btn size="sm" busy={busy} busyLabel="저장 중…" onClick={save}>
          {amount === '' && row.safetyFee !== null ? '지우기' : '저장'}
        </Btn>
        <Btn size="sm" kind="quiet" disabled={busy} onClick={onDone}>취소</Btn>
      </div>
      <Err>{error}</Err>
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
 * 수금 완료는 트리거 대신 수금일을 적는다 — 끝난 차수에 조건을 다시 적을 이유가 없고,
 * 그때 궁금한 것은 「언제 들어왔나」다.
 */
function StepCell({
  step,
}: {
  step: Pick<SettlementSummary['steps'][number], 'state' | 'planAmount' | 'trigger' | 'collectedAt'> | null;
}) {
  // 규칙상 없는 차수는 배지가 아니라 빈 값이다(화면 규칙 10번)
  if (!step || step.state === 'na') {
    return (
      <Td>
        <Empty kind="na" />
      </Td>
    );
  }
  const note = step.state === 'collected' ? step.collectedAt : step.trigger;
  return (
    <Td className="whitespace-nowrap">
      <Badge tone={STEP_TONE[step.state]}>{STEP_LABEL[step.state]}</Badge>
      <p className="mt-0.5 text-tiny font-bold tabular-nums text-slate-700">
        {step.planAmount === null ? '—' : won(step.planAmount)}
        {note && <span className="ml-1 font-semibold text-slate-400">· {note}</span>}
      </p>
    </Td>
  );
}

/**
 * 엘앤에스 턴키 현장의 영업비 초과 정리 (한백 지시 2026-11-10).
 *
 *   npx tsx scripts/fix-lns-overpay.ts --env <파일>                # 시험 실행 — 아무것도 안 쓴다
 *   npx tsx scripts/fix-lns-overpay.ts --env <파일> --apply        # 반영
 *   … --to HB-2026-XXX                                             # 반달마을 28.5만을 뺄 현장을 손으로 고른다
 *
 * 한백 지시 둘 — 「턴키업체일 경우, 영업비 초과가 될 경우, 앞으로 시공비에서 차감해」는 콘솔이 센다(lib/settlement
 * payoutSidesOf · 원장에 안 적는다). 「반달마을 푸르지오같은 경우에는 다른 엘앤에스 현장의 영업비에서 차감해」가 이 스크립트다.
 *
 * 원장에 적는 것 넷:
 *  1. 반달마을푸르지오(HB-2026-058) 영업비 재정산 +285,000 — 총액을 실제 나간 178.5만에 맞춘다. 이것이 없으면 새 규칙이
 *     반달마을 시공비 잔금에서 뺀다(한백은 이 현장만 다른 현장 영업비에서 빼라고 했다).
 *  2. 다른 엘앤에스 현장 영업비 차감 −285,000 — 그 현장의 다음 회차에. 고르는 법: 지금 「지급 가능」인 엘앤에스 영업비
 *     줄 중 28.5만 이상, 계약서류 접수가 가장 이른 것(가장 먼저 나갈 것). --to 로 바꾼다.
 *  3. 마곡럭스나인오피스텔(HB-2026-173) 영업비 재정산 +320,000 — 9/17 에 시공비 1차에서 뺀 32만(한 줄)의 짝. 짝이
 *     없으면 새 규칙이 영업비를 아직 초과로 보고 시공비에서 한 번 더 뺀다.
 *  4. 파크밸리동일하이빌 자투(HB-2026-192) 영업비 재정산 +1,760,000 — 9/30 에 시공비에서 뺀 176만의 짝. 10/28 단가가
 *     바뀌어 초과가 396만이 됐다 — 남은 220만은 새 규칙이 시공비 잔금에서 뺀다.
 * 신정이펜하우스3단지(HB-2026-125) 초과 40만은 적을 것이 없다 — 새 규칙이 시공비 잔금에서 뺀다.
 *
 * 쓰는 차례: 반달마을 재정산을 먼저 적는다 — 다른 현장 차감만 들어가고 멈추면 새 규칙이 반달마을 시공비에서도 빼 두 번
 * 빠진다. 반대로 멈추면 덜 빠질 뿐이라 다시 돌리면 된다(두 번 돌려도 같은 줄을 다시 안 적는다).
 * 멈추는 때: 초과 · 손으로 적은 시공비 차감이 위 숫자와 다르면 — 손으로 본다.
 * ★찍는 숫자는 새 규칙(이 브랜치의 셈) 기준이다★ — 운영에 배포되기 전에는 운영 화면과 다를 수 있다.
 */
import { existsSync } from 'node:fs';
import { loadEnvFile } from '../lib/env-file';

const envAt = process.argv.indexOf('--env');
const ENV_FILE = envAt >= 0 ? process.argv[envAt + 1] : '.env.local';
if (!ENV_FILE || ENV_FILE.startsWith('--')) {
  throw new Error('--env 뒤에 파일 이름이 없습니다 (예: --env .env.prod-db).');
}
if (!existsSync(ENV_FILE)) throw new Error(`${ENV_FILE} 이 없습니다.`);
loadEnvFile(ENV_FILE);
if (!process.env.DATABASE_URL && process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}
const APPLY = process.argv.includes('--apply');
const toAt = process.argv.indexOf('--to');
const TO = toAt >= 0 ? process.argv[toAt + 1] : null;

import { pgRepository } from '../lib/data/pg-store';
import { payoutsOfDetail, workOf, type PayoutWork } from '../lib/payout-board';
import { today } from '../lib/date';
import type { Actor, Viewer } from '../lib/auth/types';
import type { NewPayoutEntry, PayoutEntry, PayoutKind, ProjectDetail } from '../types/project';

const ORG = '엘앤에스';
const BANDAL = 'HB-2026-058';
const BANDAL_OVER = 285_000;
/** 다른 현장 차감 줄을 알아보는 표지 — 두 번 돌려도(고른 현장이 바뀌어도) 한 번만 적는다 */
const BANDAL_MARK = '반달마을푸르지오(HB-2026-058) 영업비 초과 28.5만 상계';
const AT = today();

const won = (n: number) => n.toLocaleString('ko-KR');
const HANBAEK: Viewer = { role: 'admin', org: null };
const ACTOR: Actor = { id: 'script', name: '영업비 초과 정리 (엘앤에스 턴키)', role: 'admin', org: null };
const ALL = { sales: true, cons: true, cost: true } as never;

/** 손으로 적은 시공비 차감 한 줄에 영업비 재정산 짝을 다는 현장 */
const PAIRS = [
  { id: 'HB-2026-173', amount: 320_000, step: 1 as 1 | 2 | null, note: '9/17 시공비 1차에서 뺀 영업비 초과 32만의 짝 — 영업비 총액을 실제 나간 금액에 맞춘다' },
  { id: 'HB-2026-192', amount: 1_760_000, step: null as 1 | 2 | null, note: '9/30 시공비에서 뺀 영업비 초과 176만의 짝 — 남은 초과는 시공비 잔금에서 저절로 빠진다' },
];
const WATCH = ['HB-2026-125'];

async function load(id: string): Promise<{ d: ProjectDetail; rows: Record<PayoutKind, PayoutWork> }> {
  const d = await pgRepository.getProject(id, HANBAEK);
  if (!d) throw new Error(`${id} 현장을 찾을 수 없습니다.`);
  const rows = Object.fromEntries(payoutsOfDetail(d, ALL).map((r) => [r.kind, workOf(r)])) as Record<PayoutKind, PayoutWork>;
  if (!rows.영업비 || !rows.시공비) throw new Error(`${id} 영업비 · 시공비 줄을 찾지 못했습니다.`);
  return { d, rows };
}

/** 사람이 적은 조정만으로 센 초과 — 새 규칙의 상계(crossOffset)는 뺀다 */
const manualOver = (w: PayoutWork) => w.confirmed - (w.plan + w.adjust - w.crossOffset);

const has = (entries: PayoutEntry[], e: NewPayoutEntry) =>
  entries.some((x) => x.kind === e.kind && x.category === e.category && x.amount === e.amount && (x.step ?? null) === e.step);

async function show(label: string, ids: string[]) {
  console.log(`\n── ${label} (새 규칙 기준) ──`);
  for (const id of ids) {
    const { d, rows } = await load(id);
    console.log(`  ${id} ${d.project.name}${d.project.holdState ? ` [${d.project.holdState}]` : ''}`);
    for (const w of [rows.영업비, rows.시공비]) {
      console.log(`    ${w.kind}  총액 ${won(w.due)} · 나감 ${won(w.confirmed)} → 남은 것 ${won(w.due - w.confirmed)}`
        + `  [1차 ${won(w.step1Amount)} · 2차 ${won(w.step2Amount)}]  ${w.state}`
        + (w.crossOffset ? `  · 턴키 상계 ${w.crossOffset > 0 ? '+' : '−'}${won(Math.abs(w.crossOffset))}` : '')
        + (w.blockers.length ? `  (${w.blockers.join(' · ')})` : ''));
    }
  }
}

/** 반달마을 28.5만을 뺄 현장 — 지금 지급 가능한 엘앤에스 영업비 중 가장 먼저 나갈 것 */
function pickTarget(lns: ProjectDetail[]): { id: string; name: string; step: 1 | 2; open: number } {
  const cands: Array<{ id: string; name: string; step: 1 | 2; open: number; since: string; state: string }> = [];
  for (const d of lns) {
    if (d.project.id === BANDAL || d.project.holdState) continue;
    const row = payoutsOfDetail(d, ALL).find((r) => r.kind === '영업비');
    const w = row ? workOf(row) : null;
    if (!w?.open || w.open.amount < BANDAL_OVER) continue;
    cands.push({
      id: d.project.id, name: d.project.name, step: w.open.no, open: w.open.amount,
      since: w.milestones.contractSubmittedAt ?? '9999', state: w.state,
    });
  }
  cands.sort((a, b) => Number(b.state === '지급 가능') - Number(a.state === '지급 가능')
    || a.since.localeCompare(b.since) || b.open - a.open);
  console.log(`\n── 반달마을 28.5만을 뺄 수 있는 엘앤에스 영업비 (위가 먼저 나갈 것) ──`);
  for (const c of cands.slice(0, 8)) {
    console.log(`  ${c.id} ${c.name} · 영업비 ${c.step}차 ${won(c.open)} · ${c.state} · 접수 ${c.since === '9999' ? '—' : c.since}`);
  }
  const pick = TO ? cands.find((c) => c.id === TO) : cands.find((c) => c.state === '지급 가능');
  if (!pick) {
    throw new Error(TO
      ? `${TO} 은(는) 엘앤에스 영업비에서 28.5만을 뺄 회차가 없습니다 — 위 목록에서 고르세요.`
      : '지금 지급 가능한 엘앤에스 영업비가 없습니다 — 위 목록에서 --to 로 고르세요.');
  }
  return pick;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error(`DATABASE_URL 이 없습니다 — ${ENV_FILE} 을 확인하세요.`);
  let host = '알 수 없음';
  try { host = new URL(url).host; } catch { /* 호스트만 찍는다 */ }
  console.log(`DB ${host}  (${ENV_FILE})  ${APPLY ? '★반영★' : '시험 실행 — 아무것도 안 씁니다'}`);

  /* ── 1 · 2 반달마을 ── */
  const bandal = await load(BANDAL);
  if (bandal.d.project.salesOrg !== ORG) throw new Error(`${BANDAL} 영업사가 ${ORG} 가 아닙니다 — 손으로 보세요.`);
  const bandalFix: NewPayoutEntry = {
    kind: '영업비', category: '재정산', amount: BANDAL_OVER, step: null, at: AT,
    note: '영업비 1차 178.5만이 계획 150만을 28.5만 넘음 — 총액을 실제 나간 금액에 맞춘다(28.5만은 다른 엘앤에스 현장 영업비에서 뺐다)',
  };
  const bandalDone = has(bandal.d.payoutEntries, bandalFix);
  if (!bandalDone && manualOver(bandal.rows.영업비) !== BANDAL_OVER) {
    throw new Error(`${BANDAL} 영업비 초과가 ${won(manualOver(bandal.rows.영업비))}원입니다(28.5만이 아님) — 손으로 보세요.`);
  }
  /* 엘앤에스 현장을 한 번씩만 읽는다 — 이미 적은 다른 현장 차감을 찾고, 없으면 뺄 현장을 고른다 */
  const lns: ProjectDetail[] = [];
  for (const p of (await pgRepository.listProjects(HANBAEK)).filter((x) => x.salesOrg === ORG)) {
    const d = await pgRepository.getProject(p.id, HANBAEK);
    if (d) lns.push(d);
  }
  const marked = lns.find((d) => d.payoutEntries.some((e) =>
    e.kind === '영업비' && e.category === '차감' && (e.note ?? '').includes(BANDAL_MARK)));
  const targetDone = marked ? { id: marked.project.id } : null;
  const target = targetDone ? null : pickTarget(lns);

  /* ── 3 · 4 손으로 적은 시공비 차감의 짝 ── */
  const pairWrites: Array<{ id: string; entry: NewPayoutEntry }> = [];
  for (const p of PAIRS) {
    const { d, rows } = await load(p.id);
    const entry: NewPayoutEntry = { kind: '영업비', category: '재정산', amount: p.amount, step: null, at: AT, note: p.note };
    if (has(d.payoutEntries, entry)) continue;
    const manualCut = d.payoutEntries.find((e) => e.kind === '시공비' && e.category === '차감'
      && e.amount === -p.amount && (e.step ?? null) === p.step);
    if (!manualCut) throw new Error(`${p.id} 에 손으로 적은 시공비 차감 −${won(p.amount)} 가 없습니다 — 손으로 보세요.`);
    if (manualOver(rows.영업비) < p.amount) {
      throw new Error(`${p.id} 영업비 초과가 ${won(manualOver(rows.영업비))}원이라 짝 ${won(p.amount)}을 달 수 없습니다 — 손으로 보세요.`);
    }
    pairWrites.push({ id: p.id, entry });
  }

  const watch = [BANDAL, ...(target ? [target.id] : targetDone ? [targetDone.id] : []), ...PAIRS.map((p) => p.id), ...WATCH];
  await show('지금', watch);

  console.log(`\n── 할 일 (${AT}) ──`);
  console.log(bandalDone ? `  1. ${BANDAL} 영업비 재정산 — 이미 있어 건너뜀` : `  1. ${BANDAL} 영업비 재정산 +${won(BANDAL_OVER)} (총액)`);
  console.log(target
    ? `  2. ${target.id} ${target.name} 영업비 차감 −${won(BANDAL_OVER)} (${target.step}차분 — ${won(target.open)} → ${won(target.open - BANDAL_OVER)})`
    : `  2. 다른 현장 차감 — 이미 있어 건너뜀 (${targetDone?.id})`);
  pairWrites.forEach((w, i) => console.log(`  ${i + 3}. ${w.id} 영업비 재정산 +${won(w.entry.amount)} (총액)`));
  if (bandalDone && !target && pairWrites.length === 0) {
    console.log('  다 반영돼 있습니다 — 할 일 없음.');
    process.exit(0);
  }
  if (!APPLY) {
    console.log('\n시험 실행이라 여기서 멈춥니다. 반영하려면 --apply 를 붙이세요.');
    process.exit(0);
  }

  if (!bandalDone) {
    await pgRepository.addPayoutEntries(BANDAL, [bandalFix], ACTOR);
    console.log(`\n1. ${BANDAL} 영업비 재정산 ✓`);
  }
  if (target) {
    try {
      await pgRepository.addPayoutEntries(target.id, [{
        kind: '영업비', category: '차감', amount: -BANDAL_OVER, step: target.step, at: AT, note: BANDAL_MARK,
      }], ACTOR);
      console.log(`2. ${target.id} 영업비 차감 ✓`);
    } catch (err) {
      console.error(`★2. ${target.id} 영업비 차감 실패 — 반달마을 재정산만 들어갔습니다. 같은 명령을 다시 돌리세요.★`);
      throw err;
    }
  }
  for (const w of pairWrites) {
    await pgRepository.addPayoutEntries(w.id, [w.entry], ACTOR);
    console.log(`${w.id} 영업비 재정산 ✓`);
  }

  await show('고친 뒤', watch);
  process.exit(0);
}

void main();

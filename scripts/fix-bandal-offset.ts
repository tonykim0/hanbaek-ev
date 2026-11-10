/**
 * 반달마을푸르지오(HB-2026-058) 영업비 초과 지급 28.5만을 시공비 잔금에서 상계한다 (한백 2026-11-10).
 *
 *   npx tsx scripts/fix-bandal-offset.ts --env <파일>            # 시험 실행 — 아무것도 안 쓴다
 *   npx tsx scripts/fix-bandal-offset.ts --env <파일> --apply    # 반영
 *
 * 영업비 계획은 150만(3대 × 50만)인데 노션 시절 1차로 178.5만이 나갔다(2026-07-10, 정산관리 ST217 — 단가를
 * 잘못 알고 더 줬다). 8/28 이관 때 「시공비 잔금에서 차감」으로 정했지만 원장에 적지 않은 채 남았다 — 9/4 에
 * 에코메트로 회수와 「같은 엘앤에스 건」으로 묶였다가 그쪽이 「일단 냅둬」로 멈출 때 같이 멈췄다.
 *
 * 엘앤에스가 영업사이자 시공사라 회사 밖으로 오갈 돈은 없다. 화진금봉5차(scripts/fix-hwajin-qty.ts)와 같은 두 줄:
 *   영업비 재정산 +285,000 (총액 — 영업비 총액을 실제 나간 178.5만에 맞춘다)
 *   시공비 차감   −285,000 (2차 — 잔금에서만 뺀다. 1차 189만은 2026-10-30 에 계획대로 나갔다)
 * 받을 합계 420만(영업비 150 + 시공비 270)은 그대로다 — 178.5 + 241.5.
 *
 * 멈추는 때: 영업사와 시공사가 다르면 · 초과가 28.5만이 아니면 · 시공비 2차가 이미 나갔으면 — 손으로 본다.
 * 두 번 돌려도 같은 줄을 다시 적지 않는다.
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

import { pgRepository } from '../lib/data/pg-store';
import { payoutsOfDetail, workOf } from '../lib/payout-board';
import { today } from '../lib/date';
import type { Actor, Viewer } from '../lib/auth/types';
import type { NewPayoutEntry, ProjectDetail } from '../types/project';

const PROJECT_ID = 'HB-2026-058';
const OFFSET = 285_000;
const AT = today();

const won = (n: number) => n.toLocaleString('ko-KR');
const HANBAEK: Viewer = { role: 'admin', org: null };
const ACTOR: Actor = { id: 'script', name: '영업비 초과 상계 (반달마을푸르지오)', role: 'admin', org: null };

const SALES_FIX: NewPayoutEntry = {
  kind: '영업비', category: '재정산', amount: OFFSET, step: null, at: AT,
  note: '영업비 1차 178.5만이 계획 150만을 28.5만 넘어 — 총액을 실제 나간 금액에 맞춘다(같은 액수를 시공비 2차에서 차감)',
};
const CONS_FIX: NewPayoutEntry = {
  kind: '시공비', category: '차감', amount: -OFFSET, step: 2, at: AT,
  note: '영업비 초과 지급 28.5만을 잔금에서 상계(엘앤에스 영업·시공 — 받을 합계 420만은 그대로)',
};

const has = (d: ProjectDetail, e: NewPayoutEntry) =>
  d.payoutEntries.some((x) =>
    x.kind === e.kind && x.category === e.category && x.amount === e.amount && (x.step ?? null) === e.step);

const rowsOf = (d: ProjectDetail) => {
  const rows = payoutsOfDetail(d, { sales: true, cons: true, cost: true } as never);
  const sales = rows.find((r) => r.kind === '영업비');
  const cons = rows.find((r) => r.kind === '시공비');
  if (!sales || !cons) throw new Error('영업비 · 시공비 줄을 찾지 못했습니다 — 손으로 보세요.');
  return { sales, cons };
};

async function show(label: string) {
  const d = await pgRepository.getProject(PROJECT_ID, HANBAEK);
  if (!d) throw new Error(`${PROJECT_ID} 현장을 찾을 수 없습니다.`);
  console.log(`\n── ${label} ──  ${d.project.name} · 영업 ${d.project.salesOrg ?? '미지정'} · 시공 ${d.project.gcOrg ?? '미지정'}`);
  for (const r of Object.values(rowsOf(d))) {
    const w = workOf(r);
    const over = r.confirmed - w.due;
    console.log(`  ${r.kind}  총액 ${won(w.due)} · 나감 ${won(r.confirmed)} → 남은 것 ${won(w.due - r.confirmed)}`
      + `  [1차 ${won(w.step1Amount)} · 2차 ${won(w.step2Amount)}]  ${w.state}`
      + (over > 0 ? `  ★초과 ${won(over)}` : ''));
  }
  const adj = d.payoutEntries.filter((e) => e.category !== '1차' && e.category !== '2차');
  console.log(`  원장 조정 ${adj.length}줄` + adj.map((e) =>
    `\n    ${e.at} ${e.kind} ${e.category} ${won(e.amount)}${e.step ? ` (${e.step}차분)` : ''}`).join(''));
  return d;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error(`DATABASE_URL 이 없습니다 — ${ENV_FILE} 을 확인하세요.`);
  let host = '알 수 없음';
  try { host = new URL(url).host; } catch { /* 호스트만 찍는다 */ }
  console.log(`DB ${host}  (${ENV_FILE})  ${APPLY ? '★반영★' : '시험 실행 — 아무것도 안 씁니다'}`);

  const d = await show('지금');
  if (d.project.holdState) throw new Error(`현장이 「${d.project.holdState}」입니다 — 손으로 보세요.`);
  if (!d.project.salesOrg || d.project.salesOrg !== d.project.gcOrg) {
    throw new Error('영업사와 시공사가 다릅니다 — 시공비에서 빼면 다른 회사의 돈이 줄어듭니다. 손으로 보세요.');
  }
  const { sales, cons } = rowsOf(d);
  const toAdd: NewPayoutEntry[] = [];

  if (has(d, SALES_FIX)) {
    console.log('\n영업비 재정산 +285,000 — 이미 있어 건너뜁니다.');
  } else {
    const over = sales.confirmed - workOf(sales).due;
    if (over !== OFFSET) throw new Error(`영업비 초과가 ${won(over)}원입니다(28.5만이 아님) — 손으로 보세요.`);
    toAdd.push(SALES_FIX);
  }

  if (has(d, CONS_FIX)) {
    console.log('시공비 차감 −285,000 (2차분) — 이미 있어 건너뜁니다.');
  } else {
    if (cons.step2EntryId) {
      throw new Error(`시공비 2차가 이미 나갔습니다(${cons.step2At}) — 잔금에서 뺄 수 없습니다. 손으로 보세요.`);
    }
    const step2 = workOf(cons).step2Amount;
    if (step2 < OFFSET) throw new Error(`시공비 2차가 ${won(step2)}원이라 28.5만을 뺄 수 없습니다 — 손으로 보세요.`);
    toAdd.push(CONS_FIX);
  }

  if (toAdd.length === 0) {
    console.log('\n두 줄 다 이미 반영돼 있습니다 — 할 일 없음.');
    process.exit(0);
  }
  console.log(`\n── 할 일 ── 원장 조정 ${toAdd.length}줄 (${AT})` + toAdd.map((e) =>
    `\n  ${e.kind} ${e.category} ${won(e.amount)}${e.step ? ` (${e.step}차분)` : ' (총액)'}`).join(''));

  if (!APPLY) {
    console.log('\n시험 실행이라 여기서 멈춥니다. 반영하려면 --apply 를 붙이세요.');
    process.exit(0);
  }

  await pgRepository.addPayoutEntries(PROJECT_ID, toAdd, ACTOR);
  console.log(`\n원장 조정 ${toAdd.length}줄 ✓`);
  await show('고친 뒤');
  process.exit(0);
}

void main();

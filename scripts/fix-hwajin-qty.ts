/**
 * 화진금봉5차 계약변경 5대 → 3대 (한백 지시 2026-09-11).
 *
 *   npx tsx scripts/fix-hwajin-qty.ts --env <파일>            # 시험 실행 — 아무것도 안 쓴다
 *   npx tsx scripts/fix-hwajin-qty.ts --env <파일> --apply    # 반영
 *
 * 대수는 지급·기성 계획의 곱하는 수라 고치면 세 곳이 같이 움직인다. 이 현장은 영업비
 * 1차 350만이 이미 나갔는데(2026-07-27) 3대의 총 영업비는 300만이라 ★50만이 초과 지급★이
 * 된다 — 한백이 「시공비 잔금에서 차감」을 골랐다(2026-09-11). 에코일렉이 영업사이자
 * 시공사라 회사 밖으로 오갈 돈은 없다: 영업비 총액을 실제 나간 350만에 맞추고(재정산 +50만),
 * 같은 액수를 시공비 2차에서 뺀다(차감 −50만 step 2). 받을 것의 합은 630만으로 같다.
 *
 * 지급조건이 2026-07-27 로 굳어 있어(지급이 나가면 자동으로 잠긴다) 저장소가 대수 수정을
 * 거절한다 — 해제 → 수정 → 재확정 순서다. ★재확정일은 오늘로 새로 찍힌다★(setPayoutTermsConfirmed
 * 가 today() 를 쓴다). 옛 확정일은 audit_log 에 남는다.
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

import { and, eq } from 'drizzle-orm';
import { getDb } from '../lib/db/client';
import { payoutEntries } from '../lib/db/schema';
import { pgRepository } from '../lib/data/pg-store';
import { payoutsOfDetail, workOf } from '../lib/payout-board';
import type { Actor, Viewer } from '../lib/auth/types';
import type { NewPayoutEntry } from '../types/project';

const PROJECT_ID = 'HB-2026-080';
const NEW_QTY = 3;
const OFFSET = 500_000;
const AT = '2026-09-11';
const MEMO = `${AT} 계약변경 5대→3대. 영업비 1차 350만이 이미 나가 3대 계획(300만)을 50만 넘어서, 그 50만을 시공비 2차에서 차감(에코일렉 턴키 — 받을 합계 630만은 그대로).`;

const won = (n: number) => n.toLocaleString('ko-KR');
const HANBAEK: Viewer = { role: 'admin', org: null };
const ACTOR: Actor = { id: 'script', name: '계약변경 대수 정정 (화진금봉5차)', role: 'admin', org: null };

const ADJUSTMENTS: NewPayoutEntry[] = [
  {
    kind: '영업비', category: '재정산', amount: OFFSET, step: null, at: AT,
    note: '계약변경 5대→3대 — 이미 나간 1차 350만에 총액을 맞춘다',
  },
  {
    kind: '시공비', category: '차감', amount: -OFFSET, step: 2, at: AT,
    note: '계약변경 5대→3대 — 영업비 초과 지급 50만을 잔금에서 상계',
  },
];

async function show(label: string) {
  const d = await pgRepository.getProject(PROJECT_ID, HANBAEK);
  if (!d) throw new Error('현장을 찾을 수 없습니다.');
  const total = d.lines.reduce((n, l) => n + l.qty, 0);
  console.log(`\n── ${label} ──`);
  console.log(`  계약대수 ${total}대 · 지급조건 확정 ${d.project.payoutTermsConfirmedAt ?? '해제됨'}`);
  for (const r of payoutsOfDetail(d, { sales: true, cons: true, cost: true } as never)) {
    const w = workOf(r);
    if (w.due === 0 && r.confirmed === 0) continue;
    console.log(`  ${r.org} ${r.kind}  총액 ${won(w.due)} · 나감 ${won(r.confirmed)}`
      + ` → 남은 것 ${won(w.due - r.confirmed)}  [1차 ${won(w.step1Amount)} · 2차 ${won(w.step2Amount)}]`);
  }
  const steps = d.admin?.steps ?? [];
  console.log(`  기성 합계 ${won(steps.reduce((n, s) => n + (s.planAmount ?? 0), 0))}`
    + ` (${steps.map((s) => won(s.planAmount ?? 0)).join(' · ')})`);
  return d;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error(`DATABASE_URL 이 없습니다 — ${ENV_FILE} 을 확인하세요.`);
  let host = '알 수 없음';
  try { host = new URL(url).host; } catch { /* 호스트만 찍는다 */ }
  console.log(`DB ${host}  (${ENV_FILE})  ${APPLY ? '★반영★' : '시험 실행 — 아무것도 안 씁니다'}`);

  const before = await show('지금');
  if (before.lines.length !== 1) throw new Error(`라인이 ${before.lines.length}줄입니다 — 손으로 보세요.`);
  const line = before.lines[0];

  /* 두 번 돌아도 조정이 겹치지 않게 — 대수는 같은 값이면 저장소가 알아서 넘긴다 */
  const existing = await getDb()
    .select({ id: payoutEntries.id, kind: payoutEntries.kind, category: payoutEntries.category })
    .from(payoutEntries)
    .where(and(eq(payoutEntries.projectId, PROJECT_ID), eq(payoutEntries.at, AT)));
  const already = ADJUSTMENTS.filter((a) =>
    existing.some((e) => e.kind === a.kind && e.category === a.category));
  if (already.length > 0) {
    console.log(`\n★${AT} 자 조정이 이미 있습니다 (${already.map((a) => `${a.kind} ${a.category}`).join(' · ')}) — 조정은 건너뜁니다.`);
  }
  const toAdd = ADJUSTMENTS.filter((a) => !already.includes(a));

  console.log('\n── 할 일 ──');
  console.log(`  1. 지급조건 확정 해제 (지금 ${before.project.payoutTermsConfirmedAt})`);
  console.log(`  2. 계약대수 ${line.qty} → ${NEW_QTY}`);
  console.log(`  3. 조정 ${toAdd.length}건` + toAdd.map((a) => `\n       ${a.kind} ${a.category} ${won(a.amount)}${a.step ? ` (${a.step}차분)` : ''}`).join(''));
  console.log('  4. 지급조건 재확정 (오늘 날짜로)');
  console.log(`  5. 정산 메모 한 줄`);

  if (!APPLY) {
    console.log('\n시험 실행이라 여기서 멈춥니다. 반영하려면 --apply 를 붙이세요.');
    process.exit(0);
  }

  await pgRepository.setPayoutTermsConfirmed(PROJECT_ID, false, ACTOR);
  console.log('\n1. 지급조건 확정 해제 ✓');

  await pgRepository.setLineFacts(line.id, { qty: NEW_QTY }, ACTOR);
  console.log(`2. 계약대수 ${line.qty} → ${NEW_QTY} ✓`);

  if (toAdd.length > 0) {
    await pgRepository.addPayoutEntries(PROJECT_ID, toAdd, ACTOR);
    console.log(`3. 조정 ${toAdd.length}건 ✓`);
  } else {
    console.log('3. 조정 — 이미 있어 건너뜀');
  }

  await pgRepository.setPayoutTermsConfirmed(PROJECT_ID, true, ACTOR);
  console.log('4. 지급조건 재확정 ✓');

  const nowNote = before.settlement.payNote ?? null;
  if (nowNote?.includes('계약변경 5대→3대')) {
    console.log('5. 정산 메모 — 이미 있어 건너뜀');
  } else {
    const next = nowNote ? `${MEMO}\n${nowNote}` : MEMO;
    await pgRepository.setPayment(PROJECT_ID, { payNote: next }, ACTOR, { payNote: nowNote });
    console.log('5. 정산 메모 ✓');
  }

  await show('고친 뒤');
  process.exit(0);
}

void main();

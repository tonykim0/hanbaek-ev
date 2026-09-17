/**
 * 광양 영신그린빌 정산 규칙 정정 — 상반기 규칙이 하반기 케이스에 붙어 있었다 (한백 확인 2026-09-18).
 *
 *   npx tsx scripts/fix-yeongsin-settlement.ts --env <파일>            # 시험 실행 — 아무것도 안 쓴다
 *   npx tsx scripts/fix-yeongsin-settlement.ts --env <파일> --apply    # 반영
 *
 * ★무엇이 어긋났나★ 받는 단가는 케이스에 있고 기성 차수 금액은 정산 규칙에 따로 산다.
 * 규칙은 현장에 규칙이 ★없을 때만★ 케이스에서 따라 붙는다(applySuggestedSettlement 의
 * `if (!p || p.settle) return`) — 나중에 케이스를 바꿔도 규칙은 옛것 그대로다.
 *
 * 이 현장이 그 한 건이다(scripts/check-settlement-drift.ts 로 170 현장 중 1건). 라인은
 * 현대엔지니어링 ★하반기★ 케이스(hec-h2-y7_10-kepco-new-apt · 기당 250만 · 기본 규칙
 * env-40-60 비율)를 쓰는데, 붙어 있는 규칙은 ★상반기★ hec-3step(30+80+120 = 230만 고정)이다.
 * 3대라 받을 기성이 690만으로 잡혀 협력사에 내려줄 690만과 같아지고, 한백 마진 60만이 0이 된다.
 *
 * ★한백이 케이스가 맞다고 확인했다★ (2026-09-18 「케이스가 말한 돈이 맞아 … 1기당 250만원
 * 맞는데(우리가 받는돈)」). 그러니 낡은 것은 규칙이다 — 케이스의 기본 규칙으로 되돌린다.
 * env-40-60 은 ★비율★이라 받는 단가를 따라오므로 같은 어긋남이 다시 나지 않는다.
 *
 * 수금이 있으면 규칙을 못 바꾼다(감사 M31) — 이 현장은 세 차수 다 미수금이라 걸리지 않는다.
 * 지급조건이 확정돼 있어 해제 → 적용 → 재확정 순서다. ★재확정일은 오늘로 새로 찍힌다★.
 * ★정산 메모는 남기지 않는다★ — 그 칸은 협력사가 읽는 자리라 기성·마진을 적으면 안 된다
 * (2026-09-17 실사고, migrations/0082). 자취는 저장소가 남기는 audit_log 로 충분하다.
 */
import { existsSync } from 'node:fs';
import { loadEnvFile } from '../lib/env-file';

const envAt = process.argv.indexOf('--env');
const ENV_FILE = envAt >= 0 ? process.argv[envAt + 1] : '.env.local';
if (!ENV_FILE || ENV_FILE.startsWith('--')) throw new Error('--env 뒤에 파일 이름이 없습니다.');
if (!existsSync(ENV_FILE)) throw new Error(`${ENV_FILE} 이 없습니다.`);
loadEnvFile(ENV_FILE);
if (!process.env.DATABASE_URL && process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}
const APPLY = process.argv.includes('--apply');

import { pgRepository } from '../lib/data/pg-store';
import { turnkeyUnit } from '../lib/settlement';
import type { Actor, Viewer } from '../lib/auth/types';

const PROJECT_ID = 'HB-2026-151';
const WANT_RULE = 'env-40-60';
const OLD_RULE = 'hec-3step';

const won = (n: number) => n.toLocaleString('ko-KR');
const HANBAEK: Viewer = { role: 'admin', org: null };
const ACTOR: Actor = { id: 'script', name: '정산 규칙 정정 (영신그린빌 · 한백 확인)', role: 'admin', org: null };

async function show(label: string) {
  const d = await pgRepository.getProject(PROJECT_ID, HANBAEK);
  if (!d) throw new Error('현장을 찾을 수 없습니다.');
  const priced = d.lines.reduce((n, l) => {
    const unit = l.rule ? turnkeyUnit(l.rule) : null;
    return unit === null ? n : n + unit * l.qty;
  }, 0);
  const steps = d.admin?.steps ?? [];
  const plan = steps.reduce((n, s) => n + (s.planAmount ?? 0), 0);
  const payout = d.lines.reduce((n, l) => {
    const r = l.rule;
    return r && r.salesUnit !== null && r.consUnit !== null ? n + (r.salesUnit + r.consUnit) * l.qty : n;
  }, 0);
  console.log(`\n── ${label} ──`);
  console.log(`  규칙 ${d.admin?.settlementRule?.name ?? '—'}`);
  console.log(`  지급조건 확정 ${d.project.payoutTermsConfirmedAt ?? '해제됨'}`);
  console.log(`  받는 단가 × 대수 ${won(priced)} · 기성 계획 ${won(plan)} · 협력사 몫 ${won(payout)}`
    + ` → 한백 마진 ${won(plan - payout)}`);
  for (const s of steps) {
    console.log(`   · ${s.no}차 ${s.trigger} · ${s.basisLabel} ${won(s.planAmount ?? 0)}`
      + (s.collectedAt ? ` · 수금 ${s.collectedAt}` : ''));
  }
  return d;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error(`DATABASE_URL 이 없습니다 — ${ENV_FILE} 을 확인하세요.`);
  let host = '알 수 없음';
  try { host = new URL(url).host; } catch { /* 호스트만 */ }
  console.log(`DB ${host}  (${ENV_FILE})  ${APPLY ? '★반영★' : '시험 실행 — 아무것도 안 씁니다'}`);

  const before = await show('지금');
  const ruleNow = before.admin?.settlementRule?.id ?? null;
  if (ruleNow === WANT_RULE) {
    console.log('\n이미 케이스 기본 규칙입니다 — 할 일이 없습니다.');
    process.exit(0);
  }
  if (ruleNow !== OLD_RULE) {
    throw new Error(`규칙이 ${OLD_RULE} 이 아니라 ${ruleNow} 입니다 — 손으로 보세요.`);
  }
  /* 수금이 하나라도 있으면 저장소가 거절한다(감사 M31) — 먼저 알려주고 멈춘다 */
  const collected = (before.admin?.steps ?? []).filter((s) => s.collectedAt);
  if (collected.length > 0) {
    throw new Error(`수금 ${collected.length}건이 있어 규칙을 못 바꿉니다 — 한백이 먼저 정해야 합니다.`);
  }

  console.log('\n── 할 일 ──');
  console.log(`  1. 지급조건 확정 해제 (지금 ${before.project.payoutTermsConfirmedAt})`);
  console.log(`  2. 정산 규칙 ${OLD_RULE} → ${WANT_RULE}`);
  console.log('  3. 지급조건 재확정 (오늘 날짜로)');

  if (!APPLY) {
    console.log('\n시험 실행이라 여기서 멈춥니다. 반영하려면 --apply 를 붙이세요.');
    process.exit(0);
  }

  await pgRepository.setPayoutTermsConfirmed(PROJECT_ID, false, ACTOR);
  console.log('\n1. 지급조건 확정 해제 ✓');
  await pgRepository.setSettlementRule(PROJECT_ID, WANT_RULE, ACTOR);
  console.log('2. 정산 규칙 교체 ✓');
  await pgRepository.setPayoutTermsConfirmed(PROJECT_ID, true, ACTOR);
  console.log('3. 지급조건 재확정 ✓');

  await show('고친 뒤');
  process.exit(0);
}

void main();

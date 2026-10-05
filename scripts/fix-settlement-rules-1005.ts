/**
 * 정산 규칙 세 자리 정정 (한백 지시 2026-10-05).
 *
 *   npx tsx scripts/fix-settlement-rules-1005.ts --env <파일>            # 시험 실행
 *   npx tsx scripts/fix-settlement-rules-1005.ts --env <파일> --apply    # 반영
 *
 * ★① 화두 두 현장 — 230 받고 250 내려주고 있었다★
 * 화두에너지솔루션은 패스스루 협업사다(lib/settlement PASS_THROUGH_ORGS, 한백 2026-09-22) —
 * 받은 것을 그대로 내려준다. 그래서 지급 줄은 시공비에 마진을 얹어 기당 250만이 나간다.
 * 그런데 기성 규칙이 ★상반기★ hec-3step(30+80+120 = 230만 · 셋 다 고정)이라 받을 돈만
 * 230만에 묶여 있었다 — 받는 230, 주는 250, 한백이 기당 20만씩 ★손해★다.
 * 한백 확인 「250 받아서 250 내려주는거 맞아」 → 케이스 기본 규칙 env-40-60(비율)으로 바꾼다.
 * 비율이라 받는 단가를 따라오므로 다시는 안 벌어지고, 마진은 0 이 된다(패스스루가 뜻하는 바).
 *
 * ★② 광양 영신그린빌 — 되돌린다★
 * 2026-09-18 에 내가 hec-3step → env-40-60 으로 바꿨다. 「케이스가 말한 250만이 맞다」는
 * 말을 「기성도 250만이어야 한다」로 읽은 것인데, 한백이 다시 보고 ★원래대로 두라★ 했다
 * (2026-10-05 「영신그린빌은 원래있던대로 내비둬」). hec-3step 으로 되돌린다.
 *
 * 셋 다 수금이 없어야 바꿀 수 있다(감사 M31 — 수금은 차수 번호에 붙어 있어 규칙을 갈면
 * 그 번호가 다른 정의로 옮겨 간다). 지급조건이 확정돼 있으므로 해제 → 적용 → 재확정이다.
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
import { payoutsOfDetail, workOf } from '../lib/payout-board';
import { turnkeyUnit } from '../lib/settlement';
import type { Actor, Viewer } from '../lib/auth/types';

const WANT: Array<{ id: string; from: string; to: string; why: string }> = [
  { id: 'HB-2026-210', from: 'hec-3step', to: 'env-40-60', why: '화두 패스스루 — 250 받아 250 내려준다' },
  { id: 'HB-2026-211', from: 'hec-3step', to: 'env-40-60', why: '화두 패스스루 — 250 받아 250 내려준다' },
  { id: 'HB-2026-151', from: 'env-40-60', to: 'hec-3step', why: '영신그린빌 — 원래대로 되돌린다' },
];

const won = (n: number) => n.toLocaleString('ko-KR');
const HANBAEK: Viewer = { role: 'admin', org: null };
const ACTOR: Actor = { id: 'script', name: '정산 규칙 정정 (한백 지시 2026-10-05)', role: 'admin', org: null };

async function show(id: string, label: string) {
  const d = await pgRepository.getProject(id, HANBAEK);
  if (!d) throw new Error(`${id} 를 찾을 수 없습니다.`);
  const priced = d.lines.reduce((n, l) => {
    const u = l.rule ? turnkeyUnit(l.rule) : null;
    return u === null ? n : n + u * l.qty;
  }, 0);
  const steps = d.admin?.steps ?? [];
  const plan = steps.reduce((n, s) => n + (s.planAmount ?? 0), 0);
  const payout = payoutsOfDetail(d, { sales: true, cons: true, cost: true } as never)
    .reduce((n, r) => n + workOf(r).due, 0);
  console.log(`  ${label}  규칙 ${d.admin?.settlementRule?.id ?? '—'}`
    + ` · 받는 단가 ${won(priced)} · 기성 ${won(plan)} · 지급 ${won(payout)}`
    + ` → 마진 ${won(plan - payout)}`);
  return d;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error(`DATABASE_URL 이 없습니다 — ${ENV_FILE} 을 확인하세요.`);
  let host = '알 수 없음';
  try { host = new URL(url).host; } catch { /* 호스트만 */ }
  console.log(`DB ${host}  (${ENV_FILE})  ${APPLY ? '★반영★' : '시험 실행 — 아무것도 안 씁니다'}\n`);

  for (const w of WANT) {
    const d = await pgRepository.getProject(w.id, HANBAEK);
    if (!d) throw new Error(`${w.id} 를 찾을 수 없습니다.`);
    console.log(`■ ${d.project.name} (${w.id}) — ${w.why}`);
    await show(w.id, '지금 ');

    const now = d.admin?.settlementRule?.id ?? null;
    if (now === w.to) { console.log('   이미 그 규칙입니다 — 건너뜁니다.\n'); continue; }
    if (now !== w.from) throw new Error(`${w.id} 의 규칙이 ${w.from} 이 아니라 ${now} 입니다 — 손으로 보세요.`);
    const collected = (d.admin?.steps ?? []).filter((s) => s.collectedAt);
    if (collected.length > 0) throw new Error(`${w.id} 에 수금 ${collected.length}건이 있어 규칙을 못 바꿉니다.`);

    if (!APPLY) { console.log(`   → ${w.from} → ${w.to}\n`); continue; }

    await pgRepository.setPayoutTermsConfirmed(w.id, false, ACTOR);
    await pgRepository.setSettlementRule(w.id, w.to, ACTOR);
    await pgRepository.setPayoutTermsConfirmed(w.id, true, ACTOR);
    await show(w.id, '고친 뒤');
    console.log();
  }

  if (!APPLY) console.log('시험 실행이라 여기서 멈춥니다. 반영하려면 --apply 를 붙이세요.');
  process.exit(0);
}

void main();

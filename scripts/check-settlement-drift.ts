/**
 * 기성 계획이 받는 단가와 어긋난 현장 — ★읽기만 한다★.
 *
 *   npx tsx scripts/check-settlement-drift.ts --env <파일>
 *
 * ★왜 어긋날 수 있나★ 받는 단가는 케이스(pricing_rules)에 있고, 기성 차수 금액은 정산
 * 규칙(settlement_rules)의 단계에 따로 있다. 단계가 「잔액」이면 총액을 따라오지만 ★「고정」은
 * 그 자리에 금액이 박혀 있다★ — 케이스의 받는 단가를 고쳐도 고정 단계는 안 따라온다.
 * 세 차수가 전부 고정인 규칙(예: 환경부 승인 30 → 착공 80 → 준공마감 120)에서 단가만 바뀌면
 * 「받을 기성 합계 ≠ 받는 단가 × 대수」가 되고, 그 차이는 조용히 한백 마진으로 잡힌다.
 *
 * 그래서 현장마다 둘을 직접 재서 다른 것만 찍는다. 0 건이면 지금은 어긋난 자리가 없다는 뜻이다.
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

import { pgRepository } from '../lib/data/pg-store';
import { turnkeyUnit } from '../lib/settlement';
import type { Actor, Viewer } from '../lib/auth/types';

const ACTOR: Actor = { id: 'script', name: '기성·단가 어긋남 점검', role: 'admin', org: null };
const HANBAEK: Viewer = { role: 'admin', org: null };
const won = (n: number) => n.toLocaleString('ko-KR');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error(`DATABASE_URL 이 없습니다 — ${ENV_FILE} 을 확인하세요.`);
  let host = '알 수 없음';
  try { host = new URL(url).host; } catch { /* 호스트만 */ }
  console.log(`DB ${host}  (${ENV_FILE})\n`);

  const all = await pgRepository.listProjects(ACTOR);
  let checked = 0;
  const off: string[] = [];
  /** 고정 단계만으로 짜인 규칙 — 단가가 움직이면 따라오지 못하는 쪽이다 */
  const allFixed = new Set<string>();

  for (const s of all) {
    const d = await pgRepository.getProject(s.id, HANBAEK);
    if (!d) continue;
    const steps = (d.admin?.steps ?? []).filter((st) => st.planAmount !== null && st.planAmount > 0);
    if (steps.length === 0) continue;
    /* 단가가 안 붙은 라인이 있으면 받는 총액을 셀 수 없다 — 견줄 수 없으니 건너뛴다 */
    if (d.lines.some((l) => !l.rule)) continue;
    const priced = d.lines.reduce((n, l) => {
      const unit = l.rule ? turnkeyUnit(l.rule) : null;
      return unit === null ? n : n + unit * l.qty;
    }, 0);
    if (priced === 0) continue;
    checked += 1;

    const plan = steps.reduce((n, st) => n + (st.planAmount ?? 0), 0);
    const basis = steps.map((st) => st.basisLabel);
    if (basis.every((b) => b === '고정')) allFixed.add(d.admin?.settlementRule?.name ?? '(이름 없음)');
    if (plan !== priced) {
      off.push(
        `   · ${d.project.name} · ${d.project.cpo}\n`
        + `     받는 단가 × 대수 ${won(priced)} · 기성 계획 합계 ${won(plan)}`
        + `  → 차이 ${won(plan - priced)}\n`
        + `     규칙 ${d.admin?.settlementRule?.name ?? '—'} [${basis.join(' · ')}]`
      );
    }
  }

  console.log(`견준 현장 ${checked}건 (단가가 다 붙고 기성 계획이 선 것만)\n`);
  if (off.length === 0) console.log('★받는 단가와 기성 계획이 어긋난 현장 0건★');
  else {
    console.log(`★어긋난 현장 ${off.length}건★`);
    for (const line of off) console.log(line);
  }
  if (allFixed.size > 0) {
    console.log(`\n참고 — 차수가 전부 「고정」인 정산 규칙 ${allFixed.size}개 (단가를 고치면 따라오지 못하는 쪽)`);
    for (const n of allFixed) console.log(`   · ${n}`);
  }
  process.exit(0);
}

void main();

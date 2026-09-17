/**
 * 케이스를 못 찾는 라인 — ★읽기만 한다★.
 *
 *   npx tsx scripts/check-blocked-lines.ts --env <파일> [--cpo SK일렉링크]
 *
 * 「모든 현장에 대응한다」의 잣대다(단가 화면의 「막힌 라인」과 같은 판정, matchingRules).
 * 축을 시기마다 다르게 세우면 한 시기만 구멍이 나는데, 케이스 목록을 훑어서는 안 보인다 —
 * 라인을 대 봐야 보인다. 이미 단가가 붙은 라인은 세지 않는다(케이스가 중지돼도 계산은 돈다).
 */
import { existsSync } from 'node:fs';
import { loadEnvFile } from '../lib/env-file';

const envAt = process.argv.indexOf('--env');
const ENV_FILE = envAt >= 0 ? process.argv[envAt + 1] : '.env.local';
if (!ENV_FILE || ENV_FILE.startsWith('--')) {
  throw new Error('--env 뒤에 파일 이름이 없습니다.');
}
if (!existsSync(ENV_FILE)) throw new Error(`${ENV_FILE} 이 없습니다.`);
loadEnvFile(ENV_FILE);
if (!process.env.DATABASE_URL && process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

const cpoAt = process.argv.indexOf('--cpo');
const ONLY = cpoAt >= 0 ? process.argv[cpoAt + 1] : null;

import { pgRepository } from '../lib/data/pg-store';
import { matchingRules } from '../lib/pricing-match';
import { normalizeRepl, replTypesOf } from '../types/project';
import type { Actor } from '../lib/auth/types';
import type { CpoName } from '../types/project';

const ACTOR: Actor = { id: 'script', name: '막힌 라인 점검', role: 'admin', org: null };

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error(`DATABASE_URL 이 없습니다 — ${ENV_FILE} 을 확인하세요.`);
  let host = '알 수 없음';
  try { host = new URL(url).host; } catch { /* 호스트만 */ }
  console.log(`DB ${host}  (${ENV_FILE})${ONLY ? `  운영사 ${ONLY}` : ''}\n`);

  const [rules, axes] = await Promise.all([
    pgRepository.listPricingRules(ACTOR),
    pgRepository.listLineAxes(ACTOR),
  ]);

  const mine = ONLY ? axes.filter((l) => l.cpo === ONLY) : axes;
  console.log(`라인 ${mine.length}건 (단가 붙은 것 ${mine.filter((l) => l.pricingRuleId).length}건)\n`);

  const blocked = mine.filter((l) => {
    if (l.pricingRuleId) return false;
    const m = matchingRules(
      { cpo: l.cpo, bizType: l.bizType, replType: l.projectReplType, bldgType: l.bldgType },
      { termYears: l.termYears, powerType: l.powerType, replType: l.lineReplType },
      rules
    );
    return m.exact.length === 0;
  });

  if (blocked.length === 0) console.log('★막힌 라인 0건★');
  else {
    console.log(`★막힌 라인 ${blocked.length}건★`);
    for (const l of blocked) {
      console.log(`   · ${l.projectName} · ${l.cpo} · ${l.bizType ?? '—'} · ${l.termYears}년 ${l.qty}대`
        + ` · ${l.powerType ?? '수전 미지정'} · ${l.lineReplType ?? l.projectReplType ?? '교체유형 미지정'}`
        + ` · ${l.bldgType ?? '유형 미지정'}`);
    }
  }

  /*
   * 닿을 수 없는 케이스 — 축 자체가 화면에 서지 않아 새 라인이 절대 못 고르는 것.
   * SK 처럼 「자체투자를 안 가르기로」 바꾸면 옛 신규위치 케이스가 여기 남는다.
   */
  const stranded = rules.filter((r) => {
    if (!r.active) return false;
    if (ONLY && r.cpo !== ONLY) return false;
    return !replTypesOf(r.cpo as CpoName).includes(r.replType)
      || normalizeRepl(r.cpo as CpoName, r.replType) !== r.replType;
  });
  if (stranded.length > 0) {
    console.log(`\n★새 라인이 닿을 수 없는 활성 케이스 ${stranded.length}건★ (축이 화면에 안 선다)`);
    for (const r of stranded) {
      console.log(`   · ${r.id}  ${r.cpo} · ${r.replType} · ${r.termYears.join('·')}년 · ${r.startDate}`);
    }
  }
  process.exit(0);
}

void main();

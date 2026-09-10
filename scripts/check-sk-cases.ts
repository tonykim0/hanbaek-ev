/**
 * SK일렉링크 단가 케이스 점검 — ★읽기만 한다★.
 *
 *   npx tsx scripts/check-sk-cases.ts --env /Users/tonykim/hanbaek-backups/.env.prod-db
 *
 * 9/1 정책(한백 2026-09-10)을 새 케이스로 세우기 전에, 지금 프로덕션에 서 있는 SK 케이스의
 * 실값(분해·조건 칸·정산 규칙·활성)과 참조 라인 수를 본다. 시드 파일은 초기값이라 화면에서
 * 고쳐진 값과 다를 수 있다 — 새 케이스가 옛 케이스의 조건 칸(공급 자재·프로모션·설치조건)을
 * 물려받아야 하므로 정본(DB)을 본다. id 충돌 점검도 여기서 한다(감사 H4 — 같은 축의 다음
 * 정책은 pricingRuleId 가 같은 id 를 낸다).
 */
import { existsSync } from 'node:fs';
import { loadEnvFile } from '../lib/env-file';

const envAt = process.argv.indexOf('--env');
const ENV_FILE = envAt >= 0 ? process.argv[envAt + 1] : '.env.local';
if (!ENV_FILE || ENV_FILE.startsWith('--')) {
  throw new Error('--env 뒤에 파일 이름이 없습니다 (예: --env /Users/tonykim/hanbaek-backups/.env.prod-db).');
}
if (!existsSync(ENV_FILE)) throw new Error(`${ENV_FILE} 이 없습니다.`);
loadEnvFile(ENV_FILE);
if (!process.env.DATABASE_URL && process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}

import { sql as raw } from 'drizzle-orm';
import { getDb } from '../lib/db/client';

type Row = {
  id: string; case_name: string; biz_type: string; power_type: string; term_years: number[];
  bldg_types: string[]; repl_type: string; channel: string; start_date: string; active: boolean;
  sales_unit: number; cons_unit: number; margin: number; default_settlement_rule_id: string;
  supply_items: string | null; promo: unknown; promo_extend: unknown; charge_rate: number | null;
  install_terms: string | null; other_support: string | null; coexist_terms: string | null;
  misc_terms: string | null; supervision_bearer: string | null; safety_fee_bearer: string | null;
  refs: number; locked: number;
};

const won = (n: number) => (n / 10_000).toLocaleString('ko-KR') + '만';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error(`DATABASE_URL 이 없습니다 — ${ENV_FILE} 을 확인하세요.`);
  let host = '알 수 없음';
  try { host = new URL(url).host; } catch { /* 호스트만 찍는다 */ }
  console.log(`DB ${host}  (${ENV_FILE})\n`);

  const rows = (await getDb().execute(raw`
    select r.*,
           (select count(*)::int from contract_lines l where l.pricing_rule_id = r.id) as refs,
           (select count(*)::int from contract_lines l join projects p on p.id = l.project_id
             where l.pricing_rule_id = r.id and p.payout_terms_confirmed_at is not null) as locked
      from pricing_rules r
     where r.cpo = 'SK일렉링크'
     order by r.active desc, r.biz_type, r.power_type, r.repl_type, r.start_date, r.id
  `)) as unknown as Row[];

  console.log(`SK 케이스 ${rows.length}건 (활성 ${rows.filter((r) => r.active).length})\n`);
  for (const r of rows) {
    const total = r.sales_unit + r.cons_unit + r.margin;
    console.log(`■ ${r.id}${r.active ? '' : '  [중지]'}`);
    console.log(`   ${r.case_name}`);
    console.log(`   ${r.biz_type} · ${r.power_type} · ${r.repl_type} · ${JSON.stringify(r.term_years)}년 · ${JSON.stringify(r.bldg_types)} · ${r.channel} · 시작 ${r.start_date}`);
    console.log(`   총 ${won(total)} = 영업 ${won(r.sales_unit)} + 시공 ${won(r.cons_unit)} + 마진 ${won(r.margin)} · 정산 ${r.default_settlement_rule_id}`);
    console.log(`   참조 라인 ${r.refs}건 (잠긴 현장 ${r.locked}건)`);
    /*
     * 참조 현장을 이름으로 — 「수정」은 이 라인들의 계획액에 소급되므로(개정 폐기, 2026-09-04)
     * 어느 현장이 영향을 받는지 사람이 읽을 수 있어야 한다. 이미 나간 지급이 있으면 그것도 적는다.
     */
    if (r.refs > 0) {
      const lines = (await getDb().execute(raw`
        select p.name, l.qty, l.term_years, l.power_type, l.repl_type,
               p.payout_terms_confirmed_at is not null as locked,
               coalesce((select sum(e.amount)::bigint from payout_entries e where e.project_id = p.id and e.category in ('1차','2차','선금','차액')), 0) as paid
          from contract_lines l join projects p on p.id = l.project_id
         where l.pricing_rule_id = ${r.id}
         order by p.name
      `)) as unknown as Array<{ name: string; qty: number; term_years: number; power_type: string | null; repl_type: string | null; locked: boolean; paid: number | string }>;
      for (const l of lines) {
        const paid = Number(l.paid);
        console.log(`     - ${l.name} · ${l.qty}기 · ${l.term_years}년${l.locked ? ' · ★지급조건 확정★' : ''}${paid > 0 ? ` · 지급 나감 ${won(paid)}` : ''}`);
      }
    }
    const cond = [
      r.supply_items && `공급자재: ${r.supply_items}`,
      r.promo && `프로모션: ${JSON.stringify(r.promo)}`,
      r.promo_extend && `연장: ${JSON.stringify(r.promo_extend)}`,
      r.charge_rate != null && `충전요금 ${r.charge_rate}`,
      r.install_terms && `설치조건: ${r.install_terms}`,
      r.other_support && `기타지원: ${r.other_support}`,
      r.coexist_terms && `병행: ${r.coexist_terms}`,
      r.misc_terms && `기타: ${r.misc_terms.split('\n').join(' / ')}`,
      `감리 ${r.supervision_bearer ?? '—'} · 안전 ${r.safety_fee_bearer ?? '—'}`,
    ].filter(Boolean);
    for (const c of cond) console.log(`   · ${c}`);
    console.log('');
  }
  process.exit(0);
}

void main();

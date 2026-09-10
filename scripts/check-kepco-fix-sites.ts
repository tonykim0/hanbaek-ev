/**
 * 7/20 한전불입 케이스(sk-h2-y10-kepco-new) 정정이 닿는 현장 — ★읽기만 한다★.
 *
 *   npx tsx scripts/check-kepco-fix-sites.ts --env /Users/tonykim/hanbaek-backups/.env.prod-db
 *
 * 시공비 120 → 100 정정은 영업사 몫 +20만/기 · 시공사 몫 −20만/기 다. 영업사와 시공사가 같은
 * 회사(턴키)면 그 회사에는 돈이 안 바뀌고, 다른 회사면 시공사가 덜 받는다 — 결정 전에 누가
 * 누구인지 본다. 나간 지급도 명목별로 본다(2차 잔액이 차액을 흡수하는지 확인하려고).
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

import { sql as raw } from 'drizzle-orm';
import { getDb } from '../lib/db/client';

type Row = {
  name: string; sales_org: string | null; gc_org: string | null; qty: number;
  status: string | null; locked: boolean; paid: string | null;
};

async function main() {
  const rows = (await getDb().execute(raw`
    select p.name, p.sales_org, p.gc_org, l.qty, pr.status,
           p.payout_terms_confirmed_at is not null as locked,
           (select string_agg(e.kind || ' ' || e.category || ' ' || (e.amount / 10000) || '만', ' / ' order by e.at)
              from payout_entries e where e.project_id = p.id) as paid
      from contract_lines l
      join projects p on p.id = l.project_id
      left join processes pr on pr.project_id = p.id
     where l.pricing_rule_id = 'sk-h2-y10-kepco-new'
     order by p.name
  `)) as unknown as Row[];

  console.log(`sk-h2-y10-kepco-new 참조 현장 ${rows.length}곳\n`);
  for (const r of rows) {
    const same = r.sales_org && r.sales_org === r.gc_org;
    console.log(`■ ${r.name} · ${r.qty}기 · ${r.status ?? '단계 없음'}${r.locked ? ' · ★지급조건 확정★' : ''}`);
    console.log(`   영업사 ${r.sales_org ?? '—'} · 시공사 ${r.gc_org ?? '—'} → ${same ? '같은 회사(턴키) — 회사 몫 불변' : '다른 회사 — 시공사 −20만/기, 영업사 +20만/기'}`);
    console.log(`   지급: ${r.paid ?? '없음'}`);
    console.log(`   정정 시 계획 변화: 영업 +${r.qty * 20}만 · 시공 −${r.qty * 20}만`);
  }
  process.exit(0);
}

void main();

/**
 * 7/20 한전불입 정정(0072)의 자취 확인 — ★읽기만 한다★.
 *
 *   npx tsx scripts/check-kepco-fix-memo.ts --env /Users/tonykim/hanbaek-backups/.env.prod-db
 *
 * 마이그레이션이 저장소의 문을 우회해 케이스를 고쳤으므로(잠긴 현장이 참조), 남긴 자취가
 * 실제로 붙었는지 눈으로 본다: 참조 현장의 정산 메모 첫 줄과 audit_log 한 줄.
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

async function main() {
  const memos = (await getDb().execute(raw`
    select p.name, s.pay_note
      from settlements s join projects p on p.id = s.project_id
     where s.project_id in (select project_id from contract_lines where pricing_rule_id = 'sk-h2-y10-kepco-new')
     order by p.name
  `)) as unknown as Array<{ name: string; pay_note: string | null }>;

  console.log(`정산 메모가 붙은 현장 ${memos.length}곳\n`);
  for (const m of memos) {
    const first = (m.pay_note ?? '').split('\n')[0];
    console.log(`■ ${m.name}`);
    console.log(`   ${first || '(메모 없음)'}\n`);
  }

  const audit = (await getDb().execute(raw`
    select actor, action, old_value, new_value, at
      from audit_log where field = 'sk-h2-y10-kepco-new' order by at desc limit 3
  `)) as unknown as Array<{ actor: string; action: string; old_value: string | null; new_value: string | null; at: Date }>;
  console.log('감사기록:');
  for (const a of audit) {
    console.log(`   ${a.actor} | ${a.action} | ${a.old_value} → ${a.new_value}`);
  }
  process.exit(0);
}

void main();

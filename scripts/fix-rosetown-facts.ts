/**
 * 효성로즈타운(HB-2026-282, 플러그링크) 현장 정보 채우기 — 주소·주차면·담당자·연락처·이메일·현장명 지역, 계약일 다시 읽기
 * (한백 지시 2026-10-29 「주소도 안 들어가 있고 현장정보도 없어」).
 *
 *   npx tsx scripts/fix-rosetown-facts.ts --env <파일>            # 시험 실행 — 서류를 읽어 보여만 준다
 *   npx tsx scripts/fix-rosetown-facts.ts --env <파일> --apply    # 반영
 *
 * 한빛엔지니어링이 서류 두 장(기설치이력·회의록)만 넣고 다시 접수한 뒤 나머지를 칸마다 올려서, 접수 판독이 읽는 현장 정보가
 * 비었다. 계약일 2026-10-21 은 16:43 에 잘못 올렸다 17:00 에 뺀 남의 현장 계약서(혜성타운운영위원회_계약서.pdf)에서 읽은
 * 값이다 — 비우고 지금 붙은 계약서에서 다시 읽는다. 쓰는 길은 접수 뒤 판독과 같다(lib/fact-read-run fillFactNow — 빈 칸만,
 * 감사 기록은 「자동 판독」, 넣은 값은 그 파일 기록에 남아 그 파일이 빠지면 걷힌다).
 *
 * 판독 키는 .env.local 에서 받는다 — ★DB 접속은 --env 파일이 먼저 잡는다★(loadEnvFile 은 이미 있는 값을 덮지 않는다).
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { loadEnvFile } from '../lib/env-file';

const envAt = process.argv.indexOf('--env');
const ENV_FILE = envAt >= 0 ? process.argv[envAt + 1] : '';
if (!ENV_FILE || ENV_FILE.startsWith('--')) throw new Error('--env 뒤에 파일 이름이 없습니다 (예: --env ~/hanbaek-backups/.env.prod-db).');
if (!existsSync(ENV_FILE)) throw new Error(`${ENV_FILE} 이 없습니다.`);
loadEnvFile(ENV_FILE);
if (!process.env.DATABASE_URL && process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL;
loadEnvFile(path.join(__dirname, '..', '.env.local'));
const APPLY = process.argv.includes('--apply');

const PROJECT_ID = 'HB-2026-282';
/** 남의 현장 계약서에서 읽혀 남은 값 — 이 값일 때만 비우고 다시 읽는다 */
const WRONG_DATE = '2026-10-21';
const FIELDS = ['contractDate', 'addr', 'parkTotal', 'mgr', 'tel', 'mail'] as const;

async function main() {
  const { sql } = await import('drizzle-orm');
  const { getDb } = await import('../lib/db/client');
  const { pgRepository } = await import('../lib/data/pg-store');
  const { fillFactNow, readFact } = await import('../lib/fact-read-run');

  const [{ n }] = (await getDb().execute(sql`select count(*)::int as n from users where id in ('navy', 'viewer')`)) as unknown as Array<{ n: number }>;
  console.log(n === 0 ? '[운영 DB]' : '[개발 DB]');

  const look = async () => {
    const got = await pgRepository.getProject(PROJECT_ID, { role: 'admin', org: null });
    if (!got) throw new Error(`${PROJECT_ID} 가 이 DB 에 없습니다. 멈춘다.`);
    return got;
  };
  const d = await look();
  const p = d.project;
  if (!p.name.includes('효성로즈타운') || p.cpo !== '플러그링크') {
    throw new Error(`${PROJECT_ID} 가 효성로즈타운(플러그링크)이 아닙니다 — ${p.name} · ${p.cpo}. 멈춘다.`);
  }
  const line = (q: typeof p) => `  현장명 ${q.name}\n${FIELDS.map((k) => `  ${k}: ${q[k] ?? '—'}`).join('\n')}`;
  console.log(`\n지금\n${line(p)}`);

  console.log('\n서류에서 읽은 값');
  for (const kind of ['contract', 'apply']) {
    for (const f of d.documents.find((x) => x.kind === kind)?.files ?? []) {
      const res = await fetch(f.url);
      if (!res.ok) throw new Error(`${f.name} 를 받지 못했습니다 (${res.status})`);
      console.log(`  ${kind} ${f.name}\n    ${JSON.stringify(await readFact(kind, { name: f.name, buffer: Buffer.from(await res.arrayBuffer()) }))}`);
    }
  }

  if (!APPLY) {
    console.log(`\n시험 실행 — 아무것도 안 썼다. 반영하려면 --apply. 계약일은 ${WRONG_DATE} 일 때만 비우고 다시 읽는다.`);
    process.exit(0);
  }

  if (p.contractDate === WRONG_DATE) {
    await pgRepository.setProjectFacts(PROJECT_ID, { contractDate: null }, { id: 'system', name: '자동 판독', role: 'admin', org: null });
  }
  for (const kind of ['contract', 'apply']) console.log(`  ${kind} 넣음 ${JSON.stringify(await fillFactNow(PROJECT_ID, kind))}`);
  console.log(`\n반영 뒤\n${line((await look()).project)}`);
  process.exit(0);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });

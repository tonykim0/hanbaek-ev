/**
 * 현장 하나의 계약 사실·잠금·돈 — ★읽기만 한다★.
 *
 *   npx tsx scripts/check-site.ts --env /Users/tonykim/hanbaek-backups/.env.prod-db --name 화진금봉
 *
 * 계약대수가 바뀌었다는 연락을 받으면(계약변경) 고치기 전에 이것부터 본다 — 대수는
 * 지급·기성 계획의 곱하는 수라, 이미 나간 지급과 받은 기성이 있으면 고침이 소급한다.
 * 지급조건이 굳어 있으면(payoutTermsConfirmedAt) 저장소가 수정을 거절하므로 해제가 먼저다.
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

const nameAt = process.argv.indexOf('--name');
const nameArg = nameAt >= 0 ? process.argv[nameAt + 1] : null;
if (!nameArg) throw new Error('--name 뒤에 현장 이름(일부)이 필요합니다.');
const NAME: string = nameArg;

import { pgRepository } from '../lib/data/pg-store';
import { payoutsOfDetail, workOf } from '../lib/payout-board';
import { turnkeyUnit } from '../lib/settlement';
import type { Viewer } from '../lib/auth/types';

const won = (n: number | null) => (n == null ? '—' : n.toLocaleString('ko-KR'));
const HANBAEK: Viewer = { role: 'admin', org: null };

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error(`DATABASE_URL 이 없습니다 — ${ENV_FILE} 을 확인하세요.`);
  let host = '알 수 없음';
  try { host = new URL(url).host; } catch { /* 호스트만 찍는다 */ }
  console.log(`DB ${host}  (${ENV_FILE})\n찾는 이름 「${NAME}」\n`);

  const all = await pgRepository.listProjects(HANBAEK);
  const hits = all.filter((p) => p.name.includes(NAME));
  if (hits.length === 0) {
    console.log(`맞는 현장이 없습니다 (전체 ${all.length}건).`);
    /*
     * ★없다고 끝내지 않는다★ — 「그런 곳 있었나」는 대개 철자가 한 글자 다르다(띄어쓰기·
     * 차수·아파트 유무). 두 글자씩 끊어 하나라도 걸리는 이름을 같이 보여 준다.
     */
    const grams = new Set<string>();
    for (let i = 0; i + 2 <= NAME.length; i += 1) grams.add(NAME.slice(i, i + 2));
    const near = all
      .map((p) => ({ p, n: [...grams].filter((g) => p.name.includes(g)).length }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n)
      .slice(0, 12);
    if (near.length > 0) {
      console.log(`\n비슷한 이름 ${near.length}건 (겹치는 두 글자 수 순)`);
      for (const { p, n } of near) console.log(`   ${n}  ${p.name}  (${p.id})`);
    }
    process.exit(0);
  }

  for (const s of hits) {
    const d = await pgRepository.getProject(s.id, HANBAEK);
    if (!d) continue;
    const p = d.project;
    console.log('─'.repeat(72));
    console.log(`${p.name}  (${p.id}${p.mgmtNo ? ` · 노션 ${p.mgmtNo}` : ''})`);
    console.log(`  운영사 ${p.cpo} · ${p.bizType} · ${p.powerType ?? '수전 미지정'} · 단계 ${d.stage}`
      + (p.holdState ? `  ★${p.holdState}★` : ''));
    console.log(`  영업사 ${p.salesOrg ?? '—'} · 시공사 ${p.gcOrg ?? '—'}`);
    console.log(`  계약확인 ${p.contractConfirmedAt ?? '—'} · 지급조건 확정 ${p.payoutTermsConfirmedAt ?? '안 굳음(수정 가능)'}`);

    const total = d.lines.reduce((n, l) => n + l.qty, 0);
    console.log(`\n  계약 라인 ${d.lines.length}줄 · 합계 ${total}대`);
    for (const l of d.lines) {
      const r = l.rule;
      console.log(`   · ${l.id}  ${l.termYears}년 ${l.qty}대`
        + ` · ${l.powerType ?? '—'} · ${l.replType ?? '—'}`
        + `\n     단가 ${r ? `${r.caseName} [${r.id}] ${r.startDate}` : '★미지정★'}${l.pricedAt ? ` (지정 ${l.pricedAt})` : ''}`
        + (r ? `\n     대당 영업 ${won(r.salesUnit)} · 시공 ${won(r.consUnit)} · 마진 ${won(r.margin)} = ${won(turnkeyUnit(r))}` : ''));
    }

    const rows = payoutsOfDetail(d, { sales: true, cons: true, cost: true } as never);
    console.log('\n  협력사 지급');
    for (const r of rows) {
      const w = workOf(r);
      if (w.due === 0 && r.confirmed === 0) continue;
      console.log(`   · ${r.org ?? '—'} ${r.kind}  계획 ${won(w.due)} · 나감 ${won(r.confirmed)}`
        + ` → 남은 것 ${won(w.due - r.confirmed)}  [${w.state}]`);
    }

    const steps = d.admin?.steps ?? [];
    console.log(`\n  운영사 기성  (규칙 ${d.admin?.settlementRule?.name ?? '—'})`);
    for (const st of steps) {
      console.log(`   · ${st.no}차 ${st.trigger} · ${st.basisLabel}  계획 ${won(st.planAmount ?? 0)}`
        + `  [${st.state}]${st.collectedAt ? ` · 수금 ${st.collectedAt}` : ''}`
        + (st.collectedAmount != null ? ` (실수금 ${won(st.collectedAmount)})` : ''));
    }

    const pr = d.process as unknown as Record<string, unknown>;
    console.log('\n  공정의 대수 값');
    for (const k of ['chargerOrderQty', 'modemOrderQty', 'chargerQty', 'modemQty']) {
      console.log(`   · ${k} = ${pr[k] ?? '—'}`);
    }
    if (d.settlement.payNote) console.log(`\n  정산 메모\n${d.settlement.payNote.split('\n').map((x) => `   | ${x}`).join('\n')}`);
    console.log();
  }
  process.exit(0);
}

void main();

/**
 * 영업사 이름 「이브이솔루션」 → 「이브이솔루션 (영업)」 (한백 지시 2026-10-28).
 *
 *   npx tsx scripts/fix-evsolution-org.ts --env <파일>            # 시험 실행 — 아무것도 안 쓴다
 *   npx tsx scripts/fix-evsolution-org.ts --env <파일> --apply    # 반영
 *
 * 영업 계정(evsolution)의 소속이 「이브이솔루션 (영업)」인데 현장 7곳의 영업사 칸이 옛 이름이라
 * 그 계정에 2곳만 보였다(협력사는 소속 글자가 같은 현장만 본다). 화면의 영업사 지정(setOrgs)은
 * 돈이 나간 현장의 지급처를 못 바꾼다(감사 M3) — 확정·세금계산서가 옛 이름을 열쇠로 들고 있어서다.
 * 그 거절의 이유는 「열쇠를 다른 현장도 같이 쓴다」였는데, 여기서는 옛 이름의 현장을 전부 옮기므로
 * 열쇠도 같이 옮긴다: 현장의 영업사 칸 · batch_finals · tax_invoices 를 한 트랜잭션에서.
 *
 * 옮기면 안 되는 경우 둘은 멈춘다 — 새 이름에 같은 (구분 · 지급일) 확정·계산서가 이미 있을 때,
 * 새 이름의 현장에 그 지급일 지급이 있어 확정된 배치에 줄이 끼어들 때.
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

import { and, eq, inArray } from 'drizzle-orm';
import { getDb } from '../lib/db/client';
import {
  batchFinals, noticeMessages, payoutEntries, projects, recvPresets, surveyDrafts, taxInvoices, users,
} from '../lib/db/schema';
import { writeAudit } from '../lib/db/audit';
import { normalizeOrg } from '../lib/roles';
import type { Actor } from '../lib/auth/types';

const OLD = '이브이솔루션';
const NEW = '이브이솔루션 (영업)';
const ACTOR: Actor = { id: 'script', name: '영업사 이름 정리 (이브이솔루션)', role: 'admin', org: null };

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error(`DATABASE_URL 이 없습니다 — ${ENV_FILE} 을 확인하세요.`);
  let host = '알 수 없음';
  try { host = new URL(url).host; } catch { /* 호스트만 찍는다 */ }
  console.log(`DB ${host}  (${ENV_FILE})  ${APPLY ? '★반영★' : '시험 실행 — 아무것도 안 씁니다'}`);
  if (normalizeOrg(NEW) !== NEW) throw new Error(`「${NEW}」가 정규형이 아닙니다.`);

  const db = getDb();
  await db.transaction(async (tx) => {
    const [account] = await tx.select({ id: users.id }).from(users).where(eq(users.org, NEW));
    if (!account) throw new Error(`소속 「${NEW}」 계정이 없습니다 — 이름을 다시 보세요.`);

    const sites = await tx.select({ id: projects.id, name: projects.name, gcOrg: projects.gcOrg })
      .from(projects).where(eq(projects.salesOrg, OLD)).orderBy(projects.id);
    const gcSites = await tx.select({ id: projects.id }).from(projects).where(eq(projects.gcOrg, OLD));
    const finals = await tx.select().from(batchFinals).where(eq(batchFinals.org, OLD));
    const invoices = await tx.select().from(taxInvoices).where(eq(taxInvoices.org, OLD));

    console.log(`\n── 옛 이름 「${OLD}」 ──`);
    console.log(`  영업사 칸 ${sites.length}곳` + sites.map((s) => `\n    ${s.id} ${s.name}`).join(''));
    console.log(`  시공사 칸 ${gcSites.length}곳`);
    console.log(`  확정 배치 ${finals.length}건` + finals.map((f) => `\n    ${f.kind} ${f.payDate} (확정 ${f.finalizedAt})`).join(''));
    console.log(`  세금계산서 ${invoices.length}장` + invoices.map((t) => `\n    ${t.kind} ${t.payDate} ${t.filename}`).join(''));
    if (gcSites.length > 0) throw new Error('시공사 칸에도 옛 이름이 있습니다 — 시공비 지급처라 손으로 보세요.');

    // 옮기지 않는 자리 — 동작이 아니라 기록이라 세기만 한다
    const others = {
      recv_presets: (await tx.select({ id: recvPresets.id }).from(recvPresets).where(eq(recvPresets.org, OLD))).length,
      notice_messages: (await tx.select({ id: noticeMessages.id }).from(noticeMessages).where(eq(noticeMessages.org, OLD))).length,
      survey_drafts: (await tx.select({ id: surveyDrafts.id }).from(surveyDrafts).where(eq(surveyDrafts.ownerOrg, OLD))).length,
    };
    console.log(`  그 밖 ${Object.entries(others).map(([k, n]) => `${k} ${n}`).join(' · ')}`);
    /*
     * 수령지 프리셋은 시공사 이름이 열쇠다(화면이 현장의 gcOrg 로 찾는다) — 영업사 정리가 옮길 것이 아니다.
     * 「(영업)」으로 옮기면 틀린 자리가 된다. 보이기만 한다.
     */
    if (others.recv_presets > 0) {
      const rows = await tx.select().from(recvPresets).where(eq(recvPresets.org, OLD));
      const gcCount = (await tx.select({ id: recvPresets.id }).from(recvPresets)
        .where(eq(recvPresets.org, '이브이솔루션 (시공)'))).length;
      console.log('  수령지 프리셋(시공사 열쇠 — 옮기지 않음):'
        + rows.map((r) => `\n    ${r.addr} · ${r.name ?? '—'} · ${r.phone ?? '—'} (${r.createdAt.toISOString().slice(0, 10)})`).join('')
        + `\n    「이브이솔루션 (시공)」 프리셋 ${gcCount}건`);
    }

    // 멈출 자리 ① 새 이름에 같은 열쇠가 이미 있다
    for (const f of finals) {
      const [dup] = await tx.select({ id: batchFinals.id }).from(batchFinals)
        .where(and(eq(batchFinals.org, NEW), eq(batchFinals.kind, f.kind), eq(batchFinals.payDate, f.payDate)));
      if (dup) throw new Error(`「${NEW}」에 ${f.kind} ${f.payDate} 확정이 이미 있습니다.`);
    }
    for (const t of invoices) {
      const [dup] = await tx.select({ id: taxInvoices.id }).from(taxInvoices)
        .where(and(eq(taxInvoices.org, NEW), eq(taxInvoices.kind, t.kind), eq(taxInvoices.payDate, t.payDate)));
      if (dup) throw new Error(`「${NEW}」에 ${t.kind} ${t.payDate} 세금계산서가 이미 있습니다.`);
    }
    // 멈출 자리 ② 새 이름의 현장 지급이 확정·계산서 붙은 배치에 끼어든다
    const newSites = (await tx.select({ id: projects.id }).from(projects).where(eq(projects.salesOrg, NEW))).map((p) => p.id);
    for (const key of [...finals, ...invoices]) {
      if (newSites.length === 0) break;
      const joins = await tx.select({ projectId: payoutEntries.projectId }).from(payoutEntries)
        .where(and(inArray(payoutEntries.projectId, newSites), eq(payoutEntries.kind, key.kind), eq(payoutEntries.at, key.payDate)));
      if (joins.length > 0) {
        throw new Error(`「${NEW}」 현장 ${[...new Set(joins.map((j) => j.projectId))].join(' · ')} 의 ${key.kind} ${key.payDate} 지급이 확정 배치에 섞입니다.`);
      }
    }

    console.log(`\n── 할 일 (한 트랜잭션) ──`);
    console.log(`  1. 영업사 칸 ${sites.length}곳 → 「${NEW}」`);
    console.log(`  2. 확정 배치 ${finals.length}건 · 세금계산서 ${invoices.length}장의 지급처 → 「${NEW}」`);
    console.log(`  3. audit_log ${sites.length + finals.length + invoices.length}줄`);

    if (!APPLY) {
      console.log('\n시험 실행이라 여기서 멈춥니다. 반영하려면 --apply 를 붙이세요.');
      return;
    }

    for (const s of sites) {
      await tx.update(projects).set({ salesOrg: NEW }).where(eq(projects.id, s.id));
      await writeAudit(tx, {
        projectId: s.id, actor: ACTOR, action: '영업사 지정',
        field: 'salesOrg', oldValue: OLD, newValue: NEW,
      });
    }
    for (const f of finals) {
      await tx.update(batchFinals).set({ org: NEW }).where(eq(batchFinals.id, f.id));
      await writeAudit(tx, {
        projectId: null, actor: ACTOR, action: '확정 배치 지급처 이름 정리',
        field: `batch_finals ${f.kind} ${f.payDate}`, oldValue: OLD, newValue: NEW,
      });
    }
    for (const t of invoices) {
      await tx.update(taxInvoices).set({ org: NEW }).where(eq(taxInvoices.id, t.id));
      await writeAudit(tx, {
        projectId: null, actor: ACTOR, action: '세금계산서 지급처 이름 정리',
        field: `tax_invoices ${t.kind} ${t.payDate}`, oldValue: OLD, newValue: NEW,
      });
    }

    const left = await tx.select({ id: projects.id }).from(projects).where(eq(projects.salesOrg, OLD));
    const now = await tx.select({ id: projects.id }).from(projects).where(eq(projects.salesOrg, NEW));
    console.log(`\n반영 ✓ — 「${OLD}」 영업사 칸 ${left.length}곳 · 「${NEW}」 ${now.length}곳`);
  });
  process.exit(0);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });

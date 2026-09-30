/**
 * 협력사별 자주 쓰는 충전기 수령지 (한백 지시 2026-09-30).
 *
 * 같은 시공사가 여러 현장을 한 창고·사무실로 받는다. 현장마다 새로 치지 않게 그
 * 협력사 이름으로 묶어 저장해 두고, 공정의 수령지 칸에서 골라 넣는다.
 *
 * ★누가 보나★ 한백과 그 협력사뿐이다 — 남의 협력사 주소·연락처가 보이면 안 된다.
 * 공정 입력(assertProcessWrite)과 같은 기준으로 잰다.
 */
import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { writeAudit } from '@/lib/db/audit';
import { recvPresets } from '@/lib/db/schema';
import { isHanbaek, normalizeOrg } from '@/lib/roles';
import type { RecvPreset } from '@/types/project';
import type { Actor, ProjectRepository } from '../repository';

/** 그 협력사 사람인가 — 공정을 적는 역할(시공사)과 이름이 맞아야 한다 */
function isOrgMember(actor: Actor, org: string): boolean {
  return (actor.role === 'cons' || actor.role === 'salesCons')
    && normalizeOrg(actor.org) === org;
}

function orgOf(raw: string): string {
  const org = normalizeOrg(raw);
  if (!org) throw new Error('협력사를 알 수 없습니다.');
  return org;
}

function assertRead(actor: Actor, org: string): void {
  if (isHanbaek(actor.role) || isOrgMember(actor, org)) return;
  throw new Error('그 협력사의 수령지는 볼 수 없습니다.');
}

function assertWrite(actor: Actor, org: string): void {
  if (actor.role === 'admin' || isOrgMember(actor, org)) return;
  throw new Error('수령지 목록은 한백 관리자와 그 협력사만 고칠 수 있습니다.');
}

const clean = (v: string | null | undefined, max: number, what: string): string | null => {
  const t = (v ?? '').trim();
  if (t.length > max) throw new Error(`${what}이 너무 깁니다.`);
  return t === '' ? null : t;
};

export const recvPresetStore: Pick<
  ProjectRepository,
  'listRecvPresets' | 'addRecvPreset' | 'removeRecvPreset'
> = {
  async listRecvPresets(rawOrg, actor): Promise<RecvPreset[]> {
    const org = orgOf(rawOrg);
    assertRead(actor, org);
    const rows = await getDb().select().from(recvPresets)
      .where(eq(recvPresets.org, org))
      .orderBy(asc(recvPresets.createdAt));
    return rows.map((r) => ({ id: r.id, org: r.org, addr: r.addr, name: r.name, phone: r.phone }));
  },

  async addRecvPreset(input, actor): Promise<string> {
    const org = orgOf(input.org);
    assertWrite(actor, org);
    const addr = clean(input.addr, 200, '주소');
    if (!addr) throw new Error('주소를 적어주세요.');
    const name = clean(input.name, 200, '담당자');
    const phone = clean(input.phone, 200, '연락처');

    const db = getDb();
    // 같은 셋이 이미 있으면 그것을 돌려준다 — 두 번 누른 것으로 목록이 불어나지 않게
    const same = await db.select().from(recvPresets)
      .where(and(eq(recvPresets.org, org), eq(recvPresets.addr, addr)));
    const dup = same.find((r) => r.name === name && r.phone === phone);
    if (dup) return dup.id;

    const id = crypto.randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(recvPresets).values({ id, org, addr, name, phone });
      await writeAudit(tx, {
        projectId: null, actor, action: '수령지 저장',
        field: 'recvPresets', oldValue: null, newValue: `${org} · ${addr}`,
      });
    });
    return id;
  },

  async removeRecvPreset(id, actor): Promise<void> {
    const db = getDb();
    const [row] = await db.select().from(recvPresets).where(eq(recvPresets.id, id)).limit(1);
    if (!row) throw new Error('이미 빠진 수령지입니다.');
    assertWrite(actor, row.org);
    await db.transaction(async (tx) => {
      await tx.delete(recvPresets).where(eq(recvPresets.id, id));
      await writeAudit(tx, {
        projectId: null, actor, action: '수령지 빼기',
        field: 'recvPresets', oldValue: `${row.org} · ${row.addr}`, newValue: null,
      });
    });
  },
};

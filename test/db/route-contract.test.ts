/**
 * 쓰기 라우트의 껍데기(lib/api/write-route.ts)와 그 뒤 저장소의 문 — /api/projects/[id]/process 로 본다.
 *
 * 껍데기가 약속한 응답 계약(401·403·400·422·200)과, 저장소가 한 번 더 보는 문(남의 현장 ·
 * 한백 전용 칸 · 아직 오지 않은 구간)이 실제로 닫혀 있는지. 감사 H2(설치완료 선언 서버 미검증)가
 * 바로 이 층이었다 — 화면 단추만 막혀 있었고 라우트는 열려 있었다.
 */
import { describe, expect, it } from 'vitest';
import { POST } from '@/app/api/projects/[id]/process/route';
import { getRepository } from '@/lib/data';
import { USERS, call, signIn, signOut, viewerOf, withProject } from './kit';

describe('쓰기 라우트의 껍데기 — /api/projects/[id]/process', () => {
  it('로그인 없이는 401 — 본문도 현장도 보기 전에', async () => {
    signOut();
    const r = await call(POST, { body: { memo: 'x' }, params: { id: 'HB-0000-000' } });
    expect(r.status).toBe(401);
  });

  it('열람 전용은 어떤 쓰기도 403', async () => {
    await signIn(USERS.viewer);
    const r = await call(POST, { body: { memo: 'x' }, params: { id: 'HB-0000-000' } });
    expect(r.status).toBe(403);
    expect(String(r.json?.error)).toContain('열람 전용');
  });

  it('본문이 JSON 이 아니면 400', async () => {
    await signIn(USERS.admin);
    const r = await call(POST, { rawBody: '이건 JSON 이 아니다', params: { id: 'HB-0000-000' } });
    expect(r.status).toBe(400);
  });

  it('값이 틀리면 400, 규칙에 걸리면 422 — 화면이 「다시 입력」과 「할 수 없다」를 가른다', async () => {
    await withProject(async (id) => {
      await signIn(USERS.admin);
      const bad = await call(POST, { body: { envApprovalDate: '2026/09/08' }, params: { id } });
      expect(bad.status).toBe(400);
      expect(String(bad.json?.error)).toContain('YYYY-MM-DD');
    });
  });

  it('현장에 붙지 않은 회사는 공정을 못 적는다 — 422', async () => {
    await withProject(async (id) => {
      await signIn(USERS.ecoelec);   // 턴키지만 이 현장의 영업사도 시공사도 아니다
      const r = await call(POST, { body: { memo: '남의 현장' }, params: { id } });
      expect(r.status).toBe(422);
      expect(String(r.json?.error)).toContain('시공사만');
    });
  });

  it('그 현장의 시공사도 한백 전용 칸(환경부 승인일)은 못 적는다 — 422', async () => {
    await withProject(async (id) => {
      await signIn(USERS.daesang);
      const r = await call(POST, { body: { envApprovalDate: '2026-09-08' }, params: { id } });
      expect(r.status).toBe(422);
      expect(String(r.json?.error)).toContain('한백이 적는 칸');
    });
  });

  it('아직 오지 않은 구간의 완료 선언은 서버가 거부한다 — 422 (감사 H2 의 부류)', async () => {
    await withProject(async (id) => {
      await signIn(USERS.daesang);
      // 계약접수 현장에 설치완료 선언 — 화면에는 단추가 없지만 API 는 직접 부를 수 있다
      const r = await call(POST, { body: { installConfirmedAt: '2026-09-08' }, params: { id } });
      expect(r.status).toBe(422);
      expect(String(r.json?.error)).toContain('아직 그 구간이 아닙니다');
      const detail = await getRepository().getProject(id, viewerOf(USERS.admin));
      expect(detail?.process.installConfirmedAt ?? null).toBeNull();
    });
  });

  it('한백이 적은 값은 저장된다 — 200 { ok: true }', async () => {
    await withProject(async (id) => {
      await signIn(USERS.admin);
      const r = await call(POST, { body: { memo: '시험 메모' }, params: { id } });
      expect(r.status).toBe(200);
      expect(r.json).toEqual({ ok: true });
      const detail = await getRepository().getProject(id, viewerOf(USERS.admin));
      expect(detail?.process.memo).toBe('시험 메모');
    });
  });
});

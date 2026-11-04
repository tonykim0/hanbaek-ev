/**
 * 태양광 자료실의 문 (2026-11-04 — 「태양광사업관리 페이지에서도 자료실 · 우리가 업로드 할 수 있는 기능」).
 *
 * 올리기 · 빼기는 한백 관리자만 — 태양광 참여 협력사 · 열람 전용은 403(보기는 화면이 한다). 관리자라도 자료실 자리
 * (solar-materials/…) 밖이면 400 — 현장 첨부파일 · 전기차 자료를 덮거나 지우는 길을 막는다. 저장소(Blob)에 닿기 전에 갈린다.
 */
import { describe, expect, it } from 'vitest';
import { DELETE, POST } from '@/app/api/solar/library/route';
import { signIn, USERS } from './kit';

const ask = async (handler: typeof POST, method: 'POST' | 'DELETE', pathname: string, step = false) =>
  (
    await handler(
      new Request(`http://test.local/api/solar/library${step ? '?step=token' : ''}`, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pathname }),
      }),
    )
  ).status;

describe('태양광 자료실 — 올리기 · 빼기의 문', () => {
  it('한백 관리자가 아니면 403 — 태양광 참여 협력사도, 열람 전용도', async () => {
    for (const who of [USERS.ecoelec, USERS.viewer]) {
      await signIn(who);
      expect(await ask(POST, 'POST', 'solar-materials/제안서.pdf', true), who.id).toBe(403);
      expect(await ask(POST, 'POST', 'solar-materials/제안서.pdf'), who.id).toBe(403);
      expect(await ask(DELETE, 'DELETE', 'solar-materials/제안서.pdf'), who.id).toBe(403);
    }
  });

  it('관리자라도 자료실 자리 밖이면 400 — 현장 첨부파일 · 전기차 자료 · 위로 오르기 · 세 칸', async () => {
    await signIn(USERS.admin);
    for (const p of ['solar-sites/SL-2026-001/a.pdf', 'materials/sk/sales/a.pdf', 'solar-materials/../materials/a.pdf', 'solar-materials/a/b/c.pdf', '']) {
      expect(await ask(POST, 'POST', p, true), `토큰 ${p}`).toBe(400);
      expect(await ask(DELETE, 'DELETE', p), `빼기 ${p}`).toBe(400);
    }
  });
});

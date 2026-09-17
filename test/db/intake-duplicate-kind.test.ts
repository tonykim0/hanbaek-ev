/**
 * 한 칸에 여러 장이 와도 접수가 된다 — ★실사고 2026-09-17★.
 *
 * 판독이 한 ZIP 에서 「기타」 3장·「실사보고서」 2장을 뽑았는데(intake-auto 가 일부러 여러
 * 장을 만든다 — 회의록 2종·사업자등록증/고유번호증처럼 한 칸에 둘이 앉는 서류가 있다)
 * createProject 가 파일마다 한 줄을 넣어 기본키 (project_id, kind) 가 겹쳤다.
 *
 * 접수가 통째로 500 이 되고 화면에는 「서버에 문제가 생겼습니다」만 떴다 — 열여섯 장을
 * 올려 둔 사람은 무엇이 문제인지 알 길이 없었다(한백 2026-09-17).
 */
import { describe, expect, it } from 'vitest';
import { getRepository } from '@/lib/data';
import { actorOf, draft, USERS } from './kit';

const repo = getRepository();
const admin = actorOf(USERS.admin);
const view = { role: 'admin' as const, org: null };

describe('접수 — 한 칸에 여러 장', () => {
  it('★같은 칸이 여럿 와도 접수된다★ — 칸마다 한 줄로 접는다', async () => {
    const id = await repo.createProject(draft({
      documents: [
        { kind: 'contract', filename: '계약서.pdf' },
        { kind: 'etc', filename: '기타_행위신고증명서.pdf' },
        { kind: 'etc', filename: '기타_행위신고증명서(2).pdf' },
        { kind: 'etc', filename: '기타_행위신고증명서(3).pdf' },
        { kind: 'survey', filename: '실사보고서.xlsx' },
        { kind: 'survey', filename: '실사보고서(2).xlsx' },
      ],
    }), admin);
    try {
      const d = (await repo.getProject(id, view))!;
      const rows = d.documents.filter((x) => x.status === 'uploaded');
      const kinds = rows.map((x) => x.kind).sort();
      expect(kinds).toEqual(['contract', 'etc', 'survey']);
      // 첫 장의 이름이 그 칸의 표시 이름이다 — 정본은 files 이고 이것은 사본이다
      expect(rows.find((x) => x.kind === 'etc')?.filename).toBe('기타_행위신고증명서.pdf');
      expect(rows.find((x) => x.kind === 'survey')?.filename).toBe('실사보고서.xlsx');
    } finally {
      await repo.deleteProject(id, admin);
    }
  });

  it('서류가 없어도 접수된다 — 안 올라온 칸은 조회할 때 채운다', async () => {
    const id = await repo.createProject(draft({ documents: [] }), admin);
    try {
      const d = (await repo.getProject(id, view))!;
      expect(d.documents.every((x) => x.status !== 'uploaded')).toBe(true);
    } finally {
      await repo.deleteProject(id, admin);
    }
  });
});

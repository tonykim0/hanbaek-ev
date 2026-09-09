/**
 * 쓰기 라우트에는 문이 있다 — 열람 전용(viewer)은 어떤 쓰기도 못 한다는 규칙(CLAUDE.md 「계정 구분 다섯」).
 *
 * 문은 껍데기(sessionWrite·adminWrite)가 정본이지만, multipart 라우트는 껍데기를 못 쓰고 canWrite 를
 * 손으로 부른다 — ★손으로 옮겨 적는 자리라 빠뜨린 적이 있다★(협력사 정보 올리기, 2026-08-25). 문장으로
 * 남긴 규칙은 다음 사람이 어긴다. 그래서 라우트 파일을 전부 읽어 문이 없는 쓰기 라우트를 잡는다.
 * 문이 없어도 되는 것은 이유와 함께 아래 목록에 적는다 — 새 라우트를 여기에 더하는 대신 문을 만든다.
 */
import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { findFiles } from './fs';

const WRITE_EXPORT = /export\s+(const|async\s+function)\s+(POST|PUT|PATCH|DELETE)\b/;
/** 문으로 인정하는 것 — 껍데기 · 관리자 확인 · 손·눈 판정 · 한백만 하는 쓰기의 role 비교 */
const GATES = [/\b(sessionWrite|adminWrite)\s*[<(]/, /\brequireAdmin\(/, /\bcanWrite\(/, /\bisHanbaek\(/, /role [!=]== 'admin'/];
/** 손으로 부르는 문 — 껍데기를 못 쓰는 multipart 라우트가 쓴다. 관리자만 받는 role 비교도 문이다(canWrite 보다 좁다) */
const MANUAL_GATES = [/\bcanWrite\(/, /\brequireAdmin\(/, /role [!=]== 'admin'/];

const UNGATED_BY_DESIGN: Record<string, string> = {
  'app/api/auth/login/route.ts': '로그인 그 자체 — 세션이 없다',
  'app/api/auth/logout/route.ts': '로그아웃 — 세션을 지우는 일이라 누구나',
  'app/api/intake/route.ts': '포털 접수 — 2026-08-26 닫혔다(lib/portal-intake.ts). 세션 없는 입구라 문이 아니라 폐쇄 안내를 준다',
  'app/api/notices/read/route.ts': '자기 읽음 표시 — 쓰기 권한과 무관, 로그인만 본다',
  'app/api/upload/route.ts': '서류 도구의 임시 올리기 토큰 — DB 에 안 쓴다. 열람 전용도 쓴다(한백 지시 2026-08-31)',
  'app/api/import-form/route.ts': '재발행 판독 — DB 에 안 쓴다. 열람 전용도 쓴다(2026-08-31). 파일 임자는 stagedPathnameOf 가 본다',
  'app/api/admin/partner-details/read/route.ts': 'POST 로 받는 조회 — 권한은 getPartnerDetails 가 actor 로 본다',
};

const routes = findFiles('app/api', 'route.ts');
const writeRoutes = routes.filter((f) => WRITE_EXPORT.test(readFileSync(f, 'utf8')));

describe('쓰기 라우트의 문', () => {
  it('라우트를 찾았다', () => {
    expect(routes.length).toBeGreaterThan(40);
    expect(writeRoutes.length).toBeGreaterThan(30);
  });

  it.each(writeRoutes)('%s — 껍데기·requireAdmin·canWrite·isHanbaek 중 하나가 있거나, 이유가 적혀 있다', (file) => {
    const src = readFileSync(file, 'utf8');
    const gated = GATES.some((re) => re.test(src));
    const reason = UNGATED_BY_DESIGN[file];
    expect(gated || Boolean(reason), `${file}: 열람 전용을 막는 문이 없다 — 껍데기를 쓰거나 canWrite 를 부르거나, 문이 없어도 되는 이유를 UNGATED_BY_DESIGN 에 적는다`).toBe(true);
  });

  it('이유 목록의 라우트는 실제로 있고, 문이 없는 상태다 — 문이 생겼으면 목록에서 지운다', () => {
    for (const [file, reason] of Object.entries(UNGATED_BY_DESIGN)) {
      expect(routes, `${file} 가 없다 (${reason}) — 목록에서 지운다`).toContain(file);
      const src = readFileSync(file, 'utf8');
      expect(GATES.some((re) => re.test(src)), `${file} 에 문이 생겼다 — 목록에서 지운다`).toBe(false);
    }
  });

  it('multipart(formData) 를 읽는 쓰기 라우트는 껍데기를 못 쓰므로 canWrite·requireAdmin 을 손으로 부른다', () => {
    for (const file of writeRoutes) {
      const src = readFileSync(file, 'utf8');
      if (!/formData\(\)/.test(src) || UNGATED_BY_DESIGN[file]) continue;
      expect(MANUAL_GATES.some((re) => re.test(src)), `${file}: multipart 쓰기 라우트에 canWrite·requireAdmin·role 비교 손 검사가 없다`).toBe(true);
    }
  });
});

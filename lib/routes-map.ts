/**
 * 주소 지도 — 어느 경로가 콘솔이고, 누가 들어가나. middleware.ts 가 이것으로 가른다.
 *
 * ★순수 모듈인 이유★ 미들웨어 파일 안에 배열로 있으면 화면을 새로 만들고 여기 안 적는 것을 아무도
 * 못 잡는다 — 감사(2026-09-04 L21)가 /finance·/scan 이 빠져 포털 404 와 로그인 문을 둘 다
 * 우회하는 것을 찾았다. test/conventions/console-paths.test.ts 가 app/(console) 의 화면 폴더와
 * 이 목록을 맞춰 보므로, 화면을 더하고 여기 안 적으면 테스트가 깨진다.
 */

/** 콘솔 경로 — 포털 주소에서는 404, 콘솔 주소에서는 로그인 필요. 화면 폴더(app/(console)/*)와 1:1 */
export const CONSOLE_PATHS = [
  '/todos',
  /*
   * /notices 화면은 콘솔이다. 정적 안내문(/notices/*.html)은 여기 안 걸린다 —
   * matcher 가 점 붙은 경로(정적 파일)를 빼므로 포털 주소에서도 그대로 열린다.
   */
  '/notices',
  '/dashboard',
  '/projects',
  '/construction',
  '/contracts',
  '/reissue',
  '/split',
  '/scan',        // 사진 → 스캔본 (2026-09-09 추가 — 감사 L21: 빠져 있어 로그인 없이 열렸다)
  '/finance',     // 정산 현황 (같은 이유로 추가)
  '/payments',
  '/payouts',
  '/receivables',
  '/statements',
  '/settings',
  '/pricing',
  '/admin',
  '/design',
  '/library',
  '/lookup',
  '/apartments',
  '/login',
] as const;

/** 콘솔 경로지만 로그인 없이 여는 것 */
export const OPEN_IN_CONSOLE = ['/login'] as const;

/** 관리자만 — (admin)/admin 라우트 그룹의 (write) 안쪽 문과 같다 */
export const ADMIN_ONLY = ['/admin'] as const;
/** /admin 아래인데 한백의 눈(열람 전용)에게도 여는 것 — 재무가 지급 전에 보는 협력사 정보 */
export const ADMIN_READABLE = ['/admin/partners'] as const;
/** 한백의 눈만(관리자·열람 전용) — (admin) 라우트 그룹의 바깥 문과 같다 */
export const HANBAEK_ONLY = ['/receivables', '/pricing', '/design'] as const;
/** 쓰는 사람만 — 열람 전용은 못 들어간다 */
export const WRITER_ONLY = ['/projects/new', '/contracts', '/settings'] as const;

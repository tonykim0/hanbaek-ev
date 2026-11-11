/**
 * 사업 — 전기차(이 콘솔이 처음 만든 것) · 태양광(2026-11-03 시작, 한백 「모드를 바꾸게 할까? 태양광/전기차 · 색깔도 구분」).
 *
 * ★주소로 가른다★ — /solar 아래가 태양광, 나머지가 전기차다. 상태(쿠키·저장소)로 두면 링크를 보냈을 때 받는 사람이 다른
 * 사업으로 열 수 있고, 새로고침 · 뒤로가기마다 맞춰야 한다. 주소면 화면과 사업이 늘 같다.
 *
 * ★색은 둘로 갈린다★ (2026-11-04 — 처음엔 틀만 갈랐다가 한백 「태양광 페이지에서 버튼이 초록색」으로 넓혔다).
 *   사업 색(tailwind brand) — 틀(아래 BIZ_FRAME)과 화면 안의 「조작」: 하는 일 단추 · 고른 칩 · 갈래 · 입력칸 초점 · 링크.
 *     전기차 한백 그린 · 태양광 귤색. 값은 CSS 변수(app/globals.css)고 껍데기(ConsoleShell)의 data-biz 가 고른다.
 *   상태 색(tailwind ok · 빨강 · 노랑 · 하늘 · 회색) — 두 사업이 같다. 「통과」가 사업마다 다른 색이면 뜻이 갈린다.
 * 그전에는 한백 그린 하나가 회사 색이자 통과 색이라 둘을 가를 수 없었다 — 그래서 상태 초록을 ok 로 따로 뺐다.
 */
import { isHanbaek, type Role } from '@/lib/roles';

export type Biz = 'ev' | 'solar';

/**
 * 시스템 이름 — 두 사업을 아우른다(2026-11-03, 한백 「이제 전기차사업관리가 아니라 신재생사업관리야 — 전기차/태양광」).
 * 탭 제목의 꼬리(app/layout 의 title.template)와 로그인 화면이 이것 하나를 쓴다. 사업마다의 이름은 BIZ_TITLE(사이드바).
 * 운영 주소도 같은 날 hanbaek-ev → hanbaek-re(renewable energy)로 바꿨다 — 옛 주소는 next.config 가 넘긴다.
 */
export const SYSTEM_NAME = '한백 신재생사업관리시스템';

export const BIZES: readonly Biz[] = ['ev', 'solar'];

/**
 * 태양광을 보는가 — 한백의 눈(관리자 · 열람 전용)은 늘, 협력사는 계정설정에서 태양광 참여를 켠 계정만(users.solar).
 * 화면의 문((console)/solar/layout) · API 의 문(lib/solar/api-gate) · 사업 전환 단추가 이것 하나를 본다.
 */
export const seesSolar = (s: { role: Role; solar?: boolean }): boolean => isHanbaek(s.role) || s.solar === true;

export const SOLAR_ROOT = '/solar';

/**
 * 두 사업이 같이 쓰는 화면 — 주소에 사업이 없다. 여기서는 마지막에 있던 사업의 틀을 그대로 둔다: 태양광에서 협력사 정보를
 * 눌렀는데 틀이 그린으로 바뀌면 사업이 바뀐 것처럼 읽힌다.
 * 공지 · 알림은 여기 없다 — 사업마다 따로다(알림 /notifications · /solar/notifications, migrations/0107 · 공지 /notices ·
 * /solar/notices, migrations/0116 — 한백 2026-11-04 「모든 공지와 알림은 분리해(전기차/태양광)」). 공지는 그날까지 여기
 * 있었다 — 그래서 태양광에서도 전기차 공지가 보였다.
 */
export const SHARED_PATHS = ['/admin/partners', '/admin/accounts'] as const;

/** 마지막에 있던 사업 — 같이 쓰는 화면의 틀을 서버가 첫 그림부터 맞게 그리려고 쿠키로 둔다 */
export const BIZ_COOKIE = 'hb-biz';

const under = (pathname: string, root: string) => pathname === root || pathname.startsWith(`${root}/`);

/** @param last 마지막에 있던 사업 — 같이 쓰는 화면에서만 쓴다 */
export function bizOf(pathname: string, last: Biz = 'ev'): Biz {
  if (under(pathname, SOLAR_ROOT)) return 'solar';
  if (SHARED_PATHS.some((p) => under(pathname, p))) return last;
  return 'ev';
}

/** 사업이 정해지는 화면인가 — 같이 쓰는 화면이 아니면 그 화면의 사업이 「마지막 사업」이 된다 */
export const isShared = (pathname: string) => SHARED_PATHS.some((p) => under(pathname, p));

export const asBiz = (v: string | undefined | null): Biz => (v === 'solar' ? 'solar' : 'ev');

/** 상단 바 「알림」이 가는 곳 — 그 사업의 알림(2026-11-03) */
export const BIZ_ALERTS: Record<Biz, string> = { ev: '/notifications', solar: `${SOLAR_ROOT}/notifications` };

/** 상단 바 「공지」가 가는 곳 — 그 사업의 공지(2026-11-04, migrations/0116). 공지 메모 알림도 그 공지의 사업 쪽으로 연다 */
export const BIZ_NOTICES: Record<Biz, string> = { ev: '/notices', solar: `${SOLAR_ROOT}/notices` };

/** AI에이전트 조직도 — 사업마다 따로다(2026-11-04, migrations/0118). 담당 화면은 그 밑 /[담당 id] */
export const BIZ_AGENTS: Record<Biz, string> = { ev: '/admin/agents', solar: `${SOLAR_ROOT}/agents` };

/** 전환 단추를 누르면 가는 곳 — 그 사업의 첫 화면. 태양광은 부지 검토다(지금 실제로 쓰는 화면 — 현장관리는 아직 틀뿐) */
export const BIZ_HOME: Record<Biz, string> = { ev: '/projects', solar: `${SOLAR_ROOT}/check` };

export const BIZ_LABEL: Record<Biz, string> = { ev: '전기차', solar: '태양광' };

/** 사이드바 로고 밑 · 탭 제목 */
export const BIZ_TITLE: Record<Biz, string> = { ev: '전기차사업관리', solar: '태양광사업관리' };

/**
 * 틀의 색 — bar 상단 바 · ink 바 위 글자(메뉴 단추 · 바로가기 · 공지 · 알림) · inkOn 그중 지금 연 화면 ·
 * on 사이드바의 고른 메뉴. 바 위 안 읽은 수는 ui.tsx Count 의 bar 가 칠한다(흰 바탕에 brand-800 — 2026-11-10 까지 여기 pick 이었다).
 * 전기차는 진한 그린 바에 흰 글자, 태양광은 귤색 바에 진한 글자 — 귤색은 밝아서 흰 글자가 안 읽힌다.
 * 바에는 2026-11-04 부터 공지 · 알림이 두 사업 모두 서므로 바 위 글자는 늘 이 값을 쓴다(흰 글자를 박아 두면 귤색에서 안 읽힌다).
 */
export const BIZ_FRAME: Record<Biz, { bar: string; ink: string; inkOn: string; on: string }> = {
  ev: {
    bar: 'bg-brand-700',
    ink: 'text-white/80 hover:bg-white/10 hover:text-white',
    inkOn: 'bg-white/15 text-white',
    on: 'bg-brand-50 text-brand-800',
  },
  solar: {
    bar: 'bg-brand-fill', // 채움과 같은 값을 읽는다 — 귤색 #FA9F38(globals.css 의 태양광 brand-fill, 2026-11-04)
    ink: 'text-slate-900/75 hover:bg-black/5 hover:text-slate-900',
    inkOn: 'bg-black/10 text-slate-900',
    on: 'bg-sun-50 text-sun-800',
  },
};

/**
 * 사업 — 전기차(이 콘솔이 처음 만든 것) · 태양광(2026-11-03 시작, 한백 「모드를 바꾸게 할까? 태양광/전기차 · 색깔도 구분」).
 *
 * ★주소로 가른다★ — /solar 아래가 태양광, 나머지가 전기차다. 상태(쿠키·저장소)로 두면 링크를 보냈을 때 받는 사람이 다른
 * 사업으로 열 수 있고, 새로고침 · 뒤로가기마다 맞춰야 한다. 주소면 화면과 사업이 늘 같다.
 *
 * ★색은 틀만 갈린다★ — 상단 바 · 전환 단추 · 사이드바의 고른 메뉴. 단추 · 배지 · 띠는 두 사업이 같다: 한백 그린(brand)이
 * 회사 색이자 「통과·진행」 상태 색이라(components/ui.tsx 의 ok), 사업마다 바꾸면 상태 색의 뜻(빨강 막힘 · 노랑 봐야 함 ·
 * 하늘 계약)이 사업마다 달라진다. 태양광의 귤색(sun, tailwind.config)은 틀에만 선다.
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
 * 두 사업이 같이 쓰는 화면 — 주소에 사업이 없다. 여기서는 마지막에 있던 사업의 틀을 그대로 둔다: 태양광에서 공지를
 * 눌렀는데 틀이 그린으로 바뀌면 사업이 바뀐 것처럼 읽힌다.
 */
export const SHARED_PATHS = ['/notices', '/notifications', '/admin/partners', '/admin/accounts'] as const;

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

/** 전환 단추를 누르면 가는 곳 — 그 사업의 첫 화면. 태양광은 부지 검토다(지금 실제로 쓰는 화면 — 현장관리는 아직 틀뿐) */
export const BIZ_HOME: Record<Biz, string> = { ev: '/projects', solar: `${SOLAR_ROOT}/check` };

export const BIZ_LABEL: Record<Biz, string> = { ev: '전기차', solar: '태양광' };

/** 사이드바 로고 밑 · 탭 제목 */
export const BIZ_TITLE: Record<Biz, string> = { ev: '전기차사업관리', solar: '태양광사업관리' };

/**
 * 틀의 색 — bar 상단 바 · ink 바 위 글자(메뉴 단추 · 전환의 안 고른 쪽) · track 전환 단추의 홈 · pick 전환에서 고른 쪽의 글자 ·
 * on 사이드바의 고른 메뉴. 전기차는 진한 그린 바에 흰 글자, 태양광은 귤색 바에 진한 글자 — 귤색은 밝아서 흰 글자가 안 읽힌다.
 */
export const BIZ_FRAME: Record<Biz, { bar: string; ink: string; track: string; pick: string; on: string }> = {
  ev: {
    bar: 'bg-brand-700',
    ink: 'text-white/80 hover:bg-white/10 hover:text-white',
    track: 'bg-black/15',
    pick: 'text-brand-800',
    on: 'bg-brand-50 text-brand-800',
  },
  solar: {
    bar: 'bg-sun-500',
    ink: 'text-slate-900/75 hover:bg-black/5 hover:text-slate-900',
    track: 'bg-black/10',
    pick: 'text-sun-800',
    on: 'bg-sun-50 text-sun-800',
  },
};

'use client';

/**
 * 상단 바 — 공지 · 알림(맨 왼쪽)과 조회 도구.
 *
 * 사이드바는 일의 흐름(진행·접수·정산·관리)만 남기고, 어느 화면에서든 잠깐 찾아보는
 * 조회·자료(자료실·이력)는 여기로 올렸다. 흐름과 참고를 한 기둥에 섞으면
 * 메뉴가 길어져 정작 매일 누르는 것이 묻힌다.
 *
 * 「할 일」은 여기 없다. 별도 할 일 메뉴도 걷고, 업무별 건수를 사이드바의 실제 처리
 * 화면(계약관리·시공관리·거래명세서·기성관리)에 붙였다(한백 지시 2026-09-03).
 *
 * ★공지 · 알림이 여기로 올라왔다★ (한백 지시 2026-11-04 「공지랑 알림을 위로 배너로 올려주고」). 2026-09-04 부터 사이드바
 * 맨 위에 있었는데, 그 자리는 사업 전환(전기차/태양광)에 내줬다 — 로고 밑 사업 이름 바로 밑이 바꾸는 자리다(ConsoleShell).
 * 바의 맨 왼쪽에 붙박아 둔다(아래 자리 주석 — 오른쪽 끝에 두었더니 안 보였다): 조회 도구는 좁은 화면에서 옆으로 흐르지만
 * (접으면 바 높이를 넘는다) 안 읽은 수는 늘 보여야 한다.
 * 두 사업 모두에 선다 — 그래서 바 위 글자는 사업 색(BIZ_FRAME ink)을 따른다.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BIZ_ALERTS, BIZ_FRAME, BIZ_NOTICES, type Biz } from '@/lib/biz';
import { NOTIFICATIONS_CHANGED } from '@/lib/notify-events';
import { isHanbaek, type Role } from '@/lib/roles';

const TOOLS: { href: string; label: string; adminOnly?: boolean; blank?: boolean }[] = [
  { href: '/library', label: '운영사 자료실' },
  // 사이드바 관리 묶음에서 옮겼다 — 보는 자리(자료실) 바로 옆이 올리는 자리여야 찾는다
  { href: '/admin/materials', label: '자료실 관리', adminOnly: true },
  { href: '/lookup', label: '기설치 이력조회' },
  /*
   * ★기설치 제출 안내를 여기서 걷었다★ (한백 지시 2026-09-06 「이거 공지에 넣어줘」).
   *
   * 2026-09-02 에 이 자리에 걸었던 정적 HTML 링크다. 공지가 표로 옮겨오고 첨부까지
   * 붙게 되면서(migrations/0051·0056) 안내문이 살 자리가 생겼다 — 상단바에 링크를
   * 하나씩 늘리는 대신 공지 한 곳에서 날짜순으로 쌓인다.
   *
   * 포털(hanbaek-form)은 2026-10-01 닫혔다 — 그쪽 머리말에 걸려 있던 같은 글도 함께 사라졌다.
   * 안내문 자체(public/notices/legacy-charger-history.html)도 그대로 산다 — 공지 본문이
   * 그리로 보낸다(결정 나무가 표라, 글로 펴면 못 읽는다).
   */
  // K-APT 정보(/apartments)는 2026-11-04 기능째 걷었다(한백 지시 「K-APT정보 기능은 지우자」)
];

/**
 * 접수·계약서 작성은 협력사에게 사이드바(주 업무)지만 한백에게는 가끔 있는 일이라 여기다.
 * ★현장과 계약을 만드는 자리라 관리자만★ — 여기까지 열면 「열람 전용」이 아니게 된다.
 */
const ADMIN_INTAKE = [
  { href: '/projects/new', label: '서류 접수' },
  { href: '/contracts', label: '계약서 작성' },
];

/**
 * 서류를 손질하는 도구 — ★한백의 눈이면 다 쓴다★ (한백 지시 2026-08-31).
 *
 * 셋 다 우리 DB 에 아무것도 안 쓴다: 재발행은 계약서 양식으로 보내는 링크 모음이고,
 * 분할·스캔은 파일을 갈라 받아 가는 자리다. 「내는 자리」라는 이유로 관리자에게만
 * 두었는데 그것은 자리의 성격이지 권한이 아니었다 — 재무(열람 전용)가 받은 서류를
 * 갈라 보고 사진을 스캔본으로 고칠 일이 있다.
 */
const TOOLS_DOC = [
  /*
   * 실사보고서 작성 (2026-10-01 포털에서 들였다) — 우리 DB 에 아무것도 안 쓰고 서식을 채워 내려받는
   * 도구라 이 묶음이다(열람 전용도 쓴다). 협력사에게는 사이드바 접수 묶음에 있다.
   */
  { href: '/survey', label: '실사보고서 작성' },
  // 사이드바 관리에 있던 것을 올렸다(한백 확인) — 접수·계약서와 같은 「가끔 하는 서류 일」이다
  { href: '/reissue', label: '서류 재발행' },
  // 스캔 묶음을 종류별로 가르는 자리 (한백 지시 2026-08-29) — 재발행과 같은 서류 손질이다
  { href: '/split', label: 'PDF 분류·분할' },
  // 찍은 사진을 스캔본으로 (한백 지시 2026-08-31) — 재발행·분할과 같은 서류 손질이다
  { href: '/scan', label: '사진 → 스캔본' },
];

export default function TopBar({ role, biz, onMenu }: {
  role: Role;
  /** 지금 사업 — 바의 색과 도구가 갈린다(lib/biz) */
  biz: Biz;
  /** 좁은 화면에서 사이드바 서랍을 연다 — 넓은 화면에는 사이드바가 늘 서 있어 단추가 없다 */
  onMenu?: () => void;
}) {
  const pathname = usePathname();
  // 아래 도구는 전부 전기차의 것이다(자료실 · 이력 조회 · 접수 · 서류 손질) — 태양광 도구는 태양광 일이 생기면 그때 단다
  const ev = biz === 'ev';
  const frame = BIZ_FRAME[biz];

  /*
   * 안 읽은 공지 수 (한백 지시 2026-09-04 「안 읽었으면 1 표시」).
   * 공지 화면에 서 있으면 그 화면이 읽음을 찍는 중이므로 0 으로 접는다 — 읽고 있는데
   * 배지가 남아 있으면 거짓말이다(찍기와 세기의 경주를 화면 판정으로 끊는다).
   * ★지금 사업의 공지만 센다★ (migrations/0116 — 공지도 사업마다 따로다, 알림과 같다).
   */
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (pathname.startsWith(BIZ_NOTICES[biz])) {
      setUnread(0);
      return;
    }
    let alive = true;
    void fetch(`/api/notices/unread?biz=${biz}`)
      .then((r) => (r.ok ? (r.json() as Promise<{ count: number }>) : null))
      .then((d) => {
        if (alive && d) setUnread(d.count);
      })
      .catch(() => {
        /* 배지가 안 뜰 뿐 — 바가 화면을 막으면 안 된다 */
      });
    return () => {
      alive = false;
    };
  }, [pathname, biz]);

  /*
   * 안 읽은 알림 수 — 진행현황에 상대방이 남긴 글(lib/notify.ts · 한백 지시 2026-10-05).
   * 화면을 옮길 때 · 1분마다(한 화면에 오래 머무는 사이에 온 글) · 읽음을 찍었다는 신호가 올 때 다시 센다.
   */
  const [alerts, setAlerts] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => {
      if (document.visibilityState === 'hidden') return;
      // 지금 사업의 알림만 센다 — 전기차 화면의 배지에 태양광 알림이 섞이지 않게(migrations/0107)
      void fetch(`/api/notifications/unread?biz=${biz}`)
        .then((r) => (r.ok ? (r.json() as Promise<{ count: number }>) : null))
        .then((d) => {
          if (alive && d) setAlerts(d.count);
        })
        .catch(() => {
          /* 배지가 안 뜰 뿐 — 바가 화면을 막으면 안 된다 */
        });
    };
    load();
    const timer = window.setInterval(load, 60_000);
    window.addEventListener(NOTIFICATIONS_CHANGED, load);
    document.addEventListener('visibilitychange', load);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener(NOTIFICATIONS_CHANGED, load);
      document.removeEventListener('visibilitychange', load);
    };
  }, [pathname, biz]);

  return (
    /*
     * 사업 색 바 — 크롬(바)과 내용(흰 카드)을 색으로 가른다. 글자는 바 색에 맞춘다(전기차 흰 글자 · 태양광 진한 글자).
     * 공지 · 알림이 맨 왼쪽 — 본문 제목과 같은 여백에서 시작한다.
     */
    <header className={`sticky top-0 z-30 flex h-12 items-center gap-1 ${frame.bar} px-5 sm:px-7 print:hidden`}>
      {/* 좁은 화면에서는 사이드바가 서랍이라 여는 자리가 필요하다 — 메뉴 옆이 그 자리다 */}
      {onMenu && (
        <button
          type="button"
          onClick={onMenu}
          aria-label="메뉴 열기"
          className={`-ml-1.5 mr-0.5 shrink-0 rounded-ctl px-2 py-1.5 text-lead font-bold transition md:hidden ${frame.ink}`}
        >
          ☰
        </button>
      )}
      {/*
        * 공지 · 알림 — ★바의 맨 왼쪽★. 처음엔 오른쪽 끝에 두었다가 같은 날 옮겼다(한백 「오른쪽 구석에 박아놓으니 안 보여,
        * 좌측 정렬」) — 넓은 화면에서 오른쪽 끝은 사이드바·본문 제목에서 눈이 가장 먼 자리다. 바로가기와 달리 흐르지 않는다
        * (shrink-0) — 좁은 화면에서도 안 읽은 수가 늘 보인다.
        */}
      <nav aria-label="공지 · 알림" className="flex shrink-0 items-center gap-1">
        {/* 공지 · 알림은 사업마다 따로다 — 지금 사업의 것으로 간다(lib/biz BIZ_NOTICES · BIZ_ALERTS) */}
        <BarLink href={BIZ_NOTICES[biz]} label="공지" biz={biz} count={unread} active={pathname.startsWith(BIZ_NOTICES[biz])} />
        <BarLink href={BIZ_ALERTS[biz]} label="알림" biz={biz} count={alerts} active={pathname.startsWith(BIZ_ALERTS[biz])} />
      </nav>
      {/* 가르는 선 — 먼저 읽을 것(공지 · 알림)과 도구는 다른 갈래다. 도구가 서는 사업(전기차)에만 */}
      {ev && <div className="mx-1 h-5 w-px shrink-0 bg-white/25" />}
      {/*
        * 좁은 화면에서는 바로가기가 옆으로 흐른다 — 접히면 상단 바 높이(h-12)를 넘어
        * 글자가 잘린다. 스크롤바는 감춘다.
        * 사업 전환(전기차/태양광)은 여기 없다 — ★사이드바 로고 밑으로 옮겼다★(한백 지시 2026-11-04, ConsoleShell BizSwitch).
        */}
      <nav
        aria-label="바로가기"
        className="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {ev && role === 'admin' && ADMIN_INTAKE.map((t) => (
          <BarLink key={t.href} href={t.href} label={t.label} biz={biz} active={pathname.startsWith(t.href)} />
        ))}
        {ev && isHanbaek(role) && (
          <>
            {TOOLS_DOC.map((t) => (
              <BarLink key={t.href} href={t.href} label={t.label} biz={biz} active={pathname.startsWith(t.href)} />
            ))}
            {/* 가르는 선 — 서류를 손질하는 일과 조회 도구는 다른 갈래다 */}
            <div className="mx-1 h-5 w-px shrink-0 bg-white/25" />
          </>
        )}
        {ev && TOOLS.filter((t) => !t.adminOnly || role === 'admin').map((t) => (
          <BarLink
            key={t.href}
            href={t.href}
            label={t.label}
            biz={biz}
            blank={t.blank}
            /* 새 탭으로 여는 것은 이 화면을 떠나지 않는다 — 켜진 표시를 하지 않는다 */
            active={!t.blank && pathname.startsWith(t.href)}
          />
        ))}
      </nav>
    </header>
  );
}

function BarLink({ href, label, biz, active, count, blank = false }: {
  href: string;
  label: string;
  /** 바 색 — 글자를 그 색에 맞춘다(lib/biz BIZ_FRAME) */
  biz: Biz;
  active: boolean;
  /**
   * 안 읽은 수(공지 · 알림) — 있을 때만 단다. 0 을 적으면 사이드바의 할 일 배지(늘 서 있다)와 헷갈린다.
   * 흰 바탕에 사업 색 글자라 그린 바에서도 귤색 바에서도 읽힌다. 글자 오른쪽 위에 얹는다 — 아래 body 주석.
   */
  count?: number;
  /**
   * 새 탭으로 여는가 — 콘솔 껍데기 밖의 것(정적 안내문)이 그렇다.
   *
   * next/link 로 열면 앱 안 이동으로 다루려다 통째로 새로 그린다. 정적 파일은 라우터가
   * 아는 자리가 아니므로 보통 앵커로 연다.
   */
  blank?: boolean;
}) {
  const frame = BIZ_FRAME[biz];
  /*
   * 수를 다는 링크(공지 · 알림)는 오른쪽에 그 자리를 늘 비워 둔다(pr-8 — 「99+」까지 든다). 수가 0 이어도 같은 폭이라
   * 수가 생기고 사라져도 아무것도 움직이지 않고, 얹은 수가 옆 글자를 덮지도 않는다(링크 사이 여백으로 어림했더니 굵은
   * 「99+」가 「알림」의 첫 글자를 덮었다). 수를 눌러도 그 링크다.
   */
  /* 글자 크기는 사이드바 메뉴와 같은 text-base(13px)다 — 12px 이었다(한백 2026-11-04 「상단바 폰트사이즈도 사이드바에 맞춰줘」) */
  const cls = `flex shrink-0 items-center whitespace-nowrap rounded-ctl py-1.5 text-base font-bold transition ${
    count !== undefined ? 'pl-2.5 pr-8' : 'px-2.5'
  } ${active ? frame.inkOn : frame.ink}`;
  /*
   * ★안 읽은 수는 글자 오른쪽 위에 얹는다 — 자리를 밀지 않는다★ (한백 2026-11-04 「숫자 붙는 걸 고려 안 한 상태로 UI 가
   * 들어갔다 · 기존 구조를 유지해줘」). 처음엔 글자 뒤에 끼워 넣었더니, 수가 생기고 사라질 때마다(화면을 연 뒤 세어 오는
   * 순간 · 새 알림 · 공지를 읽음) 뒤의 도구들이 옆으로 밀리고 당겨졌다. 사이드바에 있을 때 수는 줄 오른쪽의 빈자리에 서서
   * 아무것도 밀지 않았다 — 바에서 그 구조는 「얹기」다(absolute). 세 자리부터는 99+ — 얹은 표시가 옆 글자까지 덮지 않게.
   */
  const body = (
    <span className="relative">
      {label}
      {count !== undefined && count > 0 && (
        <span
          className={`absolute -top-2 left-full ml-0.5 min-w-[16px] rounded-tag bg-white px-1 text-center text-micro font-black leading-4 tabular-nums ${frame.pick}`}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </span>
  );
  if (blank) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {body}
      </a>
    );
  }
  return (
    <Link href={href} className={cls} title={count ? `${label} — 안 읽음 ${count}` : undefined}>
      {body}
    </Link>
  );
}

/**
 * 사업마다 갈리는 색 — app/globals.css 의 [data-biz] 변수(「R G B」)를 읽는다. 투명도(bg-brand-50/40)도 붙는다.
 * @param {string} name
 */
const biz = (name) => `rgb(var(--${name}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './lib/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      /*
       * 활자 단계 — 이 여덟 개로만 쓴다.
       *
       * 지금까지 text-[10px]·text-[11px]·text-[13px] 를 자리마다 손으로 적었더니
       * 같은 뜻의 글자가 화면마다 1px 씩 달라졌다. 이름을 붙여 두면 「이건 어느 단계인가」를
       * 고르게 되고, 없는 단계를 쓰려면 먼저 여기 추가해야 한다.
       *
       * 쓰는 자리:
       *   micro 꼬리표·단위        tiny 라벨·표 머리·실패 문구
       *   small 보조 설명·보조 단추  base 본문·표 안의 값·입력칸
       *   lead 카드 표제·하는 일 단추  h3 구역 제목   h2 화면 제목   h1 큰 숫자
       */
      fontSize: {
        micro: ['10px', { lineHeight: '1.3' }],
        tiny: ['11px', { lineHeight: '1.45' }],
        small: ['12px', { lineHeight: '1.5' }],
        base: ['13px', { lineHeight: '1.6' }],
        lead: ['14px', { lineHeight: '1.6' }],
        h3: ['16px', { lineHeight: '1.4', letterSpacing: '-0.01em' }],
        h2: ['18px', { lineHeight: '1.35', letterSpacing: '-0.02em' }],
        h1: ['24px', { lineHeight: '1.25', letterSpacing: '-0.03em' }],
      },
      /*
       * 모서리 — 네 단계.
       *   tag 꼬리표(각진 배지)   ctl 누르는 것·입력칸   box 카드 안의 표·띠   panel 화면 단위 상자
       *
       * 동글한 상태 배지는 rounded-full 이다. 「동글면 상태, 각지면 누르는 것」이
       * 눌러 보고 아는 구별이라 남겨 둔다.
       */
      borderRadius: {
        tag: '4px',
        ctl: '8px',
        box: '12px',
        panel: '16px',
      },
      colors: {
        /*
         * 사업 색 — ★사업마다 다르다★(2026-11-04, 한백 「태양광사업관리 페이지에서 버튼이 초록색 — 태양광에 맞춘
         * 디자인시스템」). 값은 CSS 변수고 app/globals.css 가 [data-biz] 마다 채운다: 전기차는 한백 로고 그린,
         * 태양광은 귤색(아래 sun). 껍데기(ConsoleShell)가 사업을 data-biz 로 달아 그 아래 화면이 다 따라간다.
         * 쓰는 자리는 「조작」이다 — 하는 일 단추 · 고른 칩 · 갈래 · 입력칸 초점 · 링크 · 고른 카드.
         * ★상태(통과·진행)는 여기가 아니라 ok 다★ — 상태 색의 뜻은 두 사업이 같아야 한다.
         *
         * ★채움 셋(fill · fill-hover · on-fill)이 따로다★ — 귤색은 밝아 흰 글자가 안 읽힌다(대비 2.3). 그래서 태양광의
         * 채운 자리는 귤색 바탕에 진한 글자고, 600~900 은 흰 바탕에 글자로 읽히게(4.5 이상) 어둡게 잡았다.
         * 채운 자리는 bg-brand-fill text-brand-on-fill 로 쓴다 — bg-brand-600 text-white 는 전기차에서만 맞는 짝이다.
         */
        brand: {
          50: biz('brand-50'),
          100: biz('brand-100'),
          200: biz('brand-200'),
          300: biz('brand-300'),
          400: biz('brand-400'),
          500: biz('brand-500'),
          600: biz('brand-600'),
          700: biz('brand-700'),
          800: biz('brand-800'),
          900: biz('brand-900'),
          /** 채운 단추 · 고른 칩의 바탕 */
          fill: biz('brand-fill'),
          'fill-hover': biz('brand-fill-hover'),
          /** 채운 바탕 위의 글자 — 전기차 흰색 · 태양광 진한 색 */
          'on-fill': biz('brand-on-fill'),
        },
        /*
         * 통과·진행의 상태 색 — ★사업과 무관한 초록★(2026-11-04 사업 색과 갈랐다). components/ui 의 Tone ok(배지 · 띠 ·
         * 저장됨)와 부지 검토의 「적합」이 쓴다. 값은 한백 로고 그린 그대로라 전기차에서는 brand 와 같다 — 태양광에서도
         * 초록은 「통과」로 읽혀야 한다(빨강 막힘 · 노랑 봐야 함 · 하늘 단계와 같이, 상태 색의 뜻은 두 사업이 같다).
         */
        ok: {
          50: '#eff7f1',
          100: '#d6ecdd',
          200: '#b2dcbe',
          300: '#83c597',
          400: '#56a76c', // 로고 그린 (정확값)
          500: '#479659',
          600: '#3a7f4d',
          700: '#316a40',
          800: '#295436',
          900: '#22452d',
        },
        /** 화면 바탕 — 사업마다(globals.css). 전기차는 초록 기운, 태양광은 따뜻한 기운의 흰색 */
        canvas: biz('canvas'),
        /*
         * 태양광 사업의 색 — 귤색(2026-11-03, 한백 「주황이 너무 구려」 → 「귤색에 가까워」). 색상 32° · 채도 78% 에서
         * 명도만 바꿔 단계를 뽑았다 — ★채도는 93% 였다가 2026-11-04 한백 「채도 조금만 낮춰봐. 너무 쨍하다」로 78%★
         * (색상 · 단계마다의 명도는 그대로 — 93 · 82 · 76 · 70 을 상단 바 · 토글 모양으로 나란히 그려 골랐다. 70 은 황토로
         * 탁해졌다). 이 밝기에서는 흰 글자가 안 읽혀서(500 위 대비 2.5) ★상단 바의 글자는 진한 색★이다
         * (대비 7.2 — lib/biz BIZ_FRAME 의 ink). 고른 메뉴는 50 바탕에 800 글자(6.1), 사이드바 사업 전환의 고른 칸은
         * 귤색 바탕에 진한 글자(brand-fill · on-fill — 7.2). 그 전 붉은 주황(색상 19°, #E8672C)도 별로라 했다. 틀(BIZ_FRAME)이 직접 쓰고, 화면 안은
         * 태양광의 brand 가 이 값을 받는다(globals.css — 50~500 은 그대로, 600~900 은 글자로 읽히게 더 어둡게).
         */
        sun: {
          50: '#fdf5ec',
          100: '#f9e7d2',
          200: '#f4cfa4',
          300: '#eeb677',
          400: '#eaa352',
          500: '#e59230', // 상단 바
          600: '#d07c1a',
          700: '#ad6615',
          800: '#885011',
          900: '#643b0c',
        },
      },
    },
  },
  plugins: [],
};

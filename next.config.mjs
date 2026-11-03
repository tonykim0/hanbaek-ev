/**
 * ★운영 주소는 hanbaek-re.vercel.app 이다★ (2026-11-03, 한백 「이제 전기차사업관리가 아니라 신재생사업관리야 —
 * 전기차/태양광」 · re = renewable energy). 옛 주소 둘로 오는 요청은 경로를 그대로 붙여 여기로 넘긴다 — 북마크·
 * 메신저에 돌던 옛 링크가 끊기지 않고 로그인 화면을 지나 같은 자리에 닿는다.
 *   hanbaek-ev.vercel.app   콘솔이 2026-11-03 까지 쓰던 주소
 *   hanbaek-form.vercel.app 포털 — 2026-10-01 닫았다(계약서 작성·실사보고서 작성은 콘솔 /contracts/* · /survey/* 로)
 * ★옛 주소는 Vercel 프로젝트에서 떼지 않는다★ — 떼면 요청이 여기까지 안 와 넘길 수도 없다.
 * ★새 주소가 프로젝트에 붙기 전에 이것을 배포하지 않는다★ — 붙기 전이면 모두를 없는 주소(DEPLOYMENT_NOT_FOUND)로 보낸다.
 * 로그인 쿠키는 주소마다 따로라 옮긴 뒤 한 번 다시 로그인한다.
 *
 * 미들웨어가 아니라 여기서 하는 이유: 미들웨어는 api·정적 파일(점이 붙은 경로)을 보지 않는다
 * (middleware.ts 의 matcher). 닫은 주소에서는 그것까지 다 넘겨야 「닫힘」이다.
 * 영구(308)로 두지 않는다 — 브라우저가 영구 이동을 오래 기억해서, 되돌릴 일이 생기면 못 되돌린다.
 */
const CONSOLE_ORIGIN = 'https://hanbaek-re.vercel.app';
const OLD_HOSTS = ['hanbaek-ev.vercel.app', 'hanbaek-form.vercel.app'];

/**
 * 포털 화면의 옛 주소 → 콘솔의 같은 화면. 콘솔 주소로 들어온 옛 링크도 여기서 갈린다.
 * 실사보고서(/survey/*)는 주소가 같아 적지 않는다.
 */
const MOVED = [
  ['/', '/projects'],
  ['/hec', '/contracts/hec'],
  ['/nice', '/contracts/nice'],
  ['/sk', '/contracts/sk'],
  ['/sk-invest', '/contracts/sk'],
  ['/pluglink', '/contracts/pluglink'],
  ['/kapt', '/apartments'],
  ['/charger-history', '/lookup'],
  ['/materials', '/library'],
  // 포털 접수는 2026-08-26 에 닫혔다 — 안내 화면이 가리키던 자리로 바로 보낸다
  ['/intake', '/projects/new'],
  ['/intake/:rest*', '/projects/new'],
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // PDF 업로드를 위해 body 크기 제한 완화
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
    // heic-convert(libheif wasm)는 번들링하지 않고 런타임에 node_modules에서 로드
    serverComponentsExternalPackages: ['heic-convert'],
  },
  async redirects() {
    return [
      ...OLD_HOSTS.map((host) => ({
        source: '/:path*',
        has: [{ type: 'host', value: host }],
        destination: `${CONSOLE_ORIGIN}/:path*`,
        permanent: false,
      })),
      ...MOVED.map(([source, destination]) => ({ source, destination, permanent: false })),
    ];
  },
};

export default nextConfig;

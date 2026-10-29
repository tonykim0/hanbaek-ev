import type { Metadata } from 'next';
import { Noto_Sans_KR, Noto_Serif_KR } from 'next/font/google';
import Retouch from '@/components/retouch/Retouch';

export const metadata: Metadata = {
  title: '서류 문구 수정 — 한백 전기차사업관리시스템',
  robots: { index: false, follow: false },
};

/*
 * 다시 쓸 글자의 글꼴 — 명조(바탕·신명조 계열)와 고딕(돋움·맑은 고딕 계열). 캔버스는 기기에 깔린 글꼴만 쓰므로
 * 우리 서버가 같이 내려준다 — 맥에는 바탕이, 윈도에는 애플 명조가 없어 기기마다 결과가 갈리면 안 된다.
 * 한글은 글자 묶음마다 파일이 따로라 미리 싣지 않는다(preload: false) — 쓸 글자의 조각만 그때 받는다(lib/retouch/paint ensureFonts).
 */
const serif = Noto_Serif_KR({ weight: ['400', '500', '600', '700'], subsets: ['latin'], preload: false, display: 'block' });
const sans = Noto_Sans_KR({ weight: 'variable', subsets: ['latin'], preload: false, display: 'block' });

/**
 * 서류 문구 수정 [한백 관리자] (한백 지시 2026-10-29) — 스캔본을 올리고 무엇을 고칠지 적으면, 그 글자만 같은 글꼴·크기로
 * 바꾼 같은 해상도의 PDF 를 받는다.
 *
 * ★직인사용동의가 닿는 서류만★ — 한백이 대신 날인할 권한을 받아 둔 사문서(계약서·동의서·신청서)다. 그래서 (write) 안,
 * 관리자만 들어온다. 기관이 발급한 공문서(건축물대장·행위신고증명서·사업자등록증)와 손글씨·도장·서명 위의 글자는
 * 판독이 멈춘다(lib/retouch/locate). 받을 때마다 누가 어느 파일의 무엇을 무엇으로 바꿨는지 audit_log 에 남고,
 * 기록이 안 남으면 받지 않는다(store/retouch).
 */
export default function RetouchPage() {
  return (
    <div className="max-w-6xl">
      <h1 className="mb-4 text-h2 font-black tracking-[-0.02em] text-slate-900">서류 문구 수정</h1>
      <Retouch fonts={{ serif: serif.style.fontFamily, sans: sans.style.fontFamily }} />
    </div>
  );
}

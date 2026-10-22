/**
 * 제안서 서식이 어디 있는가 — 한 곳에서만 적는다(화면·시험이 같이 본다).
 *
 * ★Blob 이 아니라 저장소에 둔다★ (한백 승인 2026-10-22). 치환 열쇠가 서식에 적힌 샘플
 * 값(「(주)무창」·「352.95」)이라, 서식과 열쇠는 ★같이 움직여야 한다★. Blob 에 두면 누가
 * 서식을 바꿔 끼웠을 때 코드가 조용히 어긋나고 샘플 값이 든 제안서가 나간다 — 사람은 앞장만
 * 보고 보낸다. 저장소에 두면 둘이 한 커밋에서 바뀌고, test/solar-template 이 서식을 열어
 * 열쇠가 다 있는지 본다(Blob 이면 시험이 네트워크를 타야 해서 못 하는 검사다).
 *
 * ★서식은 줄여서 넣었다★ — 받은 원본은 65.8MB 인데 그중 58MB 가 회사소개 슬라이드의 큰
 * PNG 였다. 투명도를 실제로 쓰는 30개는 PNG 로 두고 33개만 JPEG 로 바꿔 16.7MB 가 됐다
 * (scripts/shrink-pptx.py). 서식은 ★브라우저까지 내려와야★ 채울 수 있어서 무게가 그대로
 * 사람의 기다림이 된다 — 서버에서 채우면 함수가 압축을 통째로 메모리에 푼다(실사보고서도
 * 같은 이유로 브라우저에서 채운다).
 *
 * 서식을 새로 받으면: shrink-pptx.py 로 줄이고 → 이 파일을 덮고 → fill-proposal 의 SAMPLE 을
 * 맞춘다. 셋 중 하나만 하면 test/solar-template 이 빨개진다.
 */

/** public/ 아래 경로 — 브라우저는 `/${TEMPLATE_PATH}` 로 받는다 */
export const TEMPLATE_PATH = 'solar/solarshare-baro.pptx';

/** 브라우저에서 서식을 받아 온다 */
export async function loadTemplate(): Promise<ArrayBuffer> {
  const res = await fetch(`/${TEMPLATE_PATH}`);
  if (!res.ok) throw new Error('제안서 서식을 받지 못했습니다 — 새로고침 후 다시 해주세요.');
  return res.arrayBuffer();
}

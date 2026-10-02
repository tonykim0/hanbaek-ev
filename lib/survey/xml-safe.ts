/**
 * 서식(XML)에 넣을 글 — XML 이 받지 않는 글자를 걷는다. [순수]
 *
 * 붙여 넣은 값에 섞인 제어 문자(U+0001·U+000B 세로 탭 등)는 XML 1.0 에 들어갈 수 없다. 그대로 두면 워드·엑셀이
 * 파일을 못 열거나(「복구」), 브라우저가 그림 조각을 parsererror 로 읽는다. 줄바꿈·탭은 남긴다.
 */
export const xmlSafe = (s: string): string => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '');

/** XML 조각을 읽는다 — 못 읽으면 던진다(parsererror 조각이 파일에 섞여 들어가지 않게) */
export function parseXml(xml: string): Document {
  const d = new DOMParser().parseFromString(xml, 'application/xml');
  if (d.getElementsByTagName('parsererror').length) throw new Error('서식 조각을 만들지 못했습니다 — 넣은 글에 쓸 수 없는 글자가 있는지 봐 주세요.');
  return d;
}

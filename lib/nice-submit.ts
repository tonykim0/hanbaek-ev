/**
 * 나이스인프라 제출 정보 — 나이스는 계약서류와 따로 이 줄들을 받는다(한백 지시 2026-09-04). 계약 탭 맨 밑의 「나이스인프라 제출
 * 정보」(복사)와 「계약서 초안 메일」의 본문이 같은 글을 쓴다 — 두 벌로 적으면 한쪽만 고쳐진다. 순수 모듈이다.
 *
 * ★7번 「기설치 현황」은 사전현장컨설팅 결과서의 「6. 중복설치」다★ (한백 지시 2026-11-03 「나이스인프라 제출정보에서 기설치 현황은
 * 지금 사전현장컨설팅 결과서 중복설치에서 값을 가져와야해」 · lib/consult-dup). 그전에는 접수 때 협력사가 고른 기설치 있음/없음과
 * 메모였다. 결과서를 아직 못 읽었으면 비워 둔다 — 지어낸 값이 그대로 복사돼 나가면 안 된다.
 */
import type { BizType, InstallLoc } from '@/types/project';
import { dupTextOf, type ConsultDup } from './consult-dup';

const NICE_LOC: Record<InstallLoc, string> = {
  실내: '옥내',
  실외: '옥외',
  '실내·실외': '옥내/옥외',
};

export interface NiceSubmitSite {
  name: string;
  addr: string | null;
  parkTotal: number | null;
  bizType: BizType | null;
  installLoc: InstallLoc | null;
  consultDup?: ConsultDup | null;
}

/** 1~7번 — 비어 있는 값은 빈칸(「미지정」을 적으면 그대로 나간다) */
export function niceSubmitLines(p: NiceSubmitSite, qty: number): string[] {
  const biz = p.bizType === '자체투자' ? '투자' : p.bizType === '환경부' ? '보조' : '';
  return [
    `1. 장소명 : ${p.name}`,
    `2. 주소 : ${p.addr ?? ''}`,
    `3. 주차면수 : ${p.parkTotal ? `${p.parkTotal}면` : ''}`,
    `4. 설치기수 : ${qty > 0 ? `${qty}기` : ''}`,
    `5. 설치위치 : ${p.installLoc === null ? '' : NICE_LOC[p.installLoc]}`,
    `6. 설치유형 : ${biz}`,
    `7. 기설치 현황 : ${dupTextOf(p.consultDup) ?? ''}`,
  ];
}

/** 계약 탭에 서는 글 — 8번(기타)은 콘솔이 모르는 줄이라 빈 채로 둔다(복사한 뒤 채운다) */
export function niceSubmitText(p: NiceSubmitSite, qty: number): string {
  return [...niceSubmitLines(p, qty), '8. 기타 : '].join('\n');
}

/** 「계약서 초안 메일」의 양식 이름 — 같은 양식의 지난 메일에서 받는 사람을 가져온다(store/agent-mail addSiteMail) */
export const NICE_DRAFT_MAIL = 'nice-contract-draft';

/**
 * 계약서 초안 메일 — 한백이 준 양식 그대로(2026-11-03): 인사 · 제출 정보 1~7번 · 맺음. 8번(기타)은 콘솔이 모르는 줄이라 싣지 않는다
 * (한백이 보여 준 본보기도 7번까지다). 제목은 양식에 없어 현장 이름을 단 한 줄로 둔다 — 카드에서 고칠 수 있다.
 */
export function niceDraftMail(p: NiceSubmitSite, qty: number): { subject: string; body: string } {
  return {
    subject: `계약서 초안 송부 — ${p.name}`,
    body: ['안녕하세요, 계약서 초안 송부드립니다.', '', ...niceSubmitLines(p, qty), '', '감사합니다'].join('\n'),
  };
}

/**
 * POST /api/projects/[id]/nice-draft-mail — 나이스인프라 「계약서 초안 메일」 초안을 올린다 [한백 관리자]
 *
 * 한백 2026-11-03 「나이스인프라는 계약서 접수 시, 워드파일을 초안으로 받고 있어. 그 파일을 첨부한 메일 보내고싶어」.
 * ★계약서가 접수되면 나이스인프라 담당이 저절로 쓴다★(2026-11-04 · lib/site-mail-run scheduleSiteMailIntake) — 이 단추는 제출 정보
 * 밑에서 한백이 (다시) 쓰는 길이다(계약서 초안이 늦게 채워졌을 때 · 이 기능 전에 접수된 현장). 그 담당과의 대화에서 다시 요청해도 같다.
 * 그 현장의 「계약서 초안」 칸 파일(워드)을 붙이고, 본문은 한백이 준 양식(lib/nice-submit niceDraftMail)이다. ★한백이 승인해야 나간다★ —
 * 계약 탭에서 바로 보이는 카드에서 「승인하고 보내기」. 받는 사람은 같은 양식으로 마지막에 보낸 주소다.
 * 쓰기 전에 결과서 6번(제출 정보 7번)을 아직 안 읽었으면 읽는다 — 판독이라 수십 초가 걸릴 수 있다.
 */
import { adminWrite } from '@/lib/api/write-route';
import { requestSiteMail } from '@/lib/site-mail-run';
import { siteMailOfCpo } from '@/lib/site-mail';

export const maxDuration = 300;

const NICE = siteMailOfCpo('나이스인프라')!;

export const POST = adminWrite<{ id: string }, undefined>(
  '계약서 초안 메일은 한백 관리자만 올릴 수 있습니다.',
  async ({ params, actor }) => {
    const { mail } = await requestSiteMail(params.id, actor, NICE);
    return { mail };
  }
);

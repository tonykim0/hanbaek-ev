/**
 * 패스스루 집행 글 초안을 짓는다 — 정산 담당의 agit_passthru_post(답 라우트의 손)가 부른다. [서버 전용]
 * (한백 2026-11-28 「[긴급] 플러그링크 2026년 10월 패스스루 집행 이것도 주기적으로 올리는데 자동화」)
 *
 * 한백이 정산 담당 대화에 한백사업내역리스트 엑셀(과 하도급사 세금계산서 · 공사하도급계약 PDF)을 넘기면 담당은 어느 파일이 엑셀인지만 골라 부른다
 * → 콘솔이 엑셀을 칸으로 읽고(lib/agit/passthru-read — 판독 없음) 차를 가르고(lib/agit/passthru passthruReadOf — 매입내역 지급 줄 · EPC 잔금 ·
 * 지급일) 글을 지어(agitPassthruPostOf) 초안으로 세운다(store/agit draftAgitPost — 구분 「패스스루」 · 재료는 agit_posts.passthru). 그 뒤는
 * 열린구매 글과 같은 길이다: 카드의 「승인하고 올리기」 · 대화의 agit_publish → lib/agit/publish.
 */
import { getRepository } from '@/lib/data';
import type { Actor } from '@/lib/auth/types';
import { AGIT_PASSTHRU_KIND, type AgitPostRecord } from './post';
import { agitPassthruPostOf, passthruReadOf, type AgitPassthruInput, type PassthruFile, type PassthruRead } from './passthru';
import { passthruBookOf } from './passthru-read';
import { fetchOurBlob } from './bundle-zip';

export interface PassthruDraftRequest {
  /** 한백사업내역리스트(xlsx) */
  sheetFile: PassthruFile;
  /** 첨부 zip 에 넣을 증빙 — 하도급사 세금계산서 · 공사하도급계약 · 기성산출물 */
  attach: PassthruFile[];
  /** 차수 — 빼면 매입내역의 가장 큰 차 */
  round: number | null;
  /** 플러그링크 입금 예정일 YYYY-MM-DD — 한백이 말했을 때만 */
  inDate: string | null;
  /** 지급 요청일 — 빼면 매입내역 「지급일」(없으면 던진다) */
  payDate: string | null;
  /** 이미 올린 그 지급일의 패스스루 글을 다시 올리는 초안 */
  again: boolean;
}

/** 엑셀 파일 하나를 받아 읽는다 — 우리 Blob 의 xlsx 만 */
export async function readPassthruSheet(file: PassthruFile, round: number | null): Promise<PassthruRead> {
  if (!/\.xlsx$/i.test(file.name)) throw new Error(`${file.name} — 한백사업내역리스트는 xlsx 로 넘겨 주세요.`);
  return passthruReadOf(await passthruBookOf(await fetchOurBlob(file.url)), round);
}

export async function draftAgitPassthruPost(
  actor: Actor,
  q: PassthruDraftRequest,
  read: (file: PassthruFile, round: number | null) => Promise<PassthruRead> = readPassthruSheet
): Promise<{ post: AgitPostRecord; plan: 'create' | 'refresh' | 'keep'; input: AgitPassthruInput; read: PassthruRead }> {
  if (q.attach.some((f) => f.url === q.sheetFile.url)) {
    throw new Error('한백사업내역리스트를 첨부로도 골랐습니다 — 내부 장부라 zip 에 넣지 않습니다. 첨부에서 빼 주세요.');
  }
  const got = await read(q.sheetFile, q.round);
  const payDate = q.payDate ?? got.payDate;
  if (!payDate) {
    throw new Error(`매입내역 HB${got.round}차 줄에 지급일이 없습니다 — 한백에게 지급 요청일을 묻고 pay_date 로 줍니다.`);
  }
  const input: AgitPassthruInput = {
    round: got.round, month: got.month, receive: got.receive, inDate: q.inDate, rows: got.rows, sheet: q.sheetFile, attach: q.attach,
  };
  const draft = agitPassthruPostOf(payDate, input);
  const { post, plan } = await getRepository().draftAgitPost({
    payDate, kind: AGIT_PASSTHRU_KIND, body: draft.text, total: draft.total, batches: draft.batches, again: q.again, messageId: null,
    urgent: draft.urgent, passthru: input,
  }, actor);
  return { post, plan, input, read: got };
}

/**
 * 건축물대장 대조의 판독 — 건축물대장·K-apt·공문·사전현장컨설팅 결과서·설치신청서에 ★인쇄된 주차면 수★,
 * 건축물대장이 열람용인지, ★건축물대장의 도로명주소와 설치신청서의 주소★, 그리고 ★건축물대장의 발급일★을 읽는다(주소는
 * 한백 지시 2026-10-16 「설치신청서 주소가 도로명 주소인지 · 건축물대장 도로명 주소와 일치하는지」, 발급일은 2026-10-30
 * 「건축물대장 발급일자가 계약접수일로부터 3개월이내인지」). 맞는지는 코드가 가른다(lib/parking-check) —
 * 판독에게 「맞는지 봐 달라」고 묻지 않는다(기설치 대조 lib/legacy-evidence 와 같은 까닭). 주소도 「도로명인가」를 묻지 않고
 * 적힌 그대로 받아 코드가 가른다.
 *
 * ★한 파일에 문서가 여럿 묶여 온다★ — 「건축물대장+kapt.pdf」처럼 건축물대장 뒤에 K-apt 화면 캡처를 붙여 오는 일이
 * 실제로 있다(충북 진천 광혜원원림 · 전주 새한그린파크). 그래서 파일마다가 아니라 문서마다 한 항목으로 받는다.
 *
 * ★건축물대장의 주차면을 읽는 순서 — 한백 확인 2026-10-16★
 *   ① 총괄표제부(갑) 1쪽 「총 주차 대수」 (동이 여럿인 단지 — 샘플 영신그린빌·파모스라움·송림휴먼시아가 여기)
 *   ② 비었으면 2쪽 「※주차장」 표의 대수를 모두 더한다 — 자주식·기계식(·전기차) × 옥내·옥외·인근, 면제 칸은 빼고.
 *      총괄표제부 없는 표제부(갑)·일반건축물대장(갑)은 여기에만 있다(춘의디아크원 자주식 140 · 글로스터호텔 자주식 93 +
 *      기계식 170 = 263 — ★기계식도 센다★, 그래서 자주식만 적은 결과서·신청서는 어긋남이다).
 *   ③ 둘 다 없으면 같은 칸의 K-apt·지자체 공문.
 *   미확인 하나: 「전기차」 줄이 자주식·기계식 대수에 이미 든 수인지(그러면 더하면 겹친다) — 샘플 7곳 모두 그 줄이 비어 있었다.
 *
 * ★발급일은 첫 쪽 아래에 있다★ — 「이 등(초)본은 건축물대장의 원본내용과 틀림없음을 증명합니다」 줄 오른쪽의 「발급일: 2026년
 * 10월 7일」(이 Mac 의 실제 건축물대장 PDF 622개 중 글자층에 발급일이 잡히는 302개가 다 「발급일:」이고(「발급일자」 하나),
 * 299개는 첫 쪽이었다 · 글자층 없는 스캔본도 눈으로 본 것은 같은 자리였다).
 * 맨 위의 「발급확인번호」는 날짜가 아니다. 「2쪽 중 제2쪽」만 떼어 온 파일에는 발급일이 없다 — 그때는 null 이다. 열람용에도
 * 출력한 날이 「발급일」로 찍히지만(덕암아파트) 열람용은 따로 짚으니 판정이 그 날짜를 보지 않는다(lib/parking-check).
 *
 * 서버 전용.
 */
import { askPdfJson, preparePdfs } from './vision-ask';
import { nameOfAnswer, shownName } from './check-kit';
import { dayOf } from './fact-read';
import { PARKING_DOCS, type ParkingDoc, type ParkingRead, type ParkingSlot } from './parking-check';

const SLOT_NAME: Record<ParkingSlot, string> = {
  bldgreg: '건축물대장 칸',
  consult: '사전현장컨설팅 결과서 칸',
  apply: '설치신청서 칸',
};

function prompt(files: { name: string; slot: ParkingSlot }[]): string {
  return `한백 EV 충전기 사업의 계약 서류입니다. 각 파일 안의 ★문서마다★ 인쇄된 것만 읽어 JSON 으로 답하세요.
판단·추측을 지어내지 마세요. 안 보이면 null 입니다. JSON 외의 글은 쓰지 마세요.

## 파일 (${files.length}개 — originalName 에 이 이름을 그대로. 괄호는 그 파일이 올라온 칸)
${files.map((f, i) => `${i + 1}. ${shownName(f.name)} (${SLOT_NAME[f.slot]})`).join('\n')}

## 답 모양
{"docs":[{"originalName":"…","doc":"건축물대장","viewOnly":false,"parking":249,"address":"전라남도 광양시 광양읍 예구1길 8","otherAddresses":[],"issued":"2026-10-07"}]}

## 항목
- 한 파일에 문서가 여럿 묶여 있을 수 있습니다(예: 건축물대장 뒤에 K-apt 화면 캡처). 문서마다 한 항목.
  같은 건축물대장의 여러 쪽(총괄표제부·표제부, 1쪽·2쪽)은 한 항목입니다.
- doc: ${PARKING_DOCS.join(' · ')} 중 하나.
  건축물대장 = 건축물대장 총괄표제부·표제부·일반건축물대장(정부24 등에서 출력한 것).
  K-apt = 공동주택관리정보시스템(K-apt) 화면 캡처 — 단지정보의 「주차대수」가 보이는 것.
  공문 = 시·군·구청 등 지자체가 낸 공문.
  결과서 = 「사전 현장 컨설팅 결과서」(별지 제7호 서식).
  신청서 = 「전기자동차 완속충전시설 설치 신청서」(별지 제5호 서식).
- viewOnly: 건축물대장만. 「열람용」이라는 글자가 있으면 true — 바탕에 크게 찍힌 「열람용」 글씨, 또는 아래쪽
  「이 건축물대장은 열람용이므로 출력하신 건축물대장은 법적 효력이 없습니다」. 그런 글자 없이 발급번호·
  「원본내용과 틀림없음을 증명합니다」가 있으면 false. 건축물대장이 아니면 null.
- parking: 그 문서가 말하는 ★주차면 수(주차 대수)★ — 숫자만. 칸이 비어 있거나 안 보이면 null(0 으로 적지 마세요).
  건축물대장: 총괄표제부의 「총 주차 대수」. 그것이 비었으면 「※주차장」 표(옥내·옥외·인근 × 자주식·기계식·전기차)에
    적힌 대수를 모두 더한 값. 총괄표제부 없이 동마다 표제부가 있으면 각 표제부의 주차장 대수를 더한 값.
    주차장 칸이 전부 비어 있으면 null.
  K-apt: 「주차대수」의 총 대수(예: 「지상 90 · 지하 0 · 총 90대」 → 90).
  공문: 공문이 확인해 주는 주차면 수.
  결과서: 「3. 주차공간 확보」의 「주차면 수」.
  신청서: 「보유 주차면수」.
- address: ★적힌 글자 그대로★ 옮겨 적습니다 — 고치거나 바꾸거나 채우지 마세요(지번 주소가 적혀 있으면 지번 그대로,
  시·도 이름도 적힌 대로). 안 보이면 null.
  건축물대장: 첫 쪽 위쪽의 「도로명주소」 칸(「대지위치」·「지번」 칸이 아닙니다).
  신청서: 설치 희망지(설치 장소)의 주소 — 별지 제5호는 「도로명 주소 :」 뒤에 적힌 주소. 다른 양식이면 설치 장소 주소 칸.
  다른 문서: null.
- otherAddresses: 건축물대장만. 「건축물 현황」 표의 동마다 「도로명주소」 칸에 적힌 주소 중 위 address 와 다른 것(적힌 그대로).
  없거나 비어 있으면 []. 다른 문서는 [].
- issued: 건축물대장만. ★발급일★ — 첫 쪽 아래 「이 등(초)본은 건축물대장의 원본내용과 틀림없음을 증명합니다」 줄 오른쪽(또는
  그 아래)의 「발급일: 2026년 10월 7일」을 YYYY-MM-DD 로 적습니다(→ "2026-10-07").
  맨 위의 「발급확인번호」·「발급번호」는 날짜가 아닙니다. 건축물 현황·변동사항 표의 날짜(허가일·사용승인일·변동일)도 발급일이
  아닙니다. 한 항목에 따로 발급한 장이 여럿 묶여 발급일이 여럿이면 가장 이른 날짜.
  「발급일」이 안 보이면 null 입니다(뒤쪽 장만 있는 파일 등). 다른 문서는 null.`;
}

interface RawDoc {
  originalName?: unknown; doc?: unknown; viewOnly?: unknown; parking?: unknown;
  address?: unknown; otherAddresses?: unknown; issued?: unknown;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const count = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[^\d.]/g, '')) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

/** 판독의 답을 다듬는다 — 이름은 보낸 것 중 하나로, 종류는 정해진 것 중 하나로 */
export function parkingReadsOf(raw: unknown, files: { name: string; slot: ParkingSlot }[]): ParkingRead[] {
  const docs = (raw as { docs?: RawDoc[] } | null)?.docs;
  if (!Array.isArray(docs)) return [];
  return docs.flatMap((d) => {
    const name = nameOfAnswer(files.map((x) => x.name), str(d.originalName));
    const f = files.find((x) => x.name === name);
    if (!f) return [];
    const doc: ParkingDoc = PARKING_DOCS.includes(d.doc as ParkingDoc) ? (d.doc as ParkingDoc) : '기타';
    return [{
      file: f.name,
      slot: f.slot,
      doc,
      viewOnly: doc === '건축물대장' && typeof d.viewOnly === 'boolean' ? d.viewOnly : null,
      parking: count(d.parking),
      // 주소는 건축물대장(도로명주소)과 신청서(설치 장소)만 견준다 — 다른 문서의 주소는 버린다
      address: doc === '건축물대장' || doc === '신청서' ? str(d.address) : null,
      otherAddresses: doc === '건축물대장' && Array.isArray(d.otherAddresses)
        ? d.otherAddresses.flatMap((a) => (str(a) ? [str(a) as string] : []))
        : [],
      // 발급일은 건축물대장만 — 달력에 없는 날·먼 앞날은 잘못 읽은 것이라 버린다(fact-read dayOf)
      issued: doc === '건축물대장' ? dayOf(str(d.issued)) : null,
    }];
  });
}

/** 세 칸의 파일을 읽는다 — 못 읽은 파일은 unread 로(조용히 빠지지 않게) */
export async function readParking(
  files: { name: string; slot: ParkingSlot; buffer: Buffer }[]
): Promise<{ reads: ParkingRead[]; unread: string[] }> {
  const slotOf = new Map(files.map((f) => [f.name, f.slot]));
  const { batches, unread } = await preparePdfs(files, 'parking-check');
  const reads: ParkingRead[] = [];
  for (const batch of batches) {
    const named = batch.map((f) => ({ name: f.name, slot: slotOf.get(f.name) ?? 'bldgreg' as ParkingSlot }));
    const raw = await askPdfJson(batch, prompt(named), 'parking-check');
    const got = parkingReadsOf(raw, named);
    reads.push(...got);
    // 보냈는데 답에 한 번도 안 나온 파일 — 못 읽은 것이다
    for (const n of named) if (!got.some((r) => r.file === n.name)) unread.push(n.name);
  }
  return { reads, unread };
}

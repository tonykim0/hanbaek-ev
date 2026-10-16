/**
 * 주차면 대조의 판독 — 건축물대장·K-apt·공문·사전현장컨설팅 결과서·설치신청서에 ★인쇄된 주차면 수★와
 * 건축물대장이 열람용인지만 읽는다. 맞는지는 코드가 가른다(lib/parking-check) — 판독에게 「맞는지 봐 달라」고
 * 묻지 않는다(기설치 대조 lib/legacy-evidence 와 같은 까닭).
 *
 * ★한 파일에 문서가 여럿 묶여 온다★ — 「건축물대장+kapt.pdf」처럼 건축물대장 뒤에 K-apt 화면 캡처를 붙여 오는 일이
 * 실제로 있다(충북 진천 광혜원원림 · 전주 새한그린파크). 그래서 파일마다가 아니라 문서마다 한 항목으로 받는다.
 *
 * 서버 전용.
 */
import { askPdfJson, preparePdfs } from './vision-ask';
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
${files.map((f, i) => `${i + 1}. ${f.name} (${SLOT_NAME[f.slot]})`).join('\n')}

## 답 모양
{"docs":[{"originalName":"…","doc":"건축물대장","viewOnly":false,"parking":249}]}

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
  신청서: 「보유 주차면수」.`;
}

interface RawDoc { originalName?: unknown; doc?: unknown; viewOnly?: unknown; parking?: unknown }

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
    const name = str(d.originalName);
    const f = files.find((x) => x.name === name)
      ?? files.find((x) => name && (x.name.includes(name) || name.includes(x.name)));
    if (!f) return [];
    const doc: ParkingDoc = PARKING_DOCS.includes(d.doc as ParkingDoc) ? (d.doc as ParkingDoc) : '기타';
    return [{
      file: f.name,
      slot: f.slot,
      doc,
      viewOnly: doc === '건축물대장' && typeof d.viewOnly === 'boolean' ? d.viewOnly : null,
      parking: count(d.parking),
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

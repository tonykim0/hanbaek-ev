/**
 * 기설치 증빙을 읽는다 — 행위신고증명서·필증·예전 계약서에 ★인쇄된 숫자★만.
 *
 * 판독은 읽기만 한다. 엑셀과 맞는지는 코드가 가른다(lib/preinstall-check) — 판독에게
 * 「맞는지 봐 달라」고 물으면 같은 서류에 날마다 다른 답이 온다.
 *
 * 서식이 제각각이다: 행위신고증명서의 「①행위전 ②행위후」 표는 기수를 숫자 칸에 적기도 하고
 * (2021 금천효성1차: 4 → 8) 용도 글자 안에 적고 숫자 칸은 면적 0 으로 두기도 한다
 * (2025 같은 현장: 「기존8면+신규설치8면 총16면」). 그래서 숫자 칸이 아니라 ★충전기 기수★를
 * 읽으라고 묻는다.
 *
 * 서버 전용.
 */
import type { NormalizedFile } from './files';
import { askPdfJson, preparePdfs } from './vision-ask';
import type { EvidenceAct, EvidenceDoc, SheetScan } from './preinstall-check';

/* 판독 호출(모델·거절 처리·나눠 읽기)은 lib/vision-ask 에 있다 — 운영사 직인 읽기(lib/cpo-seal)와 같이 쓴다 */

const DOCS: EvidenceDoc[] = ['행위신고', '필증', '계약서', '회의록', '공문', '도면', '사진', '기타'];
const KINDS = ['신규 설치', '교체 설치', '철거'] as const;

function prompt(names: string[]): string {
  return `한백 EV 충전기 사업의 「기설치 충전기 증빙」 문서들입니다. 각 문서에 ★인쇄된 것만★ 읽어 JSON 으로 답하세요.
판단·추측·계산 결과를 지어내지 마세요. 안 보이면 null 입니다. JSON 외의 글은 쓰지 마세요.

## 문서 (${names.length}개 — originalName 에 이 이름을 그대로)
${names.map((n, i) => `${i + 1}. ${n}`).join('\n')}

## 답 모양
{"acts":[{"originalName":"…","doc":"행위신고","title":"행위신고증명서","date":"2021-12-16","number":"2021-공동주택과-행위신고(증설)-116","kind":"신규 설치","before":4,"after":8,"count":4}]}

## 항목
- 문서마다 한 항목 이상. 기수가 안 보이는 문서도 항목을 내고 숫자는 null.
  한 문서(증명서 한 장)에 행위가 둘 이상 적혀 있으면(예: 교체 설치 + 신규 설치) 행위마다 한 항목.
- doc: ${DOCS.join(' · ')} 중 하나.
  행위신고 = 공동주택 행위신고증명서·행위허가증명서·행위신고 처리 통보.
  필증 = 사용검사필증·안전점검필증·사용전검사 필증 등. 도면 = 설계도면·배치도.
- title: 문서 첫머리에 인쇄된 제목.
- date: 문서의 발급·신고·증명 날짜(YYYY-MM-DD). 행위신고증명서는 「위와 같이 신고를 하였음을 증명합니다」 아래 날짜.
  계약서는 계약일, 필증은 발급일.
- number: 신고번호·허가번호가 인쇄돼 있으면 그대로(「제」·「호」는 빼고). 없으면 null.
- before / after: 「①행위전」「②행위후」에 적힌 ★전기차 충전기 기수(= 충전기 주차면 수)★.
  ★서식은 「용도 · 면적(㎡)」 두 칸인데, 충전기 신고는 면적 칸에 기수를 적는 일이 흔하다★ —
  용도가 전기차충전기·충전시설인 칸 옆의 숫자는 면적 칸에 있어도 기수로 읽는다
  (예: 용도 「부대시설(전기차충전기)」 · 면적 칸 「4」 → 4).
  용도 글자 안에 기수가 따로 적혀 있으면 그것이 먼저다 — 그때 면적 칸은 0 인 일이 많다
  (예: 「주차장(설치전-기존설치8면)」 · 0 → before 8, 「기존8면+신규설치8면 총16면」 · 0 → after 16).
  행위전 용도가 그냥 주차장·지하주차장이고 충전기 표기가 없으면 before 는 0.
  행위신고가 아닌 문서는 null.
- count: 이 행위로 설치·교체·철거한 기수가 문서에 적혀 있으면 그 수(예: 「전기차충전기8기설치」 → 8).
  필증·계약서는 거기 적힌 충전기 대수(계약 대수·설치 대수). 적혀 있지 않으면 null — 전후 차이를 계산해 넣지 말 것.
- kind: ${KINDS.join(' · ')} 중 하나. 충전기가 새로 늘면 신규 설치, 바꾸면 교체 설치, 걷으면 철거. 알 수 없으면 null.`;
}

interface RawAct {
  originalName?: unknown; doc?: unknown; title?: unknown; date?: unknown; number?: unknown;
  kind?: unknown; before?: unknown; after?: unknown; count?: unknown;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v) : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const ymd = (v: unknown): string | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str(v) ?? '');
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

/** 판독의 답을 다듬는다 — 이름은 보낸 것 중 하나로, 값은 정해진 것 중 하나로 */
export function actsOf(raw: unknown, names: string[]): EvidenceAct[] {
  const list = (raw as { acts?: RawAct[] } | null)?.acts;
  if (!Array.isArray(list)) return [];
  return list.flatMap((a) => {
    const name = str(a.originalName);
    const file = names.find((n) => n === name) ?? names.find((n) => name && (n.includes(name) || name.includes(n)));
    if (!file) return [];
    return [{
      file,
      doc: DOCS.includes(a.doc as EvidenceDoc) ? (a.doc as EvidenceDoc) : '기타',
      title: str(a.title),
      date: ymd(a.date),
      number: str(a.number)?.replace(/^제\s*/, '').replace(/\s*호$/, '') ?? null,
      kind: (KINDS as readonly string[]).includes(a.kind as string) ? (a.kind as EvidenceAct['kind']) : null,
      before: num(a.before),
      after: num(a.after),
      count: num(a.count),
    }];
  });
}

const ask = (batch: NormalizedFile[], text: string) => askPdfJson(batch, text, 'preinstall-check');
const prepare = (files: { name: string; buffer: Buffer }[]) => preparePdfs(files, 'preinstall-check');

/** 증빙 칸의 파일들을 읽는다 */
export async function readEvidence(
  files: { name: string; buffer: Buffer }[]
): Promise<{ acts: EvidenceAct[]; unread: string[] }> {
  const { batches, unread } = await prepare(files);
  const acts: EvidenceAct[] = [];
  for (const batch of batches) {
    const names = batch.map((f) => f.name);
    const got = actsOf(await ask(batch, prompt(names)), names);
    acts.push(...got);
    // 답에 아예 없는 파일은 읽지 못한 것이다
    for (const n of names) if (!got.some((a) => a.file === n)) unread.push(n);
  }
  return { acts, unread };
}

/* ── 설치이력 스캔본(날인본) ─────────────────────────────────────────────────
 * ★기설치가 없을 때 운영사·아파트 직인이 없으면 보완요청★ (한백 지시 2026-10-07).
 * 날인본은 엑셀에 도장 그림을 박아 오기도 하지만(lib/legacy-sheet 가 코드로 본다), 출력해 찍고 스캔해
 * 오는 일이 많다 — 경주국태그린빌의 첫 판은 아파트 직인만 있고 사업수행기관 칸이 비어 보완요청됐다.
 * 스캔본은 그림이라 판독이 본다. 도장이 찍혔는지만 묻는다 — 누구 도장인지는 이름 칸이 말한다.
 */

function scanPrompt(names: string[]): string {
  return `「신청지점(대기번호)별 충전기 설치 및 철거·교체 현황」(기설치 충전기 설치이력) 양식을 출력해 날인하고 스캔한 문서입니다.
인쇄된 것과 찍힌 것만 읽어 JSON 으로 답하세요. 추측하지 마세요. JSON 외의 글은 쓰지 마세요.

## 문서 (${names.length}개 — originalName 에 이 이름을 그대로)
${names.map((n, i) => `${i + 1}. ${n}`).join('\n')}

## 답 모양
{"files":[{"originalName":"…","form":true,"applicant":{"name":"세경1차아파트관리사무소","seal":true},"operator":{"name":"현대엔지니어링 주식회사","seal":false},"total":0}]}

## 항목
- form: 서명 칸 「(설치 신청자)」·「(사업수행기관)」이 있으면 true. 서명 칸이 없는 옛 양식이거나 다른 문서면 false 이고
  applicant·operator 는 null. (total 은 form 과 상관없이 읽는다.)
- applicant: 「(설치 신청자)」 칸. name = 「신청자명 :」 뒤에 적힌 이름(비었으면 null).
  seal = 그 칸 안이나 칸에 걸쳐 ★도장(인영)이 찍혀 있으면 true★ — 붉은(흑백 스캔이면 검은) 네모·동그라미 도장 자국.
  「(인)」 글자만 있고 도장이 없으면 false. 손글씨 서명만 있어도 false.
- operator: 「(사업수행기관)」 칸. name = 「사업자명 :」 뒤. seal 은 위와 같다.
- total: 표 「전체」 줄의 「최종 기설치 수량(H)」 숫자. 행위 기수가 0보다 큰 줄이 하나도 없으면 0.
  충전기 설치·철거 현황 표가 아닌 문서이거나 안 보이면 null.`;
}

const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);

export function scansOf(raw: unknown, names: string[]): SheetScan[] {
  const list = (raw as { files?: Record<string, unknown>[] } | null)?.files;
  if (!Array.isArray(list)) return [];
  return list.flatMap((f) => {
    const name = str(f.originalName);
    const file = names.find((n) => n === name) ?? names.find((n) => name && (n.includes(name) || name.includes(n)));
    if (!file) return [];
    const side = (v: unknown) => {
      const s = (v ?? {}) as Record<string, unknown>;
      return { name: str(s.name), seal: bool(s.seal) };
    };
    return [{ file, form: f.form === true, applicant: side(f.applicant), operator: side(f.operator), total: num(f.total) }];
  });
}

/** 설치이력 칸의 스캔본(PDF·사진)을 읽는다 */
export async function readSheetScans(
  files: { name: string; buffer: Buffer }[]
): Promise<{ scans: SheetScan[]; unread: string[] }> {
  const { batches, unread } = await prepare(files);
  const scans: SheetScan[] = [];
  for (const batch of batches) {
    const names = batch.map((f) => f.name);
    const got = scansOf(await ask(batch, scanPrompt(names)), names);
    scans.push(...got);
    for (const n of names) if (!got.some((s) => s.file === n)) unread.push(n);
  }
  return { scans, unread };
}

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
import Anthropic from '@anthropic-ai/sdk';
import { imageFileToPdf, type NormalizedFile } from './files';
import { uprightPdfFiles } from './pdf-orient';
import { logLlmCall } from './llm-usage';
import type { EvidenceAct, EvidenceDoc } from './preinstall-check';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/** 숫자를 읽는 일이라 가장 정확한 모델 — 사진 글자 읽기(lib/survey/read-plate)와 같다 */
const MODEL = 'claude-opus-5-5';
/** 거절(stop_reason: refusal)이면 이 모델로 다시 — 접수 판독에서 겪었다(lib/claude.ts) */
const REFUSAL_FALLBACK_MODEL = 'claude-sonnet-5';
const CALL_TIMEOUT_MS = 150_000;
/** 한 번에 보낼 PDF 총량 — 요청 한도(32MB)에 base64 팽창(1.33배)을 감안한 값 */
const BYTES_BUDGET = 18 * 1024 * 1024;

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

async function ask(batch: NormalizedFile[]): Promise<unknown> {
  const content: Anthropic.ContentBlockParam[] = [
    ...batch.map((f) => ({
      type: 'document' as const,
      source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: f.buffer.toString('base64') },
    })),
    { type: 'text', text: prompt(batch.map((f) => f.name)) },
  ];
  let model = MODEL;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const started = Date.now();
    const message = await anthropic.messages.create(
      { model, max_tokens: 4096, messages: [{ role: 'user', content }] },
      { timeout: CALL_TIMEOUT_MS }
    );
    logLlmCall({ route: 'preinstall-check', model, ms: Date.now() - started, usage: message.usage });
    if (message.stop_reason === 'refusal') {
      if (model === REFUSAL_FALLBACK_MODEL) throw new Error('증빙 판독이 거절되었습니다.');
      console.warn(`[preinstall-check] ${model} 이 거절 — ${REFUSAL_FALLBACK_MODEL} 로 다시 읽는다`);
      model = REFUSAL_FALLBACK_MODEL;
      continue;
    }
    const text = message.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
    const json = /\{[\s\S]*\}/.exec(text)?.[0];
    if (json) {
      try { return JSON.parse(json); } catch { /* 다시 묻는다 */ }
    }
    console.warn(`[preinstall-check] 답에서 JSON 을 못 찾음(${attempt}/3) · stop=${message.stop_reason}`);
  }
  throw new Error('증빙 판독의 답을 읽지 못했습니다.');
}

/**
 * 칸의 파일들을 읽는다. 사진은 PDF 로 바꾸고, 거꾸로 스캔된 쪽은 바로 세운다(접수와 같은 길).
 * 못 읽은 파일(형식이 다르거나 한 번에 못 담는 것)은 unread 로 돌려준다 — 조용히 빠지지 않게.
 */
export async function readEvidence(
  files: { name: string; buffer: Buffer }[]
): Promise<{ acts: EvidenceAct[]; unread: string[] }> {
  const unread: string[] = [];
  const pdfs: NormalizedFile[] = [];
  for (const f of files) {
    if (/\.pdf$/i.test(f.name)) {
      pdfs.push({ name: f.name, buffer: f.buffer, hash: '', mimeType: 'application/pdf' });
      continue;
    }
    const pdf = await imageFileToPdf(f.name, f.buffer).catch(() => null);
    if (pdf) pdfs.push(pdf);
    else unread.push(f.name);
  }
  if (pdfs.length === 0) return { acts: [], unread };

  const upright = await uprightPdfFiles(pdfs, 'preinstall-check');

  // 한 번에 못 담으면 나눠 읽는다 — 한 파일이 그것만으로 넘치면 못 읽은 것으로 둔다
  const batches: NormalizedFile[][] = [];
  let cur: NormalizedFile[] = [];
  let bytes = 0;
  for (const f of upright) {
    if (f.buffer.length > BYTES_BUDGET) { unread.push(f.name); continue; }
    if (bytes + f.buffer.length > BYTES_BUDGET && cur.length > 0) { batches.push(cur); cur = []; bytes = 0; }
    cur.push(f);
    bytes += f.buffer.length;
  }
  if (cur.length > 0) batches.push(cur);

  const acts: EvidenceAct[] = [];
  for (const batch of batches) {
    const names = batch.map((f) => f.name);
    const got = actsOf(await ask(batch), names);
    acts.push(...got);
    // 답에 아예 없는 파일은 읽지 못한 것이다
    for (const n of names) if (!got.some((a) => a.file === n)) unread.push(n);
  }
  return { acts, unread };
}

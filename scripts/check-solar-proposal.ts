/**
 * 제안서 한 벌을 실제로 채워 본다 — ★읽기만 한다★ (결과 파일만 쓴다).
 *
 *   npx tsx scripts/check-solar-proposal.ts <서식.pptx> [결과.pptx]
 *
 * 화면을 붙이기 전에 ★진짜 서식★에 값을 꽂아 열어 본다. 이 저장소의 문서 생성기는
 * 늘 이렇게 확인했다(CLAUDE.md — 「네 서식 끝까지 눌러 워드·엑셀로 열어 확인」).
 *
 * 보는 것 셋: ① 안 걸린 열쇠가 없는가(있으면 샘플 값이 그대로 나간다) ② 손익표 21줄을
 * 다 썼는가 ③ 바뀐 글이 실제로 새 값인가(요약 문장과 표 몇 줄을 찍어 눈으로 본다).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

const g = globalThis as unknown as Record<string, unknown>;
g.DOMParser = DOMParser;
g.XMLSerializer = XMLSerializer;

const SRC = process.argv[2];
const OUT = process.argv[3] ?? null;
if (!SRC) throw new Error('서식 pptx 경로를 주세요.');

/** 승진패키지 — 협력사 회의 Agenda 21차 12쪽의 현장. 88.4kW 니 샘플(352.95)과 많이 다르다 */
const INPUT = {
  customer: '(주)승진패키지',
  address: '경기도 광주시 초월읍 현산로 341-32',
  region: '광주',
  capacityKw: 88.4,
  selfUseKwh: 96_000,
};

const A = 'http://schemas.openxmlformats.org/drawingml/2006/main';

function textOf(xml: string): string[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  return Array.from(doc.getElementsByTagNameNS(A, 'p')).map((p) =>
    Array.from(p.getElementsByTagNameNS(A, 't')).map((t) => t.textContent ?? '').join('')
  ).filter((s) => s.trim());
}

async function main() {
  const JSZip = (await import('jszip')).default;
  const { fillProposal, numbersOf, proposalFileName } = await import('../lib/solar/fill-proposal');

  const n = numbersOf(INPUT);
  console.log(`${INPUT.customer} · ${INPUT.capacityKw}kW · 자가소비 ${INPUT.selfUseKwh.toLocaleString('ko-KR')}kWh`);
  console.log(`  모듈 ${n.moduleCount}장 · 연 발전량 ${Math.round(n.genKwh).toLocaleString('ko-KR')}kWh`
    + ` · 초과 ${(n.excessRatio * 100).toFixed(2)}%`);
  console.log(`  첫해 ${Math.round(n.firstYear / 10_000).toLocaleString('ko-KR')}만원`
    + ` · 20년 ${(n.total / 100_000_000).toFixed(2)}억 원\n`);

  const zip = await JSZip.loadAsync(readFileSync(SRC));
  const r = await fillProposal(zip, INPUT);

  console.log(`바꾼 문단 ${r.hits}개 · 손익표 ${r.econRows}줄`);
  console.log(r.missed.length === 0 ? '★열쇠가 전부 걸렸다★' : `★안 걸린 열쇠★ ${r.missed.join(' / ')}`);
  if (r.econRows !== 21) console.log(`★손익표가 21줄이 아니다 (${r.econRows}) — 서식의 표가 바뀌었다★`);

  const bytes = r.file instanceof Uint8Array ? r.file : new Uint8Array(await r.file.arrayBuffer());
  const out = await JSZip.loadAsync(bytes);

  console.log('\n── 2번 요약 ──');
  for (const s of (await textOf(await out.file('ppt/slides/slide2.xml')!.async('string'))).slice(4, 9)) {
    console.log('  ', s.slice(0, 110));
  }
  console.log('\n── 19번 손익표 앞 세 줄 ──');
  const t19 = await textOf(await out.file('ppt/slides/slide19.xml')!.async('string'));
  const at = t19.findIndex((s) => s === '년도');
  for (const s of t19.slice(at, at + 3)) console.log('  ', s);

  if (OUT) {
    writeFileSync(OUT, bytes);
    console.log(`\n결과 ${OUT} (${(bytes.length / 1048576).toFixed(1)}MB) — ${proposalFileName(INPUT.customer)}`);
  }
  process.exit(0);
}

void main();

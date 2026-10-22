/**
 * 제안서 서식에 값을 꽂아 본다 — ★읽기만 한다★ (결과 파일만 쓴다).
 *
 *   npx tsx scripts/check-solar-fill.ts <서식.pptx> [결과.pptx]
 *
 * 화면을 만들기 전에 ★실제 서식★에 대고 돌려 본다. 단위 시험(test/solar-pptx)은 조각난
 * 글자를 다루는 규칙을 못 박지만, 그 규칙이 69MB 짜리 진짜 파일에서도 걸리는지는 대 봐야
 * 안다 — 서식이 구글 슬라이드에서 나온 것이라 run 이 어떻게 쪼개져 있는지 알 수 없다.
 *
 * ★무엇이 안 걸렸는지를 본다★ — 0 건인 열쇠가 있으면 그 값은 제안서에 샘플 그대로 남는다.
 * 그게 가장 위험한 실패다(사람은 고객 이름만 보고 보낸다).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';

const g = globalThis as unknown as Record<string, unknown>;
g.DOMParser = DOMParser;
g.XMLSerializer = XMLSerializer;

const SRC = process.argv[2];
const OUT = process.argv[3] ?? null;
if (!SRC) throw new Error('서식 pptx 경로를 주세요.');

/** 샘플(무창)을 다른 현장으로 바꿔 본다 — 값은 아무거나, 걸리는지만 본다 */
const R: Record<string, string> = {
  '(주)무창': '(주)한백시험',
  '충남 아산시 선장면 서부남로 199-32': '경기도 광주시 초월읍 현산로 341-32',
  '아산': '광주',
  '352.95': '410.80',
  '322,730': '377,100',
  '30.41': '27.12',
  '174.8': '168.2',
  '543EA': '632EA',
  '7.09억': '8.44억',
  '738만원': '902만원',
};

async function main() {
  const JSZip = (await import('jszip')).default;
  const { fillSlideXml } = await import('../lib/solar/pptx-kit');

  const buf = readFileSync(SRC);
  const zip = await JSZip.loadAsync(buf);
  const names = Object.keys(zip.files)
    .filter((n) => /^ppt\/(slides|notesSlides)\/(slide|notesSlide)\d+\.xml$/.test(n))
    .sort();
  console.log(`서식 ${(buf.length / 1048576).toFixed(1)}MB · 글자 있는 XML ${names.length}장\n`);

  /** 열쇠마다 몇 장에서 걸렸나 */
  const perKey = new Map<string, number>(Object.keys(R).map((k) => [k, 0]));
  let hits = 0;
  let parts = 0;

  for (const n of names) {
    const was = await zip.file(n)!.async('string');
    /* 열쇠 하나씩 따로 재서 「무엇이 안 걸렸는지」를 본다 */
    for (const k of Object.keys(R)) {
      const one = fillSlideXml(was, { [k]: R[k] });
      if (one.hits > 0) perKey.set(k, (perKey.get(k) ?? 0) + 1);
    }
    const all = fillSlideXml(was, R);
    if (all.hits > 0) {
      zip.file(n, all.xml);
      hits += all.hits;
      parts += 1;
    }
  }

  console.log(`바꾼 문단 ${hits}개 · 손댄 장 ${parts}개\n`);
  console.log('열쇠별로 걸린 장 수');
  let missed = 0;
  for (const [k, n] of perKey) {
    const mark = n === 0 ? '  ★안 걸림★' : '';
    if (n === 0) missed += 1;
    console.log(`   ${n === 0 ? '✗' : '✓'} ${n}장  ${k}${mark}`);
  }

  if (OUT) {
    const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    writeFileSync(OUT, out);
    console.log(`\n결과 ${OUT} (${(out.length / 1048576).toFixed(1)}MB)`);
  }
  console.log(missed === 0 ? '\n★열쇠가 전부 걸렸다★' : `\n★안 걸린 열쇠 ${missed}개 — 그 값은 샘플 그대로 나간다★`);
  process.exit(0);
}

void main();

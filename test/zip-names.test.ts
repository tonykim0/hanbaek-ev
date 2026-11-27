/**
 * ZIP 안 파일 이름 — 윈도우 한글 ZIP(CP949)도 제 이름으로 읽는다 (2026-11-27 HB-2026-298 서호e-TOWN아파트).
 *
 * 윈도우 탐색기의 「압축(ZIP) 폴더」는 이름을 CP949 로 적고 UTF-8 표시도 유니코드 이름 칸도 달지 않는다. JSZip 은 그런
 * 이름을 UTF-8 로 읽어 「��ȣ��Ÿ��…」으로 깨뜨렸고, 판독은 깨진 이름을 그대로 돌려주지 못해(� 를 다시 적지 못한다)
 * 판독 결과를 파일에 잇지 못했다 — 계약서 묶음 PDF 가 쪼개지지 않고 통째로 기타 칸에, 충전기 이력 엑셀이 실사보고서 칸에
 * 갔다. 운영에 세 현장(HB-2026-256 · 291 · 298).
 *
 * JSZip 으로 만든 ZIP 은 유니코드 이름 칸을 달아 이 일을 재현하지 못한다 — 그래서 탐색기가 만드는 모양을 손으로 짓는다.
 */
import { crc32 } from 'node:zlib';
import { PDFDocument } from 'pdf-lib';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decodeZipName, extractAndHashFromZipBuffer } from '@/lib/files';
import type { ExtractedMetadata } from '@/types/intake';

/* 접수 길 끝까지 — 판독 · 방향 · 저장만 흉내 낸다(ZIP 풀기 · 짝짓기 · 쪼개기 · 칸 정하기는 진짜) */
const classify = vi.hoisted(() => vi.fn());
vi.mock('@/lib/claude-chunked', async (orig) => ({
  ...(await orig<typeof import('@/lib/claude-chunked')>()),
  classifyInChunks: classify,
}));
vi.mock('@/lib/pdf-orient', () => ({ uprightPdfFiles: async (files: unknown) => files }));
vi.mock('@/lib/blob/server', () => ({ putBlob: async (path: string) => ({ url: `https://blob.test/${path}` }) }));
vi.spyOn(console, 'error').mockImplementation(() => {});
const { autoIntakeFromZip } = await import('@/lib/intake-auto');

/** 압축 없이(stored) 파일을 담은 ZIP — 이름 바이트를 그대로 적고 일반 비트 11(UTF-8)을 세우지 않는다 */
function rawZip(entries: { name: Buffer; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); //    필요한 판
    local.writeUInt16LE(0, 6); //     일반 비트 — UTF-8 표시 없음
    local.writeUInt16LE(0, 8); //     stored
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const PDF = Buffer.from('%PDF-1.4\n%%EOF\n');
const XLSX = Buffer.from('PK-not-really-xlsx');
/* CP949 바이트 — python3 -c "print('서호이타운 계약서류.pdf'.encode('cp949').hex())" */
const CP949_PDF = Buffer.from('bcadc8a3c0ccc5b8bfee20b0e8bee0bcadb7f92e706466', 'hex'); // 서호이타운 계약서류.pdf
const CP949_XLSX = Buffer.from('c3e6c0fcb1e2c0ccb7c25f3236313132372e786c7378', 'hex'); //   충전기이력_261127.xlsx

describe('ZIP 안 파일 이름', () => {
  it('★윈도우 한글 ZIP(CP949 · UTF-8 표시 없음)★ — 깨지지 않고 제 이름으로 나온다', async () => {
    const files = await extractAndHashFromZipBuffer(rawZip([
      { name: CP949_PDF, data: PDF },
      { name: CP949_XLSX, data: XLSX },
    ]));
    expect(files.map((f) => f.name)).toEqual(['서호이타운 계약서류.pdf', '충전기이력_261127.xlsx']);
    expect(files.some((f) => f.name.includes('�'))).toBe(false);
  });

  it('UTF-8 표시 없이 UTF-8 로 적은 이름(맥의 압축 등)은 그대로 UTF-8 이다', async () => {
    const files = await extractAndHashFromZipBuffer(rawZip([
      { name: Buffer.from('서호 회의록.pdf', 'utf8'), data: PDF },
    ]));
    expect(files.map((f) => f.name)).toEqual(['서호 회의록.pdf']);
  });

  it('decodeZipName — 영문은 그대로 · UTF-8 이 아니면 CP949', () => {
    expect(decodeZipName(Uint8Array.from(Buffer.from('scan_01.pdf')))).toBe('scan_01.pdf');
    expect(decodeZipName(Uint8Array.from(CP949_PDF))).toBe('서호이타운 계약서류.pdf');
    expect(decodeZipName([...Buffer.from('계약서.pdf', 'utf8')])).toBe('계약서.pdf');
  });
});

/** 두 쪽짜리 계약서류 묶음 — 1쪽 계약서 · 2쪽 합의서 */
async function bundlePdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([595, 842]);
  doc.addPage([595, 842]);
  return Buffer.from(await doc.save());
}

const meta = (originalName: string): ExtractedMetadata => ({
  현장명: '서호e-TOWN아파트', 주소: null, 우편번호: null, CPO: ['플러그링크'], 계약대수: null, 계약기간: null,
  총주차면수: null, 건축물유형: null, 전력인입: null, 소재지: null, 사업구분: null, 현장담당자: null,
  현장연락처: null, 현장이메일: null, 설치위치: null, 비고: null, confidence: {},
  files: [
    { originalName, category: '계약서', pages: [1] },
    { originalName, category: '합의서', pages: [2] },
  ],
} as ExtractedMetadata);

describe('접수 ZIP — 윈도우 한글 ZIP 이 칸으로 갈린다', () => {
  beforeEach(() => { classify.mockReset(); });

  it('★묶음 PDF 는 쪼개져 계약서 · 합의서 칸으로, 이력 엑셀은 기설치 이력 칸으로★ — 기타에 아무것도 안 간다', async () => {
    classify.mockImplementation(async (pdfs: { name: string }[]) => meta(pdfs[0].name));
    const zip = rawZip([{ name: CP949_PDF, data: await bundlePdf() }, { name: CP949_XLSX, data: XLSX }]);
    const out = await autoIntakeFromZip(zip, 'intake-staging/test');
    expect(classify.mock.calls[0][0].map((f: { name: string }) => f.name)).toEqual(['서호이타운 계약서류.pdf']);
    expect(out.docs.map((d) => d.kind).sort()).toEqual(['agreement', 'contract', 'legacylog']);
    expect(out.warnings.some((w) => w.includes('판독 결과가 없는'))).toBe(false);
  });

  it('판독의 답이 파일에 이어지지 않으면 ★말한다★ — 그 파일은 쪼개지지 않고 기타로', async () => {
    classify.mockResolvedValue(meta('다른 이름.pdf'));
    const zip = rawZip([{ name: CP949_PDF, data: await bundlePdf() }]);
    const out = await autoIntakeFromZip(zip, 'intake-staging/test');
    expect(out.docs.map((d) => d.kind)).toEqual(['etc']);
    expect(out.warnings).toContainEqual(expect.stringContaining('판독 결과가 없는 파일 1건 — 서호이타운 계약서류.pdf'));
  });
});

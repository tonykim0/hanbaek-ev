/**
 * 건축물대장 대조를 돌리는 길 — 자동 대조는 바뀐 파일만 판독에 보내고(2026-10-30 비용 검토), 한백의 「다시 대조」는 전부 보낸다.
 * 판독(lib/parking-read)은 흉내 내고 파일 받기(fetch)는 그 자리에서 돌려준다 — 실제 API·DB 는 부르지 않는다.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParkingCheck, ParkingRead, ParkingSlot } from '@/lib/parking-check';

const readParking = vi.fn();
vi.mock('@/lib/parking-read', () => ({ readParking }));
vi.mock('@/lib/db/client', () => ({ getDb: vi.fn() }));
vi.mock('@/lib/data', () => ({ getRepository: vi.fn() }));
vi.mock('@/lib/data/store/parking-check', () => ({ loadParkingCheck: vi.fn() }));

beforeAll(() => { vi.stubGlobal('fetch', async () => new Response('%PDF-1.4')); });
afterAll(() => { vi.unstubAllGlobals(); });

const file = (slot: ParkingSlot, name: string) => ({ slot, name, url: `https://blob/${name}` });
const REG = file('bldgreg', '건축물대장.pdf');
const CONSULT = file('consult', '결과서.pdf');
const APPLY = file('apply', '신청서.pdf');

/** 판독 흉내 — 받은 파일마다 문서 하나를 읽은 것으로(주차면 249 · 같은 도로명 · 안쪽 발급일) */
const readOf = (f: { name: string; slot: ParkingSlot; url: string }): ParkingRead => ({
  file: f.name, slot: f.slot, url: f.url, parking: 249, viewOnly: f.slot === 'bldgreg' ? false : null,
  doc: f.slot === 'bldgreg' ? '건축물대장' : f.slot === 'consult' ? '결과서' : '신청서',
  address: f.slot === 'consult' ? null : '전라남도 광양시 광양읍 예구1길 8', issued: f.slot === 'bldgreg' ? '2026-10-02' : null,
});

const detailOf = (files: Array<ReturnType<typeof file>>) => ({
  project: {
    cpo: '플러그링크', contractParty: '입주자대표회의', bldgType: '공동주택', powerType: '모자분리',
    preInstall: '없음', bizType: '환경부', createdAt: '2026-10-16',
  },
  lines: [],
  documents: (['bldgreg', 'consult', 'apply'] as const).map((kind) => ({
    kind, files: files.filter((f) => f.slot === kind).map(({ name, url }) => ({ name, url })),
  })),
}) as never;

beforeEach(() => {
  readParking.mockReset();
  readParking.mockImplementation(async (files: Array<{ name: string; slot: ParkingSlot; url: string }>) => ({
    reads: files.map(readOf), unread: [],
  }));
});

describe('건축물대장 대조를 돌린다', () => {
  it('★자동 대조 — 신청서 한 장이 새로 오면 그 한 장만 판독에 보낸다★', async () => {
    const { runParkingCheck } = await import('@/lib/parking-run');
    const prev: ParkingCheck = await runParkingCheck(detailOf([REG, CONSULT]));
    readParking.mockClear();

    const next = await runParkingCheck(detailOf([REG, CONSULT, APPLY]), prev);
    expect(readParking).toHaveBeenCalledTimes(1);
    expect(readParking.mock.calls[0][0].map((f: { name: string }) => f.name)).toEqual([APPLY.name]);
    // 판정은 세 칸 다 본 것과 같다 — 다시 쓴 판독과 새 판독이 칸 차례로 선다
    expect(next.reads.map((r) => r.file)).toEqual([REG.name, CONSULT.name, APPLY.name]);
    expect(next.files).toEqual([REG.url, CONSULT.url, APPLY.url]);
    expect(next.issues).toEqual([]);
  });

  it('한 장을 뺀 자동 대조는 판독을 부르지 않는다', async () => {
    const { runParkingCheck } = await import('@/lib/parking-run');
    const prev = await runParkingCheck(detailOf([REG, CONSULT, APPLY]));
    readParking.mockClear();
    const next = await runParkingCheck(detailOf([REG, CONSULT]), prev);
    expect(readParking).not.toHaveBeenCalled();
    expect(next.reads.map((r) => r.file)).toEqual([REG.name, CONSULT.name]);
  });

  it('한백의 「다시 대조」(지난 결과를 안 줌)는 세 칸을 전부 다시 읽는다', async () => {
    const { runParkingCheck } = await import('@/lib/parking-run');
    await runParkingCheck(detailOf([REG, CONSULT, APPLY]));
    expect(readParking.mock.calls[0][0].map((f: { name: string }) => f.name)).toEqual([REG.name, CONSULT.name, APPLY.name]);
  });
});

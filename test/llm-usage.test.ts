/**
 * 비용 한 줄 — 단가 찾기와 방향 판정의 「파일 하나에 한 줄」.
 *
 * 방향 판정은 쪽마다 API 를 부른다(lib/pdf-orient). 쪽마다 남기면 60쪽 스캔이 60줄이라 파일 하나로 모으고,
 * 부른 곳 이름을 붙여 같은 파일을 어디서 몇 번 세우는지 보이게 한다. SDK 를 흉내 낸다 — 실제 API 는 부르지 않는다.
 */
import { beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { PDFDocument } from 'pdf-lib';

const create = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class { messages = { create }; },
}));

const answer = (text: string) => ({ content: [{ type: 'text', text }], usage: { input_tokens: 100, output_tokens: 7 } });
const pdfOf = async (pages: number) => {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage();
  return Buffer.from(await doc.save());
};

let log: MockInstance<typeof console.log>;
const lines = () => log.mock.calls.map((c) => String(c[0])).filter((s) => s.startsWith('[llm]'));

beforeEach(() => {
  create.mockReset();
  log = vi.spyOn(console, 'log').mockImplementation(() => {});
  log.mockClear(); // 앞 시험의 줄이 같은 흉내에 쌓여 있다
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('단가', () => {
  it('날짜가 붙은 이름도 같은 단가다', async () => {
    const { priceOf } = await import('@/lib/llm-usage');
    expect(priceOf('claude-haiku-4-5-20251001')).toEqual(priceOf('claude-haiku-4-5'));
    expect(priceOf('claude-nope-1')).toBeUndefined();
  });

  it('하이쿠를 하이쿠 값으로 센다 — opus 값이면 다섯 배다', async () => {
    const { logLlmCall } = await import('@/lib/llm-usage');
    logLlmCall({ route: 'r', model: 'claude-haiku-4-5-20251001', ms: 1, usage: { input_tokens: 1_000_000, output_tokens: 0 } });
    expect(lines()[0]).toMatch(/~\$1\.000$/);
  });
});

describe('방향 판정 — 파일 하나에 한 줄', () => {
  it('쪽마다 부른 것을 모아 부른 곳 이름으로 한 줄 남긴다', async () => {
    create.mockResolvedValue(answer('{"candidate":"A"}'));
    const { uprightPdf } = await import('@/lib/pdf-orient');
    await uprightPdf(await pdfOf(3), 'parking-check');
    expect(create).toHaveBeenCalledTimes(3);
    expect(lines()).toHaveLength(1);
    expect(lines()[0]).toMatch(/^\[llm\] orient:parking-check model=claude-haiku-4-5\S* ms=\d+ pages=3 in=300 out=21 /);
  });

  it('답을 못 읽은 쪽도 낸 토큰은 센다', async () => {
    create.mockResolvedValueOnce(answer('모르겠습니다')).mockResolvedValue(answer('{"candidate":"A"}'));
    const { uprightPdf } = await import('@/lib/pdf-orient');
    await uprightPdf(await pdfOf(2), 'intake');
    expect(lines()[0]).toMatch(/ pages=2 in=200 out=14 /);
  });
});

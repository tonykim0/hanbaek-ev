/**
 * 방향 판정 — 검증한 요청 모양과 「쪽을 묶음으로 기다리지 않는다」.
 *
 * Haiku 5.5 로 옮기며(2026-10-30) 바로 선 실제 쪽 77장을 네 방향으로 돌려 잰 모양이 effort low · max_tokens 1024 다
 * (생각을 끄면 더 틀렸고, 생각도 max_tokens 에 든다). 5.5 는 한 번 묻는 데 4.5 의 두 배쯤 걸려 쪽을 여섯 개씩 기다리면
 * 올림이 느려진다 — 그래서 쪽마다 자리가 나는 대로 묻고, 날아가는 요청은 파일을 가리지 않고 16개까지다(메모리).
 * SDK 를 흉내 낸다 — 실제 API 는 부르지 않는다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';

const create = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class { messages = { create }; },
}));

const answer = (candidate: string) => ({
  content: [{ type: 'text', text: `{"candidate":"${candidate}"}` }],
  usage: { input_tokens: 100, output_tokens: 7 },
});
const pdfOf = async (pages: number) => {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage();
  return Buffer.from(await doc.save());
};

beforeEach(() => {
  create.mockReset();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

describe('방향 판정 요청', () => {
  it('검증한 모양 그대로 묻는다 — Haiku 5.5 · effort low · 생각할 자리 1024', async () => {
    create.mockResolvedValue(answer('A'));
    const { uprightPdf } = await import('@/lib/pdf-orient');
    await uprightPdf(await pdfOf(1), 'test');
    const [params] = create.mock.calls[0];
    expect(params.model).toBe('claude-haiku-5-5');
    expect(params.output_config).toEqual({ effort: 'low' });
    expect(params.max_tokens).toBe(1024);
    expect(params.thinking).toBeUndefined();
  });

  it('생각만 하다 끝나 답이 없으면 그 쪽은 원본 방향으로 둔다', async () => {
    create.mockResolvedValue({ stop_reason: 'max_tokens', content: [{ type: 'thinking', thinking: '' }], usage: { input_tokens: 100, output_tokens: 1024 } });
    const { uprightPdf } = await import('@/lib/pdf-orient');
    const pdf = await pdfOf(2);
    expect(await uprightPdf(pdf, 'test')).toBe(pdf);
  });

  it('돌아간 쪽은 고른 방향으로 세운다', async () => {
    create.mockResolvedValueOnce(answer('A')).mockResolvedValueOnce(answer('D'));
    const { uprightPdf } = await import('@/lib/pdf-orient');
    const out = await PDFDocument.load(await uprightPdf(await pdfOf(2), 'test'));
    expect(out.getPages().map((p) => p.getRotation().angle).sort()).toEqual([0, 270]);
  });
});

describe('쪽은 자리가 나는 대로 묻는다', () => {
  /** 부른 것을 붙잡아 두고 날아가는 수를 센다 — 놓아 줄 때까지 답하지 않는다 */
  function held() {
    const release: Array<() => void> = [];
    let now = 0;
    let most = 0;
    create.mockImplementation(() => {
      now += 1;
      most = Math.max(most, now);
      return new Promise((resolve) => release.push(() => { now -= 1; resolve(answer('A')); }));
    });
    return { release, most: () => most };
  }

  it('★13쪽 계약서는 13쪽이 한꺼번에 나간다★ — 여섯 쪽씩 기다리지 않는다', async () => {
    const h = held();
    const { uprightPdf } = await import('@/lib/pdf-orient');
    const done = uprightPdf(await pdfOf(13), 'test');
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(13));
    h.release.forEach((r) => r());
    await done;
    expect(h.most()).toBe(13);
  });

  it('날아가는 요청은 파일을 가리지 않고 16개까지다 — 남은 쪽은 자리가 나면 나간다', async () => {
    const h = held();
    const { uprightPdfFiles } = await import('@/lib/pdf-orient');
    const files = await Promise.all([10, 10, 10].map(async (n, i) => ({
      name: `f${i}.pdf`, mimeType: 'application/pdf', hash: String(i), buffer: await pdfOf(n),
    })));
    const done = uprightPdfFiles(files, 'test');
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(16));
    expect(h.most()).toBe(16);
    // 하나씩 놓아 주면 그만큼 다음 쪽이 나간다 — 끝까지 16을 넘지 않는다
    for (let spins = 0; spins < 5000 && (create.mock.calls.length < 30 || h.release.length > 0); spins++) {
      const next = h.release.shift();
      if (next) next();
      await new Promise((r) => setTimeout(r, 0));
    }
    await done;
    expect(create).toHaveBeenCalledTimes(30);
    expect(h.most()).toBe(16);
  });
});

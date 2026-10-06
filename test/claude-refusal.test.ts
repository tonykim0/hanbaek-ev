/**
 * 판독이 거절되면 다른 모델로 다시 읽는다 (2026-10-06, 일곡금호.zip).
 *
 * 거꾸로 스캔된 계약서를 바로 세워 보냈더니 기본 모델이 거절(stop_reason: refusal)했다 —
 * 출력 0 토큰, 블록 없음. 그전에는 그것을 「JSON 을 못 찾음」으로 읽고 같은 요청을 세 번
 * 보낸 뒤 「자동 분류 실패」로 떨어져, 통합 PDF 한 개가 통째로 기타로 들어갔다.
 * SDK 를 흉내 내 그 길을 못 박는다 — 실제 API 는 부르지 않는다.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const create = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class { messages = { create }; },
}));

const pdf = { name: 'a.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') };

const refusal = { stop_reason: 'refusal', content: [], usage: { input_tokens: 10, output_tokens: 0 } };
const ok = {
  stop_reason: 'end_turn',
  content: [{ type: 'text', text: '{"현장명":"시험","files":[]}' }],
  usage: { input_tokens: 10, output_tokens: 5 },
};

describe('classifyAndExtract — 거절이면 다른 모델로', () => {
  beforeEach(() => {
    create.mockReset();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('★거절되면 곧바로 다른 모델로 다시 읽어 결과를 낸다★', async () => {
    create.mockResolvedValueOnce(refusal).mockResolvedValueOnce(ok);
    const { classifyAndExtract } = await import('@/lib/claude');
    const r = await classifyAndExtract([pdf as never]);
    expect(r.현장명).toBe('시험');
    expect(create).toHaveBeenCalledTimes(2);
    const [first, second] = create.mock.calls.map((c) => c[0].model);
    expect(second).not.toBe(first);
  });

  it('같은 모델에 거절을 되풀이해 보내지 않는다 — 다시 보내면 또 거절한다', async () => {
    create.mockResolvedValueOnce(refusal).mockResolvedValueOnce(ok);
    const { classifyAndExtract } = await import('@/lib/claude');
    await classifyAndExtract([pdf as never]);
    const models = create.mock.calls.map((c) => c[0].model);
    expect(new Set(models).size).toBe(models.length);
  });

  it('다른 모델도 거절하면 거기서 멈추고 까닭을 던진다 — 세 번째를 보내지 않는다', async () => {
    create.mockResolvedValue(refusal);
    const { classifyAndExtract } = await import('@/lib/claude');
    await expect(classifyAndExtract([pdf as never])).rejects.toThrow(/거절/);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('거절이 아니면 모델을 바꾸지 않는다 — 판독 품질은 모델마다 다르다', async () => {
    create.mockResolvedValueOnce(ok);
    const { classifyAndExtract } = await import('@/lib/claude');
    await classifyAndExtract([pdf as never]);
    expect(create).toHaveBeenCalledTimes(1);
  });
});

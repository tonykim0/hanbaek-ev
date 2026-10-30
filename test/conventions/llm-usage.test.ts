/**
 * 판독을 부르면 비용 한 줄([llm])이 남는다 — 남지 않는 경로는 청구서에만 나타난다.
 *
 * 2026-10-30 비용 검토에서 방향 판정(lib/pdf-orient)과 접수 분류(lib/claude)가 한 줄도 안 남기고 있었다 —
 * 추정으로는 판독비의 절반이 넘는데 로그로는 0원이었다. 단가표에 없는 모델은 opus 값으로 세어 하이쿠가
 * 다섯 배로 보였을 것이다. 그래서 API 를 부르는 파일은 logLlmCall 을 부르고, 코드에 적힌 모델은 단가가 있다.
 */
import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { priceOf } from '@/lib/llm-usage';
import { findSources } from './fs';

const sources = [...findSources('lib'), ...findSources('app')];
const callers = sources.filter((f) => /\.messages\.create\(/.test(readFileSync(f, 'utf8')));
const MODEL_LITERAL = /['"`](claude-(?:opus|sonnet|haiku|fable|mythos)-\d[a-z0-9-]*)['"`]/g;

describe('판독 비용 한 줄', () => {
  it('API 를 부르는 파일을 찾았다', () => {
    expect(callers.length).toBeGreaterThan(5);
  });

  it.each(callers)('%s — 부른 만큼 logLlmCall 로 남긴다', (file) => {
    expect(readFileSync(file, 'utf8'), `${file}: 판독을 부르는데 비용 한 줄을 안 남긴다 — logLlmCall`).toMatch(/\blogLlmCall\(/);
  });

  it('코드에 적힌 모델은 단가표(lib/llm-usage PRICES)에 있다 — 없으면 opus 값으로 센다', () => {
    const models = new Set(sources.flatMap((f) => [...readFileSync(f, 'utf8').matchAll(MODEL_LITERAL)].map((m) => m[1])));
    expect(models.size).toBeGreaterThan(2);
    for (const model of models) expect(priceOf(model), `${model} 의 단가가 없다`).toBeDefined();
  });
});

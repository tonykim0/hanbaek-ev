/**
 * 「다음 칸」은 흐름에게 묻는다 — ★PROCESS_STATUSES 색인에 ±1 을 하지 않는다.★
 *
 * PROCESS_STATUSES 는 흐름 하나가 아니라 ★모든 칸의 목록★이다. 현장마다 지나는 칸이
 * 다르고(lib/process stepsOf — 기설치 연동은 「충전기 발주」·「충전기 수령」을 안 지난다),
 * 앞으로 가는 길에 없는 칸도 있다(BRANCH_ONLY 「준공보완」 — 반려로만 들어간다).
 * 그래서 이웃 칸은 nextStatusOf(cur, ctx) · prevStatusOf(cur, ctx) 가 답한다.
 *
 * 색인 산술은 ★맞을 때도 있다★ — 그래서 위험하다. 계약완료 다음은 모든 흐름에서 같아
 * IntakeTab 의 `PROCESS_STATUSES[statusIndex(status) + 1]` 은 여태 옳은 칸을 가리켰다
 * (2026-09-10 점검에서 발견해 고쳤다). 그 사이에 칸이 하나 생기거나 어느 흐름이 그 자리를
 * 건너뛰는 순간 조용히 틀린 칸을 가리킨다 — 화면에는 그럴듯한 칸 이름이 뜨고, 누르면
 * 엉뚱한 데로 간다. 흐름 갈래를 만든 뒤로 이 부류가 여러 번 물었다.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { describe, expect, it } from 'vitest';

function sourcesUnder(dir: string): string[] {
  const root = process.cwd();
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e)) out.push(relative(root, p));
    }
  };
  walk(join(root, dir));
  return out.sort();
}

/* lib/process.ts 는 예외다 — 흐름의 정본이라 거기서 칸 목록을 훑는 것이 그 일이다 */
const sources = [...sourcesUnder('components'), ...sourcesUnder('app'), ...sourcesUnder('lib')]
  .filter((p) => p !== 'lib/process.ts');

/** PROCESS_STATUSES[…±1] · steps[i±1] 처럼 이웃 칸을 색인으로 집는 모양 */
const INDEX_MATH = /(PROCESS_STATUSES|statusIndex\([^)]*\))\s*(\[[^\]]*[+-]\s*1[^\]]*\]|[+-]\s*1)/;

describe('이웃 칸을 색인 산술로 세지 않는다', () => {
  it('훑을 파일을 찾았다', () => {
    expect(sources.length).toBeGreaterThan(80);
  });

  it('★PROCESS_STATUSES 의 이웃은 nextStatusOf · prevStatusOf 에게 묻는다★', () => {
    const bad: string[] = [];
    for (const path of sources) {
      readFileSync(path, 'utf8').split('\n').forEach((line, i) => {
        if (/^\s*(\/\/|\/?\*)/.test(line)) return;   // 규칙을 설명하는 주석은 뺀다
        if (INDEX_MATH.test(line)) bad.push(`${path}:${i + 1}  ${line.trim()}`);
      });
    }
    expect(
      bad,
      '이웃 칸을 색인으로 집는다 — 흐름마다 지나는 칸이 달라 조용히 틀린 칸을 가리킬 수 있다.\n'
      + 'lib/process 의 nextStatusOf(cur, ctx) · prevStatusOf(cur, ctx) 를 쓴다\n'
      + '(ctx 는 gateContextOf(project)):\n  ' + bad.join('\n  ')
    ).toEqual([]);
  });
});

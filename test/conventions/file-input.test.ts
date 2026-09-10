/**
 * 파일 입력 — ★`.target.files` 는 쥐고 있으면 안 되는 물건이다.★
 *
 * `input.value = ''` 는 「선택된 파일 목록을 비운다」인데, 그 목록이 바로 `input.files` 가
 * 돌려준 ★그★ FileList 다 — 사본이 아니라 입력칸이 들고 있는 물건이다. 그래서
 *
 *     const files = e.target.files;
 *     e.target.value = '';   // ← 방금 그 목록이 여기서 비워진다
 *     take(files);           // ← 빈 목록
 *
 * 는 창에서 파일을 골라도 아무 일이 안 일어난다. 컴파일도 되고 화면도 멀쩡하고 오류도
 * 안 뜬다 — 그냥 조용하다. ★실사고 2026-09-10★: 접수 화면의 ZIP 자리가 이 모양이라
 * 에코일렉이 현장 세 건을 손으로 접수했다(「창은 없어지는데 파일이 안 들어가졌다」).
 * /scan 의 사진 고르기도 같이 깨져 있었는데, 거기서는 「사진이나 PDF 를 넣어주세요」라는
 * ★틀린★ 말이 떴다. 끌어다 놓기는 dataTransfer 라 두 자리 모두 멀쩡했다 — 그래서
 * 「되는 사람도 있다」로 보였다.
 *
 * 눈으로는 못 지킨다(같은 줄이 화면 열 곳에 있고, 안전한 것과 아닌 것이 한 글자 차이다).
 * 그래서 규칙 하나를 기계로 지킨다: ★`.target.files` 는 꺼내는 자리에서 바로 복사한다.★
 * `[...(e.target.files ?? [])]` · `Array.from(...)` · `e.target.files?.[0]` 셋 중 하나다.
 * 그 뒤로는 File 이나 File[] 만 돌아다니므로 언제 비우든 상관없다.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { describe, expect, it } from 'vitest';

/* fs.ts 의 findFiles 는 이름이 꼭 같은 것만 찾는다 — 여기는 확장자로 훑어야 한다 */
function tsxUnder(dir: string): string[] {
  const root = process.cwd();
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (e.endsWith('.tsx')) out.push(relative(root, p));
    }
  };
  walk(join(root, dir));
  return out.sort();
}

const sources = [...tsxUnder('components'), ...tsxUnder('app')];

/** 복사해서 꺼내는 모양 — 이 셋만 허용한다 */
const SAFE = [
  /\[\s*\.\.\.\s*\(?[A-Za-z_$][\w$]*\.target\.files/,   // [...(e.target.files ?? [])]
  /Array\.from\(\s*[A-Za-z_$][\w$]*\.target\.files/,     // Array.from(e.target.files ?? [])
  /\.target\.files\s*\?\?\s*\[\]\s*\)?\s*\]/,            // 위 둘의 꼬리
  /\.target\.files\s*\?\.\s*\[\s*\d+\s*\]/,              // e.target.files?.[0]
  /\.target\.files\s*\[\s*\d+\s*\]/,                     // e.target.files[0]
  /\.target\.files\s*\?\.\s*length/,                     // 길이만 본다
];

describe('파일 입력에서 FileList 를 들고 다니지 않는다', () => {
  it('훑을 화면을 찾았다', () => {
    expect(sources.length).toBeGreaterThan(50);
  });

  it('★`.target.files` 는 그 줄에서 바로 복사한다★ — 참조를 넘기면 value=\'\' 가 비운다', () => {
    const bad: string[] = [];
    for (const path of sources) {
      readFileSync(path, 'utf8').split('\n').forEach((line, i) => {
        if (!/\.target\.files/.test(line)) return;
        // 규칙을 설명하는 주석이 규칙에 걸리지 않게 — 이 시험의 머리말도 그런 줄이다
        if (/^\s*(\/\/|\/?\*)/.test(line)) return;
        if (SAFE.some((re) => re.test(line))) return;
        bad.push(`${path}:${i + 1}  ${line.trim()}`);
      });
    }
    expect(
      bad,
      '이 줄들은 FileList 를 그대로 넘긴다 — 그 뒤 어디선가 input.value = \'\' 를 만나면\n'
      + '조용히 빈 목록이 된다. 꺼내는 자리에서 [...(e.target.files ?? [])] 로 복사하고\n'
      + '받는 쪽 타입을 File[] 로 바꾼다:\n  ' + bad.join('\n  ')
    ).toEqual([]);
  });
});

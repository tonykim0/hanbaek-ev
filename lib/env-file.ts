/**
 * .env.local 을 process.env 에 얹는다.
 *
 * Next 는 .env.local 을 자동으로 읽지만, drizzle-kit 과 시드 스크립트는
 * Next 밖에서 도는 별개의 프로세스라서 아무것도 읽지 않는다.
 * dotenv 를 의존성으로 넣지 않으려고 필요한 만큼만 직접 파싱한다.
 *
 * 이미 들어 있는 값은 덮지 않는다 — 셸에서 준 값이 파일보다 우선이다.
 */
import { readFileSync } from 'fs';
import path from 'path';

export function loadEnvFile(file = '.env.local'): void {
  let raw: string;
  try {
    /*
     * 절대경로는 그대로 쓴다 — path.join 은 '/Users/…' 도 cwd 뒤에 이어 붙여 없는 파일을 만들고,
     * 아래 catch 가 그것을 「파일 없음」으로 조용히 넘겼다. 워크트리에는 .env.prod-db 링크가
     * 없어서(CLAUDE.md 협업 방식) 프로덕션 점검 스크립트가 백업 폴더의 파일을 절대경로로
     * 가리키는데, 그 길이 소리 없이 막혔다(2026-09-10). 상대경로는 전과 같다.
     */
    raw = readFileSync(path.isAbsolute(file) ? file : path.join(process.cwd(), file), 'utf8');
  } catch {
    return; // 파일이 없으면 조용히 넘어간다 (운영에서는 플랫폼이 환경변수를 준다)
  }

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;

    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;

    let value = trimmed.slice(eq + 1).trim();
    // 따옴표로 감싼 값은 벗긴다. 비밀번호에 # 이 있어도 잘리지 않도록 주석은 처리하지 않는다.
    const q = value[0];
    if ((q === '"' || q === "'") && value.endsWith(q) && value.length > 1) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

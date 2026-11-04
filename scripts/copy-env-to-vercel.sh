#!/bin/bash
# 다른 .env 파일에 이미 있는 키를 Vercel(production·preview)과 본 저장소 .env.local 로 옮긴다 — 값은 화면에 찍히지 않는다.
#
#   bash ~/Documents/hanbaek-ev/scripts/copy-env-to-vercel.sh <원본 .env 파일> 이름… [이름=운영값…]
#
#   이름        원본 파일의 그 값을 본 저장소 .env.local 과 Vercel production·preview 에(Sensitive)
#   이름=운영값  비밀이 아닌 운영 전용 값 — Vercel production 에만(본 저장소 .env.local 에는 원본의 로컬 값)
#               예: VWORLD_DOMAIN=https://hanbaek-re.vercel.app — VWorld 키는 발급 때 적은 서비스 주소에 묶인다
#
# 태양광 키 여섯이 solar-site 에만 있고 운영에 없어 운영 부지 검토가 「키 없음」이었다(2026-11-04).
# Vercel 에 이미 있는 이름은 건너뛴다(덮으려면 대시보드에서). 클립보드를 쓰지 않는다 — 클립보드에 남은 다른 키가 들어가지 않게.
set -euo pipefail

src="${1:-}"
shift || true
if [ -z "$src" ] || [ ! -f "$src" ] || [ $# -eq 0 ]; then
  echo "쓰는 법: bash $0 <원본 .env 파일> 이름… [이름=운영값…]" >&2
  exit 1
fi

repo="$HOME/Documents/hanbaek-ev"
cd "$repo"
touch .env.local

valueOf() { { grep -E "^$1=" "$src" || true; } | tail -1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/' | tr -d '\r\n'; }

setLocal() { # 본 저장소 .env.local 의 그 줄을 바꾸거나 붙인다
  local tmp
  tmp="$(mktemp .env.local.XXXXXX)"
  NAME="$1" VAL="$2" awk '
    index($0, ENVIRON["NAME"] "=") == 1 { print ENVIRON["NAME"] "=" ENVIRON["VAL"]; done = 1; next }
    { print }
    END { if (!done) print ENVIRON["NAME"] "=" ENVIRON["VAL"] }
  ' .env.local >"$tmp"
  chmod 600 "$tmp"
  mv "$tmp" .env.local
}

fail=0
for arg in "$@"; do
  name="${arg%%=*}"
  if ! [[ "$name" =~ ^[A-Z][A-Z0-9_]*$ ]]; then echo "$arg — 이름이 이상합니다" >&2; fail=1; continue; fi
  local_val="$(valueOf "$name")"
  if [[ "$arg" == *=* ]]; then
    prod_val="${arg#*=}"; envs="production"; kind="--no-sensitive"
  else
    prod_val="$local_val"; envs="production,preview"; kind="--sensitive"
  fi
  if [ -z "$prod_val" ]; then echo "$name — 원본에 값이 없습니다 (건너뜀)" >&2; fail=1; continue; fi

  [ -n "$local_val" ] && setLocal "$name" "$local_val"
  if printf '%s' "$prod_val" | npx -y vercel env add "$name" --environment "$envs" "$kind" --yes >/dev/null 2>&1; then
    echo "$name — Vercel $envs 에 넣음 (${#prod_val}자)"
  else
    echo "$name — Vercel 에 못 넣음: 이미 있거나 로그인이 필요합니다 (npx vercel env ls)" >&2
    fail=1
  fi
done
echo "운영에는 다음 배포부터 실린다."
exit $fail

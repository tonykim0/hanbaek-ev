#!/bin/bash
# 클립보드에 복사한 키를 .env.local 에 넣는다 — 키가 화면·대화창에 찍히지 않게 (solar-site 에서 가져왔다, 2026-11-04).
#
#   1) 키를 복사한다 (Anthropic 콘솔 → API Keys 의 「hanbaek-solar」 · 카카오 → [앱] > [플랫폼 키] …)
#   2) bash ~/Documents/hanbaek-ev/scripts/set-env.sh ANTHROPIC_SOLAR_API_KEY
#      --vercel 을 붙이면 Vercel 에도 같은 값을 넣는다 — 없던 이름은 production · preview 에 Sensitive 로 새로,
#      있던 이름은 값만 바꾼다(그 변수가 걸린 환경 전부 · 종류는 그대로). 운영에는 다음 배포부터 실린다.
#
# 같은 이름의 줄이 있으면 바꾸고, 없으면 끝에 붙인다. 출력은 글자 수뿐이다.
# ★워크트리가 아니라 본 저장소(~/Documents/hanbaek-ev)의 .env.local 에 넣는다★ — 워크트리는 만들 때 거기서 복사해 간다
# (.worktreeinclude). 이미 있는 워크트리에 그 이름의 줄이 있으면 같이 바꾼다 — 키를 갈면 옛 키가 남은 워크트리가 401 로 멈춘다.
set -euo pipefail

name="${1:-}"
case "$name" in
  KAKAO_REST_KEY | KAKAO_JS_KEY | VWORLD_KEY | VWORLD_DOMAIN | KEPCO_KEY | DATA_GO_KR_KEY | ANTHROPIC_API_KEY | ANTHROPIC_SOLAR_API_KEY) ;;
  *)
    echo "이름을 하나 주세요: ANTHROPIC_SOLAR_API_KEY · ANTHROPIC_API_KEY · KAKAO_REST_KEY · KAKAO_JS_KEY · VWORLD_KEY · VWORLD_DOMAIN · KEPCO_KEY · DATA_GO_KR_KEY" >&2
    exit 1
    ;;
esac

VERCEL=0; [ "${2:-}" = "--vercel" ] && VERCEL=1
repo="$HOME/Documents/hanbaek-ev"
cd "$repo"
touch .env.local

# 앞뒤 공백·줄바꿈을 걷고, 「이름=」까지 같이 복사했으면 그것도 걷는다
val="$(pbpaste | tr -d '\r\n' | sed -E 's/^[[:space:]]+//; s/[[:space:]]+$//')"
val="${val#"$name"=}"

if [ -z "$val" ]; then
  echo "클립보드가 비어 있습니다 — 키를 먼저 복사하세요" >&2
  exit 1
fi
if [[ "$val" =~ [[:space:]] ]]; then
  echo "클립보드에 띄어쓰기가 섞여 있습니다 — 키만 복사했는지 보세요 (아무것도 안 바꿨습니다)" >&2
  exit 1
fi

current() { { grep -E "^$1=" "$2" 2>/dev/null || true; } | tail -1 | cut -d= -f2- | tr -d '"\r\n'; }

# Anthropic 키 둘(전기차 · 태양광)은 한 번에 하나씩 클립보드로 넣는다 — 앞에 넣은 키가 클립보드에 남은 채로 다른 이름을
# 돌리면 두 이름이 같은 키가 된다. 그 실수를 여기서 멈춘다.
case "$name" in
  ANTHROPIC_*)
    if [[ "$val" != sk-ant-* ]]; then
      echo "Anthropic 키 모양(sk-ant-…)이 아닙니다 — 키를 복사했는지 보세요 (아무것도 안 바꿨습니다)" >&2
      exit 1
    fi
    for other in ANTHROPIC_API_KEY ANTHROPIC_SOLAR_API_KEY; do
      if [ "$other" != "$name" ] && [ "$(current "$other" .env.local)" = "$val" ]; then
        echo "클립보드의 키가 $other 와 같습니다 — $name 의 키를 복사했는지 보세요 (아무것도 안 바꿨습니다)" >&2
        exit 1
      fi
    done
    ;;
esac

setLine() { # 그 파일의 그 이름 줄을 바꾸거나 붙인다
  local file="$1" tmp
  tmp="$(mktemp "$file.XXXXXX")"
  NAME="$name" VAL="$val" awk '
    index($0, ENVIRON["NAME"] "=") == 1 { print ENVIRON["NAME"] "=" ENVIRON["VAL"]; done = 1; next }
    { print }
    END { if (!done) print ENVIRON["NAME"] "=" ENVIRON["VAL"] }
  ' "$file" >"$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$file"
}

[ "$(current "$name" .env.local)" = "$val" ] && same=" (이미 같은 값이었습니다)" || same=""
setLine .env.local
echo "$name 저장됨 — ${#val}자$same (값은 찍지 않습니다). 개발 서버가 저절로 다시 읽으니 브라우저만 새로고침하세요."

n=0
for wt in .claude/worktrees/*/.env.local; do
  [ -f "$wt" ] && grep -qE "^$name=" "$wt" && { setLine "$wt"; n=$((n + 1)); }
done
[ "$n" -gt 0 ] && echo "워크트리 ${n}곳의 .env.local 도 바꿈"

# 키가 실제로 듣는지 — 모델 목록은 돈이 안 든다
if [[ "$name" == ANTHROPIC_* ]]; then
  code=$(curl -s -o /dev/null -w '%{http_code}' -H @<(printf 'x-api-key: %s\nanthropic-version: 2023-06-01\n' "$val") https://api.anthropic.com/v1/models || true)
  if [ "$code" = 200 ]; then echo "키 확인 — Anthropic 이 받았습니다 (HTTP 200)"; else echo "키 확인 실패 — HTTP $code (키를 다시 복사해 보세요)" >&2; exit 1; fi
fi

# Vercel — 없던 이름은 운영·프리뷰 둘에 Sensitive(되읽기 불가)로 새로 넣는다(개발 환경은 .env.local 이 맡는다 · Sensitive 는
# development 에 못 넣는다). 있던 이름은 값만 바꾼다 — production 이 걸린 그 변수의 값이 그 변수의 모든 환경에 간다.
if [ "$VERCEL" = 1 ]; then
  if printf '%s' "$val" | npx -y vercel env add "$name" --environment production,preview --sensitive --yes >/dev/null 2>&1; then
    echo "Vercel production · preview 에 새로 넣음 — 운영에는 다음 배포부터 실린다"
  elif printf '%s' "$val" | npx -y vercel env update "$name" --environment production --yes >/dev/null 2>&1; then
    echo "Vercel 의 $name 값을 바꿈 — 운영에는 다음 배포부터 실린다"
  else
    echo "Vercel 에 못 넣었습니다 — 로그인이 필요하거나 production 에 걸린 $name 이 없습니다: npx vercel env ls" >&2
    exit 1
  fi
fi

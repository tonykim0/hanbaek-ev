#!/bin/bash
# 손으로 만든 워크트리 준비 — Claude Code 가 워크트리를 만들 때 하는 것과 같은 일을 한다.
#
#   · .claude/settings.json 의 worktree.symlinkDirectories 에 적힌 디렉터리를 본 저장소에서 링크 (node_modules)
#   · .worktreeinclude 에 적힌 비추적 파일을 본 저장소에서 복사 (.env.local · .vercel/project.json)
#
# claude -w · EnterWorktree 로 만든 워크트리는 이미 되어 있다. 이 스크립트는 `git worktree add` 로 직접
# 만들었을 때 쓴다. 무엇을 링크·복사할지는 여기 적지 않는다 — 위 두 설정 파일이 정본이다.
#
#   bash scripts/worktree-setup.sh [워크트리 경로]     (기본: 현재 디렉터리) · 멱등 — 있으면 건너뛴다
set -u
WT="${1:-$PWD}"
WT="$(cd "$WT" 2>/dev/null && pwd -P)" || { echo "경로가 없습니다: ${1:-$PWD}"; exit 1; }
GITDIR="$(git -C "$WT" rev-parse --git-dir 2>/dev/null)" || { echo "git 저장소가 아닙니다: $WT"; exit 1; }
case "$GITDIR" in
  */.git/worktrees/*) ;;
  *) echo "본 저장소라 준비할 것이 없습니다: $WT"; exit 0 ;;
esac
COMMON="$(cd "$WT" && cd "$(git rev-parse --git-common-dir)" && pwd -P)"
MAIN="$(dirname "$COMMON")"

have() { [ -e "$WT/$1" ] || [ -L "$WT/$1" ]; }
link() { # 디렉터리 링크
  have "$1" && { echo "  있음  $1"; return; }
  [ -e "$MAIN/$1" ] || { echo "  없음  $1 — 본 저장소에 없어 건너뜀"; return; }
  mkdir -p "$(dirname "$WT/$1")" && ln -s "$MAIN/$1" "$WT/$1" && echo "  링크  $1 → $MAIN/$1"
}
copy() { # 파일 복사
  have "$1" && { echo "  있음  $1"; return; }
  mkdir -p "$(dirname "$WT/$1")" && cp -R "$MAIN/$1" "$WT/$1" && echo "  복사  $1"
}

echo "워크트리 준비: $WT"
echo "본 저장소:     $MAIN"
# 설정은 워크트리 자신의 체크아웃에서 읽는다 — 내 브랜치의 설정이 정본이다. 없으면 본 저장소의 것.
CFG="$WT"; [ -f "$WT/.claude/settings.json" ] || CFG="$MAIN"
INC="$WT/.worktreeinclude"; [ -f "$INC" ] || INC="$MAIN/.worktreeinclude"
for d in $(jq -r '.worktree.symlinkDirectories[]? // empty' "$CFG/.claude/settings.json" 2>/dev/null); do link "$d"; done
if [ -f "$INC" ]; then
  while IFS= read -r pat || [ -n "$pat" ]; do
    pat="${pat%%#*}"; pat="$(printf '%s' "$pat" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"; [ -z "$pat" ] && continue
    ( cd "$MAIN" && for f in $pat; do
        [ -e "$f" ] || continue
        git check-ignore -q "$f" || { echo "  건너뜀 $f — 추적 파일은 복사하지 않는다"; continue; }
        copy "$f"
      done )
  done < "$INC"
fi
echo "끝. 확인은 npm test · npx tsc --noEmit"

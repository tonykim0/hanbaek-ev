#!/bin/bash
# main 은 머지로만 바뀐다 — 세션은 워크트리(.claude/worktrees/<이름>)의 브랜치에서 일한다.
# 이 훅이 그 규칙을 기계적으로 지킨다:
#   1. 본 저장소(main 이 체크아웃된 곳)와 main 브랜치에서는 커밋·리베이스·리셋·체리픽·리버트를 막는다.
#   2. main 으로 가는 강제 푸시·삭제를 막는다.
#   3. main 으로 푸시하기 전에 마이그레이션 번호 겹침을 본다 — 겹친 채 올리면 프로덕션 빌드가
#      깨진다(scripts/migrate.ts 가 거부. 2026-09-07 실사고: 세션 둘이 0064 를 같이 집었다).
#
# 옛 규칙(경로 지정 커밋)은 뺐다 — 세션이 각자 워크트리를 쓰면 인덱스가 갈려서 남의 스테이징을
# 삼킬 수 없다. 그 사고(2026-08-21 · 08-29)는 한 작업 트리를 여럿이 나눠 쓴 데서 났다.
#
# PreToolUse(Bash) 훅. stdin: {"cwd":"...","tool_input":{"command":"..."}} — cwd 는 세션이 있는 곳
# (워크트리에 들어가면 그곳). 차단 시 permissionDecision:"deny" JSON 을 출력한다. 허용은 출력 없이 exit 0.
# 설정의 훅 경로는 $CLAUDE_PROJECT_DIR(세션을 시작한 저장소 루트)라 본 저장소의 이 파일이 돈다.

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty' 2>/dev/null)
[ -z "$cmd" ] && exit 0
case "$cmd" in *git*) ;; *) exit 0 ;; esac
cwd=$(printf '%s' "$input" | jq -r '.cwd // empty' 2>/dev/null)
[ -z "$cwd" ] && cwd="$PWD"

deny() {
  jq -n --arg r "$1" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}'
  exit 0
}

# 명령이 향하는 저장소 — `git -C <경로>` 가 있으면 그곳, 없으면 세션의 cwd
dir="$cwd"
c_path=$(printf '%s' "$cmd" | sed -nE 's/.*git[[:space:]]+-C[[:space:]]+"?([^"[:space:]]+)"?.*/\1/p' | head -1)
[ -n "$c_path" ] && dir="$c_path"
case "$dir" in "~"*) dir="$HOME${dir#\~}" ;; esac
git -C "$dir" rev-parse --git-dir >/dev/null 2>&1 || exit 0   # 저장소가 아니면 볼 것이 없다

branch=$(git -C "$dir" symbolic-ref --short -q HEAD 2>/dev/null)   # 분리 HEAD 면 빈 값
gitdir=$(git -C "$dir" rev-parse --git-dir 2>/dev/null)
case "$gitdir" in */.git/worktrees/*) in_worktree=1 ;; *) in_worktree=0 ;; esac

G='git([[:space:]]+-C[[:space:]]+"?[^"[:space:]]+"?)?[[:space:]]+'   # git 또는 git -C <경로>
HINT='세션은 워크트리에서 일합니다: claude -w 로 시작(또는 EnterWorktree) → 브랜치에 커밋 → git push -u origin <브랜치> 로 프리뷰 → 확인 뒤 git push origin HEAD:main. (CLAUDE.md 협업 방식)'

# 1. 본 저장소·main 에서의 이력 변경 금지
if [ "$branch" = "main" ] || [ "$in_worktree" = 0 ]; then
  if printf '%s' "$cmd" | grep -qE "${G}(commit|rebase|reset|cherry-pick|revert)([[:space:]]|$)"; then
    where="main 브랜치"; [ "$in_worktree" = 0 ] && where="본 저장소($dir)"
    deny "$where 에서는 커밋·리베이스·리셋을 하지 않습니다 — main 은 머지(fast-forward)로만 바뀝니다. 본 저장소를 맞추는 것은 git pull --ff-only 입니다. $HINT"
  fi
fi

# 2·3. main 으로 가는 푸시
to_main=0
if printf '%s' "$cmd" | grep -qE "${G}push([[:space:]]|$)"; then
  if printf '%s' "$cmd" | grep -qE '(:main|[[:space:]]main)([[:space:]]|$)'; then to_main=1; fi
  # 인자 없는 push 가 main 에서 나가면 그것도 main 이다
  if [ "$branch" = "main" ]; then to_main=1; fi
fi
if [ "$to_main" = 1 ]; then
  if printf '%s' "$cmd" | grep -qE '[[:space:]](-f|--force|--force-with-lease[^[:space:]]*|--force-if-includes|--delete|-d)([[:space:]]|$)|[[:space:]]\+[^[:space:]]*:main([[:space:]]|$)|[[:space:]]:main([[:space:]]|$)'; then
    deny "main 으로 강제 푸시·삭제는 하지 않습니다. 되돌릴 것이 있으면 브랜치에서 git revert 로 새 커밋을 만들어 머지하세요."
  fi
  dups=$(ls "$dir/migrations" 2>/dev/null | grep -E '^[0-9]+_' | cut -d_ -f1 | sort | uniq -d | grep -v '^0011$' | tr '\n' ' ')
  if [ -n "$dups" ]; then
    deny "마이그레이션 번호가 겹칩니다: $dups— 이대로 main 에 올리면 프로덕션 빌드가 깨집니다(2026-09-07 실사고). 늦게 만든 파일을 디렉터리 최대 번호 + 1 로 바꾸고 다시 푸시하세요."
  fi
fi

exit 0

#!/bin/bash
# make-sandbox.sh — generate a macOS sandbox profile for one AI coding agent.
#
#   usage: make-sandbox.sh <claude|codex|grok|kimi|deepseek|antigravity|none> > agent.sb
#          sandbox-exec -f agent.sb <the agent command>
#
# Policy: allow everything by default, then deny every credential store on the
# machine, then re-allow ONLY the one credential the named agent needs to run.
# SBPL is last-match-wins, so the order of the three blocks below is the policy.
set -euo pipefail
AGENT="${1:-none}"
H="$HOME"

# Extra paths to block, colon-separated. Put your work repos and secret dirs here.
#   EXTRA_DENY="$HOME/code/work-repo:$HOME/Documents/private" make-sandbox.sh claude
EXTRA_DENY="${EXTRA_DENY:-}"

extra_rules=""
if [ -n "$EXTRA_DENY" ]; then
  IFS=':' read -ra paths <<< "$EXTRA_DENY"
  for p in "${paths[@]}"; do
    [ -n "$p" ] && extra_rules="$extra_rules
  (subpath \"$p\")"
  done
fi

cat <<EOF
(version 1)
(allow default)

;; ---- 1. deny every credential store and private data on this machine ----
(deny file-read* file-write*
  (subpath "$H/.ssh")
  (subpath "$H/.aws")
  (subpath "$H/.gnupg")
  (subpath "$H/.docker")
  (subpath "$H/.kube")
  (subpath "$H/.config/gh")
  (subpath "$H/Library/Keychains")
  (subpath "$H/Library/Application Support/Google/Chrome")
  (subpath "$H/Library/Application Support/Firefox")
  (literal "$H/.netrc")
  (literal "$H/.npmrc")
  (literal "$H/.pypirc")
  ;; every agent CLI's own home, including the one we are about to run
  (subpath "$H/.claude")
  (subpath "$H/.codex")
  (subpath "$H/.grok")
  (subpath "$H/.kimi-code")
  (subpath "$H/.reasonix")
  (subpath "$H/.gemini")
  (subpath "$H/.cache/antigravity")
  (literal "$H/.claude.json")
  ;; any .env anywhere under \$HOME
  (regex #"^$H/.*/\.env\$")
  (regex #"^$H/.*/\.env\..*\$")$extra_rules)

EOF

# ---- 2. re-allow ONLY this agent's own credential (last match wins) ----
case "$AGENT" in
  claude)
    echo ";; ---- 2. claude's own auth, minus the operator's private context ----"
    echo "(allow file-read* file-write* (subpath \"$H/.claude\") (literal \"$H/.claude.json\"))"
    echo ";; Claude Code's token lives in login.keychain-db. SBPL is file-level and that one"
    echo ";; file holds every keychain item, so this grants READ of the whole login keychain."
    echo ";; Read-only: the agent cannot modify or delete credentials. See docs/SANDBOX-MACOS.md."
    echo "(allow file-read* (subpath \"$H/Library/Keychains\"))"
    echo "(deny file-read* (literal \"$H/.claude/CLAUDE.md\") (subpath \"$H/.claude/skills\") (subpath \"$H/.claude/projects\") (subpath \"$H/.claude/history\"))"
    ;;
  codex)
    echo ";; ---- 2. codex's own auth ----"
    echo "(allow file-read* file-write* (subpath \"$H/.codex\"))"
    echo "(deny file-read* (subpath \"$H/.codex/history\"))"
    ;;
  grok)
    echo ";; ---- 2. grok needs its dir for the binary + MCP config; token stays denied ----"
    echo "(allow file-read* file-write* process-exec (subpath \"$H/.grok\"))"
    echo "(deny file-read* (literal \"$H/.grok/auth.json\"))"
    ;;
  kimi)
    echo ";; ---- 2. kimi's own home (binary lives here too) ----"
    echo "(allow file-read* file-write* process-exec (subpath \"$H/.kimi-code\"))"
    ;;
  deepseek)
    echo ";; ---- 2. reasonix reads its key from its own .env, not the environment ----"
    echo "(allow file-read* file-write* (subpath \"$H/.reasonix\"))"
    ;;
  antigravity)
    echo ";; ---- 2. antigravity's own cache + keychain (its session lives there) ----"
    echo "(allow file-read* file-write* process-exec (subpath \"$H/.cache/antigravity\") (subpath \"$H/.local/bin\"))"
    echo "(allow file-read* (subpath \"$H/Library/Keychains\"))" ;;
  none) echo ";; ---- 2. no agent credential re-allowed ----" ;;
  *) echo "unknown agent: $AGENT" >&2; exit 1 ;;
esac

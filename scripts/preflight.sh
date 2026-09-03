#!/bin/bash
# preflight.sh — prove an agent can reach the model AND drive a browser before a run.
#
#   usage: BASE_URL=http://localhost:3000 ./preflight.sh <agent|all>
#
# A blind agent still produces a confident report, so a run that skips this
# measures the setup, not the agent. Exits non-zero if any agent fails.
set -uo pipefail
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${BASE_URL:-http://localhost:3000}"
TIMEOUT="${TIMEOUT:-420}"   # cold npx fetch + browser launch is slow the first time
AGENTS=("${1:-all}")
[ "${AGENTS[0]}" = "all" ] && AGENTS=(claude codex grok kimi deepseek)

# The app must be up or every agent fails for the same uninteresting reason.
code=$(curl -sS -o /dev/null -m5 -w '%{http_code}' "$BASE_URL/" 2>/dev/null)
[ "$code" = "200" ] || { echo "app not answering 200 at $BASE_URL (got '$code')" >&2; exit 1; }

# Ask for the page title. Getting it right requires a working model AND a working browser.
EXPECT="$(curl -sS -m5 "$BASE_URL/" | sed -n 's/.*<title>\([^<]*\)<\/title>.*/\1/p' | head -1 | tr -d '\r')"
[ -n "$EXPECT" ] || { echo "could not read a <title> from $BASE_URL to check against" >&2; exit 1; }
PROMPT="Use the playwright browser tool to open $BASE_URL and reply with ONLY the page title, nothing else."

PW_CFG="$REPO/scripts/pw-mcp.json"
cat > "$PW_CFG" <<'JSON'
{ "mcpServers": { "playwright": { "command": "npx",
  "args": ["-y","@playwright/mcp@latest","--headless","--isolated","--no-sandbox"] } } }
JSON

mkdir -p /tmp/pw; export PWTEST_SOCKETS_DIR=/tmp/pw
cap() { perl -e 'alarm shift; exec @ARGV' "$TIMEOUT" "$@" 2>&1; }

echo "expecting the title: \"$EXPECT\""
fail=0
for a in "${AGENTS[@]}"; do
  printf '  %-9s %-22s ' "$a" "$(bash "$REPO/scripts/model-of.sh" "$a")"
  case "$a" in
    claude)   out=$(cap claude -p "$PROMPT" --strict-mcp-config \
                --mcp-config "$PW_CFG" --permission-mode bypassPermissions </dev/null) ;;
    codex)    out=$(cap codex exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox \
                -c 'mcp_servers.playwright.command="npx"' \
                -c 'mcp_servers.playwright.args=["-y","@playwright/mcp@latest","--headless","--isolated","--no-sandbox"]' \
                "$PROMPT" </dev/null) ;;
    grok)     out=$(cap grok -p "$PROMPT" --always-approve --no-plan </dev/null) ;;
    kimi)     out=$(cap "$HOME/.kimi-code/bin/kimi" -p "$PROMPT" </dev/null) ;;
    deepseek) out=$(cap reasonix -p "$PROMPT" </dev/null) ;;
    *) echo "unknown agent"; fail=1; continue ;;
  esac
  if printf '%s' "$out" | grep -qF "$EXPECT"; then
    echo "ok - drove the browser and read \"$EXPECT\""
  else
    fail=1
    if printf '%s' "$out" | grep -qiE 'alarm|^$'; then :; fi
    echo "FAILED"
    diag=$(printf '%s\n' "$out" | grep -iE 'error|not found|denied|unauthor|missing|refused|timed out' | head -2)
    # no recognisable error usually means it was still working when the clock ran out
    [ -z "$diag" ] && diag=$(printf '%s\n' "$out" | tail -3)
    [ -z "$diag" ] && diag="no output - probably hit the ${TIMEOUT}s timeout. Raise TIMEOUT and retry."
    printf '%s\n' "$diag" | sed 's/^/               /'
  fi
done
[ $fail -eq 0 ] && echo "all agents ready" || echo "at least one agent cannot run - fix before comparing" >&2
exit $fail

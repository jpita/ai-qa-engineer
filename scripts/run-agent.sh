#!/bin/bash
# run-agent.sh — run one AI coding agent against a running app with the QA skill,
# inside a macOS sandbox that blocks every credential except the agent's own.
#
#   usage: BASE_URL=http://localhost:3000 ./run-agent.sh <claude|codex|grok|kimi|deepseek>
#
# env:
#   BASE_URL     the running app to test          (default http://localhost:3000)
#   APP_NAME     name shown in the report         (default "app")
#   OUT_DIR      where findings + report land     (default ./runs/<agent>)
#   SKILL_FILE   the skill to inline              (default <repo>/SKILL.md)
#   EXTRA_DENY   extra paths to block, colon-separated
#   NO_SANDBOX=1 skip the sandbox (see docs/QUICKSTART.md)
set -uo pipefail
AGENT="${1:?usage: run-agent.sh <claude|codex|grok|kimi|deepseek|antigravity>}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE_URL="${BASE_URL:-http://localhost:3000}"
APP_NAME="${APP_NAME:-app}"
OUT_DIR="${OUT_DIR:-$REPO/runs/$AGENT}"
SKILL_FILE="${SKILL_FILE:-$REPO/SKILL.md}"

# The model pin lives in one file: scripts/models.env. It is sent explicitly with
# -m/--model to every CLI call below. Never rely on a CLI's own default — it can
# change between two runs with no warning, which breaks a comparison silently.
case "$AGENT" in
  claude|codex|grok|kimi|deepseek|antigravity) ;;
  *) echo "unknown agent: $AGENT" >&2; exit 1 ;;
esac
# shellcheck source=scripts/models.env
. "$REPO/scripts/models.env"
case "$AGENT" in
  claude)      MODEL="$MODEL_CLAUDE" ;;
  codex)       MODEL="$MODEL_CODEX" ;;
  grok)        MODEL="$MODEL_GROK" ;;
  kimi)        MODEL="$MODEL_KIMI" ;;
  deepseek)    MODEL="$MODEL_DEEPSEEK" ;;
  antigravity) MODEL="$MODEL_ANTIGRAVITY" ;;
esac
[ -n "$MODEL" ] || { echo "no model set for $AGENT in scripts/models.env" >&2; exit 1; }
MODEL_LABEL="$MODEL"

mkdir -p "$OUT_DIR"
log(){ echo "[$(date +%H:%M:%S)] $AGENT: $*"; }

# The app must already be up. A run against a dead app produces a confident empty report.
code=$(curl -sS -o /dev/null -m5 -w '%{http_code}' "$BASE_URL/" 2>/dev/null)
[ "$code" = "200" ] || { echo "app not answering 200 at $BASE_URL (got '$code'). Start it first." >&2; exit 1; }
log "app up at $BASE_URL"

# The skill is INLINED, not pointed at. A path is a file the agent may or may not read;
# inlining makes every agent receive byte-identical instructions.
SKILL="$(cat "$SKILL_FILE")"
TASK="Follow the QA skill below EXACTLY. Target the running app at BASE_URL: $BASE_URL
Use plain HTTP for the API layer and the Playwright MCP browser for the UI layer.
You are running as model: $MODEL_LABEL
FIND functional bugs (do not write or run regression specs; that is the optional later stage).
Write findings.json and coverage.json in the current directory, in the shapes the skill describes -- capture a screenshot per bug and record the API calls as the skill requires.
Then do the skill's Stage 5: build the single self-contained bug-report HTML, named with the timestamp and the model label \"$MODEL_LABEL\", for app \"$APP_NAME\".
When findings.json, coverage.json and the bug-report HTML are written, stop.

===== SKILL =====
$SKILL"

# Every agent must have the SAME browser tool or the run measures the tooling.
# Only claude takes an MCP config per invocation. codex, grok, kimi and deepseek read
# their own config files, so wire those up first (see docs/QUICKSTART.md step 1).
# --no-sandbox is required: Chromium's own sandbox cannot nest inside sandbox-exec.
PW_CFG="$REPO/scripts/pw-mcp.json"
cat > "$PW_CFG" <<'JSON'
{ "mcpServers": { "playwright": { "command": "npx",
  "args": ["-y","@playwright/mcp@latest","--headless","--isolated","--no-sandbox"] } } }
JSON

if [ "${NO_SANDBOX:-0}" = "1" ]; then
  SANDBOX=""
  log "WARNING: running WITHOUT sandbox"
else
  SBP="$OUT_DIR/sandbox.sb"
  EXTRA_DENY="${EXTRA_DENY:-}" bash "$REPO/scripts/make-sandbox.sh" "$AGENT" > "$SBP"
  SANDBOX="sandbox-exec -f $SBP"
  log "sandboxed with $SBP"
fi

# macOS caps unix socket paths at 104 chars; some CLIs build a long MCP state path.
mkdir -p /tmp/pw; export PWTEST_SOCKETS_DIR=/tmp/pw

log "run start ($MODEL_LABEL)"
START=$(date +%s)
cd "$OUT_DIR" || exit 1
case "$AGENT" in
  claude)
    $SANDBOX claude -p "$TASK" --model "$MODEL" \
      --strict-mcp-config --mcp-config "$PW_CFG" \
      --permission-mode bypassPermissions --add-dir "$REPO" > run.log 2>&1 < /dev/null ;;
  codex)
    $SANDBOX codex exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox \
      -m "$MODEL" "$TASK" > run.log 2>&1 < /dev/null ;;
  grok)
    # grok reads XAI_API_KEY from the environment; its stored session token stays denied.
    $SANDBOX grok -p "$TASK" -m "$MODEL" --always-approve --no-plan > run.log 2>&1 < /dev/null ;;
  kimi)
    $SANDBOX "$HOME/.kimi-code/bin/kimi" -p "$TASK" -m "$MODEL" > run.log 2>&1 < /dev/null ;;
  deepseek)
    $SANDBOX reasonix -p "$TASK" --model "$MODEL" -y > run.log 2>&1 < /dev/null ;;
  antigravity)
    $SANDBOX "$HOME/.local/bin/agy" -p "$TASK" --model "$MODEL" --effort "$ANTIGRAVITY_EFFORT" \
      --dangerously-skip-permissions > run.log 2>&1 < /dev/null ;;
esac
log "run done in $(( $(date +%s) - START ))s"

F=$([ -f "$OUT_DIR/findings.json" ] && echo yes || echo NO)
C=$([ -f "$OUT_DIR/coverage.json" ] && echo yes || echo NO)
R=$(ls "$OUT_DIR"/bug-report-*.html 2>/dev/null | tail -1)
log "findings.json=$F coverage.json=$C report=${R:-NONE}"

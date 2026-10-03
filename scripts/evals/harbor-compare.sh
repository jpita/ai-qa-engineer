#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/../.."
# Public defaults are independent of the operator's personal CLI catalog.
MODEL_CLAUDE="${MODEL_CLAUDE:-claude-haiku-4-5-20251001}"
MODEL_CODEX="${MODEL_CODEX:-gpt-6-luna}"
# Harbor supports explicit subscription auth for Codex. Never copy whole homes.
if [[ -z "${OPENAI_API_KEY:-}" && -f "${CODEX_AUTH_JSON_PATH:-$HOME/.codex/auth.json}" ]]; then
  export CODEX_AUTH_JSON_PATH="${CODEX_AUTH_JSON_PATH:-$HOME/.codex/auth.json}"
fi
if [[ -z "${ANTHROPIC_API_KEY:-}" && -z "${CLAUDE_CODE_OAUTH_TOKEN:-}" ]]; then
  echo 'Claude in Harbor needs ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN in your shell.' >&2
  echo 'For subscription auth, run claude setup-token, then export CLAUDE_CODE_OAUTH_TOKEN securely.' >&2
  exit 1
fi
if [[ -z "${OPENAI_API_KEY:-}" && -z "${CODEX_AUTH_JSON_PATH:-}" ]]; then
  echo 'Codex needs OPENAI_API_KEY or CODEX_AUTH_JSON_PATH pointing to its auth.json.' >&2
  exit 1
fi
npm run harbor:prepare
export MODEL_CLAUDE MODEL_CODEX
node --input-type=module - <<'JS'
import { writeFileSync } from 'node:fs';
writeFileSync('runs/harbor/compare.json', JSON.stringify({
  jobs_dir: process.cwd() + '/runs/harbor/jobs',
  n_attempts: 3,
  n_concurrent_trials: 1,
  datasets: [{path: process.cwd() + '/runs/harbor/tasks'}],
  agents: [
    {name: 'claude-code', model_name: 'anthropic/' + process.env.MODEL_CLAUDE, kwargs: {version: '2.1.287'}},
    {name: 'codex', model_name: 'openai/' + process.env.MODEL_CODEX, kwargs: {version: '0.160.0'}},
  ],
}, null, 2));
JS
exec harbor run -c runs/harbor/compare.json "$@"

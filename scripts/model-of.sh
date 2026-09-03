#!/bin/bash
# model-of.sh <agent> — print the model an agent's CLI will actually use.
# Read from each CLI's own config so the harness never labels a report with a
# model that did not run. Empty output means the CLI decides at run time.
case "$1" in
  claude)
    m=$(sed -n 's/.*"model"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$HOME/.claude/settings.json" 2>/dev/null | head -1)
    echo "${m:-default}" ;;
  codex)
    m=$(sed -n 's/^model[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' "$HOME/.codex/config.toml" 2>/dev/null | head -1)
    e=$(sed -n 's/^model_reasoning_effort[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' "$HOME/.codex/config.toml" 2>/dev/null | head -1)
    echo "${m:-default}${e:+-$e}" ;;
  grok)
    m=$(sed -n 's/^[[:space:]]*model[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' "$HOME/.grok/config.toml" 2>/dev/null | head -1)
    echo "${m:-default}" ;;
  kimi)
    m=$(sed -n 's/^default_model[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' "$HOME/.kimi-code/config.toml" 2>/dev/null | head -1)
    echo "${m##*/}" ;;
  deepseek)
    m=$(sed -n 's/^default_model[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' "$HOME/.reasonix/config.toml" 2>/dev/null | head -1)
    echo "${m:-default}" ;;
  antigravity)
    m=$(sed -n 's/.*"model"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$HOME/.cache/antigravity/config.json" 2>/dev/null | head -1)
    echo "${m:-default}" ;;
  *) echo "unknown" ;;
esac

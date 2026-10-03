# Quickstart

Point an agent at a running app, get back a bug report with screenshots and repro steps.

## Choose a workflow

| Goal | Start here |
| --- | --- |
| Test your own app and produce a full QA report | Follow this guide below. |
| Check the eval without calling a model | Install the repo dependencies and Playwright Chromium, then run `npm run eval:demo`. See [EVALS.md](EVALS.md). |
| Score a local agent on the broken/fixed QA tasks | [Local eval runner](EVALS.md#run-a-real-agent). |
| Compare Claude Code and Codex in fresh Docker containers | [Harbor setup and comparisons](HARBOR.md). |

## Requirements

- Node 20+
- An agent CLI you are logged into. Claude Code, Codex, Grok, Kimi, DeepSeek (the `reasonix` CLI), Antigravity (`agy`) and Copilot can use the skill — it is plain markdown.
- A real browser. The full-site commands below use Playwright MCP; the focused evals execute Playwright code directly and do not require MCP setup.
- Docker with Compose v2 if you use `npm run app:up` for Juice Shop. Harbor additionally needs Buildx and the [pinned Harbor runner](HARBOR.md#setup). The local eval needs no Docker.
- This repo cloned with `npm install` run in it, if you want the `npm run *` helpers.

## 1. Wire the browser

```bash
claude   mcp add playwright -- npx -y @playwright/mcp@latest --headless --isolated
codex    mcp add playwright -- npx -y @playwright/mcp@latest --headless --isolated
reasonix mcp add playwright -- npx -y @playwright/mcp@latest --headless --isolated
agy      mcp add playwright npx -y @playwright/mcp@latest --headless --isolated
```

Grok and Kimi read JSON instead (`~/.kimi-code/mcp.json`):

```json
{ "mcpServers": { "playwright": { "command": "npx",
  "args": ["-y", "@playwright/mcp@latest", "--headless", "--isolated"] } } }
```

Confirm with `claude mcp list` before running anything.

## 2. Start a target

Two apps this has been run against. Pick either — the skill is the same. Note where you cloned it; step 3 needs the source path.

| | Stack | Why |
| --- | --- | --- |
| **Conduit** (RealWorld) | React + Express + Sequelize | register, login, articles, comments, follows, favourites. Small enough to read in full |
| **OWASP Juice Shop** | Angular + Express | bigger surface, 100+ routes, one Docker command |

### Juice Shop

```bash
npm run app:up          # docker compose, pinned to v20.2.0, waits for healthy
```

Runs on `:3000`. A committed example run is in [`examples/juice-shop/`](../examples/juice-shop).

### Conduit

```bash
git clone https://github.com/TonyMckes/conduit-realworld-example-app.git conduit
cd conduit && npm install && npm install -w backend sqlite3

cat > backend/.env <<'EOF'
PORT=3001
JWT_KEY=local_dev_only
DEV_DB_DIALECT=sqlite
DEV_DB_STORAGE=./dev.sqlite
EOF
```

Add `storage: process.env.DEV_DB_STORAGE,` to the `development` block of `backend/config/config.js` — the repo does not read it.

```bash
npm run sqlz -- db:migrate
npm run dev                      # frontend :3000, backend :3001
npm run sqlz -- db:seed:all      # second terminal, AFTER the app boots
```

Seed order matters: `backend/index.js` runs `sequelize.sync({ alter: true })` at boot, and that adds the columns the seeders need. Seeding first fails with `table Articles has no column named userId`.

### Either way

Check it answers before running an agent. Pointed at a dead app, the agent produces a confident empty report.

```bash
curl -o /dev/null -w '%{http_code}\n' http://localhost:3000/
```

## 3. Run

Inline the skill. A path is a file the agent may not open; inlining guarantees every agent got identical instructions.

```bash
mkdir -p ~/qa-run && cd ~/qa-run
SKILL="$(cat /path/to/ai-qa-engineer/SKILL.md)"   # wherever you cloned it
APP=http://localhost:3000
SRC=/path/to/the/app/source          # the checkout you are running, or a git URL to clone

TASK="Follow the QA skill below EXACTLY.
The running app is at: $APP
The app source is at: $SRC
Read the source to enumerate every backend route. That count is your coverage denominator.
Use HTTP for the API layer and the Playwright MCP browser for the UI layer.
You are running as model: claude-sonnet-5
Write test-plan.json first, then findings.json and coverage.json here, screenshot each bug, then build the Stage 6 report.

===== SKILL =====
$SKILL"

claude -p "$TASK" --model sonnet --effort xhigh --permission-mode bypassPermissions
```

`--effort xhigh` buys more reasoning per step. A thorough run is long: it reads the
whole codebase and exercises every route, so expect it to keep working for a while.

If the app proxies its API through the frontend port (Conduit does: Vite forwards
`/api` to `:3001`), one URL is enough. If not, tell the agent both.

| CLI | Command |
| --- | --- |
| Codex | `codex exec --skip-git-repo-check --dangerously-bypass-approvals-and-sandbox -m gpt-5.6-terra -c model_reasoning_effort=high "$TASK"` |
| Grok | `grok -p "$TASK" -m grok-4.3 --always-approve --no-plan` |
| Kimi | `~/.kimi-code/bin/kimi -p "$TASK" -m kimi-k2.7-code` |
| DeepSeek | `reasonix -p "$TASK"` |
| Antigravity | `agy -p "$TASK" --dangerously-skip-permissions` |

One-shot is the intended mode.

## Output

| File | Contents |
| --- | --- |
| `test-plan.json` | every test case: steps, expected result, risk, and the result once run |
| `findings.json` | one entry per bug: steps, expected vs observed, API calls, screenshot path |
| `coverage.json` | one row per backend route, with the result or why it could not be tested |
| `bug-report-<timestamp>-<model>.html` | self-contained, screenshots embedded, opens with no server |

The filename carries the timestamp and model so runs stay comparable.

Focused evals instead write `result.json`, `findings.json` and a screenshot per trial, plus runner-generated grades and timing data. They do not create the full-site test plan or bug report. See the [eval output contract](EVALS.md#trial-artifacts).

## Checking the run

Coverage rows must equal the routes the server registers:

```bash
# rough count — catches app.get(...) and router.post(...) in .js and .ts
grep -rhoE '\.(get|post|put|patch|delete|all)\([^,)]*' <dir> \
  --include='*.js' --include='*.ts' | sort -u | wc -l
```

This is a starting number, not the answer. It over-counts chained calls and misses
routes built dynamically. The real denominator comes from reading the route files.

21 rows against 40 routes means half the app was tested.

## Gotchas

| Symptom | Fix |
| --- | --- |
| UI bugs the agent never saw | no browser — check `mcp list` |
| `Target crashed` | add `--no-sandbox` to the MCP args |
| MCP path-length error | `export PWTEST_SOCKETS_DIR=/tmp/pw` (macOS 104-char socket limit) |
| Grok exits clean, no output | add `--always-approve --no-plan` |
| Empty report | curl the URL yourself; the app was probably down |

## Comparing full-site runs

Use [EVALS.md](EVALS.md) or [HARBOR.md](HARBOR.md) for a scored comparison against known broken/fixed behavior. The launcher below collects full-site QA reports for manual comparison; it does not grade them against known answers.

For a run across several agents, `scripts/run-agent.sh` does what step 3 does by
hand, plus a per-agent sandbox (see [SANDBOX-MACOS.md](SANDBOX-MACOS.md)).

```bash
BASE_URL=http://localhost:3000 APP_NAME=conduit ./scripts/run-agent.sh claude
```

The full-site launcher reads model selections from [`scripts/models.env`](../scripts/models.env). Choose IDs supported by your CLI and account, and confirm the model actually served in the logs. Automatic selections and provider aliases are not immutable model versions. Harbor's eval comparison has its own portable defaults and environment overrides, documented in [HARBOR.md](HARBOR.md#compare-agents).

Before a comparison run, prove every agent can actually reach its model and drive
the browser:

```bash
BASE_URL=http://localhost:3000 ./scripts/preflight.sh all
```

It asks each agent for the page `<title>`, which only comes back right with a
working model and a working browser. Run it after any change to `models.env`.

## Warning

Every command here bypasses approval prompts: the agent gets your shell, your permissions, for the length of the run. Fine on a personal machine with a throwaway app. Not fine where `$HOME` holds SSH keys and cloud credentials — see [SANDBOX-MACOS.md](SANDBOX-MACOS.md).

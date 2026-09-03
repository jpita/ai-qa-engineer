# Quickstart

Point an agent at a running app, get back a bug report with screenshots and repro steps.

## Requirements

- Node 20+
- An agent CLI you are logged into. Claude Code, Codex, Grok, Kimi and DeepSeek (the `reasonix` CLI) all work — the skill is plain markdown.
- A Playwright MCP browser wired into it. Not optional; without a browser the agent guesses at the UI from source.
- Docker with Compose v2, only if you use `npm run app:up` for Juice Shop.
- This repo cloned with `npm install` run in it, if you want the `npm run *` helpers.

## 1. Wire the browser

```bash
claude   mcp add playwright -- npx -y @playwright/mcp@latest --headless --isolated
codex    mcp add playwright -- npx -y @playwright/mcp@latest --headless --isolated
reasonix mcp add playwright -- npx -y @playwright/mcp@latest --headless --isolated
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
Write findings.json and coverage.json here, screenshot each bug, then build the Stage 5 report.

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

One-shot is the intended mode.

## Output

| File | Contents |
| --- | --- |
| `findings.json` | one entry per bug: steps, expected vs observed, API calls, screenshot path |
| `coverage.json` | one row per backend route, with the result or why it could not be tested |
| `bug-report-<timestamp>-<model>.html` | self-contained, screenshots embedded, opens with no server |

The filename carries the timestamp and model so runs stay comparable.

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

## Warning

Every command here bypasses approval prompts: the agent gets your shell, your permissions, for the length of the run. Fine on a personal machine with a throwaway app. Not fine where `$HOME` holds SSH keys and cloud credentials — see [SANDBOX-MACOS.md](SANDBOX-MACOS.md).

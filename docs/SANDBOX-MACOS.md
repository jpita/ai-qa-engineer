# Sandboxing agents (macOS)

Run several vendors' agent CLIs against a target app without giving any of them your credentials.

macOS only — the mechanism is `sandbox-exec`. Linux equivalents at the bottom.

## Why

Unattended runs need approvals off:

```bash
claude -p "$TASK" --permission-mode bypassPermissions
codex  exec --dangerously-bypass-approvals-and-sandbox "$TASK"
grok   -p "$TASK" --always-approve
```

That is full shell, your user, your permissions. Benchmark five vendors and five fresh binaries get it, while `$HOME` holds `~/.ssh`, `~/.aws`, `~/.config/gh`, your keychains, every `.env` you have cloned, and each vendor's API key in plaintext (`~/.kimi-code/config.toml`, `~/.reasonix/.env`, `~/.grok/auth.json`). They all have network access.

They also read each other's config. Grok and DeepSeek load `~/.claude/skills/` as their own skills; Codex reads `~/.claude/CLAUDE.md` unprompted. Whatever is in those files goes to that vendor.

## Policy

SBPL is last-match-wins, so the policy is three blocks:

```lisp
(version 1)
(allow default)                    ;; still has to work as a dev tool

(deny file-read* file-write*       ;; every credential on the machine
  (subpath "/Users/you/.ssh")
  (subpath "/Users/you/.aws")
  (subpath "/Users/you/.config/gh")
  (subpath "/Users/you/.claude")   ;; including the agent about to run
  (subpath "/Users/you/.kimi-code")
  (regex #"^/Users/you/.*/\.env$"))

;; hand back one thing: this agent's own credential
(allow file-read* file-write* (subpath "/Users/you/.claude"))
(deny  file-read* (literal "/Users/you/.claude/CLAUDE.md")
                  (subpath "/Users/you/.claude/skills")
                  (subpath "/Users/you/.claude/projects"))
```

Allow by default so the tool still works, then subtract, then hand back the one credential.

## Use

```bash
./scripts/make-sandbox.sh claude > claude.sb
sandbox-exec -f claude.sb claude -p "$TASK" --permission-mode bypassPermissions

EXTRA_DENY="$HOME/code/work-repo:$HOME/Documents/private" \
  ./scripts/make-sandbox.sh kimi > kimi.sb
```

Or `BASE_URL=http://localhost:3000 ./scripts/run-agent.sh claude`, which generates the profile and runs the agent.

## Verify

| Profile | Attempt | Result |
| --- | --- | --- |
| `none` | `ls ~/.ssh` | denied |
| `none` | `cat ~/project/.env` | denied |
| `none` | `ls ~/.config/gh` | denied |
| `none` | `cat ~/code/myapp/index.js` | readable — it still has to code |
| `claude` | `cat ~/.kimi-code/config.toml` | denied |
| `claude` | `cat ~/.claude/CLAUDE.md` | denied |
| `claude` | `cat ~/.claude/settings.json` | readable — its own auth |
| `kimi` | `ls ~/.codex` | denied |
| `kimi` | `ls ~/Library/Keychains` | denied |
| `claude` | `ls ~/Library/Keychains` | **readable, read-only** (see below) |

## Environment bugs

| Bug | Fix |
| --- | --- |
| Chromium cannot nest inside `sandbox-exec` (`Target crashed`) | `--no-sandbox` on the Playwright MCP; it is already inside the outer sandbox |
| Grok's binary lives in `~/.grok`, so a blanket deny gives `execvp() Operation not permitted` | allow the dir with `process-exec`, deny `~/.grok/auth.json` alone |
| Reasonix ignores `DEEPSEEK_API_KEY` in the environment | it reads `~/.reasonix/.env` |
| macOS caps unix socket paths at 104 chars; long MCP state paths fail like a denial | `export PWTEST_SOCKETS_DIR=/tmp/pw` |

## Limits

- **No network isolation.** Anything the agent can read, it can send. This shrinks what it can read.
- **Your source is readable by design.** It has to read the app to test it.
- **`sandbox-exec` is deprecated** (per its man page). Works on macOS 26; no compatibility promise.
- **File-level only.** Does not stop it spending API credits or wrecking the app under test.
- **Not a container.** For a real trust boundary, use a VM.
- **The `claude` profile can read your login keychain.** Claude Code's token lives in `login.keychain-db`, and SBPL is file-level: that one file holds every keychain item, so there is no way to grant the token without granting the file. The grant is read-only, so nothing can be modified or deleted. Every other agent profile denies it outright. If this matters to you, run Claude with an API key in the environment instead and drop the grant.
- **Keys stay in plaintext.** This stops *other* agents reading them; it does not encrypt them.

The sandbox does not cover two things: global instruction files (`CLAUDE.md`, `AGENTS.md`, `.cursorrules`) go to whichever vendor is running, and these binaries are unsandboxed when you use them outside a run.

## Other platforms

| Platform | Mechanism |
| --- | --- |
| Linux | `bubblewrap` (`--ro-bind`, `--tmpfs` over credential dirs), firejail |
| Any | container with only the project dir mounted; or a disposable VM |

Containers are the stronger boundary.

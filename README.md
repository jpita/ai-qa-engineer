# ai-qa-engineer

**An AI agent that tests a web app the way a QA engineer does, and reports only the bugs it proved.**

Give it a running app and its source code.
It reads the code, lists every feature and API route, and tests each one in a real browser.
You get back one HTML bug report: repro steps, screenshots and the exact API calls for every bug.

[![Bug report summary: 11 bugs found in Conduit](docs/images/bug-report-summary.png)](examples/conduit)

<sub>A real run against [Conduit](https://github.com/TonyMckes/conduit-realworld-example-app), the RealWorld demo app: 11 functional bugs, 4 of them high severity, all 21 backend routes covered. [Open the full report](examples/conduit).</sub>

## What makes it different

- **Proof, not guesses.** A bug is reported only if the agent reproduced it live on the running app.
- **Full coverage, with a count.** It counts every route the server registers. Each route gets a result, or a reason it could not be tested.
- **The UI and the API, both.** A green API call does not prove the screen sends that call. It tests both layers.
- **Any agent.** The skill is one Markdown file. It runs on Claude Code, Codex, Grok, Kimi, DeepSeek and Antigravity.

## Every bug comes with evidence

<img src="docs/images/bug-report-card.png" alt="One bug card: steps, API calls, expected, observed, screenshot" width="720">

## Quickstart

```bash
git clone https://github.com/jpita/ai-qa-engineer.git
cd ai-qa-engineer
npm install
npx playwright install chromium
```

Link the skill into Claude Code:

```bash
mkdir -p ~/.claude/skills/ai-qa-engineer
ln -s "$PWD/SKILL.md" ~/.claude/skills/ai-qa-engineer/SKILL.md
```

Run it. The app and the source can each be local or remote:

```
/ai-qa-engineer --url http://localhost:3000 --source ./conduit
/ai-qa-engineer --source https://github.com/juice-shop/juice-shop   # clones, boots, then tests
```

Other agents: paste [SKILL.md](SKILL.md) into the prompt.
Full setup, including the Playwright browser: [Quickstart](docs/QUICKSTART.md).

> [!WARNING]
> The agent runs with your shell and your permissions.
> Run it against a throwaway app, or [sandbox it](docs/SANDBOX-MACOS.md).

## How it works

1. **Read.** It reads the frontend and backend and lists every route. That list is the coverage target.
2. **Test.** For each feature it runs the happy path, bad input, edge cases and a reload check, in a real browser.
3. **Prove.** It keeps only the bugs it reproduced, with a screenshot and the captured requests.
4. **Report.** It writes `findings.json`, `coverage.json` and one self-contained HTML report.

Scope is functional bugs: wrong results, lost data, crashes, bad error handling.
It is not a security scanner.

## Design decisions

**Code for the mechanical work, the agent for judgment.**

| Code | The agent |
| --- | --- |
| crawl the app, record its elements and requests | read the source, find the real API surface |
| join the crawl and the API into a coverage map | rank what to test |
| run the suite, parse the results | write tests at the right layer |
| render the report | decide which failures are real bugs |
| validate every output against a schema | |

An LLM doing the crawl is slow and unreliable.
Code doing the triage gives you the noise most generated test suites are made of.

**Three test layers.**

| Layer | What it does | Best for |
| --- | --- | --- |
| `api` | calls the endpoint directly | bad payloads, missing fields, wrong types |
| `ui` | drives the real browser on the real backend | the flows a user actually does |
| `ui_mocked` | drives the browser, fakes the response | a 500, an empty list, a malformed body |

Every endpoint with a screen in front of it is tested at both the API and the UI layer.
If the plan covers only one, the report says so.

**Triage has four answers.** Each failure is one of: app broken, test broken, environment not ready, or not enough evidence.
Each gets a verdict, the evidence and a confidence level.
`inconclusive` is a valid answer.

**No retries, no invented timeouts.** A retry hides the signal triage needs. A timeout is raised only with a measured number.

**Gaps are reported, not guessed.** If the source does not show whether a field is validated, the report says so.

## Examples

| | What it shows |
| --- | --- |
| [`examples/conduit/`](examples/conduit) | a full skill run: 11 bugs, 21 routes, the HTML report with screenshots |
| [`examples/juice-shop/`](examples/juice-shop) | the script pipeline on [OWASP Juice Shop](https://github.com/juice-shop/juice-shop): UI map, API surface, test plan, generated Playwright specs, triage. An early run: 10 of 102 routes |

## Docs

- [Quickstart](docs/QUICKSTART.md): wire a browser, start a target app, run it, compare agents
- [Sandboxing agents](docs/SANDBOX-MACOS.md): keep an agent away from your credentials on macOS
- [SKILL.md](SKILL.md): the full instructions the agent follows

## License

MIT

# ai-qa-engineer

Point a coding agent at a web app and it will:

- read the frontend and backend, and map every route the server registers
- exercise each one against the running app
- report only the bugs it reproduced, with screenshots, repro steps and the API calls

## Install

```bash
git clone https://github.com/jpita/ai-qa-engineer.git
cd ai-qa-engineer
npm install
npx playwright install chromium
```

For Claude Code, link it in so `/ai-qa-engineer` works:

```bash
mkdir -p ~/.claude/skills/ai-qa-engineer
ln -s "$PWD/SKILL.md" ~/.claude/skills/ai-qa-engineer/SKILL.md
```

For any other agent CLI, inline [SKILL.md](SKILL.md) into the prompt. See the [Quickstart](docs/QUICKSTART.md).

## Target apps

Two that this has been run against:

| Target | Command | Notes |
| --- | --- | --- |
| OWASP Juice Shop | `npm run app:up` | Docker, pinned to v20.2.0, serves on `:3000` |
| Conduit (RealWorld) | see [Quickstart](docs/QUICKSTART.md#2-start-a-target) | Node + SQLite, no Docker |

## Usage

Tell it where the app is and where the code is. Either can be local or remote.

```
/ai-qa-engineer --url http://localhost:3000 --source ~/code/juice-shop
/ai-qa-engineer --source https://github.com/juice-shop/juice-shop     # clones it, boots it
```

The judgment stages run on your existing agent session. The scripts run locally.
Claude Code needs no API key; Grok reads `XAI_API_KEY`, and Kimi and DeepSeek read
keys from their own config files.

## Docs

| | |
| --- | --- |
| [Quickstart](docs/QUICKSTART.md) | wire a browser, boot a target app, run it |
| [Sandboxing agents](docs/SANDBOX-MACOS.md) | stop an agent reading your credentials (macOS) |

---

The rest is how it works and why.

## The split

What is code, and what is judgment.

| Code, deterministic | The skill, judgment |
| --- | --- |
| crawl the app, record every element and XHR | read the source, work out the real API surface |
| join crawl and API surface into a coverage map | write the ranked test plan |
| run the suite, parse the results | write the specs at the right layer |
| render the report | triage every failure |
| validate every artifact against a schema | |

Crawling is not a judgment call, so it is a script.

Deciding whether a failed test is a bug is nothing but judgment, so it is not.

Put an LLM in the first job and it gets slow and unreliable. Put code in the second job and you get the noise most generated test suites are made of.

Every artifact is validated against a Zod schema before the next stage reads it. A malformed plan fails immediately instead of quietly producing bad specs.

## Why three views of the system

Crawling the UI tells you what a user can click. It does not tell you:

- which status codes a handler can return
- which fields it validates
- which endpoints have no UI in front of them at all

| View | From | What only it tells you |
| --- | --- | --- |
| UI map | Playwright crawl | what a user can reach, and which calls each page fires |
| API surface | the server source | every route, its real validation, the codes that genuinely exist |
| Coverage map | both, joined | which screen calls which endpoint |

The coverage map is the useful one. When an endpoint changes, it names the exact screens to regression test.

That list is not the list of changed files. Using changed files instead is how regressions get missed.

## Three test layers

| Layer | What it does | Where it fits |
| --- | --- | --- |
| **api** | call the endpoint directly | negative paths: bad payloads, missing fields, wrong types, unauthorised access |
| **ui** | drive the real browser against the real backend | the flows a user actually performs |
| **ui_mocked** | drive the browser, intercept the call, fake the response | failures the real backend will not produce on demand: a 500, an empty list, a malformed body |

`ui_mocked` reaches error handling you cannot otherwise test. A lot of real UI bugs live there.

### The rule the tool enforces

> A backend endpoint is not verified by calling it yourself. A direct call proves the server handles the payload **the test** chose. It does not prove the application sends that payload.

The frontend can:

- send an old field name
- drop a parameter
- call the wrong route
- never call it on the screen the user is actually on

Every one of those still passes a green direct call.

So every endpoint with a UI caller is covered at both layers. If the plan covers only one, the report names the endpoint and the screens affected. It does not quietly claim coverage it does not have.

## Triage

Generating tests is easy and mostly useless. Run them and you get failures, each one of four things:

1. The app is broken.
2. The test is broken.
3. The environment was not ready.
4. There is not enough evidence to say.

Getting it wrong costs both ways:

- Report a bad test as a product bug and you burn a developer's afternoon.
- Wave a real bug through as flaky and it ships.

So each failure gets a verdict, the evidence behind it, and a confidence level. Three rules:

- A timeout is not automatically a bug. What was the test waiting for, and could it ever have appeared?
- Raising a timeout is never the fix for a broken test. Find what it should have waited on.
- `inconclusive` is a real answer, not a failure to decide.

## Output

**The skill run** writes three things into the working directory:

```
findings.json                        one entry per bug: steps, expected vs observed, calls, screenshot
coverage.json                        one row per route, with the result or why it could not be tested
bug-report-<timestamp>-<model>.html  self-contained, screenshots embedded, opens with no server
```

The filename carries the timestamp and model, so runs from different agents stay comparable.

**The optional script pipeline** (`npm run crawl / coverage / run-specs / report`) writes the intermediate maps and a regression suite:

```
ui-map.json        what the crawl found
api-surface.json   what the source says exists
coverage.json      which screen calls which endpoint  (different shape: see below)
test-plan.json     ranked cases, each with a layer
specs/             generated Playwright tests
results.json       what passed and what did not
triage.json        a verdict and evidence per failure
QA-REPORT.md       the thing a developer reads
```

The two `coverage.json` files are not the same shape. The skill's is one row per route; the pipeline's joins screens to endpoints. Validate with `npm run validate -- --schema route-coverage` and `--schema coverage` respectively.

### Committed examples

| | What it shows |
| --- | --- |
| [`examples/conduit/`](examples/conduit) | a skill run: 11 functional bugs, 21 routes, the bug report with embedded screenshots |
| [`examples/juice-shop/`](examples/juice-shop) | a pipeline run: the maps, the plan, the triage and the generated specs. Covers 10 of 102 routes and predates the functional-bug rewrite, so several findings are access-control issues the skill now puts out of scope |

## Design decisions

**The target runs locally, not on the public internet.**
Default is OWASP Juice Shop in Docker, pinned to a version. A shared public demo makes runs non-reproducible.

**`retries: 0`.**
Retries hide the exact signal triage exists to read. An unstable test is a finding.

**No generated timeouts.**
The default retry window is the answer, unless someone measured that it is not. Then the measured number goes in the comment.

**The source read reports gaps instead of guessing.**
If it cannot tell whether a route validates a field, it says so. It does not invent a rule that becomes a misleading test.

**The report is the product.**
Everything else is scaffolding around one file a developer can act on: steps, expected result, evidence, honest confidence, and what was not covered.

## License

MIT

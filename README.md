# ai-qa-engineer

A coding agent skill that tests a web application the way a quality engineer does: it works out what the system is from three angles, decides what is worth testing, writes the tests at the right layer, runs them, and then decides which failures are real.

Tell it where the app is and where the code is. Either can be local or remote.

```
/ai-qa-engineer --url http://localhost:3000 --source ~/code/juice-shop
/ai-qa-engineer --source https://github.com/juice-shop/juice-shop     # clones it, boots it
```

## Docs

| | |
| --- | --- |
| [Quickstart](docs/QUICKSTART.md) | wire a browser, boot a target app, run it |
| [Sandboxing agents](docs/SANDBOX-MACOS.md) | stop an agent reading your credentials (macOS) |

[SKILL.md](SKILL.md) is plain markdown. Inline it into any agent's prompt.

## The split

The interesting design choice is what is code and what is not.

| Code, deterministic | The skill, judgment |
| --- | --- |
| crawl the app, record every element and XHR | read the source, work out the real API surface |
| join crawl and API surface into a coverage map | write the ranked test plan |
| run the suite, parse the results | write the specs at the right layer |
| render the report | triage every failure |
| validate every artifact against a schema | |

Crawling is not a judgment call, so it is a script. Deciding whether a failed test is a bug is nothing but judgment, so it is not. Putting an LLM in the first job makes it slow and unreliable; putting code in the second job is why most generated test suites are noise.

Every artifact the skill writes is validated against a Zod schema before the next stage reads it, so a malformed plan fails immediately instead of silently producing bad specs.

## Why three views of the system

Crawling the UI tells you what a user can click. It does not tell you which status codes a handler can return, which fields it validates, or which endpoints have no UI in front of them at all.

| View | From | What only it tells you |
| --- | --- | --- |
| UI map | Playwright crawl | what a user can reach, and which calls each page fires |
| API surface | the server source | every route, its real validation, the codes that genuinely exist |
| Coverage map | both, joined | which screen calls which endpoint |

The coverage map is the useful one. When an endpoint changes it tells you exactly which screens to regression test, and that list is not the same as the list of changed files. Using changed files instead is how regressions get missed.

## Three test layers

**api** — call the endpoint directly. Cheap, fast, and where negative paths belong: bad payloads, missing fields, wrong types, unauthorised access.

**ui** — drive the real browser against the real backend.

**ui_mocked** — drive the browser, but intercept the call and return a failure the real backend will not produce on demand: a 500, an empty list, a malformed body. This reaches the error handling you otherwise cannot test, and that is where a lot of real UI bugs live.

### The rule the tool enforces

> A backend endpoint is not verified by calling it yourself. A direct call proves the server handles the payload **the test** chose. It does not prove the application sends that payload.

The frontend can send an old field name, drop a parameter, call the wrong route, or never call it on the screen the user is actually on. Every one of those still passes a green direct call.

So every endpoint with a UI caller must be covered at both layers. If the plan covers only one, the report names the endpoint and the screens affected. It does not quietly claim coverage it does not have.

## Triage

Generating tests is easy and mostly useless. The moment you run them you get failures, and each is one of four things: the app is broken, the test is broken, the environment was not ready, or there is not enough evidence to say.

Getting it wrong costs in both directions. Report a bad test as a product bug and you burn a developer's afternoon. Wave a real bug through as flaky and it ships.

So each failure gets a verdict, the evidence behind it, and a confidence level. Three rules it triages under:

- A timeout is not automatically a bug. What was the test waiting for, and could it ever have appeared?
- Raising a timeout is never the fix for a broken test. Find what it should have waited on.
- `inconclusive` is a real answer, not a failure to decide.

## Output

```
artifacts/<run>/
  ui-map.json        what the crawl found
  api-surface.json   what the source says exists
  coverage.json      which screen calls which endpoint
  test-plan.json     ranked cases, each with a layer
  specs/             generated Playwright tests
  results.json       what passed and what did not
  triage.json        a verdict and evidence per failure
  QA-REPORT.md       the thing a developer reads
```

A full example run against Juice Shop is committed under [`examples/juice-shop/`](examples/juice-shop).

## Design decisions

**The target runs in Docker, not on the public internet.** Default is OWASP Juice Shop pinned to a version. A shared public demo makes runs non-reproducible, and a flaky suite proves nothing about anything.

**`retries: 0`.** Retries hide the exact signal triage exists to read. An unstable test is a finding.

**No generated timeouts.** The skill is told never to emit one. The default retry window is the answer unless someone has measured that it is not, and then the measured number goes in the comment.

**The source read reports gaps instead of guessing.** If it cannot tell whether a route validates a field, it says so rather than inventing a rule that becomes a misleading test.

**The report is the product.** Everything else is scaffolding around one file a developer can act on: steps, expected result, evidence, honest confidence, and what was not covered.

## Setup

```bash
npm install
npx playwright install chromium
npm run app:up
```

Then run the skill from Claude Code. No API key: the judgment stages run on your existing Claude Code session, the scripts run locally.

## License

MIT

---
name: ai-qa-engineer
description: Test a running web app the way a QA engineer would and find FUNCTIONAL bugs — features that do the wrong thing, break, miscalculate, lose data, or handle errors badly. Reads the frontend and backend, maps every feature and route, exercises each one (happy path, negative path, edge cases, regression) against the running app, and reports only bugs reproduced with evidence. Not a security tool. Use when asked to test a web app, find bugs, or produce a QA report.
user-invocable: true
---

# ai-qa-engineer

Test whether the application's features actually work. Find functional bugs and report them with proof.

## Scope: functional bugs, NOT security

This skill looks for features that behave wrongly for a normal user. It is not a penetration test.

- **In scope:** a feature that does the wrong thing, gives a wrong result, miscalculates, loses or corrupts data, breaks a workflow, crashes, shows a wrong or blank screen, accepts input it should reject, rejects input it should accept, or handles an error badly.
- **Out of scope:** SQL injection, XSS, XXE, SSRF, auth bypass, and other exploits. Do not craft attack payloads. If you happen to notice a security issue while testing a feature normally, note it in one line under a separate "security, not verified" list and move on. Do not pursue it. The job is whether the features work.

Think like a careful user and a careful tester, not an attacker.

## The rule above every stage: aim for 100%

Get a feel for the whole application, not a sample. Coverage and thoroughness beat speed.

- Read the whole codebase, frontend and backend. Enumerate every feature a user can reach and every backend route the server registers. That list is your denominator.
- Exercise every feature and route against the running app. Reading the code is never enough on its own — a bug only counts if you reproduced it live.
- Account for everything. `coverage.json` has one row per route; a route you could not test is recorded with the reason, never dropped silently.
- Finding a few bugs is not a reason to stop. Stop when the whole map is covered.
- If a request crashes the server, that is a finding. Note it, restart the instance, and keep going. A crash never ends the pass.

## What to test on every feature

For each feature and route, run the cases that apply:

1. **Happy path** — the normal use. Does it do what it is supposed to, with a correct result?
2. **Negative path** — bad or missing input: empty fields, missing required fields, the wrong type, a number where text is expected and vice versa, an id that does not exist, a value out of range (negative quantity, zero, a huge number), a malformed date. Does it reject cleanly with a helpful message, or does it crash, miscalculate, or silently accept?
3. **Edge and boundary** — empty lists, the first and last item, duplicates, very long input, special characters in a normal field (an apostrophe in a name), submitting the same thing twice, doing steps out of order.
4. **State and persistence** — does the change actually save? Reload the page, open a new tab, log in again: is the data still right? Is a total recalculated correctly after an edit?
5. **Correct user's data** — if a feature is meant to show one user's own data (their basket, their orders, their profile), confirm it shows the right data for the logged-in user and updates when they change it. (This is functional correctness — that the feature works for its owner — not an attempt to break into another account.)
6. **Regression** — anything a change touched that used to work. If testing a PR, focus here.

Chase the odd detail. The bug is usually the small thing that looked slightly wrong and got waved through, not the obvious happy path.

## Testing technique (borrowed from our own QA practice)

- **A DOM node is not a pixel. Check what is actually painted before reporting a visual bug.** `querySelectorAll` counts hidden nodes, and `innerText` on a `display:none` element still returns its text, so a hidden skeleton or an unmounted menu reads as present. For any claim about what the user sees, take a screenshot and look, or check `getBoundingClientRect()` (non-zero size) and `getComputedStyle` (`display`, `visibility`, `opacity`). Do not write up a screen state you have not actually seen painted.
- **Test the feature from the UI, not only the endpoint.** A direct API call proves the server handles the payload YOU chose. It does not prove the app sends that payload on the screen the user is on. If a feature has a UI, drive the UI and read the real request it fires; the app can send the wrong field, the wrong value, or nothing at all, and a green curl hides all of it.
- **A "successful" click can be a silent no-op.** A click the browser reports as done can land on a disabled or covered element and do nothing. Never treat a passing command as proof the effect happened; check for the effect (the row appeared, the total changed, the request fired).
- **Playwright MCP gotcha:** a `page.on('response', ...)` listener does not survive between separate tool calls. To inspect the calls an action made, use the network-requests tool immediately after the action, not a listener set up in a prior call.
- **A refactor or migration is never "nothing to test".** It changes what the user sees and can regress. Regression is the whole point of testing one.

## Required tooling: eyes on the UI, not just the API

Every agent in a run must have the SAME tools, or the comparison measures the setup, not the agent. Testing frontend features needs a real browser. A **Playwright MCP server** (or equivalent) is required, not optional:

- Backend routes: plain HTTP (curl/fetch).
- Frontend features: drive a real browser — navigate, click, type, read what the user actually sees. An agent with no browser can only guess at the UI from code, which is not testing it.
- Provision the browser tool for every agent and confirm it (`<cli> mcp list`).

## Inputs

- `--url` the running app. Required.
- `--source` local path to the app source (frontend and backend). The running app is a checkout on disk; point at that. Without it you cannot enumerate the routes, so coverage is guesswork; say so in the report.
- `--pr` a GitHub pull request URL. Aims the run at the risk that change introduced (regression focus).

Work in the current directory. Write the output files there.

## Tools every run uses

The methodology is what matters, not the exact tool:

- **API layer** — any HTTP client (`curl`, `fetch`).
- **UI layer** — a real browser via Playwright MCP (required, see above).
- **The `npm run *` helpers live in `~/code/ai-qa-engineer`** (`crawl`, `coverage`, `run-specs`, `report`, `validate`) and are available to any agent: `cd ~/code/ai-qa-engineer && npm run crawl -- --url <target>`. They are an OPTIONAL accelerator for the mechanical steps. If you prefer, do the same work by hand with HTTP and the browser. The output is identical.

---

## Stage 1 — Map the app

Read the frontend and backend and produce two maps:

- **Feature list** — every user-facing feature (register, login, create X, edit X, delete X, search, checkout, etc.) and the page it lives on.
- **Route list** — every backend route the server registers. Read the entry file plus every handler. Enumerate ALL of them; the count is your denominator. A quick way to get the full count before reading handlers, adapt to the framework:

```bash
grep -roE "app\.(get|post|put|delete|patch)\(\s*'[^']*'" <entry file> | sort -u | wc -l
```

Also crawl the running UI: every page, its controls, and the API calls each page fires (method, path, status). Most apps are single-page apps, so follow hash routes (`#/x`) and `routerLink` targets, log in and crawl again for pages behind auth.

Write `ui-map.json` (pages, elements, observed calls) and `api-surface.json` (one entry per route: method, path, what it does, required fields, the status codes the handler can really return, whether it needs auth). Do not invent a status code or a validation rule you did not read in the handler; leave it blank and note the gap.

## Stage 2 — Coverage map

Produce `coverage.json`: one row per backend route, saying which UI pages call it and which frontend files reference it. This is the denominator. Any observed call that matches no known route is either a route you missed or a third party — check before accepting it.

## Stage 3 — Test every feature

Go feature by feature and route by route, running the cases from "What to test" above against the running app. For a real user flow, drive it in the browser; for direct API behaviour, use HTTP.

A bug counts only if you reproduced it live. Capture the evidence as you go:

- **Screenshot every bug.** The moment you see a bug on screen, take a screenshot with the browser tool and save it to a file. Put that file path in the finding's `screenshot` field. For an API-only bug with no screen, screenshot is optional.
- **Record the exact calls.** For an API bug, put the request(s) and response(s) in the finding's `calls` field (method, path, headers, body, status, response body). These are also the replication steps.
- Also record the human `reproduction` steps and the `expected` vs `observed`.

## Stage 4 — Report

Write two files.

`findings.json`:
```
{ "findings": [ {
  "title": "short description of the wrong behaviour",
  "feature": "the feature it belongs to",
  "endpoint": "METHOD /path or the UI page",
  "severity": "high | medium | low",
  "reproduction": "the exact steps or request",
  "calls": ["METHOD /path -> status, and the request/response detail (API bugs)"],
  "screenshot": "relative/path/to/screenshot.png (the wrong screen; omit for pure API bugs)",
  "observed": "what actually happened, with status code / screen state",
  "expected": "what should have happened"
} ] }
```

`coverage.json` (from stage 2), one row per route:
```
{ "coverage": [ {
  "route": "METHOD /path",
  "feature": "which feature",
  "cases": ["happy","negative","edge","persistence"],
  "result": "ok | bug (see findings) | could not test: <reason>"
} ] }
```

The number of coverage rows must equal the number of routes the server registers. Fewer means you missed routes; go back to Stage 1.

## Stage 5 — Build the bug report (required)

Turn `findings.json` into ONE self-contained HTML file: a card per bug, each with its severity, steps to replicate, the API calls (for API bugs), expected vs observed, and the embedded screenshot. The file must be standalone (screenshots embedded as data URIs, no external files) so it opens locally with no server.

The filename MUST carry the date, timestamp and the model that ran it, so reports can be compared later:
`bug-report-<YYYY-MM-DDTHH-MM-SS>-<model>.html`

You build this yourself. The generator is provided:

```
cd ~/code/ai-qa-engineer && npm run bug-report -- \
  --findings <path>/findings.json --model "<the model label you were told you are running as>" \
  --app "<app name>" --url "<target url>" --out <path>
```

It embeds the screenshots, sorts by severity, and writes the correctly named file. If for any reason you cannot run it, build the same single HTML file by hand to the same spec (one card per bug, screenshot embedded as a data URI, filename with timestamp and model).

## Optional Stage 6 — Build a regression suite

Only when asked to leave behind automated tests. Turn each confirmed bug and each key happy path into a Playwright spec:

- **api** cases: `test("...", async ({ request }) => ...)`, assert status and body shape.
- **ui** cases: role/text locators (`getByRole`, `getByLabel`, `getByText`), create the data you assert on.
- Never set an explicit timeout or use `waitForTimeout`; wait on the thing you need (a response, an element state). If you believe the default is too short, measure it and put the number in a comment.
- One test, one reason to fail. Annotate each with its case id.
- Run with retries OFF (an unstable test is a finding), keep traces/screenshots on failure.
- Then triage every failure: `product_bug` (the app is wrong), `test_bug` (the test is wrong), `environment` (setup not ready), or `inconclusive`. Cite the evidence for each. A timeout is not automatically a bug; raising a timeout is never the fix for a test bug.

---

## What never goes in the report

- A cause you did not confirm. No "possible cause", no "likely mechanism", not even labelled as a guess. A labelled guess still steers the reader away from the evidence.
- A conclusion dressed as an observation. Write what you saw, not what you concluded from it.
- Anything you cannot point at a request, a screen, or a screenshot for.

---
name: ai-qa-engineer
description: Test a running web app the way a QA engineer would and find FUNCTIONAL bugs — features that do the wrong thing, break, miscalculate, lose data, or handle errors badly. Reads the frontend and backend, maps every feature and route, writes a test plan, runs each case (happy path, negative path, edge cases, regression) against the running app, and reports only bugs reproduced with evidence. Not a security tool. Can also write Playwright or Cypress regression tests on request. Use when asked to test a web app, find bugs, write a test plan, write automated tests, or produce a QA report.
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

## What you need to be told

Two things. Either form works for each; the operator gives you whatever they have.

**The app under test.**
- A URL that is already serving, or
- a local project you boot yourself. Read its README or package.json, start it (`npm run dev`, `docker compose up`, whatever it uses), and wait until it answers.

Confirm it responds before you test anything. Pointed at a dead app you will produce a confident empty report.

**The source.**
- A local folder, or
- a git URL. Clone it, then work from the clone.

You must read the frontend and backend to enumerate every route the server registers. That count is your coverage denominator. With no source you cannot know what you missed, so say that plainly in the report and treat coverage as unknown.

Optionally a pull request URL, which aims the run at regression around that change.

Optionally the test framework for Stage 7: `playwright` or `cypress` (for example `--tests cypress`). Naming a framework is a request for automated tests, so Stage 7 runs. When Stage 7 runs with no framework named:

1. If the app's repo already has a `cypress.config.*` or a `playwright.config.*`, use that framework, so the tests fit the team's setup.
2. If it has both or neither, use Playwright.
3. Say in the report which framework you used and why.

Work in the current directory. Write the output files there.

## Tools every run uses

The methodology is what matters, not the exact tool:

- **API layer** — any HTTP client (`curl`, `fetch`).
- **UI layer** — a real browser via Playwright MCP (required, see above).
- **The `npm run *` helpers** (`crawl`, `coverage`, `run-specs`, `report`, `validate`, `bug-report`) live in this skill's own repo. `run-specs` runs Playwright tests only; for Cypress, run `npx cypress run` yourself. `cd` into it and run them: `npm run crawl -- --url <target>`. They are an OPTIONAL accelerator for the mechanical steps. If you prefer, do the same work by hand with HTTP and the browser. The output is identical.

---

## Stage 1 — Map the app

Read the frontend and backend and produce two maps:

- **Feature list** — every user-facing feature (register, login, create X, edit X, delete X, search, checkout, etc.) and the page it lives on.
- **Route list** — every backend route the server registers. Read the entry file plus every handler. Enumerate ALL of them; the count is your denominator. A quick way to get the full count before reading handlers, adapt to the framework:

```bash
# rough count — catches app.get(...) and router.post(...) in .js and .ts
grep -rhoE '\.(get|post|put|patch|delete|all)\([^,)]*' <dir> \
  --include='*.js' --include='*.ts' | sort -u | wc -l
```

This is a starting number, not the answer. It over-counts chained calls and misses
routes built dynamically. The real denominator comes from reading the route files.

Also crawl the running UI: every page, its controls, and the API calls each page fires (method, path, status). Most apps are single-page apps, so follow hash routes (`#/x`) and `routerLink` targets, log in and crawl again for pages behind auth.

Write `ui-map.json` (pages, elements, observed calls) and `api-surface.json` (one entry per route: method, path, what it does, required fields, the status codes the handler can really return, whether it needs auth). Do not invent a status code or a validation rule you did not read in the handler; leave it blank and note the gap.

## Stage 2 — Coverage map

Produce `coverage.json`: one row per backend route, saying which UI pages call it and which frontend files reference it. This is the denominator. Any observed call that matches no known route is either a route you missed or a third party — check before accepting it.

## Stage 3 — Write the test plan

Before you test anything, write `test-plan.json`. It is the list of test cases you will run, written the way a QA engineer writes one for a human tester.

- Cover every feature from Stage 1 and every route from Stage 2. A feature with no test case is a gap; name it in `summary`.
- For each feature, write the cases from "What to test" above that apply: happy path, negative path, edge, state and persistence, correct user's data, regression.
- Pick the layer per case: `ui` for a flow a user performs, `api` for bad payloads and status codes, `ui_mocked` for a server failure the real backend will not produce on demand.
- Rank by risk. `high` is a feature where a bug loses data, blocks a core flow, or affects every user.
- Each case is concrete: the exact steps and the exact expected result. "Check login works" is not a test case.

```
{ "summary": "what the app is, what this plan covers, and what it does not",
  "riskAreas": [ { "area": "Settings", "risk": "high", "reason": "saves the account password" } ],
  "cases": [ {
    "id": "settings-03",
    "title": "Saving the profile with the password field empty keeps the old password",
    "layer": "ui",
    "endpoint": "PUT /api/user",
    "risk": "high",
    "why": "every profile edit goes through this form",
    "steps": ["Log in", "Open Settings", "Change only Bio, leave Password empty, click Update", "Log out and log in with the old password"],
    "expected": "Login succeeds with the old password",
    "result": "fail"
  } ] }
```

Leave `result` empty now. Stage 4 fills it.

## Stage 4 — Test every feature

Run every case in `test-plan.json` against the running app. For a real user flow, drive it in the browser; for direct API behaviour, use HTTP.

After each case, set its `result`: `pass`, `fail`, or `not run: <reason>`. A case that fails becomes a finding, and the finding's `caseId` names the case.

When testing shows something the plan missed, add a case for it to `test-plan.json`, run it, and record the result. The plan at the end is the plan you actually ran.

A bug counts only if you reproduced it live. Capture the evidence as you go:

- **Screenshot every bug.** The moment you see a bug on screen, take a screenshot with the browser tool and save it to a file. Put that file path in the finding's `screenshot` field. For an API-only bug with no screen, screenshot is optional.
- **Record the exact calls.** For an API bug, put the request(s) and response(s) in the finding's `calls` field (method, path, headers, body, status, response body). These are also the replication steps.
- Also record the human `reproduction` steps and the `expected` vs `observed`.

## Stage 5 — Report

Write two files. `test-plan.json` from Stage 3 is the third, with every `result` filled.

`findings.json`:
```
{ "findings": [ {
  "caseId": "the test-plan case that found it, e.g. settings-03",
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
  "cases": ["the test-plan case ids that exercise this route"],
  "result": "ok | bug (see findings) | could not test: <reason>"
} ] }
```

The number of coverage rows must equal the number of routes the server registers. Fewer means you missed routes; go back to Stage 1.

## Stage 6 — Build the bug report (required)

Turn `findings.json` and `test-plan.json` into ONE self-contained HTML file: the test plan with each case's result, then a card per bug, each with its severity, steps to replicate, the API calls (for API bugs), expected vs observed, and the embedded screenshot. The file must be standalone (screenshots embedded as data URIs, no external files) so it opens locally with no server.

The filename MUST carry the date, timestamp and the model that ran it, so reports can be compared later:
`bug-report-<YYYY-MM-DDTHH-MM-SS>-<model>.html`

You build this yourself. The generator is provided; run it from the skill's repo:

```
npm run bug-report -- \
  --findings <path>/findings.json --plan <path>/test-plan.json --model "<the model label you were told you are running as>" \
  --app "<app name>" --url "<target url>" --out <path>
```

It embeds the screenshots, sorts by severity, and writes the correctly named file. If for any reason you cannot run it, build the same single HTML file by hand to the same spec (the test plan table, one card per bug, screenshot embedded as a data URI, filename with timestamp and model).

## Optional Stage 7 — Build a regression suite

Only when asked to leave behind automated tests. Turn each confirmed bug and each high-risk case in `test-plan.json` into an automated test, in the framework chosen above.

Rules for both frameworks:

- One test, one reason to fail. Put the case id in the test name, for example `settings-03: saving the profile keeps the old password`.
- A test for a confirmed bug asserts the CORRECT behaviour, so it fails today and passes once the bug is fixed.
- Create the data you assert on. Never depend on data another test or a seed left behind.
- Never set an explicit timeout or a fixed wait. Wait on the thing you need: a response, an element state. If you believe the default is too short, measure it and put the number in a comment.
- Run with retries OFF. An unstable test is a finding. Keep screenshots and traces or videos on failure.

**Playwright**: files in `specs/*.spec.ts`:

- **api** cases: `test("...", async ({ request }) => ...)`, assert status and body shape.
- **ui** cases: role/text locators (`getByRole`, `getByLabel`, `getByText`).
- **ui_mocked** cases: `page.route()` to return the failure, then assert what the user sees.
- Wait with `expect(...).toBeVisible()` or `page.waitForResponse()`. Never `waitForTimeout`.
- Config: `retries: 0`, `trace: "retain-on-failure"`. Run: `npx playwright test`.

**Cypress**: files in `cypress/e2e/*.cy.ts`:

- **api** cases: `cy.request({ method, url, body, failOnStatusCode: false })`, assert status and body shape.
- **ui** cases: `cy.contains()` and `data-*` attributes; `cy.findByRole()` only if `@testing-library/cypress` is installed.
- **ui_mocked** cases: `cy.intercept(method, url, { statusCode: 500 })`, then assert what the user sees.
- Wait on the request: `cy.intercept(...).as("save")`, act, then `cy.wait("@save")`. Never `cy.wait(<milliseconds>)`.
- Config: `retries: 0`, `video: true`. Run: `npx cypress run` (no `--browser` flag; it defaults to Electron).

Then triage every failure: `product_bug` (the app is wrong), `test_bug` (the test is wrong), `environment` (setup not ready), or `inconclusive`. Cite the evidence for each in `triage.json`. A timeout is not automatically a bug; raising a timeout is never the fix for a test bug.

---

## What never goes in the report

- A cause you did not confirm. No "possible cause", no "likely mechanism", not even labelled as a guess. A labelled guess still steers the reader away from the evidence.
- A conclusion dressed as an observation. Write what you saw, not what you concluded from it.
- Anything you cannot point at a request, a screen, or a screenshot for.

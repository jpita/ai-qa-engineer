# Evaluate functional QA agents

The app is the fixture. The QA agent is what we grade. All task data is synthetic.

| Task | Requirement | Broken behavior |
| --- | --- | --- |
| `profile` | A saved bio survives a full page reload | Save returns success but loses the edit |
| `calculation` | A match score follows the stated formula for both list and text requirements | Requests succeed, but text requirements silently produce wrong scores |

Both tasks have broken and fixed variants. The fixed variants measure false alarms. The local runner and [Harbor](HARBOR.md) share each task's fixture, scripted browser reference and grader. No external app, CV or job history is needed.

## See it work without calling a model

```bash
npm run eval:demo
```

Requires the normal repo dependencies and Playwright Chromium (`npx playwright install chromium` if missing). No Docker or external app is needed. Open the `report.html` path printed at the end. Each row links to the agent-format verdict, screenshot, recorded requests, and individual grading checks.

This runs a scripted Playwright reference against both states of both tasks: four trials, all expected to pass. A 100% result means the fixture and graders accept the known-good tester; it is **not** a model benchmark result. The report links to sibling evidence files, so keep the whole run folder when sharing it.

## Select a task

```bash
npm run eval:demo -- --task calculation
npm run eval:demo -- --task profile
npm run eval:demo -- --task all --trials 3
```

The default is `all`. One attempt means one fresh run per selected task and state: four trials for `all`, or two for a single task. Three attempts across all tasks produce 12 trials.

The runner generates only the selected implementation in a fresh temporary working folder, with a fresh app instance for every trial. The agent receives its URL, source, requirement and the QA skill; it is not told whether the app is broken or fixed. Broken/fixed order alternates across attempts. Both implementations live in the same repo revision; separate branches are unnecessary.

Artifacts are retained under ignored `runs/evals/` directories. Fresh folders isolate trial state, not host permissions. For larger applications, use pinned revisions and isolated databases/browser profiles.

## Run a real agent

The runner accepts any noninteractive agent CLI command. It runs that command once per app state, from a fresh working folder, and supplies:

- `QA_EVAL_PROMPT_FILE`: full task and current QA skill, with scope narrowed to this one behavior.
- `QA_EVAL_MODEL`: the model ID supplied on the command line.
- `QA_EVAL_URL`, `QA_EVAL_SOURCE`, `QA_EVAL_PLAYWRIGHT`: target URL, selected source file, and installed browser library.

Example for an installed and authenticated Claude Code CLI:

```bash
npm run eval:run -- \
  --task calculation \
  --agent claude --model claude-haiku-4-5-20251001 \
  --timeout 180 \
  --command 'claude -p "$(cat "$QA_EVAL_PROMPT_FILE")" --model "$QA_EVAL_MODEL" --tools Read,Write,Bash --allowedTools Read Write Bash --strict-mcp-config --setting-sources "" --no-session-persistence --output-format json'
```

The example uses an explicit Claude model ID; it is not a recommendation that this model is best. Change `--model` explicitly to compare another model. This command uses your authenticated CLI and model quota. The agent runs with your local permissions; fresh folders isolate trial state, **not host access**.

Other CLIs use the same task and output contract via `--command`. They must support noninteractive execution, file output, and real browser execution. This first slice uses Playwright through code execution rather than MCP. Keep that tool setup consistent when comparing agents. These are comparisons of the whole agent setup, not pure model intelligence.

### Local runner options

| Option | Meaning |
| --- | --- |
| `--task NAME` | `all` (default), `profile` or `calculation`. |
| `--demo` | Run the scripted reference without an agent CLI. Cannot be combined with `--command`. |
| `--agent NAME` | Label for the agent setup; required outside demo mode. |
| `--model ID` | Model label, also exposed as `QA_EVAL_MODEL`; required outside demo mode. Your command must pass it to the CLI. |
| `--command 'COMMAND'` | Noninteractive shell command, run from each fresh trial folder; required outside demo mode. |
| `--trials N` | Attempts **per task per state**, from 1 to 20; default 1. Total = `selected tasks × 2 × N`. |
| `--timeout SECONDS` | Positive time limit for each agent command; default 180. Does not limit the scripted demo. |

The local runner does not source `scripts/models.env`; the CLI command and model selection are explicit. Harbor's comparison wrapper also has portable defaults and accepts `MODEL_CLAUDE` / `MODEL_CODEX` overrides independently of that catalog.

## Trial artifacts

Each agent writes `result.json`, `findings.json` and a screenshot in its working directory (`/app/output` in Harbor). Both result formats have `verdict` (`bug`, `working` or `inconclusive`), nonempty `summary`, and a `screenshot` path. `inconclusive` is a valid format but does not pass.

| Task | Additional result fields | Screenshot |
| --- | --- | --- |
| `profile` | Exact final `savedBio` and `reloadedBio` strings | `after-reload.png` |
| `calculation` | `observations`: ordered objects with `format` (`list` or `text`), exact `skills` string, integer `expectedScore` and `observedScore` | `after-calculation.png` |

`findings.json` follows the [skill's findings format](../SKILL.md#stage-5--report). A fixed app requires `{"findings":[]}`. A broken app requires exactly one supported finding, with reproduction steps and matching expected/observed values. The endpoint is `PUT /api/profile` or `POST /api/match` respectively. Calculation findings must describe the first discrepancy in the observations.

Focused instructions override the full-site skill: the agent does not need a full test plan, route-coverage file, HTML bug report or regression suite.

The local runner stores `app.mjs`, `prompt.txt`, agent artifacts, `server-events.json` and `grade.json` under `<task>/<attempt>-<state>/`. Real CLI runs also include `agent.log`. The parent contains `summary.json` and `report.html`; keep the whole folder when sharing reports because evidence links are relative. Harbor has its own [job layout](HARBOR.md#results-and-timing).

## What earns a pass?

`resultSchema` and `findingsSchema` show format validity separately from behavior checks. A correct diagnosis with malformed findings still fails the trial, while retaining the successful evidence checks. All checks must pass. The conclusion must be `bug` on the broken app or `working` on the fixed app, with matching findings and browser evidence.

### Profile persistence

The server must record two browser save → full reload → profile read cycles, using a changed bio. Final reported values must agree with the server's observations.

### Silent calculation

The synthetic job requires Python, SQL and Docker. The score is the percentage of those three requirements matched, rounded to an integer. Whole skill names match case-insensitively; whitespace, duplicate skills and unrelated extras do not change the answer.

For **each** input format, the agent must exercise at least two distinct positive expected scores and a no-match control through the browser: at least six calculations. It must independently calculate expected scores, read displayed scores and report observations in execution order. Each observation needs a distinct matching server request. The list format acts as a working comparison even on the broken app.

The grader derives expected answers directly from the requirement, independently of the fixture implementation. It rejects API-only activity, guessed diagnoses, invented observations, trusting the app's wrong calculation as the expected answer, missing controls, and false alarms on the fixed app.

### Shared artifact and execution checks

The screenshot must resolve inside the trial directory and contain a PNG signature with more than 100 bytes. The local runner also requires exit code zero within the time limit and returns nonzero if any trial fails. Harbor records the shared grader's result as reward 1/0; inspect execution errors and timeouts separately.

## Comparing agents

Score = fully passing trials / attempted trials × 100.

With one attempt on a single task, scores are 0%, 50%, or 100%. Across both tasks, each trial contributes 25 percentage points. Always reporting a bug can score at most 50%; a correct guess without browser evidence scores zero.

Add `--trials 3` to run three fresh attempts per task and state (12 trials with both tasks, six with one). The local runner alternates broken/fixed order across attempts. Keep the skill, evaluator and fixture hashes, browser version, tools, timeout and permissions constant. Record CLI versions and reasoning settings alongside each comparison. The summary records those hashes, browser version, model labels, command, repo commit, dirty-worktree flag, time limit, durations and checks. Model labels are operator-supplied: confirm the actual provider identity in `agent.log` and reject silent fallbacks. Token/cost normalization is not implemented yet.

Use `byTask` and trial rows to inspect each task separately; an aggregate score can hide a regression. Use separate columns for broken-state detection and fixed-state false alarms, plus overall pass rate and runtime. A higher score here means better performance **on these selected tasks**, not a generally better QA agent. Repeat trials and add diverse scenarios before drawing broader conclusions.

For a container-based Claude Code/Codex comparison, use [Harbor](HARBOR.md#compare-agents). Its defaults are three attempts per task and state per agent and a 240-second agent limit; the local runner defaults to 180 seconds, so align limits before comparing across runners.

### Timings in the report

Both `report.html` and `summary.json` include total run time, total agent time, mean/median agent time, and separate averages for passed and failed trials. Each trial shows agent time and trial time; timeouts are explicitly labeled and included in totals. An absent passed/failed group displays N/A, not zero.

Agent time measures CLI startup through completion, including browser/tool work and process cleanup/log capture. Trial time additionally includes prompt preparation and grading after the fixture is ready. Total run time includes setup, completed trials, artifact copying and fixture cleanup; it excludes final report generation. Durations use a monotonic clock. Compare successful-trial timings alongside pass rate so immediate failures do not appear to be a performance advantage. Old reports retain their original measurements; do not reinterpret their `elapsedSeconds` as agent-only time.

## Files

- `scripts/evals/fixture.ts`: profile variants, event types and fixture lifecycle.
- `scripts/evals/calculation-fixture.ts`: synthetic match calculator with list/text variants.
- `scripts/evals/calculation-grade.ts`: independent score and browser-evidence checks.
- `scripts/evals/calculation-reference.ts`: scripted browser checks with explicit expected scores.
- `scripts/evals/tasks.ts`: shared task selection, instructions and artifact contracts.
- `scripts/evals/artifacts.ts`: shared file and screenshot checks.
- `scripts/evals/reference.ts`: deterministic browser tester proving the eval is solvable.
- `scripts/evals/grade.ts`: verdict, evidence and artifact checks.
- `scripts/evals/run.ts`: fresh state, agent execution, timeouts and reports.
- `scripts/evals/timing.ts`: duration summaries, including separate passed/failed averages.
- `scripts/evals/harbor-prepare.ts`: generated container tasks, instructions, reference solution and verifier.
- `scripts/evals/harbor-compare.sh`: credentials, model selections and comparison job configuration.
- `tests/eval.test.ts`: catches false passes and verifies fixture behavior.
- `tests/eval-calculation.test.ts`: silent-error, false-alarm, control and fixture regression tests.
- `tests/eval-timing.test.ts`: verifies timing aggregates and absent-group handling.

## Limits

The screenshot check only checks path containment, byte count and a PNG signature; it does not decode the image or judge what it shows. Report checks establish structured consistency, not prose quality. Inspect screenshot relevance and report clarity manually.

Browser fetch headers identify normal browser activity but are forgeable. Local agents are instructed not to inspect evaluation files, but retain host permissions. Harbor adds container isolation, an unprivileged agent and a separate event log; neither runner is designed to resist an agent deliberately gaming the grader.

These evaluate two focused behaviors of the QA skill. They do not yet score full-site route coverage, HTML report quality, or generated regression tests.

## Lessons behind the tasks

A success status is not proof of correct behavior: a save can lose data, and a calculation can return a plausible but incorrect value. Pair each defect with a fixed control and require independently checked evidence.

The calculation scenario was inspired by the string-versus-list scoring incident documented in [Jobhunter's regression tests](https://github.com/PeteBoucher/jobhunter-agent/blob/e8a4914c9e4605604450cb4eb103ed2b6ee7f948/tests/test_job_matcher_unit.py#L219). This fixture is an independent synthetic implementation; it includes no CVs, scraped jobs or personal scan data.

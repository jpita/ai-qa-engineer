# Harbor evaluation

[Harbor](https://github.com/harbor-framework/harbor) runs the [functional QA evals](EVALS.md) in a fresh Docker container for every trial, with a viewer for results, evidence and timings. The generated tasks reuse the local runner's fixture, reference browser test and grader.

## Setup

From the repository root, install the repo dependencies and the pinned [Harbor 0.23.0 release](https://pypi.org/project/harbor/0.23.0/):

```bash
npm install
uv tool install harbor==0.23.0
harbor --version
```

This requires Node 20+, `uv`, and Docker with Compose v2 and Buildx. Start your Docker runtime first (for example, `colima start` if you use Colima on macOS), then verify it:

```bash
docker info
docker compose version
docker buildx version
```

Host-installed agent CLIs and Playwright Chromium are not required for Harbor: the generated image contains both agent CLIs, Playwright and Chromium. The first run needs network access to build the image and install its pinned packages.

## Check the evaluation without calling a model

```bash
npm run harbor:oracle           # scripted reference: expect 4 rewards of 1
npm run harbor:nop              # does nothing: expect 4 rewards of 0
npm run harbor:view             # http://127.0.0.1:8080
```

Each check regenerates the tasks and runs both states of both tasks sequentially. Neither needs model credentials. Oracle proves the task is solvable; nop checks that doing nothing earns no reward. These are checks of the evaluation machinery, not AI scores. Nop's zero rewards are the expected result.

To generate task files without building containers or running trials:

```bash
npm run harbor:prepare
```

### What runs inside each container

| Task | App behavior | Passing conclusion |
| --- | --- | --- |
| `profile-1` | Save acknowledges the change but does not persist it | `bug`, with one supported persistence finding |
| `profile-2` | The changed bio survives a full reload | `working`, with no findings |
| `calculation-1` | Text requirements return a wrong score despite HTTP success | `bug`, with independently calculated expectations |
| `calculation-2` | Both requirement formats return correct scores | `working`, with no findings |

The agent receives the requirement, `/app/SKILL.md`, the running app at `http://localhost:3000`, and only that app's source at `/app/source/app.mjs`. It is not told the state. It runs as an unprivileged user and writes scripts and [required artifacts](EVALS.md#trial-artifacts) to `/app/output`.

The root-owned server records requests separately from agent output. The verifier is copied in after the agent finishes. Tasks use 1 CPU, 2,048 MB of memory, a 240-second agent limit and a separate 60-second verifier limit, as defined in `scripts/evals/harbor-prepare.ts`.

## Compare agents

Configure authentication in the launching shell before starting a model comparison:

- **Claude Code:** set `ANTHROPIC_API_KEY` or `CLAUDE_CODE_OAUTH_TOKEN`. For subscription auth, obtain a token with `claude setup-token`. A host Keychain login is not automatically shared with Docker.
- **Codex:** set `OPENAI_API_KEY`, or use an existing auth file. When no API key is set, the wrapper uses `CODEX_AUTH_JSON_PATH` if supplied, otherwise `~/.codex/auth.json` if it exists. Harbor uploads that credential file into the temporary agent environment; it does not mount your home directory.

Keep tokens out of the repo and job configuration. The wrapper checks for credential inputs before launching; successful authentication still depends on the provider.

```bash
npm run harbor:compare
```

This runs Claude Code and Codex against both tasks and states, three times each: **2 agents × 2 tasks × 2 states × 3 attempts = 24 trials**, one at a time to reduce local resource contention. A quick eight-trial comparison uses:

```bash
npm run harbor:compare -- --n-attempts 1
```

The wrapper has portable defaults, independent of the local full-site model catalog:

| Agent | Environment override | Repository default |
| --- | --- | --- |
| Claude Code | `MODEL_CLAUDE` | `claude-haiku-4-5-20251001` |
| Codex | `MODEL_CODEX` | `gpt-6-luna` |

Export either override before running the comparison to choose another model supported by your provider account. Use the plain model ID: the wrapper adds `anthropic/` or `openai/` for Harbor. These defaults are configuration choices, not measured claims about which model is best.

The wrapper regenerates `runs/harbor/compare.json` on each invocation and forwards extra arguments to `harbor run`. Change defaults in the wrapper or use CLI overrides; edits to that generated config will be overwritten.

The task image preinstalls Claude Code **2.1.287** and Codex **0.160.0**, and the comparison requests those same CLI versions. These are separate from host-installed CLIs. Preinstallation avoids Harbor's apt-based Node/npm setup conflicting with the Playwright image's NodeSource packages. Keep the image and wrapper version pins aligned when updating them.

Model identifiers are requested configuration; confirm the served model in the transcript/provider metadata. Comparisons use your model quota or API billing. Subscription usage may not yield an accurate dollar cost.

## Results and timing

Run `npm run harbor:view`, then open http://127.0.0.1:8080. The [Harbor viewer](https://www.harborframework.com/docs/run-jobs/run-evals#using-the-viewer) shows jobs, trials, rewards, errors, timings, logs and collected artifacts.

| Location | Contents |
| --- | --- |
| `runs/harbor/jobs/<job>/` | Job configuration and aggregate results |
| `<job>/<trial>/result.json` | Harbor's trial result, timing and error metadata |
| `<job>/<trial>/agent/` | Agent logs and trajectory |
| `<job>/<trial>/artifacts/` | Collected output from `/app/output` |
| `<job>/<trial>/verifier/` | `grade.json`, `server-events.json`, `reward.txt` and an `evidence/` copy of the agent output |

The agent's `result.json` inside its output is the QA verdict; Harbor's trial-level `result.json` describes execution. They are different files with different schemas.

Reward **1** means all shared grading checks passed; **0** means at least one failed. An execution or verifier error may leave no reward, so inspect errors and timeouts as well as scores. For a broken app, identifying and proving the bug passes. For a fixed app, correctly reporting no bug passes.

Compare each agent/model's mean reward, results for both states, attempted/completed/error counts and agent execution duration. With a reward for every attempt, mean reward × 100 is the pass percentage. For an overall success rate, count errored attempts in the denominator rather than silently dropping them. Environment setup and verification time are separate from agent execution; inspect successful-trial speed alongside pass rate.

These are two focused tasks, not a broad agent ranking. The [same evidence limitations](EVALS.md#limits) apply: request headers and PNG signature checks do not establish screenshot relevance or resist deliberate manipulation.

## Maintaining and reproducing tasks

Generated tasks live under `runs/harbor/tasks`; jobs live under `runs/harbor/jobs`. Both are ignored by Git. Edit `scripts/evals/harbor-prepare.ts` and the shared evaluation modules, then re-run prepare. The oracle, nop and comparison commands prepare automatically.

Completed jobs retain their own configuration and artifacts. To reproduce them later, also preserve the corresponding repo revision and any uncommitted changes, Harbor/CLI versions, model selections and container image. The local runner's hash-rich `summary.json` is not produced by this Harbor wrapper.

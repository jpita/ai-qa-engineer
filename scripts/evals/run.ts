import { spawn, execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, cp, rm, writeFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { startFixture, type Variant } from "./fixture.js";
import { grade } from "./grade.js";
import { selectTasks } from "./tasks.js";
import { summarizeTiming } from "./timing.js";

const runStarted = performance.now();
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const { values } = parseArgs({ options: {
  demo: { type: "boolean", default: false },
  task: { type: "string", default: "all" },
  agent: { type: "string" }, model: { type: "string" }, command: { type: "string" },
  trials: { type: "string", default: "1" }, timeout: { type: "string", default: "180" },
} });
const count = Number(values.trials);
const timeout = Number(values.timeout);
if (!Number.isInteger(count) || count < 1 || count > 20 || !Number.isFinite(timeout) || timeout < 1) throw new Error("Use 1–20 trials and a positive timeout in seconds");
if (!values.demo && (!values.agent || !values.model || !values.command)) throw new Error("Supply --agent NAME --model ID --command 'COMMAND', or use --demo");
if (values.demo && values.command) throw new Error("Choose --demo or --command, not both");
const selectedTasks = selectTasks(values.task);
const agent = values.demo ? "scripted-reference-NOT-AI" : values.agent!;
const model = values.demo ? "none" : values.model!;
const output = join(repo, "runs", "evals", `${new Date().toISOString().replaceAll(":", "-")}-${randomUUID().slice(0, 8)}`);
await mkdir(output, { recursive: true });
const skill = await readFile(join(repo, "SKILL.md"), "utf8");
const hash = (text: string) => createHash("sha256").update(text).digest("hex");

async function runCommand(command: string, cwd: string, url: string) {
  const child = spawn("/bin/sh", ["-c", command], {
    cwd, detached: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, QA_EVAL_PROMPT_FILE: join(cwd, "prompt.txt"), QA_EVAL_URL: url,
      QA_EVAL_SOURCE: join(cwd, "app.mjs"), QA_EVAL_MODEL: model,
      QA_EVAL_PLAYWRIGHT: join(repo, "node_modules", "playwright", "index.mjs") },
  });
  let log = "";
  const append = (chunk: Buffer) => { if (log.length < 4_000_000) log += chunk.toString(); };
  child.stdout.on("data", append);
  child.stderr.on("data", append);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    if (child.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch {} }
  }, timeout * 1000);
  try {
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      child.on("error", reject);
      child.on("close", resolve);
    });
    return { exitCode, timedOut };
  } finally {
    clearTimeout(timer);
    // Close orphan browser/server children before removing the temporary trial.
    if (child.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch {} }
    await writeFile(join(cwd, "agent.log"), log);
  }
}

type Execution = { exitCode: number | null; timedOut: boolean; error?: string };
type Row = Awaited<ReturnType<typeof grade>> & {
  task: string; directory: string; screenshot: string; trial: number; variant: Variant; execution: Execution; elapsedSeconds: number; agentElapsedSeconds: number; fixtureSha256: string;
};
const rows: Row[] = [];
const evaluatorFiles = (await readdir(join(repo, "scripts/evals"))).filter(name => name.endsWith(".ts")).sort();
const evaluatorSources = await Promise.all(evaluatorFiles.map(name => readFile(join(repo, "scripts/evals", name), "utf8")));
for (const task of selectedTasks) {
for (let trial = 1; trial <= count; trial++) {
  // Alternate ordering across repeats. Never identify the variant to the agent.
  const variants: Variant[] = trial % 2 ? ["broken", "fixed"] : ["fixed", "broken"];
  for (const variant of variants) {
    const work = await mkdtemp(join(tmpdir(), "qa-eval-"));
    const source = task.source(variant);
    const fixture = await startFixture(source);
    const started = performance.now();
    const directory = `${task.id}/${trial}-${variant}`;
    const destination = join(output, directory);
    console.log(`Running ${agent}: ${task.id}/${variant}, trial ${trial}/${count}`);
    try {
      await writeFile(join(work, "app.mjs"), source);
      const prompt = `Perform one focused functional QA evaluation using the methodology below.
App: ${fixture.url}
Source: ${join(work, "app.mjs")}. This exact implementation is already running; do not start or modify it.
Use a real Chromium browser through Playwright. Import the installed module at ${join(repo, "node_modules/playwright/index.mjs")} if needed. No installation is needed.
Do not infer execution from source alone. Keep scripts and output in this working directory. Read only the supplied app source and installed browser library; do not inspect the evaluator, other runs, or sibling files in the QA repo.
${task.instructions}
These focused instructions override the full-site skill. Do not write a full HTML report or regression suite. Stop when the artifacts are written.

Methodology (the focused scope and artifact instructions above take precedence):
${skill}`;
      await writeFile(join(work, "prompt.txt"), prompt);
      let execution: Execution = { exitCode: 0, timedOut: false };
      const agentStarted = performance.now();
      try {
        if (values.demo) await task.runReference(fixture.url, work);
        else execution = await runCommand(values.command!, work, fixture.url);
      } catch (error) { execution = { exitCode: null, timedOut: false, error: String(error) }; }
      const agentElapsedSeconds = Number(((performance.now() - agentStarted) / 1000).toFixed(2));
      const grading = await task.grade(variant, fixture.events, work);
      const row = { task: task.id, directory, screenshot: task.screenshot, trial, variant, ...grading, passed: grading.passed && execution.exitCode === 0 && !execution.timedOut,
        execution, agentElapsedSeconds, elapsedSeconds: Number(((performance.now() - started) / 1000).toFixed(2)), fixtureSha256: hash(source) };
      rows.push(row);
      await writeFile(join(work, "server-events.json"), JSON.stringify(fixture.events, null, 2));
      await writeFile(join(work, "grade.json"), JSON.stringify(row, null, 2));
      await cp(work, destination, { recursive: true });
      console.log(`  ${row.passed ? "PASS" : "FAIL"}: ${JSON.stringify(row.checks)}`);
    } finally {
      await fixture.close();
      await rm(work, { recursive: true, force: true });
    }
  }
}
}
const passed = rows.filter(r => r.passed).length;
const summary = {
  eval: "functional-qa-v1", tasks: selectedTasks.map(t => ({ id: t.id, version: t.version })), demo: values.demo, agent, model,
  // This label is operator-supplied. Verify provider-reported identity in agent.log.
  modelIdentity: "operator supplied; inspect agent.log for provider identity",
  command: values.command ?? "scripted Playwright reference", timeoutSeconds: timeout,
  evaluatorSha256: hash(evaluatorSources.join("\n")),
  playwrightVersion: JSON.parse(await readFile(join(repo, "node_modules/playwright/package.json"), "utf8")).version as string,
  skillSha256: hash(skill), repoCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" }).trim(),
  workingTreeDirty: execFileSync("git", ["status", "--porcelain"], { cwd: repo, encoding: "utf8" }).trim().length > 0,
  passed, total: rows.length, score: 100 * passed / rows.length, rows,
  timing: summarizeTiming(rows, (performance.now() - runStarted) / 1000),
  byTask: Object.fromEntries(selectedTasks.map(task => {
    const selected = rows.filter(row => row.task === task.id);
    return [task.id, { passed: selected.filter(row => row.passed).length, total: selected.length }];
  })),
  byState: Object.fromEntries((["broken", "fixed"] as const).map(variant => {
    const selected = rows.filter(row => row.variant === variant);
    return [variant, { passed: selected.filter(row => row.passed).length, total: selected.length }];
  })),
};
await writeFile(join(output, "summary.json"), JSON.stringify(summary, null, 2));
const escape = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const seconds = (value: number | null) => value === null ? "N/A" : `${value.toFixed(2)} s`;
await writeFile(join(output, "report.html"), `<!doctype html><html lang="en"><meta charset="utf-8"><title>Functional QA evals</title>
<style>body{font:17px system-ui;max-width:950px;margin:50px auto;padding:20px}table{border-collapse:collapse;width:100%}td,th{padding:12px;text-align:left;border-bottom:1px solid #ddd}img{max-width:640px;width:100%}code{background:#eee;padding:3px}</style>
<h1>Functional QA evals</h1><p>${escape(agent)} / ${escape(model)}</p>
<p><strong>${summary.score.toFixed(0)}% — ${passed}/${rows.length} trials passed</strong></p>
<table aria-label="Timing summary"><tr><th>Timing metric</th><th>Duration</th></tr>
<tr><td>Total run time (through completed trials)</td><td>${seconds(summary.timing.wallSeconds)}</td></tr>
<tr><td>Total agent time</td><td>${seconds(summary.timing.totalAgentSeconds)}</td></tr>
<tr><td>Average / median agent time per trial</td><td>${seconds(summary.timing.averageAgentSeconds)} / ${seconds(summary.timing.medianAgentSeconds)}</td></tr>
<tr><td>Average agent time — passed trials</td><td>${seconds(summary.timing.averagePassedAgentSeconds)}</td></tr>
<tr><td>Average agent time — failed trials</td><td>${seconds(summary.timing.averageFailedAgentSeconds)}</td></tr></table>
<p>Agent time includes CLI startup, model/tool work, browser execution, and process cleanup/log capture; it excludes fixture setup and grading. Total run time also includes setup, grading, artifact copying and fixture cleanup, but excludes final report generation. Failed trials and timeouts count toward totals; compare successful-trial speed alongside pass rate.</p>
<p>${values.demo ? "Scripted reference demonstration. This is NOT an AI performance score." : "Focused tasks, not an overall agent ranking. Model label supplied by the operator."}</p>
${selectedTasks.map(t => `<p><strong>${escape(t.title)}:</strong> ${escape(t.description)} ${summary.byTask[t.id]!.passed}/${summary.byTask[t.id]!.total} passed.</p>`).join("")}
<p>Each trial starts with fresh state.</p>
<table><tr><th>Task</th><th>Trial</th><th>App state</th><th>Result</th><th>Agent time</th><th>Trial time*</th><th>Evidence</th></tr>
${rows.map(r => `<tr><td>${r.task}</td><td>${r.trial}</td><td>${r.variant}</td><td>${r.passed ? "PASS" : r.execution.timedOut ? "TIMEOUT" : "FAIL"}</td><td>${seconds(r.agentElapsedSeconds)}</td><td>${seconds(r.elapsedSeconds)}</td><td><a href="${r.directory}/grade.json">Checks</a> · <a href="${r.directory}/result.json">Verdict</a> · <a href="${r.directory}/server-events.json">Requests</a> · <a href="${r.directory}/${r.screenshot}">Screenshot</a></td></tr>`).join("")}</table>
<p>*Trial time runs from a ready fixture through grading; excludes artifact copying and fixture cleanup.</p>
<p>Pass requires correct diagnosis, task-specific browser checks, matching observations, the expected report, a PNG artifact, and successful agent exit.</p>
<p>Evidence checks establish structural consistency. A human must still inspect screenshot relevance and report clarity. Browser request headers are evidence for cooperative agents, not a tamper-proof boundary.</p></html>`);
console.log(`\n${values.demo ? "DEMO (not an AI score)" : agent}: ${passed}/${rows.length} passed (${summary.score.toFixed(0)}%)\nRun time: ${seconds(summary.timing.wallSeconds)}; average agent time: ${seconds(summary.timing.averageAgentSeconds)}\nReport: ${join(output, "report.html")}`);
if (passed !== rows.length) process.exitCode = 1;

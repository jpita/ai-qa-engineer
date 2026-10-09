import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const agents = [
  ["claude", "claude-haiku-5-5"],
  ["codex", "gpt-6-luna"],
  ["grok", "grok-4.7"],
  ["kimi", "moonshotai/kimi-k3"],
  ["deepseek", "deepseek-pro"],
  ["antigravity", "gemini-3.8-flash-low"],
  ["copilot", "auto"],
] as const;

describe("agent launchers", () => {
  let directory: string;
  let env: NodeJS.ProcessEnv;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "qa-launchers-"));
    mkdirSync(join(directory, "scripts"));
    mkdirSync(join(directory, "bin"));
    for (const name of ["models.env", "run-agent.sh", "preflight.sh"]) {
      copyFileSync(join(root, "scripts", name), join(directory, "scripts", name));
    }
    writeFileSync(join(directory, "SKILL.md"), "Test the target app.");
    const executable = (name: string, body: string) => {
      const path = join(directory, "bin", name);
      writeFileSync(path, body);
      chmodSync(path, 0o755);
    };
    executable("curl", '#!/bin/bash\nif [[ "$*" == *"%{http_code}"* ]]; then printf 200; else printf "<title>Fixture title</title>\\n"; fi\n');
    for (const name of ["claude", "codex", "grok", "kimi", "reasonix", "agy", "copilot"]) {
      executable(name, `#!/usr/bin/env node
const fs = require('node:fs');
fs.writeFileSync(process.env.MOCK_CALL_PATH, JSON.stringify(process.argv.slice(2)));
console.log('Fixture title');
process.exit(Number(process.env.MOCK_EXIT_CODE || 0));
`);
    }
    env = { ...process.env };
    for (const key of Object.keys(env)) {
      if (key.startsWith("MODEL_") || key === "ANTIGRAVITY_EFFORT" || key === "XAI_API_KEY") delete env[key];
    }
    Object.assign(env, {
      PATH: join(directory, "bin") + ":" + process.env.PATH,
      OUT_DIR: join(directory, "output"),
      BASE_URL: "http://fixture.invalid",
      SKILL_FILE: join(directory, "SKILL.md"),
      NO_SANDBOX: "1",
      KIMI_BIN: join(directory, "bin", "kimi"),
      ANTIGRAVITY_BIN: join(directory, "bin", "agy"),
      MOCK_CALL_PATH: join(directory, "call.json"),
      MOCK_EXIT_CODE: "0",
    });
  });
  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  function run(script: string, agent: string, overrides: NodeJS.ProcessEnv = {}) {
    return spawnSync("bash", [join(directory, "scripts", script), agent], {
      env: { ...env, ...overrides }, encoding: "utf8", timeout: 10_000,
    });
  }
  function modelArgument() {
    const args: string[] = JSON.parse(readFileSync(join(directory, "call.json"), "utf8"));
    const flag = args.findIndex(arg => arg === "--model" || arg === "-m");
    return args[flag + 1];
  }

  for (const script of ["run-agent.sh", "preflight.sh"]) {
    it.each(agents)(`${script} passes the explicit %s default`, (agent, model) => {
      const result = run(script, agent);
      expect(result.status, result.stderr + result.stdout).toBe(0);
      expect(modelArgument()).toBe(model);
    });
    it.each(["claude", "copilot"])(`${script} preserves a %s model override`, agent => {
      const result = run(script, agent, { ["MODEL_" + agent.toUpperCase()]: "explicit-model" });
      expect(result.status).toBe(0);
      expect(modelArgument()).toBe("explicit-model");
    });
    it(`${script} preserves a CLI failure even when output contains the expected title`, () => {
      const result = run(script, "deepseek", { MOCK_EXIT_CODE: "7" });
      expect(result.status).toBe(script === "run-agent.sh" ? 7 : 1);
      expect(result.stdout).toContain("exit 7");
    });
  }
  it("requires a separate key for the Grok direct API alias", () => {
    const result = run("run-agent.sh", "grok", { MODEL_GROK: "grok-4-3-direct" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("XAI_API_KEY");
  });
  it("keeps the Harbor image and wrapper CLI pins aligned", () => {
    const wrapper = readFileSync(join(root, "scripts/evals/harbor-compare.sh"), "utf8");
    const image = readFileSync(join(root, "scripts/evals/harbor-prepare.ts"), "utf8");
    for (const [name, version] of [["claude-code", "2.1.289"], ["codex", "0.160.0"]]) {
      expect(wrapper).toContain(`name: '${name}'`);
      expect(wrapper).toContain(`version: '${version}'`);
      expect(image).toContain(`${name}@${version}`);
    }
  });
});

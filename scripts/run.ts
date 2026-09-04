import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RunResult } from "./types.js";

export async function run(outDir: string, specDir: string, baseUrl: string): Promise<RunResult[]> {
  const reportFile = path.join(outDir, "playwright-report.json");

  // SPEC_DIR sets playwright's testDir. Passing specDir positionally makes playwright
  // treat it as a filename regex, which silently matches nothing.
  const code = await new Promise<number>((resolve, reject) => {
    const proc = spawn("npx", ["playwright", "test", "--reporter", "json"], {
      env: {
        ...process.env,
        SPEC_DIR: specDir,
        BASE_URL: baseUrl,
        PLAYWRIGHT_JSON_OUTPUT_NAME: reportFile,
      },
      stdio: ["ignore", "inherit", "inherit"],
    });
    proc.on("error", reject);
    proc.on("close", (c) => resolve(c ?? 1));
  });

  let raw: PlaywrightJson;
  try {
    raw = JSON.parse(await readFile(reportFile, "utf8")) as PlaywrightJson;
  } catch {
    throw new Error(
      `playwright exited ${code} and wrote no readable report at ${reportFile}. ` +
        `Check that ${specDir} contains spec files.`,
    );
  }

  const results = flatten(raw);
  if (results.length === 0) {
    throw new Error(
      `No tests ran. ${specDir} matched no spec files (playwright exited ${code}). ` +
        `A run that executes nothing is a failure, not a pass.`,
    );
  }
  return results;
}

interface PlaywrightJson {
  suites: Suite[];
}
interface Suite {
  suites?: Suite[];
  specs?: Spec[];
}
interface Spec {
  title: string;
  tests: {
    annotations?: { type: string; description?: string }[];
    results: {
      status: string;
      duration: number;
      error?: { message?: string };
      attachments?: { name: string; path?: string }[];
    }[];
  }[];
}

function flatten(json: PlaywrightJson): RunResult[] {
  const out: RunResult[] = [];

  const walk = (suite: Suite): void => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests) {
        const result = test.results[0];
        if (result === undefined) continue;
        const caseId =
          test.annotations?.find((a) => a.type === "caseId")?.description ?? spec.title;
        out.push({
          caseId,
          status: normalise(result.status),
          durationMs: result.duration,
          error: result.error?.message ?? null,
          attachments: (result.attachments ?? [])
            .filter((a): a is { name: string; path: string } => a.path !== undefined)
            .map((a) => ({ name: a.name, path: a.path })),
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child);
  };

  for (const suite of json.suites) walk(suite);
  return out;
}

function normalise(status: string): RunResult["status"] {
  if (status === "passed" || status === "failed" || status === "timedOut" || status === "skipped") {
    return status;
  }
  return "failed";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { parseArgs } = await import("node:util");
  const { writeFile } = await import("node:fs/promises");
  const path = (await import("node:path")).default;
  const { values } = parseArgs({
    options: { specs: { type: "string" }, url: { type: "string" }, out: { type: "string" } },
  });
  if (values.specs === undefined || values.url === undefined || values.out === undefined) {
    process.stderr.write("usage: tsx scripts/run.ts --specs <dir> --url <url> --out <file>\n");
    process.exit(1);
  }
  const results = await run(path.dirname(values.out), values.specs, values.url);
  await writeFile(values.out, JSON.stringify(results, null, 2), "utf8");
  const failed = results.filter((r) => r.status !== "passed" && r.status !== "skipped").length;
  process.stderr.write(`${results.length - failed}/${results.length} passed -> ${values.out}\n`);
}

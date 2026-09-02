import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { CoverageGap, CoverageMap, RunResult, TestPlan, Triage } from "./types.js";

export async function report(
  outDir: string,
  target: string,
  testPlan: TestPlan,
  results: RunResult[],
  triageResult: Triage,
  coverage: CoverageMap,
  gaps: CoverageGap[],
): Promise<string> {
  const passed = results.filter((r) => r.status === "passed").length;
  const bugs = triageResult.verdicts.filter((v) => v.verdict === "product_bug");
  const testBugs = triageResult.verdicts.filter((v) => v.verdict === "test_bug");

  const byId = new Map(testPlan.cases.map((c) => [c.id, c]));

  const lines: string[] = [
    `# QA report`,
    ``,
    `**Target:** ${target}`,
    `**Run:** ${new Date().toISOString()}`,
    `**Result:** ${passed}/${results.length} passed, ${bugs.length} product bugs, ${testBugs.length} test defects`,
    ``,
    `## Summary`,
    ``,
    testPlan.summary,
    ``,
    `## Risk areas`,
    ``,
    `| Area | Risk | Why |`,
    `| --- | --- | --- |`,
    ...testPlan.riskAreas.map((r) => `| ${r.area} | ${r.risk} | ${r.reason} |`),
    ``,
  ];

  if (bugs.length > 0) {
    lines.push(`## Product bugs`, ``);
    for (const bug of bugs) {
      const testCase = byId.get(bug.caseId);
      lines.push(
        `### ${testCase?.title ?? bug.caseId}`,
        ``,
        `**Confidence:** ${bug.confidence}`,
        ``,
        `**Steps**`,
        ...(testCase?.steps ?? []).map((s, i) => `${i + 1}. ${s}`),
        ``,
        `**Expected:** ${testCase?.expected ?? "not recorded"}`,
        ``,
        `**Evidence**`,
        ...bug.evidence.map((e) => `- ${e}`),
        ``,
      );
    }
  }

  if (testBugs.length > 0) {
    lines.push(`## Test defects`, ``, `These failed because the test was wrong, not the app.`, ``);
    for (const t of testBugs) {
      lines.push(`- **${byId.get(t.caseId)?.title ?? t.caseId}** — ${t.reasoning}${t.suggestedFix === null ? "" : ` Fix: ${t.suggestedFix}`}`);
    }
    lines.push(``);
  }

  lines.push(
    `## Coverage`,
    ``,
    `${coverage.links.length} endpoints are reached from the UI. ${coverage.endpointsWithNoUiCaller.length} exist in the source with no UI caller found.`,
    ``,
  );

  if (gaps.length > 0) {
    lines.push(
      `Endpoints tested at only one layer. A direct call proves the server handles the payload the test chose, not that the app sends it:`,
      ``,
      `| Endpoint | Missing layer | Reached from |`,
      `| --- | --- | --- |`,
      ...gaps.map((g) => `| ${g.endpoint} | ${g.missingLayer} | ${g.callerPages.join(", ")} |`),
      ``,
    );
  } else {
    lines.push(`Every endpoint with a UI caller was tested at both the API and the UI layer.`, ``);
  }

  if (coverage.callsWithNoKnownEndpoint.length > 0) {
    lines.push(
      `The browser made these calls that no endpoint in the source matched. Either the source read missed a route, or these are third party:`,
      ``,
      ...coverage.callsWithNoKnownEndpoint.map((c) => `- \`${c}\``),
      ``,
    );
  }

  lines.push(
    `## Every case`,
    ``,
    `| Case | Layer | Risk | Result |`,
    `| --- | --- | --- | --- |`,
    ...results.map((r) => {
      const c = byId.get(r.caseId);
      return `| ${c?.title ?? r.caseId} | ${c?.layer ?? "-"} | ${c?.risk ?? "-"} | ${r.status} |`;
    }),
    ``,
  );

  const file = path.join(outDir, "QA-REPORT.md");
  await writeFile(file, lines.join("\n"), "utf8");
  return file;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { parseArgs } = await import("node:util");
  const { readFile } = await import("node:fs/promises");
  const path = (await import("node:path")).default;
  const { TestPlanSchema, TriageSchema, CoverageMapSchema } = await import("./types.js");
  const { findCoverageGaps } = await import("./coverage-gate.js");

  const { values } = parseArgs({ options: { dir: { type: "string" }, url: { type: "string" } } });
  if (values.dir === undefined || values.url === undefined) {
    process.stderr.write("usage: tsx scripts/report.ts --dir <run dir> --url <target url>\n");
    process.exit(1);
  }

  const read = async (name: string): Promise<unknown> =>
    JSON.parse(await readFile(path.join(values.dir as string, name), "utf8"));

  const testPlan = TestPlanSchema.parse(await read("test-plan.json"));
  const coverage = CoverageMapSchema.parse(await read("coverage.json"));
  const triageResult = TriageSchema.parse(await read("triage.json"));
  const results = (await read("results.json")) as Awaited<ReturnType<typeof report>> extends string
    ? Parameters<typeof report>[3]
    : never;

  const file = await report(
    values.dir,
    values.url,
    testPlan,
    results,
    triageResult,
    coverage,
    findCoverageGaps(coverage, testPlan),
  );
  process.stderr.write(`${file}\n`);
}

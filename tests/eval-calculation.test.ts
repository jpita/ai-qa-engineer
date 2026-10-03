import { describe, expect, it } from "vitest";
import { calculationSource } from "../scripts/evals/calculation-fixture.js";
import { expectedScore, gradeCalculationClaims } from "../scripts/evals/calculation-grade.js";
import { startFixture, type Event, type Variant } from "../scripts/evals/fixture.js";
import { selectTasks } from "../scripts/evals/tasks.js";

function evidence(variant: Variant) {
  const observations = (["list", "text"] as const).flatMap(format =>
    [["Rust", 0], ["Docker", 33], ["Python, SQL", 67]].map(([skills, score]) => ({
      format, skills: String(skills), expectedScore: Number(score), observedScore: variant === "broken" && format === "text" ? 0 : Number(score),
    })));
  const events: Event[] = observations.map(o => ({ method: "POST", path: "/api/match", browser: true, format: o.format, skills: o.skills, score: o.observedScore }));
  const result = { verdict: variant === "broken" ? "bug" : "working", summary: "Checked both formats", observations, screenshot: "after-calculation.png" };
  const findings = { findings: variant === "broken" ? [{ title: "Text score wrong", feature: "Calculator", endpoint: "POST /api/match", severity: "medium",
    reproduction: "Calculate with Docker and Python, SQL in each format", expected: "33%", observed: "0%" }] : [] };
  return { events, result, findings };
}
const passes = (checks: ReturnType<typeof gradeCalculationClaims>) => Object.values(checks).every(Boolean);

describe("silent calculation evaluator", () => {
  it.each(["broken", "fixed"] as const)("accepts supported %s conclusions", variant => {
    const { events, result, findings } = evidence(variant);
    expect(passes(gradeCalculationClaims(variant, events, result, findings))).toBe(true);
  });
  it("computes the stated formula independently with case, whitespace, duplicates and unrelated skills", () => {
    expect(expectedScore(" PYTHON, sql, Python, Rust ")).toBe(67);
    expect(expectedScore("Docker")).toBe(33);
    expect(expectedScore("Python, SQL, Docker")).toBe(100);
    expect(expectedScore("Pythonic, PostgreSQL")).toBe(0);
    expect(expectedScore("")).toBe(0);
  });
  it("rejects source-only guesses and ordinary API-only execution", () => {
    const { events, result, findings } = evidence("broken");
    expect(passes(gradeCalculationClaims("broken", [], result, findings))).toBe(false);
    expect(passes(gradeCalculationClaims("broken", events.map(e => ({ ...e, browser: false })), result, findings))).toBe(false);
  });
  it("rejects fabricated scores, changed inputs and reusing one request as multiple observations", () => {
    const { events, result, findings } = evidence("broken");
    const fabricated = structuredClone(result);
    fabricated.observations[5]!.observedScore = 42;
    expect(gradeCalculationClaims("broken", events, fabricated, findings).observationsMatchServer).toBe(false);
    fabricated.observations[5]!.skills = "Python";
    expect(gradeCalculationClaims("broken", events, fabricated, findings).observationsMatchServer).toBe(false);
    expect(gradeCalculationClaims("broken", events.slice(0, 3), result, findings).observationsMatchServer).toBe(false);
  });
  it("rejects treating the broken API response as the expected answer", () => {
    const { events, result, findings } = evidence("broken");
    result.observations.forEach(o => { o.expectedScore = o.observedScore; });
    expect(gradeCalculationClaims("broken", events, result, findings).independentCalculation).toBe(false);
  });
  it("keeps diagnosis and evidence visible when findings use an invalid schema", () => {
    const { events, result, findings } = evidence("broken");
    const invalid = { findings: findings.findings.map(f => ({ ...f, calls: [{ request: "POST /api/match" }] })) };
    const checks = gradeCalculationClaims("broken", events, result, invalid);
    expect(checks.findingsSchema).toBe(false);
    expect(checks.report).toBe(false);
    expect(checks.diagnosis).toBe(true);
    expect(checks.observationsMatchServer).toBe(true);
    expect(passes(checks)).toBe(false);
  });
  it("requires two distinct positive scores and a no-match control in each format", () => {
    const { events, result, findings } = evidence("broken");
    result.observations = result.observations.filter(o => o.expectedScore !== 0);
    expect(passes(gradeCalculationClaims("broken", events, result, findings))).toBe(false);
    const onlyZeros = evidence("fixed");
    onlyZeros.result.observations.forEach(o => { o.skills = "Rust"; o.expectedScore = o.observedScore = 0; });
    expect(gradeCalculationClaims("fixed", onlyZeros.events, onlyZeros.result, onlyZeros.findings).reproducedWithControls).toBe(false);
  });
  it("rejects false alarms, inconclusive conclusions and extra or mismatched findings", () => {
    const broken = evidence("broken");
    const fixed = evidence("fixed");
    expect(passes(gradeCalculationClaims("fixed", fixed.events, { ...fixed.result, verdict: "bug" }, broken.findings))).toBe(false);
    expect(passes(gradeCalculationClaims("broken", broken.events, { ...broken.result, verdict: "inconclusive" }, broken.findings))).toBe(false);
    expect(passes(gradeCalculationClaims("broken", broken.events, broken.result, { findings: [] }))).toBe(false);
    broken.findings.findings[0]!.expected = "133%";
    expect(gradeCalculationClaims("broken", broken.events, broken.result, broken.findings).report).toBe(false);
  });
  it.each(["broken", "fixed"] as const)("returns HTTP 200 even when %s calculation is wrong", async variant => {
    const fixture = await startFixture(calculationSource(variant));
    try {
      for (const format of ["list", "text"]) {
        for (const [skills, score] of [["Python, SQL", 67], ["docker", 33], ["Rust", 0], ["PYTHON, SQL, Docker, Python", 100]] as const) {
          const response = await fetch(fixture.url + "/api/match", { method: "POST", body: JSON.stringify({ format, skills }) });
          expect(response.status).toBe(200);
          expect(await response.json()).toEqual({ score: variant === "broken" && format === "text" ? 0 : score });
        }
      }
    } finally { await fixture.close(); }
  });
  it("selects independent tasks and fails on unknown names", () => {
    expect(selectTasks("all").map(t => t.id)).toEqual(["profile", "calculation"]);
    expect(selectTasks("calculation")).toHaveLength(1);
    expect(() => selectTasks("typo")).toThrow("Unknown task");
    for (const task of selectTasks("all")) {
      expect(task.source("broken")).not.toBe(task.source("fixed"));
      expect(task.instructions).not.toContain("/Users/");
    }
  });
});

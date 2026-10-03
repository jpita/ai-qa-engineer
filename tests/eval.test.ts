import { describe, it, expect } from "vitest";
import { fixtureSource, startFixture, type Event } from "../scripts/evals/fixture.js";
import { grade, gradeClaims } from "../scripts/evals/grade.js";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const result = { verdict: "bug", summary: "Bio was lost", savedBio: "New bio", reloadedBio: "Original bio", screenshot: "after-reload.png" };
const findings = { findings: [{ title: "Bio lost", feature: "Profile", endpoint: "PUT /api/profile", severity: "medium",
  reproduction: "Save and reload twice", observed: "Original bio", expected: "New bio" }] };
const cycle: Event[] = [
  { method: "PUT", path: "/api/profile", bio: "New bio", browser: true },
  { method: "GET", path: "/", browser: true },
  { method: "GET", path: "/api/profile", bio: "Original bio", browser: true },
];
const events = [...cycle, ...cycle];
const passes = (checks: ReturnType<typeof gradeClaims>) => Object.values(checks).every(Boolean);

describe("profile persistence evaluator", () => {
  it("accepts a supported defect and rejects the same report on a fixed app", () => {
    expect(passes(gradeClaims("broken", events, result, findings))).toBe(true);
    expect(passes(gradeClaims("fixed", events, result, findings))).toBe(false);
  });
  it("accepts a verified healthy flow with no findings", () => {
    const fixedEvents = events.map(e => e.path === "/api/profile" ? { ...e, bio: "New bio" } : e);
    expect(passes(gradeClaims("fixed", fixedEvents, { ...result, verdict: "working", reloadedBio: "New bio" }, { findings: [] }))).toBe(true);
  });
  it("accepts different inputs across reproductions and checks the final reported values", () => {
    const different = [...cycle.map(e => e.method === "PUT" ? { ...e, bio: "First change" } : e), ...cycle];
    expect(passes(gradeClaims("broken", different, result, findings))).toBe(true);
    expect(passes(gradeClaims("broken", different, { ...result, savedBio: "Not actually submitted" }, findings))).toBe(false);
  });
  it("rejects correct guesses without execution and API-only evidence", () => {
    expect(passes(gradeClaims("broken", [], result, findings))).toBe(false);
    expect(passes(gradeClaims("broken", events.map(e => ({ ...e, browser: false })), result, findings))).toBe(false);
  });
  it("rejects one reproduction, fabricated observations, missing reports and inconclusive verdicts", () => {
    expect(passes(gradeClaims("broken", cycle, result, findings))).toBe(false);
    expect(passes(gradeClaims("broken", events, { ...result, reloadedBio: "invented" }, findings))).toBe(false);
    expect(passes(gradeClaims("broken", events, result, undefined))).toBe(false);
    expect(passes(gradeClaims("broken", events, { ...result, verdict: "inconclusive" }, findings))).toBe(false);
  });
  it("rejects extra findings rather than rewarding overreporting", () => {
    expect(passes(gradeClaims("broken", events, result, { findings: [...findings.findings, ...findings.findings] }))).toBe(false);
  });
  it("fails closed on absent artifacts, invalid PNGs and screenshots outside the trial", async () => {
    const directory = await mkdtemp(join(tmpdir(), "qa-grader-test-"));
    try {
      expect((await grade("broken", events, directory)).passed).toBe(false);
      await writeFile(join(directory, "result.json"), JSON.stringify(result));
      await writeFile(join(directory, "findings.json"), JSON.stringify(findings));
      await writeFile(join(directory, "after-reload.png"), "not an image");
      expect((await grade("broken", events, directory)).checks.screenshot).toBe(false);
      await writeFile(join(directory, "result.json"), JSON.stringify({ ...result, screenshot: "../outside.png" }));
      expect((await grade("broken", events, directory)).passed).toBe(false);
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
  it("serves the exact source variant and resets state for every instance", async () => {
    for (const variant of ["broken", "fixed", "fixed"] as const) {
      const fixture = await startFixture(fixtureSource(variant));
      try {
        expect(await (await fetch(fixture.url + "/api/profile")).json()).toEqual({ bio: "Original bio" });
        await fetch(fixture.url + "/api/profile", { method: "PUT", body: JSON.stringify({ bio: "New bio" }) });
        expect(await (await fetch(fixture.url + "/api/profile")).json()).toEqual({ bio: variant === "fixed" ? "New bio" : "Original bio" });
      } finally { await fixture.close(); }
    }
  });
});

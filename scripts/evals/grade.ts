import { gradeArtifacts } from "./artifacts.js";
import { z } from "zod";
import { FindingsSchema } from "../types.js";
import type { Event, Variant } from "./fixture.js";

export const ResultSchema = z.object({
  verdict: z.enum(["bug", "working", "inconclusive"]),
  summary: z.string().min(1),
  savedBio: z.string().min(1),
  reloadedBio: z.string(),
  screenshot: z.string().min(1),
});

export function gradeClaims(variant: Variant, events: Event[], raw: unknown, findings: unknown) {
  const result = ResultSchema.safeParse(raw);
  const report = FindingsSchema.safeParse(findings);
  const checks = {
    resultSchema: result.success, findingsSchema: report.success,
    diagnosis: false,
    exercisedThroughBrowser: false,
    observationsMatchServer: false,
    report: false,
  };
  if (!result.success) return checks;
  const r = result.data;
  checks.diagnosis = r.verdict === (variant === "broken" ? "bug" : "working");
  // Require two save -> page reload -> profile read cycles. Do not accept a
  // request made directly to the API as evidence of exercising the UI.
  const cycles = events.flatMap((event, index) => {
    if (event.method !== "PUT" || event.path !== "/api/profile" || !event.browser || !event.bio || event.bio === "Original bio") return [];
    const nextWrite = events.findIndex((e, i) => i > index && e.method === "PUT");
    const following = events.slice(index + 1, nextWrite < 0 ? undefined : nextWrite);
    const navigation = following.findIndex(e => e.method === "GET" && e.path === "/" && e.browser);
    const read = navigation < 0 ? undefined : following.slice(navigation + 1).find(e => e.method === "GET" && e.path === "/api/profile" && e.browser);
    return read ? [{ saved: event.bio, reloaded: read.bio }] : [];
  });
  checks.exercisedThroughBrowser = cycles.length >= 2;
  const last = cycles.at(-1);
  checks.observationsMatchServer = cycles.length >= 2 && last?.saved === r.savedBio && last.reloaded === r.reloadedBio
    && cycles.every(c => variant === "broken" ? c.reloaded !== c.saved : c.reloaded === c.saved);
  checks.report = report.success && (variant === "fixed" ? report.data.findings.length === 0 :
    report.data.findings.length === 1 && report.data.findings.every(f =>
      f.endpoint === "PUT /api/profile" && f.reproduction.trim().length > 0 &&
      f.observed.includes(r.reloadedBio) && f.expected.includes(r.savedBio)));
  return checks;
}

export function grade(variant: Variant, events: Event[], directory: string) {
  return gradeArtifacts(directory, (result, findings) => gradeClaims(variant, events, result, findings));
}

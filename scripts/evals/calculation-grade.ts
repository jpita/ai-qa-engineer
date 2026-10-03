import { z } from "zod";
import { FindingsSchema } from "../types.js";
import { gradeArtifacts } from "./artifacts.js";
import type { Event, Variant } from "./fixture.js";

export const ObservationSchema = z.object({
  format: z.enum(["list", "text"]), skills: z.string(),
  expectedScore: z.number().int().min(0).max(100),
  observedScore: z.number().int().min(0).max(100),
});
export const CalculationResultSchema = z.object({
  verdict: z.enum(["bug", "working", "inconclusive"]), summary: z.string().min(1),
  observations: z.array(ObservationSchema).min(6), screenshot: z.string().min(1),
});

// Ground truth from the stated requirement, never from the app's score or code.
export function expectedScore(skills: string): number {
  const tokens = new Set(skills.split(",").map(s => s.trim().toLowerCase()));
  const count = Number(tokens.has("python")) + Number(tokens.has("sql")) + Number(tokens.has("docker"));
  return [0, 33, 67, 100][count]!;
}

export function gradeCalculationClaims(variant: Variant, events: Event[], raw: unknown, findings: unknown) {
  const result = CalculationResultSchema.safeParse(raw);
  const report = FindingsSchema.safeParse(findings);
  const checks = { resultSchema: result.success, findingsSchema: report.success, diagnosis: false, exercisedThroughBrowser: false, independentCalculation: false,
    observationsMatchServer: false, reproducedWithControls: false, report: false };
  if (!result.success) return checks;
  const r = result.data;
  checks.diagnosis = r.verdict === (variant === "broken" ? "bug" : "working");
  const recorded = events.filter(e => e.method === "POST" && e.path === "/api/match" && e.browser);
  // Each claimed observation needs a distinct recorded request in the same order.
  let cursor = 0;
  checks.observationsMatchServer = r.observations.every(o => {
    const index = recorded.findIndex((e, i) => i >= cursor && e.format === o.format && e.skills === o.skills && e.score === o.observedScore);
    if (index < 0) return false;
    cursor = index + 1;
    return true;
  });
  checks.exercisedThroughBrowser = ["list", "text"].every(format => recorded.filter(e => e.format === format).length >= 3);
  checks.independentCalculation = r.observations.every(o => o.expectedScore === expectedScore(o.skills));
  checks.reproducedWithControls = (["list", "text"] as const).every(format => {
    const samples = r.observations.filter(o => o.format === format);
    const positive = samples.filter(o => o.expectedScore > 0);
    const control = samples.some(o => o.expectedScore === 0 && o.observedScore === 0);
    const reproduced = positive.length >= 2 && new Set(positive.map(o => o.expectedScore)).size >= 2;
    return control && reproduced && samples.every(o =>
      variant === "broken" && format === "text" && o.expectedScore > 0
        ? o.observedScore !== o.expectedScore : o.observedScore === o.expectedScore);
  });
  const defect = r.observations.find(o => o.expectedScore !== o.observedScore);
  const mentionsScore = (text: string, score: number) => new RegExp(`(^|[^\\d.])${score}(?:\\s*%|\\b)(?![\\d.])`).test(text);
  checks.report = report.success && (variant === "fixed" ? report.data.findings.length === 0 :
    !!defect && report.data.findings.length === 1 && report.data.findings.every(f =>
      f.endpoint === "POST /api/match" && f.reproduction.trim().length > 0 &&
      mentionsScore(f.expected, defect.expectedScore) && mentionsScore(f.observed, defect.observedScore)));
  return checks;
}

export function gradeCalculation(variant: Variant, events: Event[], directory: string) {
  return gradeArtifacts(directory, (result, findings) => gradeCalculationClaims(variant, events, result, findings));
}

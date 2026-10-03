import { fixtureSource } from "./fixture.js";
import { grade } from "./grade.js";
import { runReference } from "./reference.js";
import { calculationSource } from "./calculation-fixture.js";
import { gradeCalculation } from "./calculation-grade.js";
import { runReference as runCalculationReference } from "./calculation-reference.js";

export const tasks = [
  {
    id: "profile", version: "profile-bio-persistence-v1", title: "Profile bio persistence",
    description: "Broken: save loses the bio after reload. Fixed: the saved bio persists.",
    source: fixtureSource, grade, runReference, screenshot: "after-reload.png", referenceFile: "reference.ts", graderFile: "grade.ts", graderExport: "grade",
    instructions: `Requirement: editing the Bio field and clicking Save must preserve the new bio after a full page reload.
Scope: ONLY profile bio persistence.
Wait for #bio[data-loaded="true"] before reading/filling, and for the Saved status after saving.
Save a distinct non-empty bio (different from Original bio), reload and inspect it, twice. You may use different text each time; report the final cycle's exact saved and reloaded values.
Required artifacts:
1. result.json: {"verdict":"bug"|"working"|"inconclusive","summary":"explanation","savedBio":"exact text entered","reloadedBio":"exact text shown after reload","screenshot":"after-reload.png"}
2. after-reload.png: real screenshot after the final reload.
3. findings.json in the skill's schema. Working: {"findings":[]}. Broken: exactly one persistence finding for "PUT /api/profile", with reproduction steps, expected including saved text and observed including reloaded text.`,
  },
  {
    id: "calculation", version: "match-score-calculation-v1", title: "Match score calculation",
    description: "Broken: text requirements silently yield incorrect scores. Fixed: list and text formats follow the same formula.",
    source: calculationSource, grade: gradeCalculation, runReference: runCalculationReference,
    screenshot: "after-calculation.png", referenceFile: "calculation-reference.ts", graderFile: "calculation-grade.ts", graderExport: "gradeCalculation",
    instructions: `Requirement: the displayed match score must equal matching requirements / 3 × 100, rounded to the nearest integer, for the job requirements Python, SQL, Docker.
Match whole skill names ignoring case and surrounding spaces; ignore extra and duplicate candidate skills. List and Text formats must produce identical correct scores for the same skills.
Scope: ONLY match-score calculation. HTTP success is not proof that a number is correct.
Use the browser form to test BOTH formats. For EACH format, use at least two distinct positive expected scores and one no-match control (at least six calculations total). Calculate expected scores independently from the requirement, not from the implementation or API response. Read the displayed score after each calculation completes. Reproduce any discrepancy with a second positive input.
Required artifacts:
1. result.json: {"verdict":"bug"|"working"|"inconclusive","summary":"explanation","observations":[{"format":"list"|"text","skills":"exact comma-separated input","expectedScore":67,"observedScore":67}],"screenshot":"after-calculation.png"}. Include every tested case in execution order; the numbers above illustrate the schema, not an answer.
2. after-calculation.png: real screenshot after a calculation; show a failing positive case if one exists.
3. findings.json in the skill's schema. Working: {"findings":[]}. Broken: exactly one calculation finding for "POST /api/match", with reproduction steps and expected/observed numbers matching the FIRST discrepancy in observations.`,
  },
] as const;

export function selectTasks(selection: string) {
  if (selection === "all") return [...tasks];
  const selected = tasks.filter(task => task.id === selection);
  if (!selected.length) throw new Error(`Unknown task ${selection}. Use all, ${tasks.map(t => t.id).join(", ")}`);
  return selected;
}

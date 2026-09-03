import { z } from "zod";

export const RiskLevel = z.enum(["high", "medium", "low"]);
export const TestLayer = z.enum(["api", "ui", "ui_mocked"]);

export const ElementSchema = z.object({
  role: z.string(),
  name: z.string(),
  selector: z.string(),
});

export const ObservedCallSchema = z.object({
  method: z.string(),
  path: z.string(),
  status: z.number(),
});

export const PageSchema = z.object({
  url: z.string(),
  title: z.string(),
  elements: z.array(ElementSchema),
  calls: z.array(ObservedCallSchema),
});

export const UiMapSchema = z.object({
  target: z.string(),
  crawledAt: z.string(),
  pages: z.array(PageSchema),
});

export const EndpointSchema = z.object({
  method: z.string(),
  path: z.string(),
  handlerFile: z.string(),
  purpose: z.string(),
  requiredFields: z.array(z.string()),
  statusCodes: z.array(z.number()),
  validationRules: z.array(z.string()),
  authRequired: z.boolean(),
});

export const ApiSurfaceSchema = z.object({
  endpoints: z.array(EndpointSchema),
  notes: z.array(z.string()),
});

export const CoverageLinkSchema = z.object({
  endpoint: z.string(),
  callerFiles: z.array(z.string()),
  callerPages: z.array(z.string()),
  source: z.enum(["observed", "source", "both"]),
});

export const CoverageMapSchema = z.object({
  links: z.array(CoverageLinkSchema),
  endpointsWithNoUiCaller: z.array(z.string()),
  callsWithNoKnownEndpoint: z.array(z.string()),
});

export const TestCaseSchema = z.object({
  id: z.string(),
  title: z.string(),
  layer: TestLayer,
  endpoint: z.string().nullable(),
  risk: RiskLevel,
  why: z.string(),
  steps: z.array(z.string()),
  expected: z.string(),
});

export const TestPlanSchema = z.object({
  summary: z.string(),
  riskAreas: z.array(z.object({ area: z.string(), risk: RiskLevel, reason: z.string() })),
  cases: z.array(TestCaseSchema),
});

export const TriageVerdictSchema = z.object({
  caseId: z.string(),
  verdict: z.enum(["product_bug", "test_bug", "environment", "inconclusive"]),
  confidence: z.enum(["high", "medium", "low"]),
  evidence: z.array(z.string()),
  reasoning: z.string(),
  suggestedFix: z.string().nullable(),
});

export const TriageSchema = z.object({ verdicts: z.array(TriageVerdictSchema) });

export type UiMap = z.infer<typeof UiMapSchema>;
export type ApiSurface = z.infer<typeof ApiSurfaceSchema>;
export type Endpoint = z.infer<typeof EndpointSchema>;
export type CoverageMap = z.infer<typeof CoverageMapSchema>;
export type TestPlan = z.infer<typeof TestPlanSchema>;
export type TestCase = z.infer<typeof TestCaseSchema>;
export type Triage = z.infer<typeof TriageSchema>;

export interface RunResult {
  caseId: string;
  status: "passed" | "failed" | "timedOut" | "skipped";
  durationMs: number;
  error: string | null;
  attachments: { name: string; path: string }[];
}

export interface CoverageGap {
  endpoint: string;
  callerPages: string[];
  missingLayer: "api" | "ui";
}

// --- what SKILL.md emits (the agent-driven run) ---

export const FindingSchema = z.object({
  title: z.string(),
  feature: z.string(),
  endpoint: z.string(),
  severity: z.enum(["high", "medium", "low"]),
  reproduction: z.string(),
  calls: z.array(z.string()).optional(),
  screenshot: z.string().optional(),
  observed: z.string(),
  expected: z.string(),
});
export const FindingsSchema = z.object({ findings: z.array(FindingSchema) });
export type Finding = z.infer<typeof FindingSchema>;

export const RouteCoverageRowSchema = z.object({
  route: z.string(),
  feature: z.string(),
  cases: z.array(z.string()),
  result: z.string(),
});
export const RouteCoverageSchema = z.object({ coverage: z.array(RouteCoverageRowSchema) });

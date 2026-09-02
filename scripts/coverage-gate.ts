import type { CoverageGap, CoverageMap, TestPlan } from "./types.js";

export function findCoverageGaps(coverage: CoverageMap, testPlan: TestPlan): CoverageGap[] {
  const gaps: CoverageGap[] = [];

  for (const link of coverage.links) {
    if (link.callerPages.length === 0) continue;

    const cases = testPlan.cases.filter((c) => c.endpoint === link.endpoint);
    const hasApi = cases.some((c) => c.layer === "api");
    const hasUi = cases.some((c) => c.layer === "ui" || c.layer === "ui_mocked");

    if (!hasApi) {
      gaps.push({ endpoint: link.endpoint, callerPages: link.callerPages, missingLayer: "api" });
    }
    if (!hasUi) {
      gaps.push({ endpoint: link.endpoint, callerPages: link.callerPages, missingLayer: "ui" });
    }
  }

  return gaps;
}

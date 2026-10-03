import { describe, expect, it } from "vitest";
import { summarizeTiming } from "../scripts/evals/timing.js";

describe("eval timings", () => {
  it("keeps fast failures separate from successful-trial speed", () => {
    expect(summarizeTiming([
      { passed: true, agentElapsedSeconds: 12 },
      { passed: false, agentElapsedSeconds: 1 },
      { passed: true, agentElapsedSeconds: 8 },
    ], 25)).toEqual({ wallSeconds: 25, totalAgentSeconds: 21, averageAgentSeconds: 7,
      medianAgentSeconds: 8, averagePassedAgentSeconds: 10, averageFailedAgentSeconds: 1 });
  });
  it("includes timeouts and does not report zero seconds for absent successes", () => {
    const result = summarizeTiming([{ passed: false, agentElapsedSeconds: 180 }, { passed: false, agentElapsedSeconds: 2 }], 185);
    expect(result.totalAgentSeconds).toBe(182);
    expect(result.medianAgentSeconds).toBe(91);
    expect(result.averagePassedAgentSeconds).toBeNull();
    expect(summarizeTiming([], 0).averageAgentSeconds).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { matches } from "../scripts/coverage.js";
import { canonical } from "../scripts/crawl.js";
import { findCoverageGaps } from "../scripts/coverage-gate.js";
import type { CoverageMap, TestPlan } from "../scripts/types.js";

describe("matches", () => {
  it("matches an exact path", () => {
    expect(matches("GET", "/rest/products", "GET /rest/products")).toBe(true);
  });

  it("ignores a trailing slash", () => {
    expect(matches("GET", "/rest/products", "GET /rest/products/")).toBe(true);
  });

  it("does not match a different method", () => {
    expect(matches("GET", "/rest/products", "POST /rest/products")).toBe(false);
  });

  it("matches an express style parameter", () => {
    expect(matches("GET", "/api/users/:id", "GET /api/users/42")).toBe(true);
  });

  it("matches a brace style parameter", () => {
    expect(matches("GET", "/api/users/{id}", "GET /api/users/42")).toBe(true);
  });

  it("does not let a parameter swallow a path segment", () => {
    expect(matches("GET", "/api/users/:id", "GET /api/users/42/orders")).toBe(false);
  });

  it("does not treat a dot as a wildcard", () => {
    expect(matches("GET", "/a.c", "GET /abc")).toBe(false);
  });
});

const coverage = (endpoint: string, callerPages: string[]): CoverageMap => ({
  links: [{ endpoint, callerFiles: [], callerPages, source: "observed" }],
  endpointsWithNoUiCaller: [],
  callsWithNoKnownEndpoint: [],
});

const planWith = (layers: TestPlan["cases"][number]["layer"][], endpoint: string): TestPlan => ({
  summary: "",
  riskAreas: [],
  cases: layers.map((layer, i) => ({
    id: `c${i}`,
    title: `case ${i}`,
    layer,
    endpoint,
    risk: "high" as const,
    why: "",
    steps: [],
    expected: "",
  })),
});

describe("findCoverageGaps", () => {
  const endpoint = "POST /rest/basket";
  const pages = ["http://app/basket"];

  it("reports nothing when both layers cover the endpoint", () => {
    expect(findCoverageGaps(coverage(endpoint, pages), planWith(["api", "ui"], endpoint))).toEqual([]);
  });

  it("accepts a mocked ui case as ui coverage", () => {
    expect(
      findCoverageGaps(coverage(endpoint, pages), planWith(["api", "ui_mocked"], endpoint)),
    ).toEqual([]);
  });

  it("reports the missing ui layer when only the api was tested", () => {
    const gaps = findCoverageGaps(coverage(endpoint, pages), planWith(["api"], endpoint));
    expect(gaps).toEqual([{ endpoint, callerPages: pages, missingLayer: "ui" }]);
  });

  it("reports the missing api layer when only the browser was driven", () => {
    const gaps = findCoverageGaps(coverage(endpoint, pages), planWith(["ui"], endpoint));
    expect(gaps).toEqual([{ endpoint, callerPages: pages, missingLayer: "api" }]);
  });

  it("ignores an endpoint with no UI caller, since one layer is enough there", () => {
    expect(findCoverageGaps(coverage(endpoint, []), planWith(["api"], endpoint))).toEqual([]);
  });
});

describe("canonical", () => {
  it("treats a bare origin and a trailing slash as the same page", () => {
    expect(canonical("http://app:80/")).toBe(canonical("http://app:80"));
  });

  it("strips a trailing slash from a path", () => {
    expect(canonical("http://app/about/")).toBe(canonical("http://app/about"));
  });

  it("strips the fragment", () => {
    expect(canonical("http://app/about#team")).toBe(canonical("http://app/about"));
  });

  it("keeps different paths apart", () => {
    expect(canonical("http://app/about")).not.toBe(canonical("http://app/contact"));
  });
});

describe("canonical with hash routing", () => {
  it("keeps a hash route, since it is a real page", () => {
    expect(canonical("http://app/#/login")).not.toBe(canonical("http://app/"));
  });

  it("keeps two hash routes apart", () => {
    expect(canonical("http://app/#/login")).not.toBe(canonical("http://app/#/search"));
  });

  it("still strips a plain anchor fragment", () => {
    expect(canonical("http://app/about#team")).toBe(canonical("http://app/about"));
  });

  it("ignores a trailing slash inside a hash route", () => {
    expect(canonical("http://app/#/login/")).toBe(canonical("http://app/#/login"));
  });
});

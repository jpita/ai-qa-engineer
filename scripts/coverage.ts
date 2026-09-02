import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ApiSurface, CoverageMap, UiMap } from "./types.js";

const run = promisify(execFile);

export async function buildCoverage(
  uiMap: UiMap,
  surface: ApiSurface,
  sourcePath: string | null,
): Promise<CoverageMap> {
  const observed = new Map<string, Set<string>>();
  for (const page of uiMap.pages) {
    for (const call of page.calls) {
      const key = `${call.method} ${call.path}`;
      const pages = observed.get(key) ?? new Set<string>();
      pages.add(page.url);
      observed.set(key, pages);
    }
  }

  const links: CoverageMap["links"] = [];
  const matchedCalls = new Set<string>();

  for (const endpoint of surface.endpoints) {
    const key = `${endpoint.method} ${endpoint.path}`;
    const callerPages = new Set<string>();

    for (const [observedKey, pages] of observed) {
      if (matches(endpoint.method, endpoint.path, observedKey)) {
        matchedCalls.add(observedKey);
        for (const p of pages) callerPages.add(p);
      }
    }

    const callerFiles = sourcePath === null ? [] : await grepCallers(sourcePath, endpoint.path);
    if (callerPages.size === 0 && callerFiles.length === 0) continue;

    links.push({
      endpoint: key,
      callerFiles,
      callerPages: [...callerPages],
      source:
        callerPages.size > 0 && callerFiles.length > 0
          ? "both"
          : callerPages.size > 0
            ? "observed"
            : "source",
    });
  }

  const linked = new Set(links.map((l) => l.endpoint));

  return {
    links,
    endpointsWithNoUiCaller: surface.endpoints
      .map((e) => `${e.method} ${e.path}`)
      .filter((k) => !linked.has(k)),
    callsWithNoKnownEndpoint: [...observed.keys()].filter((k) => !matchedCalls.has(k)),
  };
}

export function matches(method: string, routePath: string, observedKey: string): boolean {
  const [observedMethod, observedPath] = observedKey.split(" ");
  if (observedMethod === undefined || observedPath === undefined) return false;
  if (observedMethod.toUpperCase() !== method.toUpperCase()) return false;

  const pattern = routePath
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\\\{[^}]+\\\}|:[A-Za-z_]+/g, "[^/]+");
  return new RegExp(`^${pattern}/?$`).test(observedPath);
}

async function grepCallers(sourcePath: string, routePath: string): Promise<string[]> {
  const literal = routePath.split(/[:{]/)[0]?.replace(/\/$/, "") ?? "";
  if (literal.length < 4) return [];

  try {
    const { stdout } = await run(
      "git",
      ["-C", sourcePath, "grep", "-l", "-F", literal, "--", "*.ts", "*.tsx", "*.js", "*.jsx", "*.vue", "*.html"],
      { maxBuffer: 4_000_000 },
    );
    return stdout
      .split("\n")
      .filter((f) => f !== "" && !/(test|spec|routes|controllers|server)/i.test(f))
      .slice(0, 12);
  } catch {
    return [];
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { parseArgs } = await import("node:util");
  const { readFile, writeFile } = await import("node:fs/promises");
  const { UiMapSchema, ApiSurfaceSchema } = await import("./types.js");
  const { values } = parseArgs({
    options: {
      ui: { type: "string" },
      api: { type: "string" },
      source: { type: "string" },
      out: { type: "string" },
    },
  });
  if (values.ui === undefined || values.api === undefined || values.out === undefined) {
    process.stderr.write(
      "usage: tsx scripts/coverage.ts --ui <ui-map.json> --api <api-surface.json> [--source <path>] --out <file>\n",
    );
    process.exit(1);
  }
  const uiMap = UiMapSchema.parse(JSON.parse(await readFile(values.ui, "utf8")));
  const surface = ApiSurfaceSchema.parse(JSON.parse(await readFile(values.api, "utf8")));
  const map = await buildCoverage(uiMap, surface, values.source ?? null);
  await writeFile(values.out, JSON.stringify(map, null, 2), "utf8");
  process.stderr.write(
    `${map.links.length} endpoints reached from the UI, ${map.endpointsWithNoUiCaller.length} with no UI caller -> ${values.out}\n`,
  );
}

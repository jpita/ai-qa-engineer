import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import type { UiMap } from "./types.js";

const MAX_PAGES = 60;

export interface CrawlOptions {
  authStatePath?: string | undefined;
  seedRoutes?: string[] | undefined;
}

export async function crawlUi(target: string, options: CrawlOptions = {}): Promise<UiMap> {
  const browser = await chromium.launch();
  const context = await browser.newContext(
    options.authStatePath === undefined
      ? {}
      : { storageState: JSON.parse(await readFile(options.authStatePath, "utf8")) },
  );
  const page = await context.newPage();
  const origin = new URL(target).origin;

  let calls: UiMap["pages"][number]["calls"] = [];
  page.on("response", (response) => {
    const request = response.request();
    const type = request.resourceType();
    if (type !== "xhr" && type !== "fetch") return;
    if (!response.url().startsWith(origin)) return;
    calls.push({
      method: request.method(),
      path: new URL(response.url()).pathname,
      status: response.status(),
    });
  });

  const seen = new Set<string>();
  const base = target.replace(/\/$/, "");
  const queue = [
    canonical(target),
    ...(options.seedRoutes ?? []).map((r) => canonical(`${base}/#/${r.replace(/^[#/]+/, "")}`)),
  ];
  const pages: UiMap["pages"] = [];

  while (queue.length > 0 && pages.length < MAX_PAGES) {
    const url = queue.shift();
    if (url === undefined || seen.has(url)) continue;
    seen.add(url);

    calls = [];
    try {
      await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    } catch {
      continue;
    }

    const elements = await page.evaluate(() => {
      const nodes = document.querySelectorAll(
        "button, a[href], input, select, textarea, [role=button], [role=link]",
      );
      return [...nodes].slice(0, 60).map((el) => ({
        role: el.getAttribute("role") ?? el.tagName.toLowerCase(),
        name:
          el.getAttribute("aria-label") ??
          el.getAttribute("placeholder") ??
          (el.textContent ?? "").trim().slice(0, 60),
        selector: el.id !== "" ? `#${el.id}` : el.tagName.toLowerCase(),
      }));
    });

    pages.push({ url, title: await page.title(), elements, calls: dedupe(calls) });

    const links = await page.evaluate((o) => {
      const anchors = [...document.querySelectorAll("a[href]")];
      const hashRouted = anchors.some((a) => (a.getAttribute("href") ?? "").startsWith("#/"));
      const sameOrigin = anchors
        .map((a) => (a as HTMLAnchorElement).href)
        .filter((h) => h.startsWith(o));
      const routed = [...document.querySelectorAll("[routerlink], [ng-reflect-router-link]")]
        .map((e) => e.getAttribute("routerlink") ?? e.getAttribute("ng-reflect-router-link") ?? "")
        .filter((r) => r.startsWith("/"))
        .map((r) => (hashRouted ? `${o}/#${r}` : `${o}${r}`));
      return [...sameOrigin, ...routed];
    }, origin);

    for (const link of links) {
      const clean = canonical(link);
      if (!seen.has(clean)) queue.push(clean);
    }
  }

  await browser.close();
  return { target, crawledAt: new Date().toISOString(), pages };
}

export function canonical(url: string): string {
  const parsed = new URL(url);
  parsed.search = "";
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.hash = parsed.hash.startsWith("#/")
    ? parsed.hash.replace(/\/+$/, "")
    : "";
  return parsed.toString();
}

function dedupe(calls: UiMap["pages"][number]["calls"]): UiMap["pages"][number]["calls"] {
  const seen = new Set<string>();
  return calls.filter((c) => {
    const key = `${c.method} ${c.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { parseArgs } = await import("node:util");
  const { writeFile, readFile: read } = await import("node:fs/promises");
  const { values } = parseArgs({
    options: {
      url: { type: "string" },
      out: { type: "string" },
      auth: { type: "string" },
      routes: { type: "string" },
    },
  });
  if (values.url === undefined || values.out === undefined) {
    process.stderr.write(
      "usage: tsx scripts/crawl.ts --url <url> --out <file> [--auth <auth.json>] [--routes <routes.json>]\n",
    );
    process.exit(1);
  }
  const seedRoutes =
    values.routes === undefined
      ? undefined
      : (JSON.parse(await read(values.routes, "utf8")) as string[]);

  const map = await crawlUi(values.url, { authStatePath: values.auth, seedRoutes });
  await writeFile(values.out, JSON.stringify(map, null, 2), "utf8");
  process.stderr.write(
    `${map.pages.length} pages, ${map.pages.flatMap((p) => p.calls).length} API calls -> ${values.out}\n`,
  );
}

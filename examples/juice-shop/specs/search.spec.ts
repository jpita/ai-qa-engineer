import { expect, test } from "@playwright/test";
import { BASE, dismissBanners, dismissOverlays } from "./helpers.js";

test("search-01 search returns matching products", async ({ request }) => {
  test.info().annotations.push({ type: "caseId", description: "search-01" });
  const res = await request.get(`${BASE}/rest/products/search?q=apple`);
  expect(res.status()).toBe(200);
  const rows = (await res.json()).data as { name: string; description: string }[];
  expect(rows.length).toBeGreaterThan(0);
  for (const row of rows) {
    expect(`${row.name} ${row.description}`.toLowerCase()).toContain("apple");
  }
});

test("search-02 an empty term returns the catalogue", async ({ request }) => {
  test.info().annotations.push({ type: "caseId", description: "search-02" });
  for (const url of [`${BASE}/rest/products/search`, `${BASE}/rest/products/search?q=`]) {
    const res = await request.get(url);
    expect(res.status(), url).toBe(200);
    expect((await res.json()).data.length, url).toBeGreaterThan(0);
  }
});

test("search-03 no matches returns an empty list", async ({ request }) => {
  test.info().annotations.push({ type: "caseId", description: "search-03" });
  const res = await request.get(`${BASE}/rest/products/search?q=zzzzzznotaproduct`);
  expect(res.status()).toBe(200);
  expect((await res.json()).data).toEqual([]);
});

test("search-04 a quote in the term does not break the query", async ({ request }) => {
  test.info().annotations.push({ type: "caseId", description: "search-04" });
  const res = await request.get(`${BASE}/rest/products/search?q=${encodeURIComponent("o'brien")}`);
  expect(res.status(), "a quote must not produce a server error").toBe(200);
  expect(await res.text()).not.toMatch(/SQLITE_ERROR|SequelizeDatabaseError|syntax error/i);
});

test("search-05 searching from the header shows results", async ({ page }) => {
  test.info().annotations.push({ type: "caseId", description: "search-05" });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await dismissOverlays(page);
  await page.locator('[aria-label="Open search"]').click();
  await page.locator("#searchQuery input, input[aria-label*='earch']").first().fill("apple");
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/q=apple/);
  const tiles = page.locator("mat-grid-tile, .mat-mdc-card");
  await expect(tiles.first()).toBeVisible();
  await expect(page.locator("body")).toContainText(/apple/i);
});

test("search-06 an empty result shows an empty state", async ({ page }) => {
  test.info().annotations.push({ type: "caseId", description: "search-06" });
  await page.route("**/rest/products/search**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "success", data: [] }) }),
  );
  await page.goto(`${BASE}/#/search?q=anything`, { waitUntil: "networkidle" });
  await dismissBanners(page);
  const body = await page.locator("body").innerText();
  expect(body, "an empty result must tell the user, not render nothing").toMatch(/no results|nothing found|no products|empty/i);
});

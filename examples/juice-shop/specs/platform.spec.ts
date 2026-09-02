import { expect, test } from "@playwright/test";
import { BASE, dismissBanners, loginUi, register } from "./helpers.js";

test("lang-01 the language list loads", async ({ request }) => {
  test.info().annotations.push({ type: "caseId", description: "lang-01" });
  const res = await request.get(`${BASE}/rest/languages`);
  expect(res.status()).toBe(200);
  const rows = (await res.json()) as { key: string }[];
  expect(rows.some((r) => r.key === "en")).toBe(true);
});

test("lang-02 the app renders when the language list fails", async ({ page }) => {
  test.info().annotations.push({ type: "caseId", description: "lang-02" });
  await page.route("**/rest/languages", (route) => route.fulfill({ status: 500, body: "{}" }));
  await page.goto(BASE, { waitUntil: "networkidle" });
  await dismissBanners(page);
  await expect(page.locator("app-root")).not.toBeEmpty();
});

test("cfg-01 the application configuration loads", async ({ request }) => {
  test.info().annotations.push({ type: "caseId", description: "cfg-01" });
  const res = await request.get(`${BASE}/rest/admin/application-configuration`);
  expect(res.status()).toBe(200);
  expect((await res.json()).config).toBeDefined();
});

test("cfg-02 every page loads the application configuration", async ({ page }) => {
  test.info().annotations.push({ type: "caseId", description: "cfg-02" });
  const statuses: number[] = [];
  page.on("response", (r) => {
    if (r.url().includes("/rest/admin/application-configuration")) statuses.push(r.status());
  });
  for (const route of ["", "#/login", "#/search"]) {
    await page.goto(`${BASE}/${route}`, { waitUntil: "networkidle" });
  }
  expect(statuses.length, "the config endpoint should be requested while browsing").toBeGreaterThan(0);
  expect(statuses.every((s) => s === 200), `saw statuses ${statuses.join(",")}`).toBe(true);
});

test("ver-01 the version endpoint returns a version", async ({ request }) => {
  test.info().annotations.push({ type: "caseId", description: "ver-01" });
  const res = await request.get(`${BASE}/rest/admin/application-version`);
  expect(res.status()).toBe(200);
  expect((await res.json()).version).toMatch(/\d+\.\d+\.\d+/);
});

test("ver-02 the version is shown in the UI", async ({ page, request }) => {
  test.info().annotations.push({ type: "caseId", description: "ver-02" });
  const version = (await (await request.get(`${BASE}/rest/admin/application-version`)).json()).version;
  await page.goto(BASE, { waitUntil: "networkidle" });
  await dismissBanners(page);
  await expect(page.locator("body")).toContainText(String(version));
});

test("stock-01 product quantities load", async ({ request }) => {
  test.info().annotations.push({ type: "caseId", description: "stock-01" });
  const res = await request.get(`${BASE}/api/Quantitys/`);
  expect(res.status()).toBe(200);
  const rows = (await res.json()).data as { ProductId: number; quantity: number }[];
  expect(rows.length).toBeGreaterThan(0);
  expect(typeof rows[0]?.ProductId).toBe("number");
  expect(typeof rows[0]?.quantity).toBe("number");
});

test("stock-02 the product list reflects stock", async ({ page }) => {
  test.info().annotations.push({ type: "caseId", description: "stock-02" });
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/Quantitys")),
    page.goto(BASE, { waitUntil: "networkidle" }),
  ]);
  expect(res.status()).toBe(200);
  await expect(page.locator("mat-grid-tile, .mat-mdc-card").first()).toBeVisible();
});

test("chal-01 the challenge list is readable", async ({ request }) => {
  test.info().annotations.push({ type: "caseId", description: "chal-01" });
  const res = await request.get(`${BASE}/api/Challenges/`);
  expect(res.status()).toBe(200);
  const rows = (await res.json()).data as { name: string; category: string; solved: boolean }[];
  expect(rows.length).toBe(116);
  expect(rows[0]?.category).toBeDefined();
});

test("chal-02 the score board renders challenges", async ({ page }) => {
  test.info().annotations.push({ type: "caseId", description: "chal-02" });
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/Challenges")),
    page.goto(`${BASE}/#/score-board`, { waitUntil: "networkidle" }),
  ]);
  expect(res.status()).toBe(200);
});

test("contact-01 a captcha is issued", async ({ request }) => {
  test.info().annotations.push({ type: "caseId", description: "contact-01" });
  const res = await request.get(`${BASE}/rest/captcha/`);
  expect(res.status()).toBe(200);
  const body = await res.json();
  expect(body.captchaId).toBeDefined();
  expect(body.captcha).toBeDefined();
});

test("contact-02 the contact page loads its captcha", async ({ page, request }) => {
  test.info().annotations.push({ type: "caseId", description: "contact-02" });
  const account = await register(request);
  await loginUi(page, account);
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/rest/captcha")),
    page.goto(`${BASE}/#/contact`, { waitUntil: "networkidle" }),
  ]);
  expect(res.status()).toBe(200);
});

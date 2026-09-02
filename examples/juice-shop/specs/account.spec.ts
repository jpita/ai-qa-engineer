import { expect, test } from "@playwright/test";
import { BASE, bearer, loginUi, register } from "./helpers.js";

test("order-01 order history loads for a logged in user", async ({ request }) => {
  test.info().annotations.push({ type: "caseId", description: "order-01" });
  const account = await register(request);
  const res = await request.get(`${BASE}/rest/order-history`, { headers: bearer(account) });
  expect(res.status()).toBe(200);
  expect(Array.isArray((await res.json()).data)).toBe(true);
});

test("order-02 order history requires authentication", async ({ request }) => {
  test.info().annotations.push({ type: "caseId", description: "order-02" });
  const res = await request.get(`${BASE}/rest/order-history`);
  expect([401, 403], `anonymous order history returned ${res.status()}`).toContain(res.status());
});

test("order-03 an unknown order id is rejected", async ({ request }) => {
  test.info().annotations.push({ type: "caseId", description: "order-03" });
  for (const id of ["undefined", "does-not-exist"]) {
    const res = await request.get(`${BASE}/rest/track-order/${id}`);
    const body = await res.json().catch(() => ({}));
    const rows = body?.data ?? [];
    expect(rows.length, `GET /rest/track-order/${id} returned ${rows.length} orders`).toBe(0);
  }
});

test("addr-01 addresses require authentication", async ({ request }) => {
  test.info().annotations.push({ type: "caseId", description: "addr-01" });
  const res = await request.get(`${BASE}/api/Addresss`);
  expect([401, 403], `anonymous addresses returned ${res.status()}`).toContain(res.status());
});

test("addr-02 the saved addresses page lists addresses", async ({ page, request }) => {
  test.info().annotations.push({ type: "caseId", description: "addr-02" });
  const account = await register(request);
  await loginUi(page, account);
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/Addresss")),
    page.goto(`${BASE}/#/address/saved`, { waitUntil: "networkidle" }),
  ]);
  expect(res.status()).toBe(200);
});

test("card-01 payment cards require authentication", async ({ request }) => {
  test.info().annotations.push({ type: "caseId", description: "card-01" });
  const res = await request.get(`${BASE}/api/Cards`);
  expect([401, 403], `anonymous cards returned ${res.status()}`).toContain(res.status());
});

import { expect, test } from "@playwright/test";
import { BASE, bearer, loginUi, register } from "./helpers.js";

test("basket-01 a user can read their own basket", async ({ request }) => {
  test.info().annotations.push({ type: "caseId", description: "basket-01" });
  const account = await register(request);
  const res = await request.get(`${BASE}/rest/basket/${account.bid}`, { headers: bearer(account) });
  expect(res.status()).toBe(200);
  expect((await res.json()).data.UserId).toBe(account.id);
});

test("basket-02 a user cannot read another user's basket", async ({ request }) => {
  test.info().annotations.push({ type: "caseId", description: "basket-02" });
  const a = await register(request);
  const b = await register(request);
  const res = await request.get(`${BASE}/rest/basket/${b.bid}`, { headers: bearer(a) });
  expect([401, 403, 404], `user A got status ${res.status()} for user B's basket`).toContain(res.status());
  expect(await res.text()).not.toContain(`"UserId":${b.id}`);
});

test("basket-03 an invalid basket id is rejected", async ({ request }) => {
  test.info().annotations.push({ type: "caseId", description: "basket-03" });
  const account = await register(request);
  for (const id of ["999999", "NaN", "abc"]) {
    const res = await request.get(`${BASE}/rest/basket/${id}`, { headers: bearer(account) });
    expect([400, 404], `GET /rest/basket/${id} returned ${res.status()}`).toContain(res.status());
  }
});

test("basket-04 the basket page shows the user's items", async ({ page, request }) => {
  test.info().annotations.push({ type: "caseId", description: "basket-04" });
  const account = await register(request);
  await loginUi(page, account);
  const [res] = await Promise.all([
    page.waitForResponse((r) => /\/rest\/basket\/\d+/.test(r.url())),
    page.goto(`${BASE}/#/basket`, { waitUntil: "networkidle" }),
  ]);
  expect(new URL(res.url()).pathname).toBe(`/rest/basket/${account.bid}`);
  expect(res.status()).toBe(200);
});

test("basket-05 the basket page handles a failed load", async ({ page, request }) => {
  test.info().annotations.push({ type: "caseId", description: "basket-05" });
  const account = await register(request);
  await loginUi(page, account);
  await page.route("**/rest/basket/**", (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "boom" }) }),
  );
  await page.goto(`${BASE}/#/basket`, { waitUntil: "networkidle" });
  await expect(page.locator("mat-spinner, .mat-mdc-progress-spinner")).toHaveCount(0);
});

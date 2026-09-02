import { expect, test } from "@playwright/test";
import { BASE, bearer, register, loginUi, tokenCookie } from "./helpers.js";

test("auth-01 a new account can be registered", async ({ request }) => {
  test.info().annotations.push({ type: "caseId", description: "auth-01" });
  const email = `aiqa-reg-${Date.now()}@test.local`;
  const res = await request.post(`${BASE}/api/Users/`, {
    data: { email, password: "AiQaTest123!", passwordRepeat: "AiQaTest123!", securityQuestion: { id: 1 }, securityAnswer: "test" },
  });
  expect(res.status()).toBe(201);
  expect((await res.json()).data.email).toBe(email);
});

test("auth-02 registering an existing email is rejected", async ({ request }) => {
  test.info().annotations.push({ type: "caseId", description: "auth-02" });
  const account = await register(request);
  const again = await request.post(`${BASE}/api/Users/`, {
    data: { email: account.email, password: account.password, passwordRepeat: account.password, securityQuestion: { id: 1 }, securityAnswer: "test" },
  });
  expect(again.status(), "a duplicate email must not create a second account").toBeGreaterThanOrEqual(400);
});

test("auth-03 valid credentials return a token", async ({ request }) => {
  test.info().annotations.push({ type: "caseId", description: "auth-03" });
  const account = await register(request);
  const res = await request.post(`${BASE}/rest/user/login`, { data: { email: account.email, password: account.password } });
  expect(res.status()).toBe(200);
  const auth = (await res.json()).authentication;
  expect(typeof auth.token).toBe("string");
  expect(auth.token.length).toBeGreaterThan(0);
  expect(typeof auth.bid).toBe("number");
});

test("auth-04 a wrong password is rejected", async ({ request }) => {
  test.info().annotations.push({ type: "caseId", description: "auth-04" });
  const account = await register(request);
  const res = await request.post(`${BASE}/rest/user/login`, { data: { email: account.email, password: "definitely-not-the-password" } });
  expect(res.status()).toBe(401);
  expect(await res.text()).not.toContain("token");
});

test("auth-05 a user can log in through the form", async ({ page, request }) => {
  test.info().annotations.push({ type: "caseId", description: "auth-05" });
  const account = await register(request);
  await loginUi(page, account);
  await expect(page.locator("#navbarAccount")).toBeVisible();
});

test("auth-06 the form shows an error for wrong credentials", async ({ page, request }) => {
  test.info().annotations.push({ type: "caseId", description: "auth-06" });
  const account = await register(request);
  await page.goto(`${BASE}/#/login`, { waitUntil: "networkidle" });
  const banner = page.locator('[aria-label="Close Welcome Banner"]').first();
  if (await banner.isVisible().catch(() => false)) await banner.click();
  await page.locator("#email").fill(account.email);
  await page.locator("#password").fill("wrong-password");
  await page.locator("#loginButton").click();
  await expect(page.locator(".error, mat-error, .mat-mdc-snack-bar-label").first()).toBeVisible();
  expect(page.url()).toContain("/login");
});

test("auth-07 the form handles a server error", async ({ page, request }) => {
  test.info().annotations.push({ type: "caseId", description: "auth-07" });
  const account = await register(request);
  await page.route("**/rest/user/login", (route) =>
    route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "boom" }) }),
  );
  await page.goto(`${BASE}/#/login`, { waitUntil: "networkidle" });
  const banner = page.locator('[aria-label="Close Welcome Banner"]').first();
  if (await banner.isVisible().catch(() => false)) await banner.click();
  await page.locator("#email").fill(account.email);
  await page.locator("#password").fill(account.password);
  await page.locator("#loginButton").click();
  await expect(page.locator(".error, mat-error, .mat-mdc-snack-bar-label").first()).toBeVisible();
});

test("sess-01 whoami returns the logged in user", async ({ request }) => {
  test.info().annotations.push({ type: "caseId", description: "sess-01" });
  const account = await register(request);
  const res = await request.get(`${BASE}/rest/user/whoami`, { headers: tokenCookie(account) });
  expect(res.status()).toBe(200);
  expect((await res.json()).user.email).toBe(account.email);
});

test("sess-02 whoami returns no user when anonymous", async ({ request }) => {
  test.info().annotations.push({ type: "caseId", description: "sess-02" });
  const res = await request.get(`${BASE}/rest/user/whoami`);
  const body = await res.json();
  expect(body.user?.email, "an anonymous caller must not get a user identity").toBeUndefined();
});

test("sess-03 the contact page identifies the logged in user", async ({ page, request }) => {
  test.info().annotations.push({ type: "caseId", description: "sess-03" });
  const account = await register(request);
  await loginUi(page, account);
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/rest/user/whoami")),
    page.goto(`${BASE}/#/contact`, { waitUntil: "networkidle" }),
  ]);
  expect(res.status()).toBe(200);
});

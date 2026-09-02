import { randomUUID } from "node:crypto";
import { type APIRequestContext, type Page, expect } from "@playwright/test";

export const BASE = process.env["BASE_URL"] ?? "http://localhost:3000";

export interface Account {
  email: string;
  password: string;
  token: string;
  bid: number;
  id: number;
}

export async function register(request: APIRequestContext): Promise<Account> {
  const email = `aiqa-${randomUUID()}@test.local`;
  const password = "AiQaTest123!";
  const created = await request.post(`${BASE}/api/Users/`, {
    data: {
      email,
      password,
      passwordRepeat: password,
      securityQuestion: { id: 1 },
      securityAnswer: "test",
    },
  });
  expect(created.status(), "registration should succeed").toBe(201);
  const id = (await created.json()).data.id as number;

  const login = await request.post(`${BASE}/rest/user/login`, { data: { email, password } });
  expect(login.status(), "login after registration should succeed").toBe(200);
  const auth = (await login.json()).authentication as { token: string; bid: number };
  return { email, password, token: auth.token, bid: auth.bid, id };
}

export function bearer(account: Account): Record<string, string> {
  return { Authorization: `Bearer ${account.token}` };
}

export function tokenCookie(account: Account): Record<string, string> {
  return { Cookie: `token=${account.token}` };
}

export async function dismissOverlays(page: Page): Promise<void> {
  await dismissBanners(page);
  await page
    .locator(".cdk-overlay-backdrop")
    .waitFor({ state: "detached", timeout: 5000 })
    .catch(() => {});
}

export async function dismissBanners(page: Page): Promise<void> {
  for (const selector of ['[aria-label="Close Welcome Banner"]', ".cc-btn"]) {
    const el = page.locator(selector).first();
    if (await el.isVisible().catch(() => false)) await el.click().catch(() => {});
  }
}

export async function loginUi(page: Page, account: Account): Promise<void> {
  await page.goto(`${BASE}/#/login`, { waitUntil: "networkidle" });
  await dismissBanners(page);
  await page.locator("#email").fill(account.email);
  await page.locator("#password").fill(account.password);
  const submit = page.locator("#loginButton");
  await expect(submit, "the login button must become enabled once the form is valid").toBeEnabled();
  await Promise.all([
    page.waitForResponse((r) => r.url().includes("/rest/user/login") && r.request().method() === "POST"),
    submit.click(),
  ]);
}

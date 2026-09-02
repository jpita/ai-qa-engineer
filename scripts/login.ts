import { writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { chromium, type Page } from "playwright";

const { values } = parseArgs({
  options: {
    url: { type: "string" },
    email: { type: "string" },
    password: { type: "string" },
    out: { type: "string" },
    route: { type: "string" },
    emailSelector: { type: "string" },
    passwordSelector: { type: "string" },
    submitSelector: { type: "string" },
    dismiss: { type: "string", multiple: true },
  },
});

if (
  values.url === undefined ||
  values.email === undefined ||
  values.password === undefined ||
  values.out === undefined
) {
  process.stderr.write(
    "usage: tsx scripts/login.ts --url <url> --email <e> --password <p> --out <auth.json>\n" +
      "       [--route '#/login'] [--emailSelector s] [--passwordSelector s] [--submitSelector s]\n" +
      "       [--dismiss <selector> ...]\n",
  );
  process.exit(1);
}

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

await page.goto(`${values.url.replace(/\/$/, "")}/${values.route ?? "#/login"}`, {
  waitUntil: "networkidle",
});

for (const selector of values.dismiss ?? []) {
  const el = page.locator(selector).first();
  if (await el.isVisible().catch(() => false)) {
    await el.click().catch(() => {});
  }
}

const email = locate(page, values.emailSelector, /email/i);
const password = locate(page, values.passwordSelector, /password/i);
await email.fill(values.email);
await password.fill(values.password);

const submit =
  values.submitSelector === undefined
    ? page.getByRole("button", { name: /log ?in|sign ?in/i }).first()
    : page.locator(values.submitSelector).first();

await submit.waitFor({ state: "visible" });
if (await submit.isDisabled()) {
  await submit
    .waitFor({ state: "attached" })
    .then(() => page.waitForFunction(
      (sel: string) => {
        const el = document.querySelector(sel);
        return el !== null && !(el as HTMLButtonElement).disabled;
      },
      values.submitSelector ?? "button[type=submit]",
    ))
    .catch(() => {});
}

if (await submit.isDisabled()) {
  process.stderr.write(
    "the submit button is still disabled after filling the form. " +
      "the credentials fields were probably not the ones the form validates. " +
      "pass --emailSelector and --passwordSelector.\n",
  );
  await browser.close();
  process.exit(1);
}

const [response] = await Promise.all([
  page.waitForResponse(
    (r) => /login|signin|session|auth/i.test(r.url()) && r.request().method() === "POST",
  ),
  submit.click(),
]);

if (!response.ok()) {
  process.stderr.write(
    `login failed: POST ${new URL(response.url()).pathname} returned ${response.status()}\n`,
  );
  await browser.close();
  process.exit(1);
}

const state = await context.storageState();
await writeFile(values.out, JSON.stringify(state, null, 2), "utf8");
process.stderr.write(
  `logged in as ${values.email} (${response.status()}), ` +
    `${state.cookies.length} cookies, ${state.origins.length} origins -> ${values.out}\n`,
);

await browser.close();

function locate(p: Page, selector: string | undefined, label: RegExp) {
  return selector === undefined ? p.getByLabel(label).first() : p.locator(selector).first();
}

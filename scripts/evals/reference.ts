import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

// An oracle for checking the eval machinery, NOT an AI agent or benchmark score.
export async function runReference(url: string, directory: string) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const savedBio = "Updated profile for persistence evaluation";
    let reloadedBio = "";
    await page.goto(url);
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.locator('#bio[data-loaded="true"]').waitFor();
      await page.getByLabel("Bio", { exact: true }).fill(savedBio);
      await page.getByRole("button", { name: "Save", exact: true }).click();
      await page.getByRole("status").filter({ hasText: "Saved" }).waitFor();
      await page.reload();
      await page.locator('#bio[data-loaded="true"]').waitFor();
      reloadedBio = await page.getByLabel("Bio", { exact: true }).inputValue();
    }
    await page.screenshot({ path: join(directory, "after-reload.png") });
    const broken = savedBio !== reloadedBio;
    await writeFile(join(directory, "result.json"), JSON.stringify({
      verdict: broken ? "bug" : "working", summary: broken ? "Bio is lost after reload" : "Bio persists after reload",
      savedBio, reloadedBio, screenshot: "after-reload.png",
    }, null, 2));
    await writeFile(join(directory, "findings.json"), JSON.stringify({ findings: broken ? [{
      title: "Profile save does not persist bio", feature: "Profile", endpoint: "PUT /api/profile", severity: "medium",
      reproduction: "Edit Bio, Save, reload. Repeat to confirm.", observed: `Bio reverts to ${reloadedBio}`,
      expected: `Bio remains ${savedBio}`, screenshot: "after-reload.png",
    }] : [] }, null, 2));
  } finally { await browser.close(); }
}

import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

// Explicit independent examples; this oracle does not import fixture or grader math.
export async function runReference(url: string, directory: string) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(url);
    const observations = [];
    // Finish with a positive text case so the screenshot shows the defect if present.
    for (const format of ["list", "text"]) {
      for (const [skills, expectedScore] of [["Rust", 0], ["Docker", 33], ["Python, SQL", 67]] as const) {
        await page.getByLabel("Candidate skills (comma-separated)").fill(skills);
        await page.getByLabel("Requirement format").selectOption(format);
        const response = page.waitForResponse(r => r.url().endsWith("/api/match") && r.request().method() === "POST");
        await page.getByRole("button", { name: "Calculate match" }).click();
        await response;
        await page.getByRole("status").filter({ hasText: /^Calculated$/ }).waitFor();
        const observedScore = Number((await page.locator("#score").innerText()).replace("%", ""));
        observations.push({ format, skills, expectedScore, observedScore });
      }
    }
    await page.screenshot({ path: join(directory, "after-calculation.png") });
    const defect = observations.find(o => o.expectedScore !== o.observedScore);
    await writeFile(join(directory, "result.json"), JSON.stringify({
      verdict: defect ? "bug" : "working", summary: defect ? "Text requirements silently produce the wrong match score" : "Both formats match independently calculated scores",
      observations, screenshot: "after-calculation.png",
    }, null, 2));
    await writeFile(join(directory, "findings.json"), JSON.stringify({ findings: defect ? [{
      title: "Text requirements give incorrect match scores", feature: "Match calculator", endpoint: "POST /api/match", severity: "medium",
      reproduction: `Choose Text and enter ${defect.skills}, then Calculate match. Repeat with a second matching skill set; compare List and a no-match control.`,
      observed: `Displayed ${defect.observedScore}%`, expected: `Should display ${defect.expectedScore}% according to the stated formula`, screenshot: "after-calculation.png",
    }] : [] }, null, 2));
  } finally { await browser.close(); }
}

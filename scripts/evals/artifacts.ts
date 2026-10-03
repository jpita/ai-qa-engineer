import { readFile, realpath } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { z } from "zod";

// Shared artifact checks; each task independently checks its claims and evidence.
export async function gradeArtifacts(directory: string, evaluate: (result: unknown, findings: unknown) => Record<string, boolean>) {
  let result: unknown;
  let findings: unknown;
  let error: string | null = null;
  try {
    result = JSON.parse(await readFile(resolve(directory, "result.json"), "utf8"));
    findings = JSON.parse(await readFile(resolve(directory, "findings.json"), "utf8"));
  } catch (e) { error = String(e); }
  const checks = { ...evaluate(result, findings), screenshot: false };
  const parsed = z.object({ screenshot: z.string().min(1) }).safeParse(result);
  if (parsed.success) {
    try {
      const root = await realpath(directory);
      const path = await realpath(resolve(directory, parsed.data.screenshot));
      if (!path.startsWith(root + sep)) throw new Error("Screenshot must be inside this trial");
      const bytes = await readFile(path);
      checks.screenshot = bytes.length > 100 && bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    } catch (e) { error = String(e); }
  }
  return { passed: Object.values(checks).every(Boolean), checks, error };
}

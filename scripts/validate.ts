import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { z } from "zod";
import {
  ApiSurfaceSchema,
  CoverageMapSchema,
  FindingsSchema,
  RouteCoverageSchema,
  TestPlanSchema,
  TriageSchema,
  UiMapSchema,
} from "./types.js";

const SCHEMAS: Record<string, z.ZodType> = {
  "ui-map": UiMapSchema,
  "api-surface": ApiSurfaceSchema,
  coverage: CoverageMapSchema,
  "test-plan": TestPlanSchema,
  triage: TriageSchema,
  // emitted by the skill itself, not the script pipeline
  findings: FindingsSchema,
  "route-coverage": RouteCoverageSchema,
};

const { values } = parseArgs({ options: { schema: { type: "string" }, file: { type: "string" } } });

if (values.schema === undefined || values.file === undefined) {
  process.stderr.write(
    `usage: tsx scripts/validate.ts --schema <${Object.keys(SCHEMAS).join("|")}> --file <file>\n`,
  );
  process.exit(1);
}

const schema = SCHEMAS[values.schema];
if (schema === undefined) {
  process.stderr.write(`unknown schema: ${values.schema}\n`);
  process.exit(1);
}

const result = schema.safeParse(JSON.parse(await readFile(values.file, "utf8")));

if (!result.success) {
  process.stderr.write(`${values.file} does not match the ${values.schema} schema:\n`);
  for (const issue of result.error.issues) {
    process.stderr.write(`  ${issue.path.join(".")}: ${issue.message}\n`);
  }
  process.exit(1);
}

process.stderr.write(`${values.file} is valid ${values.schema}\n`);

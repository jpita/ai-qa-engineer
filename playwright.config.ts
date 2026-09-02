import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: process.env["SPEC_DIR"] ?? "./tests-e2e",
  use: {
    baseURL: process.env["BASE_URL"] ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  reporter: [["json", { outputFile: process.env["PLAYWRIGHT_JSON_OUTPUT_NAME"] }]],
  fullyParallel: true,
  forbidOnly: Boolean(process.env["CI"]),
  retries: 0,
});

import { defineConfig } from "vitest/config";

// Unit tests only. Generated Playwright specs under examples/ and artifacts/
// are run by Playwright, not vitest.
export default defineConfig({
  test: { include: ["tests/**/*.test.ts"] },
});

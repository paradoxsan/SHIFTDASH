import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Phase 1 — unit/integration test harness. E2E (Playwright) is configured
// separately and runs in CI (Linux) as the source of truth.
export default defineConfig({
  // Mirror the tsconfig "@/*" path alias so app code can be imported under test
  // exactly as it is at runtime.
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "node",
    globals: true,
    include: [
      "tests/unit/**/*.test.ts",
      "tests/integration/**/*.test.ts",
      "tests/golden/**/*.test.ts",
    ],
    setupFiles: ["tests/setup/test-env.ts"],
  },
});

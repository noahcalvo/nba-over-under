import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    passWithNoTests: true,
    // Each database test file migrates a cold in-memory PGlite once (createTestDb), and that grows with every
    // migration; on a loaded machine it outlasts Vitest's 5 s default, in a test or in its beforeEach hook.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});

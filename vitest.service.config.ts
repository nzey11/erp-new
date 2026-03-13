/**
 * Vitest config for SERVICE-LEVEL tests.
 * Tests business logic functions against a real test database.
 * Requires DATABASE_URL pointing to listopt_erp_test.
 * Pattern: tests/unit/lib/stock-movements.test.ts (DB-backed service logic)
 */
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: ".env.test", override: true });

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    include: [
      "tests/unit/lib/stock-movements.test.ts",
      "tests/unit/lib/cogs.test.ts",
      "tests/unit/lib/party-owner.test.ts",
      "tests/unit/lib/party-merge.test.ts",
    ],
    // Sequential: avoid DB race conditions
    fileParallelism: false,
    sequence: {
      concurrent: false,
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});

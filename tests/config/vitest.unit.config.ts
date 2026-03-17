/**
 * Vitest config for PURE UNIT tests.
 * No database access required — tests run fast and offline.
 * Pattern: tests/unit/**  excluding service tests that hit the DB.
 */
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";
import dotenv from "dotenv";

// Even pure unit files transitively import lib/shared/db.ts (module init)
// so env vars must be present even though no DB connections are opened.
dotenv.config({ path: ".env.test", override: true });

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    globals: true,
    testTimeout: 10000,
    hookTimeout: 10000,
    // Stock-movements and cogs service tests need a real DB → excluded here, live in test:service
    include: ["tests/unit/**/*.test.ts"],
    exclude: ["tests/unit/lib/stock-movements.test.ts", "tests/unit/lib/cogs.test.ts", "tests/unit/lib/party-owner.test.ts", "tests/unit/lib/party-merge.test.ts", "tests/unit/lib/activity-ingest.test.ts"],
    // Pure unit tests can run in parallel
    fileParallelism: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../.."),
      "@/tests": path.resolve(__dirname, ".."),
      "server-only": path.resolve(__dirname, "../helpers/server-only-mock.ts"),
    },
  },
});

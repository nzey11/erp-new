/**
 * Vitest config for INTEGRATION tests.
 * Tests full data flows against a real test database, including
 * repository queries, transaction boundaries, and API route handlers.
 * Requires DATABASE_URL pointing to listopt_erp_test.
 * Pattern: tests/integration/**
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
    testTimeout: 60000,
    hookTimeout: 60000,
    include: ["tests/integration/**/*.test.ts"],
    // Sequential: avoid DB race conditions between test files
    fileParallelism: false,
    sequence: {
      concurrent: false,
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../.."),
      "@/tests": path.resolve(__dirname, ".."),
      "server-only": path.resolve(__dirname, "../helpers/server-only-mock.ts"),
    },
  },
});

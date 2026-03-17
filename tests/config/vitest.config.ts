import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

// Load test environment variables BEFORE any imports
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
    include: ["tests/**/*.test.ts"],
    // Run tests sequentially to avoid database race conditions
    fileParallelism: false,
    sequence: {
      concurrent: false,
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../.."),
      "@/tests": path.resolve(__dirname, ".."),
    },
  },
});

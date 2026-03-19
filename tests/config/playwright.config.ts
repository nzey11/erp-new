import { defineConfig } from "@playwright/test";
import dotenv from "dotenv";

// Load .env.test but don't override existing env vars (CI sets DATABASE_URL)
dotenv.config({ path: ".env.test", override: false });

export default defineConfig({
  testDir: "../e2e/specs",
  outputDir: "./test-results",
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: "http://localhost:3001",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  webServer: {
    command: "npm run start",
    url: "http://localhost:3001",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL
        ?? "postgresql://test:test@localhost:5434/listopt_erp_test",
      SESSION_SECRET: process.env.SESSION_SECRET
        ?? "ci-test-secret-key-do-not-use-in-production",
      NODE_ENV: "production",
      APP_ENV: "test",
    },
  },
});

import { beforeAll, afterAll, beforeEach } from "vitest";
import { cleanDatabase, disconnectTestDb } from "./helpers/test-db";

beforeAll(async () => {
  // Global setup before all tests
});

beforeEach(async () => {
  // Clean database before each test for isolation.
  // Silently skips if DB is not reachable (e.g. in pure unit tests).
  try {
    await cleanDatabase();
  } catch {
    // DB not available – unit tests that don't need it will still pass.
  }
});

afterAll(async () => {
  // Disconnect from test database after all tests
  try {
    await disconnectTestDb();
  } catch {
    // ignore disconnect errors
  }
});

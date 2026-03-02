import { beforeAll, afterAll, beforeEach } from "vitest";
import { cleanDatabase, disconnectTestDb } from "./helpers/test-db";

beforeAll(async () => {
  // Global setup before all tests
});

beforeEach(async () => {
  // Clean database before each test for isolation
  await cleanDatabase();
});

afterAll(async () => {
  // Disconnect from test database after all tests
  await disconnectTestDb();
});

import "dotenv/config";
import path from "path";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // In dev: file:./dev.db (SQLite). In prod: postgresql://...
    url: process.env["DATABASE_URL"] ?? `file:${path.join(__dirname, "prisma", "dev.db")}`,
  },
});

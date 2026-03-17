/**
 * Environment variable validation.
 * Imported in instrumentation.ts to fail fast on startup if required vars are missing.
 */

const requiredEnvVars = [
  'DATABASE_URL',
  'SESSION_SECRET',
] as const

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(
      `Missing required environment variable: ${envVar}\n` +
        'Check your .env file or deployment configuration.',
    )
  }
}

export const env = {
  DATABASE_URL: process.env.DATABASE_URL!,
  SESSION_SECRET: process.env.SESSION_SECRET!,
  // Optional — handled gracefully at call site
  OUTBOX_SECRET: process.env.OUTBOX_SECRET,
  STORE_TENANT_ID: process.env.STORE_TENANT_ID,
}

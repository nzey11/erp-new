/**
 * Next.js Instrumentation — app startup hook.
 *
 * This file is the single explicit entry point for one-time server initialization.
 * Next.js calls register() once per process on startup (Node.js runtime only).
 *
 * See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run in Node.js runtime (not Edge), where DB access is available
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Validate required environment variables on startup
    await import("@/lib/shared/env");
    // Bootstrap domain event handler registry for outbox processing.
    // This ensures all handlers are wired before the first cron tick fires.
    const { registerOutboxHandlers } = await import(
      "@/lib/events/handlers/register-outbox-handlers"
    );
    registerOutboxHandlers();
  }
}

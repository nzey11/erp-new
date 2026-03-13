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
    const { bootstrapDomainEvents } = await import(
      "@/lib/bootstrap/domain-events"
    );
    bootstrapDomainEvents();
  }
}

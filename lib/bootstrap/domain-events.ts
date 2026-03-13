/**
 * Bootstrap — Domain Event wiring
 *
 * Single entry point that registers all domain event handlers.
 * Called once at app startup from instrumentation.ts.
 *
 * To add a new domain's handlers in future phases:
 *   1. Create lib/modules/<domain>/register-handlers.ts
 *   2. Import and call registerXxxHandlers(eventBus) here
 */

import { eventBus } from "@/lib/events";
import { registerAccountingHandlers } from "@/lib/modules/accounting/register-handlers";

// Guard against double-registration on dev hot-reload.
// Node.js module cache keeps this value stable across calls within one process.
let bootstrapped = false;

export function bootstrapDomainEvents(): void {
  if (bootstrapped) return;
  bootstrapped = true;
  registerAccountingHandlers(eventBus);

  // Future phases:
  // registerEcomHandlers(eventBus);
  // registerFinanceHandlers(eventBus);
}

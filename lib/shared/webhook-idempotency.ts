/**
 * Webhook idempotency utilities.
 * Prevents duplicate processing of webhooks from external sources.
 */

import { db } from "./db";

/**
 * Check if a webhook has already been processed.
 */
export async function isWebhookProcessed(
  source: string,
  externalId: string
): Promise<boolean> {
  const existing = await db.processedWebhook.findUnique({
    where: {
      source_externalId: { source, externalId },
    },
  });
  return !!existing;
}

/**
 * Mark a webhook as processed.
 * Should be called after successful processing.
 */
export async function markWebhookProcessed(
  source: string,
  externalId: string,
  payload: unknown
): Promise<void> {
  await db.processedWebhook.create({
    data: {
      source,
      externalId,
      payload: payload as object,
    },
  });
}

/**
 * Execute a webhook handler with idempotency protection.
 * Returns the result of the handler, or null if already processed.
 */
export async function withIdempotency<T>(
  source: string,
  externalId: string,
  payload: unknown,
  handler: () => Promise<T>
): Promise<{ result: T | null; alreadyProcessed: boolean }> {
  if (await isWebhookProcessed(source, externalId)) {
    return { result: null, alreadyProcessed: true };
  }

  const result = await handler();
  await markWebhookProcessed(source, externalId, payload);

  return { result, alreadyProcessed: false };
}

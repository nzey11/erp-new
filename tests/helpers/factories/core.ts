/**
 * Core test utilities shared across all factory modules.
 */

let counter = 0;

/**
 * Generate a unique ID for test entities.
 * Combines timestamp with an incrementing counter for uniqueness.
 */
export function uniqueId(): string {
  return `test_${Date.now()}_${++counter}`;
}

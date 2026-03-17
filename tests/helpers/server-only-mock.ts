// Mock for 'server-only' in test environment.
// The real package throws an error when imported outside of a Next.js server context.
// In tests (Vitest/Node.js), we simply export nothing — the import is a no-op.
export {};

interface CacheEntry {
  data: unknown[];
  total: number;
  timestamp: number;
}

const FRESH_MS = 30_000;  // 30 seconds
const MAX_ENTRIES = 50;

const cache = new Map<string, CacheEntry>();

export function buildCacheKey(endpoint: string, params: URLSearchParams): string {
  const sorted = new URLSearchParams([...params.entries()].sort());
  return `${endpoint}:${sorted.toString()}`;
}

export function getCache(key: string): { data: unknown[]; total: number; fresh: boolean } | null {
  const entry = cache.get(key);
  if (!entry) return null;
  const age = Date.now() - entry.timestamp;
  return { data: entry.data, total: entry.total, fresh: age < FRESH_MS };
}

export function setCache(key: string, data: unknown[], total: number): void {
  // LRU eviction
  if (cache.size >= MAX_ENTRIES && !cache.has(key)) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { data, total, timestamp: Date.now() });
}

export function invalidateCache(endpoint: string): void {
  for (const key of [...cache.keys()]) {
    if (key.startsWith(endpoint + ":")) {
      cache.delete(key);
    }
  }
}

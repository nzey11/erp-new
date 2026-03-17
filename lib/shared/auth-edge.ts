/**
 * Edge Runtime-safe session token utilities.
 * Uses Web Crypto API only — no Node.js built-ins.
 *
 * Used exclusively by middleware.ts (Edge Runtime).
 * For full auth (DB access), use lib/shared/auth.ts in Node.js routes.
 */

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET must be set in environment variables");
  }
  return secret;
}

/** Encode string to Uint8Array with explicit ArrayBuffer */
function encode(str: string): ArrayBuffer {
  return new TextEncoder().encode(str).buffer as ArrayBuffer;
}

/** Encode bytes to hex string */
function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Timing-safe byte comparison */
function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/**
 * Verify a session token using Web Crypto (HMAC-SHA256).
 * Returns userId or null if invalid/expired.
 */
export async function verifySessionTokenEdge(token: string): Promise<string | null> {
  const dotIndex = token.lastIndexOf(".");
  if (dotIndex === -1) return null;

  const payload = token.substring(0, dotIndex);
  const signature = token.substring(dotIndex + 1);

  const pipeIndex = payload.lastIndexOf("|");
  if (pipeIndex === -1) return null;

  const userId = payload.substring(0, pipeIndex);
  const expiresAt = Number(payload.substring(pipeIndex + 1));

  if (!userId || isNaN(expiresAt)) return null;

  if (Date.now() > expiresAt) return null;

  try {
    const secret = getSessionSecret();
    const key = await crypto.subtle.importKey(
      "raw",
      encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const sigBuffer = await crypto.subtle.sign("HMAC", key, encode(payload));
    const expected = toHex(sigBuffer);

    // Hex decode both for timing-safe comparison
    const sigBytes = new Uint8Array(signature.match(/.{2}/g)!.map((b) => parseInt(b, 16)));
    const expBytes = new Uint8Array(expected.match(/.{2}/g)!.map((b) => parseInt(b, 16)));

    return bytesEqual(sigBytes, expBytes) ? userId : null;
  } catch {
    return null;
  }
}

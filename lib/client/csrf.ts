/**
 * Client-side CSRF utilities for ERP frontend.
 * Fetches and caches CSRF tokens for mutating requests.
 */

const CSRF_COOKIE_NAME = "csrf_token";
const CSRF_HEADER_NAME = "X-CSRF-Token";
const CSRF_ENDPOINT = "/api/auth/csrf";

let cachedToken: string | null = null;

/**
 * Fetch a fresh CSRF token from the server.
 */
export async function fetchCsrfToken(): Promise<string> {
  const response = await fetch(CSRF_ENDPOINT, {
    method: "GET",
    credentials: "include", // Include cookies
  });

  if (!response.ok) {
    throw new Error("Failed to fetch CSRF token");
  }

  const data = await response.json();
  cachedToken = data.token;
  return cachedToken!;
}

/**
 * Get the cached CSRF token, or fetch a new one if not cached.
 */
export async function getCsrfToken(): Promise<string> {
  if (cachedToken) {
    return cachedToken;
  }
  return fetchCsrfToken();
}

/**
 * Clear the cached CSRF token (e.g., on logout).
 */
export function clearCsrfToken(): void {
  cachedToken = null;
}

/**
 * Add CSRF token to fetch options.
 * Use this before making mutating requests (POST, PUT, PATCH, DELETE).
 * 
 * @example
 * const response = await fetch('/api/products', withCsrf({
 *   method: 'POST',
 *   body: JSON.stringify(data),
 * }));
 */
export async function withCsrf(
  options: RequestInit = {}
): Promise<RequestInit> {
  const token = await getCsrfToken();

  return {
    ...options,
    credentials: "include",
    headers: {
      ...options.headers,
      [CSRF_HEADER_NAME]: token,
    },
  };
}

/**
 * Fetch wrapper that automatically adds CSRF token for mutating methods.
 * 
 * @example
 * const response = await csrfFetch('/api/products', {
 *   method: 'POST',
 *   body: JSON.stringify(data),
 * });
 */
export async function csrfFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const method = (options.method || "GET").toUpperCase();
  const protectedMethods = ["POST", "PUT", "PATCH", "DELETE"];

  if (protectedMethods.includes(method)) {
    const enhancedOptions = await withCsrf(options);
    return fetch(url, enhancedOptions);
  }

  return fetch(url, { ...options, credentials: "include" });
}

export { CSRF_HEADER_NAME };

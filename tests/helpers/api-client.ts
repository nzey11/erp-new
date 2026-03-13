import { NextRequest } from "next/server";
import { vi } from "vitest";
import * as authModule from "@/lib/shared/auth";
import type { ErpRole } from "@/lib/generated/prisma/client";

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

interface ApiRequestOptions {
  method?: HttpMethod;
  body?: unknown;
  query?: Record<string, string>;
}

/**
 * Create a NextRequest for testing API route handlers.
 */
export function createTestRequest(
  path: string,
  options: ApiRequestOptions = {}
): NextRequest {
  const { method = "GET", body, query } = options;
  const url = new URL(path, "http://localhost:3000");

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }
  }

  const headers = new Headers({
    "Content-Type": "application/json",
  });

  // Build init object compatible with NextRequest constructor
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const init: any = { method, headers };
  if (body && method !== "GET") {
    init.body = JSON.stringify(body);
  }

  return new NextRequest(url, init);
}

/**
 * Mock getAuthSession to return a specific user with tenant context.
 * Must be called after vi.mock("@/lib/shared/auth") setup.
 */
export function mockAuthUser(user: {
  id: string;
  username: string;
  role: ErpRole;
  tenantId?: string;
  tenantName?: string;
  tenantSlug?: string;
  membershipId?: string;
}) {
  vi.mocked(authModule.getAuthSession).mockResolvedValue({
    id: user.id,
    username: user.username,
    role: user.role,
    tenantId: user.tenantId ?? "test-tenant",
    tenantName: user.tenantName ?? "Test Tenant",
    tenantSlug: user.tenantSlug ?? "test-tenant",
    membershipId: user.membershipId ?? "test-membership",
  });
}

/**
 * Mock getAuthSession to return null (unauthenticated).
 */
export function mockAuthNone() {
  vi.mocked(authModule.getAuthSession).mockResolvedValue(null);
}

/**
 * Parse JSON response body.
 */
export async function jsonResponse(response: Response) {
  return response.json();
}

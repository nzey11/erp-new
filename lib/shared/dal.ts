import { redirect } from "next/navigation";
import { getAuthSession, type TenantAwareSession } from "./auth";

/**
 * Data Access Layer — server-side session verification.
 *
 * Single source of truth for auth checks in Server Components and layouts.
 * This is the recommended Next.js pattern (DAL) for defence-in-depth auth.
 *
 * Usage in any Server Component layout:
 *   import { verifySession } from "@/lib/shared/dal";
 *   const session = await verifySession();
 */
export async function verifySession(): Promise<TenantAwareSession> {
  const session = await getAuthSession();

  if (!session) {
    redirect("/login");
  }

  return session;
}

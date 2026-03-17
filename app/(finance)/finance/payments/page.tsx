import { redirect } from "next/navigation";

/**
 * Legacy payments page — redirect to canonical ERPTable-based payments page.
 *
 * The canonical payments page is now at /payments (not /finance/payments).
 * This redirect preserves any existing bookmarks/links.
 */
export default function LegacyPaymentsPage() {
  redirect("/payments");
}

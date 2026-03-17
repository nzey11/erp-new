import { redirect } from "next/navigation";

/**
 * Legacy /payments URL — permanently redirected to canonical /finance/payments.
 * Preserves existing bookmarks and external links.
 */
export default function LegacyPaymentsRedirect() {
  redirect("/finance/payments");
}

import { redirect } from "next/navigation";

/**
 * Legacy /reports URL — permanently redirected to canonical /finance/reports.
 * Preserves existing bookmarks and external links.
 */
export default function LegacyReportsRedirect() {
  redirect("/finance/reports");
}

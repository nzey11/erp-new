/**
 * Sales documents query — thin delegate over getDocuments().
 * Resolves tab → DocumentFilters.group / .type before delegating.
 *
 * Covers only the three simple sales tabs:
 *   "all"                → group=sales
 *   "outgoing_shipment"  → type=outgoing_shipment
 *   "customer_return"    → type=customer_return
 *
 * sales_order tab (SalesOrdersView) and profitability tab are NOT covered here.
 */

import { getDocuments } from "@/lib/domain/documents/queries";
import type { GetDocumentsResult } from "@/lib/domain/documents/queries";
import type { SalesFilters } from "./parse-filters";
import type { DocumentFilters } from "@/lib/domain/documents/parse-filters";

export type { GetDocumentsResult };

/**
 * Map the sales tab value to DocumentFilters group/type params.
 */
function resolveDocumentFilters(salesFilters: SalesFilters): DocumentFilters {
  const tab = salesFilters.tab;

  // Specific types
  if (tab === "outgoing_shipment" || tab === "customer_return") {
    return {
      ...salesFilters,
      group: undefined,
      type: tab,
    } as DocumentFilters;
  }

  // "all" or missing tab → group=sales
  return {
    ...salesFilters,
    group: "sales",
    type: undefined,
  } as DocumentFilters;
}

/**
 * Fetch sales documents (simple tabs only).
 * Server-side only — delegates to getDocuments with sales group/type scope.
 */
export async function getSalesDocuments(
  filters: SalesFilters
): Promise<GetDocumentsResult> {
  const docFilters = resolveDocumentFilters(filters);
  return getDocuments(docFilters);
}

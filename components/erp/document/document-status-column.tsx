"use client";

import { createStatusColumn } from "@/components/erp/columns";
import type { StatusMap } from "@/components/erp/columns";
import type { ERPColumn } from "@/components/erp/erp-table.types";

/**
 * Canonical status map for the document family (draft / confirmed / cancelled).
 * Color semantics: default=grey, success=green, error=red — matches legacy Badge variants.
 */
export const DocumentStatusMap: StatusMap = {
  draft: { label: "Черновик", color: "default" },
  confirmed: { label: "Подтверждён", color: "success" },
  cancelled: { label: "Отменён", color: "error" },
};

/**
 * Creates a status column pre-wired with DocumentStatusMap.
 *
 * Usage:
 *   createDocumentStatusColumn<Doc>({ accessor: (row) => row.status })
 */
export function createDocumentStatusColumn<T>(options: {
  accessor: (row: T) => string | null | undefined;
  width?: number;
  sortable?: boolean;
}): ERPColumn<T> {
  return createStatusColumn<T>({
    key: "status",
    title: "Статус",
    accessor: options.accessor,
    statusMap: DocumentStatusMap,
    width: options.width ?? 130,
    sortable: options.sortable ?? true,
  });
}

"use client";

import Link from "next/link";
import type { ERPColumn } from "@/components/erp/erp-table.types";

/**
 * Creates a document number column that renders a monospace link to /documents/[id].
 *
 * Usage:
 *   createDocumentNumberColumn<Doc>()
 */
export function createDocumentNumberColumn<T extends { id: string; number: string }>(
  options: { width?: number } = {}
): ERPColumn<T> {
  return {
    key: "number",
    title: "Номер",
    dataIndex: "number",
    width: options.width ?? 130,
    sortable: true,
    render: (_value, row) => (
      <Link
        href={`/documents/${row.id}`}
        className="font-mono font-medium text-blue-600 hover:text-blue-800 hover:underline"
        onClick={(e) => e.stopPropagation()}
      >
        {row.number}
      </Link>
    ),
  };
}

import type { MenuProps } from "antd";
import type { SalesOrderRow } from "@/lib/domain/sales-orders/queries";

/**
 * Action types specific to sales orders (ecom workflow + manual confirm).
 */
export type EcomActionType = "update-status" | "confirm";

/**
 * Row action menu for sales orders (sales_order tab).
 * Handles ecom workflow (paid → processing → shipped → delivered)
 * and manual document confirmation.
 */
export function getSalesOrderRowActions(
  row: SalesOrderRow,
  onAction: (type: EcomActionType, row: SalesOrderRow, payload?: { status: string }) => void
): MenuProps["items"] {
  const items: MenuProps["items"] = [
    {
      key: "open",
      label: "Открыть",
      onClick: () => onAction("update-status", row), // "open" is handled as navigation, payload-less
    },
    { type: "divider" },
  ];

  const isEcom = row.customerId != null;

  if (isEcom) {
    // Ecom workflow actions
    if (row.status === "paid") {
      items.push({
        key: "to-processing",
        label: "В работу",
        onClick: () => onAction("update-status", row, { status: "processing" }),
      });
    }

    if (row.status === "processing") {
      items.push({
        key: "to-shipped",
        label: "Отправить",
        onClick: () => onAction("update-status", row, { status: "shipped" }),
      });
    }

    if (row.status === "shipped") {
      items.push({
        key: "to-delivered",
        label: "Доставлен",
        onClick: () => onAction("update-status", row, { status: "delivered" }),
      });
    }
  } else {
    // Manual order actions
    // Manual orders use DocumentStatus (draft/confirmed/cancelled) stored in the status field
    // We check if the order is not yet processed (pending is the initial state for manual orders)
    if (row.status === "pending") {
      items.push({
        key: "confirm",
        label: "Подтвердить",
        onClick: () => onAction("confirm", row),
      });
    }
  }

  return items;
}

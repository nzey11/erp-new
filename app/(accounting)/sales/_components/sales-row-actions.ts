import type { MenuProps } from "antd";
import type { DocumentRow } from "@/lib/domain/documents/queries";

type SalesDocRowActionType = "open" | "confirm" | "cancel";

/**
 * Row action menu for the sales simple-tabs list.
 * Handles standard document statuses (draft/confirmed/cancelled).
 *
 * Does NOT include ecom-specific actions (В работу / Отправить / Доставлен) —
 * those belong to SalesOrdersView (Step 4b).
 */
export function getSalesRowActions(
  row: DocumentRow,
  onAction: (type: SalesDocRowActionType, row: DocumentRow) => void
): MenuProps["items"] {
  const items: MenuProps["items"] = [
    {
      key: "open",
      label: "Открыть",
      onClick: () => onAction("open", row),
    },
    { type: "divider" },
  ];

  if (row.status === "draft") {
    items.push({
      key: "confirm",
      label: "Подтвердить",
      onClick: () => onAction("confirm", row),
    });
  }

  if (row.status === "confirmed") {
    items.push({
      key: "cancel",
      label: "Отменить",
      danger: true,
      onClick: () => onAction("cancel", row),
    });
  }

  return items;
}

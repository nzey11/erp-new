import type { MenuProps } from "antd";
import type { PurchaseDocument } from "@/lib/domain/purchases/queries";

type RowActionType = "open" | "confirm" | "cancel";

/**
 * Get row action menu items for a purchase document.
 * Pure function — no side effects, no business logic.
 */
export function getPurchaseRowActions(
  row: PurchaseDocument,
  onAction: (type: RowActionType, row: PurchaseDocument) => void
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

import type { MenuProps } from "antd";
import type { StockDocumentRow } from "@/lib/domain/stock-documents/queries";

type StockDocRowActionType = "open" | "confirm" | "cancel";

/**
 * Row action menu for stock document tables.
 * Pure function — no side effects, no mutations.
 */
export function getStockDocumentRowActions(
  row: StockDocumentRow,
  onAction: (type: StockDocRowActionType, row: StockDocumentRow) => void
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

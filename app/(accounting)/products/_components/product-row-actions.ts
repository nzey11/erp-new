import type { MenuProps } from "antd";
import type { ProductWithRelations } from "@/lib/domain/products/queries";

type RowActionType = "open" | "duplicate" | "archive" | "restore";

/**
 * Get row action menu items for a product.
 * Pure function — no side effects, no business logic.
 */
export function getProductRowActions(
  row: ProductWithRelations,
  onAction: (type: RowActionType, row: ProductWithRelations) => void
): MenuProps["items"] {
  const items: MenuProps["items"] = [
    {
      key: "open",
      label: "Открыть",
      onClick: () => onAction("open", row),
    },
    {
      key: "duplicate",
      label: "Дублировать",
      onClick: () => onAction("duplicate", row),
    },
    { type: "divider" },
  ];

  if (row.isActive) {
    items.push({
      key: "archive",
      label: "В архив",
      danger: false,
      onClick: () => onAction("archive", row),
    });
  } else {
    items.push({
      key: "restore",
      label: "Восстановить",
      onClick: () => onAction("restore", row),
    });
  }

  return items;
}

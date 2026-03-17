import type { MenuProps } from "antd";
import type { DocumentRow } from "@/lib/domain/documents/queries";

type DocRowActionType = "open" | "confirm" | "cancel";

/**
 * Row action menu for the generic documents list.
 * Pure function — no side effects, no mutations.
 */
export function getDocumentRowActions(
  row: DocumentRow,
  onAction: (type: DocRowActionType, row: DocumentRow) => void
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

"use client";

import { Dropdown, Button } from "antd";
import { MoreOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import type { CounterpartyWithBalance } from "@/lib/domain/counterparties/queries";

interface CounterpartyRowActionsProps {
  row: CounterpartyWithBalance;
  onEdit: (row: CounterpartyWithBalance) => void;
  onDelete: (row: CounterpartyWithBalance) => void;
}

/**
 * Row actions component for counterparties table.
 * Returns ReactNode for ERPTable rowActions prop.
 *
 * No business logic — only presentation and callback delegation.
 */
export function CounterpartyRowActions({
  row,
  onEdit,
  onDelete,
}: CounterpartyRowActionsProps) {
  const items = [
    {
      key: "edit",
      label: "Редактировать",
      icon: <EditOutlined />,
      onClick: () => onEdit(row),
    },
    {
      key: "delete",
      label: "Удалить",
      icon: <DeleteOutlined />,
      danger: true,
      onClick: () => onDelete(row),
    },
  ];

  return (
    <Dropdown menu={{ items }} placement="bottomRight" trigger={["click"]}>
      <Button type="text" icon={<MoreOutlined />} size="small" />
    </Dropdown>
  );
}

/**
 * Factory function for ERPTable rowActions prop.
 * Usage: rowActions={(row) => createCounterpartyRowActions(row, handleEdit, handleDelete)}
 */
export function createCounterpartyRowActions(
  row: CounterpartyWithBalance,
  onEdit: (row: CounterpartyWithBalance) => void,
  onDelete: (row: CounterpartyWithBalance) => void
): React.ReactNode {
  return (
    <CounterpartyRowActions row={row} onEdit={onEdit} onDelete={onDelete} />
  );
}

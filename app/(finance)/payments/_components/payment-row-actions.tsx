"use client";

import { Dropdown, Button } from "antd";
import { MoreOutlined, EditOutlined, DeleteOutlined } from "@ant-design/icons";
import type { PaymentWithRelations } from "@/lib/domain/payments/queries";

interface PaymentRowActionsProps {
  row: PaymentWithRelations;
  onEdit: (row: PaymentWithRelations) => void;
  onDelete: (row: PaymentWithRelations) => void;
}

/**
 * Row actions component for payments table.
 * Returns ReactNode for ERPTable rowActions prop.
 *
 * No business logic — only presentation and callback delegation.
 */
export function PaymentRowActions({ row, onEdit, onDelete }: PaymentRowActionsProps) {
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
 * Usage: rowActions={(row) => createPaymentRowActions(row, handleEdit, handleDelete)}
 */
export function createPaymentRowActions(
  row: PaymentWithRelations,
  onEdit: (row: PaymentWithRelations) => void,
  onDelete: (row: PaymentWithRelations) => void
): React.ReactNode {
  return <PaymentRowActions row={row} onEdit={onEdit} onDelete={onDelete} />;
}

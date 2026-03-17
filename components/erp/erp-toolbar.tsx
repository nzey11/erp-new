"use client";

import { Button, Space } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import type { ERPToolbarProps } from "./erp-table.types";

/**
 * ERPToolbar — presentation-only toolbar for ERP screens.
 *
 * Responsibilities:
 * - Render create button
 * - Render bulk actions when rows selected
 * - Render extra actions on the right
 *
 * NOT responsible for:
 * - Domain logic
 * - Data fetching
 * - Navigation decisions
 * - Business rules
 */
export function ERPToolbar({
  onCreateClick,
  createLabel = "Создать",
  bulkActions,
  extraActions,
  selectedCount = 0,
}: ERPToolbarProps) {
  const isBulkMode = selectedCount > 0;

  return (
    <div className="flex items-center justify-between py-3">
      {/* Left side: Create button or Bulk actions */}
      <div className="flex items-center gap-2">
        {isBulkMode ? (
          <Space>
            <span className="text-sm text-muted-foreground">
              Выбрано: {selectedCount}
            </span>
            {bulkActions}
          </Space>
        ) : (
          onCreateClick && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={onCreateClick}
            >
              {createLabel}
            </Button>
          )
        )}
      </div>

      {/* Right side: Extra actions */}
      {extraActions && (
        <div className="flex items-center gap-2">{extraActions}</div>
      )}
    </div>
  );
}

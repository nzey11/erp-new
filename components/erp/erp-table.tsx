"use client";

import { Table } from "antd";
import type { ColumnsType, TableProps } from "antd/es/table";
import type {
  ERPColumn,
  ERPTableProps,
  ERPPagination,
  ERPSelection,
} from "./erp-table.types";

/**
 * Maps framework-agnostic ERPColumn to antd ColumnsType.
 * This is the only place where antd types are used internally.
 */
function mapColumns<T>(
  columns: ERPColumn<T>[],
  rowActions?: (row: T) => React.ReactNode
): ColumnsType<T> {
  const mapped: ColumnsType<T> = columns.map((col) => ({
    key: col.key,
    title: col.title,
    dataIndex: col.dataIndex as string,
    width: col.width,
    align: col.align,
    fixed: col.fixed,
    hidden: col.hidden,
    sorter: col.sortable,
    render: col.render,
    className: col.className,
    ellipsis: col.ellipsis,
  }));

  // Add actions column if rowActions provided
  if (rowActions) {
    mapped.push({
      key: "__actions",
      title: "",
      width: 60,
      align: "center",
      fixed: "right",
      render: (_: unknown, record: T) => rowActions(record),
    });
  }

  return mapped;
}

/**
 * Maps ERP pagination to antd pagination config.
 */
function mapPagination(pagination?: ERPPagination): TableProps<unknown>["pagination"] {
  if (!pagination) return false;

  return {
    current: pagination.current,
    pageSize: pagination.pageSize,
    total: pagination.total,
    showSizeChanger: true,
    showTotal: (total, range) =>
      `${range[0]}-${range[1]} из ${total}`,
  };
}

/**
 * Maps ERP selection to antd rowSelection.
 */
function mapSelection<T>(selection?: ERPSelection<T>): TableProps<T>["rowSelection"] {
  if (!selection) return undefined;

  return {
    type: "checkbox",
    selectedRowKeys: selection.selectedRowKeys,
    onChange: selection.onChange,
    getCheckboxProps: () => ({}),
    columnWidth: selection.columnWidth,
    preserveSelectedRowKeys: selection.preserveSelectedRowKeys,
  };
}

/**
 * ERPTable — stateless presentation wrapper over antd Table.
 *
 * Responsibilities:
 * - Render data with column configuration
 * - Handle selection, pagination, sorting
 * - Support row click and row actions
 *
 * NOT responsible for:
 * - Data fetching
 * - Domain logic
 * - URL management
 * - State management
 */
export function ERPTable<T>({
  data,
  columns,
  loading,
  pagination,
  selection,
  onRowClick,
  rowActions,
  emptyText,
  sticky,
  size = "middle",
  rowClassName,
  onChange,
  rowKey = "id",
}: ERPTableProps<T>) {
  const antdColumns = mapColumns(columns, rowActions);
  const antdPagination = mapPagination(pagination);
  const antdRowSelection = mapSelection(selection);

  const handleChange: TableProps<T>["onChange"] = (
    pagination,
    _filters,
    sorter
  ) => {
    if (!onChange) return;

    const sortField = Array.isArray(sorter) ? undefined : sorter.field?.toString();
    const sortOrder = Array.isArray(sorter) ? null : sorter.order || null;

    onChange({
      page: pagination.current || 1,
      pageSize: pagination.pageSize || 20,
      sortField,
      sortOrder,
    });
  };

  const handleRow = onRowClick
    ? (record: T) => ({
        onClick: () => onRowClick(record),
        style: { cursor: "pointer" },
      })
    : undefined;

  return (
    <Table<T>
      dataSource={data}
      columns={antdColumns}
      loading={loading}
      pagination={antdPagination}
      rowSelection={antdRowSelection}
      onChange={handleChange}
      onRow={handleRow}
      rowKey={rowKey as string}
      size={size}
      sticky={sticky}
      rowClassName={rowClassName}
      locale={{
        emptyText: emptyText || "Нет данных",
      }}
      scroll={{ x: "max-content" }}
    />
  );
}

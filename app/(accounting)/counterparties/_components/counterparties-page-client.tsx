"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { App, Popconfirm, Button } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { PageHeader } from "@/components/shared/page-header";
import type { CounterpartyFilters } from "@/lib/domain/counterparties/parse-filters";
import type {
  GetCounterpartiesResult,
  CounterpartyWithBalance,
} from "@/lib/domain/counterparties/queries";
import { ERPTable } from "@/components/erp/erp-table";
import { ERPToolbar } from "@/components/erp/erp-toolbar";
import type { ERPPagination, ERPSelection } from "@/components/erp/erp-table.types";
import { CounterpartyFilterBar } from "./counterparty-filter-bar";
import { getCounterpartyColumns } from "./counterparty-table-columns";
import { CounterpartyRowActions } from "./counterparty-row-actions";
import { CounterpartyDrawer } from "./counterparty-drawer";
import {
  createCounterparty,
  updateCounterparty,
  deleteCounterparty,
} from "../actions";
import type { CounterpartyFormValues } from "./counterparty-drawer";

interface CounterpartiesPageClientProps {
  initialData: GetCounterpartiesResult;
  initialFilters: CounterpartyFilters;
}

/**
 * Counterparties page client shell.
 *
 * Owns all client-side state:
 * - Drawer open/close
 * - Selected counterparty for editing
 * - Table selection state
 * - Message API for notifications
 *
 * Receives initial data from Server Component.
 */
export function CounterpartiesPageClient({
  initialData,
  initialFilters,
}: CounterpartiesPageClientProps) {
  const { message } = App.useApp();
  const router = useRouter();

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit">("create");
  const [selectedCounterparty, setSelectedCounterparty] =
    useState<CounterpartyWithBalance | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  // Selection state
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  // Data comes directly from server props — router.refresh() triggers re-render with new initialData
  const data = initialData;

  const handleCreateClick = () => {
    setDrawerMode("create");
    setSelectedCounterparty(null);
    setDrawerOpen(true);
  };

  const handleRowClick = (row: CounterpartyWithBalance) => {
    setDrawerMode("edit");
    setSelectedCounterparty(row);
    setDrawerOpen(true);
  };

  const handleEdit = (row: CounterpartyWithBalance) => {
    setDrawerMode("edit");
    setSelectedCounterparty(row);
    setDrawerOpen(true);
  };

  const handleDelete = async (row: CounterpartyWithBalance) => {
    try {
      await deleteCounterparty(row.id);
      message.success("Контрагент удалён");
      router.refresh();
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "Ошибка удаления"
      );
    }
  };

  const handleDrawerClose = () => {
    setDrawerOpen(false);
    setSelectedCounterparty(null);
  };

  const handleDrawerSubmit = async (values: CounterpartyFormValues) => {
    setDrawerLoading(true);
    try {
      if (drawerMode === "create") {
        await createCounterparty(values);
        message.success("Контрагент создан");
      } else if (drawerMode === "edit" && selectedCounterparty) {
        await updateCounterparty(selectedCounterparty.id, values);
        message.success("Контрагент обновлён");
      }
      setDrawerOpen(false);
      router.refresh();
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "Ошибка сохранения"
      );
    } finally {
      setDrawerLoading(false);
    }
  };

  const selection: ERPSelection<CounterpartyWithBalance> = {
    selectedRowKeys,
    onChange: (keys) => setSelectedRowKeys(keys),
    getRowKey: (row) => row.id,
  };

  const pagination: ERPPagination = {
    current: data.page,
    pageSize: data.pageSize,
    total: data.total,
  };

  const columns = getCounterpartyColumns();

  const rowActions = (row: CounterpartyWithBalance) => (
    <CounterpartyRowActions
      row={row}
      onEdit={handleEdit}
      onDelete={(r) => (
        <Popconfirm
          title="Удалить контрагента?"
          description={`Контрагент "${r.name}" будет удалён безвозвратно`}
          onConfirm={() => handleDelete(r)}
          okText="Удалить"
          cancelText="Отмена"
          okButtonProps={{ danger: true }}
        >
          <span />
        </Popconfirm>
      )}
    />
  );

  return (
    <div className="space-y-4">
      {/* PageHeader with primary action */}
      <PageHeader
        title="Контрагенты"
        actions={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleCreateClick}
          >
            Новый контрагент
          </Button>
        }
      />

      {/* Filters */}
      <CounterpartyFilterBar initialFilters={initialFilters} />

      {/* Toolbar — secondary actions only */}
      <ERPToolbar
        selectedCount={selectedRowKeys.length}
      />

      {/* Table */}
      <ERPTable<CounterpartyWithBalance>
        data={data.items}
        columns={columns}
        pagination={pagination}
        selection={selection}
        onRowClick={handleRowClick}
        rowActions={rowActions}
        rowKey="id"
        sticky
      />

      {/* Drawer */}
      <CounterpartyDrawer
        open={drawerOpen}
        mode={drawerMode}
        counterparty={selectedCounterparty}
        onClose={handleDrawerClose}
        onSubmit={handleDrawerSubmit}
        loading={drawerLoading}
      />
    </div>
  );
}

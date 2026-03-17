"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { App, Modal, Button } from "antd";
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
  const [modal, modalContextHolder] = Modal.useModal();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit">("create");
  const [selectedCounterparty, setSelectedCounterparty] =
    useState<CounterpartyWithBalance | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  // Mounted guard — prevents antd pagination Select hydration mismatch
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

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

  const handleDelete = (row: CounterpartyWithBalance) => {
    modal.confirm({
      title: "Удалить контрагента?",
      content: `Контрагент "${row.name}" будет удалён безвозвратно.`,
      okText: "Удалить",
      okType: "danger",
      cancelText: "Отмена",
      onOk: async () => {
        try {
          await deleteCounterparty(row.id);
          message.success("Контрагент удалён");
          router.refresh();
        } catch (error) {
          message.error(
            error instanceof Error ? error.message : "Ошибка удаления"
          );
        }
      },
    });
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

  const handleSortChange = ({ sortField, sortOrder }: { sortField?: string; sortOrder?: "ascend" | "descend" | null }) => {
    const params = new URLSearchParams(searchParams.toString());
    if (sortField) {
      params.set("sort", sortField);
      params.set("order", sortOrder === "ascend" ? "asc" : "desc");
    } else {
      params.delete("sort");
      params.delete("order");
    }
    params.set("page", "1");
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const columns = getCounterpartyColumns();

  const rowActions = (row: CounterpartyWithBalance) => (
    <CounterpartyRowActions
      row={row}
      onEdit={handleEdit}
      onDelete={handleDelete}
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

      {/* Table — rendered only after mount to avoid antd pagination Select hydration mismatch */}
      {mounted && (
        <ERPTable<CounterpartyWithBalance>
          data={data.items}
          columns={columns}
          pagination={pagination}
          selection={selection}
          onRowClick={handleRowClick}
          rowActions={rowActions}
          rowKey="id"
          sticky
          onChange={({ sortField, sortOrder }) => handleSortChange({ sortField, sortOrder })}
        />
      )}

      {/* Modal context holder — required for modal.confirm() */}
      {modalContextHolder}

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

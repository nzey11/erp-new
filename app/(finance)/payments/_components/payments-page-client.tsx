"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { App, Popconfirm, Button } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import { PageHeader } from "@/components/shared/page-header";
import type { PaymentFilters } from "@/lib/domain/payments/parse-filters";
import type { GetPaymentsResult, PaymentWithRelations } from "@/lib/domain/payments/queries";
import { ERPTable } from "@/components/erp/erp-table";
import { ERPToolbar } from "@/components/erp/erp-toolbar";
import type { ERPPagination, ERPSelection } from "@/components/erp/erp-table.types";
import { PaymentFilterBar } from "./payment-filter-bar";
import { getPaymentColumns } from "./payment-table-columns";
import { PaymentRowActions } from "./payment-row-actions";
import { PaymentDrawer } from "./payment-drawer";
import { createPayment, updatePayment, deletePayment } from "../actions";
import type { PaymentFormValues } from "./payment-drawer";

interface PaymentsPageClientProps {
  initialData: GetPaymentsResult;
  initialFilters: PaymentFilters;
}

/**
 * Payments page client shell.
 *
 * Owns all client-side state:
 * - Drawer open/close
 * - Selected payment for editing
 * - Table selection state
 * - Message API for notifications
 *
 * Receives initial data from Server Component.
 */
export function PaymentsPageClient({
  initialData,
  initialFilters,
}: PaymentsPageClientProps) {
  const { message } = App.useApp();
  const router = useRouter();

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"create" | "edit">("create");
  const [selectedPayment, setSelectedPayment] = useState<PaymentWithRelations | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);

  // Selection state
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  // Data comes directly from server props — router.refresh() triggers re-render with new initialData
  const data = initialData;

  const handleCreateClick = () => {
    setDrawerMode("create");
    setSelectedPayment(null);
    setDrawerOpen(true);
  };

  const handleRowClick = (row: PaymentWithRelations) => {
    setDrawerMode("edit");
    setSelectedPayment(row);
    setDrawerOpen(true);
  };

  const handleEdit = (row: PaymentWithRelations) => {
    setDrawerMode("edit");
    setSelectedPayment(row);
    setDrawerOpen(true);
  };

  const handleDelete = async (row: PaymentWithRelations) => {
    try {
      await deletePayment(row.id);
      message.success("Платёж удалён");
      router.refresh();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Ошибка удаления");
    }
  };

  const handleDrawerClose = () => {
    setDrawerOpen(false);
    setSelectedPayment(null);
  };

  const handleDrawerSubmit = async (values: PaymentFormValues) => {
    setDrawerLoading(true);
    try {
      if (drawerMode === "create") {
        await createPayment(values);
        message.success("Платёж создан");
      } else if (drawerMode === "edit" && selectedPayment) {
        await updatePayment(selectedPayment.id, values);
        message.success("Платёж обновлён");
      }
      setDrawerOpen(false);
      router.refresh();
    } catch (error) {
      message.error(error instanceof Error ? error.message : "Ошибка сохранения");
    } finally {
      setDrawerLoading(false);
    }
  };

  const selection: ERPSelection<PaymentWithRelations> = {
    selectedRowKeys,
    onChange: (keys) => setSelectedRowKeys(keys),
    getRowKey: (row) => row.id,
  };

  const pagination: ERPPagination = {
    current: data.page,
    pageSize: data.pageSize,
    total: data.total,
  };

  const columns = getPaymentColumns();

  const rowActions = (row: PaymentWithRelations) => (
    <PaymentRowActions
      row={row}
      onEdit={handleEdit}
      onDelete={(r) => (
        <Popconfirm
          title="Удалить платёж?"
          description={`Платёж ${r.number} будет удалён безвозвратно`}
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
        title="Платежи"
        actions={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleCreateClick}
          >
            Новый платёж
          </Button>
        }
      />

      {/* Filters */}
      <PaymentFilterBar initialFilters={initialFilters} />

      {/* Toolbar — secondary actions only */}
      <ERPToolbar
        selectedCount={selectedRowKeys.length}
      />

      {/* Table */}
      <ERPTable<PaymentWithRelations>
        data={data.items}
        columns={columns}
        pagination={pagination}
        selection={selection}
        onRowClick={handleRowClick}
        rowActions={rowActions}
        rowKey="id"
        sticky
      />

      {/* Summary */}
      <div className="flex items-center justify-end gap-6 text-sm">
        <span>
          Приход: {" "}
          <span className="font-medium text-green-600">
            {new Intl.NumberFormat("ru-RU", {
              style: "currency",
              currency: "RUB",
            }).format(data.incomeTotal)}
          </span>
        </span>
        <span>
          Расход: {" "}
          <span className="font-medium text-red-600">
            {new Intl.NumberFormat("ru-RU", {
              style: "currency",
              currency: "RUB",
            }).format(data.expenseTotal)}
          </span>
        </span>
        <span>
          Итого: {" "}
          <span
            className={`font-medium ${
              data.netCashFlow >= 0 ? "text-green-600" : "text-red-600"
            }`}
          >
            {new Intl.NumberFormat("ru-RU", {
              style: "currency",
              currency: "RUB",
            }).format(data.netCashFlow)}
          </span>
        </span>
      </div>

      {/* Drawer */}
      <PaymentDrawer
        open={drawerOpen}
        mode={drawerMode}
        payment={selectedPayment}
        onClose={handleDrawerClose}
        onSubmit={handleDrawerSubmit}
        loading={drawerLoading}
      />
    </div>
  );
}

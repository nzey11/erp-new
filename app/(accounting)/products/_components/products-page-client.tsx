"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { App, Button, Dropdown, Popconfirm, Space } from "antd";
import { DownloadOutlined, MoreOutlined, PlusOutlined } from "@ant-design/icons";
import { PageHeader } from "@/components/shared/page-header";
import type { ProductFilters } from "@/lib/domain/products/parse-filters";
import type {
  GetProductsResult,
  ProductWithRelations,
} from "@/lib/domain/products/queries";
import { ERPTable } from "@/components/erp/erp-table";
import { ERPToolbar } from "@/components/erp/erp-toolbar";
import type { ERPPagination, ERPSelection } from "@/components/erp/erp-table.types";
import { ProductFilterBar } from "./product-filter-bar";
import { getProductColumns } from "./product-table-columns";
import { getProductRowActions } from "./product-row-actions";
import {
  archiveProduct,
  restoreProduct,
  duplicateProduct,
  bulkArchiveProducts,
  bulkRestoreProducts,
} from "../actions";

interface Category {
  id: string;
  name: string;
}

interface ProductsPageClientProps {
  initialData: GetProductsResult;
  initialFilters: ProductFilters;
  categories: Category[];
}

/**
 * Products page client shell (Catalog tab).
 *
 * Owns all client-side state:
 * - Table selection state
 * - Message API for notifications
 *
 * No Drawer — product editing is full-page at /products/[id].
 * Navigation on name click is handled by <Link> inside columns.
 */
export function ProductsPageClient({
  initialData,
  initialFilters,
  categories,
}: ProductsPageClientProps) {
  const { message } = App.useApp();
  const router = useRouter();

  // Selection state
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [bulkLoading, setBulkLoading] = useState(false);

  // Row action handler
  const handleRowAction = useCallback(
    async (action: string, row: ProductWithRelations) => {
      switch (action) {
        case "open":
          router.push(`/products/${row.id}`);
          break;

        case "duplicate": {
          try {
            const result = await duplicateProduct(row.id);
            message.success(`Товар скопирован`);
            if (result.productId) {
              router.push(`/products/${result.productId}`);
            } else {
              router.refresh();
            }
          } catch (error) {
            message.error(
              error instanceof Error ? error.message : "Ошибка дублирования"
            );
          }
          break;
        }

        case "archive": {
          try {
            await archiveProduct(row.id);
            message.success(`«${row.name}» перемещён в архив`);
            router.refresh();
          } catch (error) {
            message.error(
              error instanceof Error ? error.message : "Ошибка архивирования"
            );
          }
          break;
        }

        case "restore": {
          try {
            await restoreProduct(row.id);
            message.success(`«${row.name}» восстановлен`);
            router.refresh();
          } catch (error) {
            message.error(
              error instanceof Error ? error.message : "Ошибка восстановления"
            );
          }
          break;
        }
      }
    },
    [router, message]
  );

  // Bulk actions
  const handleBulkArchive = async () => {
    if (selectedRowKeys.length === 0) return;
    setBulkLoading(true);
    try {
      const ids = selectedRowKeys.map((k) => String(k));
      await bulkArchiveProducts(ids);
      message.success(`${ids.length} товар(ов) перемещено в архив`);
      setSelectedRowKeys([]);
      router.refresh();
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "Ошибка массового архивирования"
      );
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkRestore = async () => {
    if (selectedRowKeys.length === 0) return;
    setBulkLoading(true);
    try {
      const ids = selectedRowKeys.map((k) => String(k));
      await bulkRestoreProducts(ids);
      message.success(`${ids.length} товар(ов) восстановлено`);
      setSelectedRowKeys([]);
      router.refresh();
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : "Ошибка массового восстановления"
      );
    } finally {
      setBulkLoading(false);
    }
  };

  // CSV export (pass-through to existing API)
  const handleCsvExport = () => {
    window.location.href = "/api/accounting/products/export-csv";
  };

  const selection: ERPSelection<ProductWithRelations> = {
    selectedRowKeys,
    onChange: (keys) => setSelectedRowKeys(keys),
    getRowKey: (row) => row.id,
  };

  const pagination: ERPPagination = {
    current: initialData.page,
    pageSize: initialData.pageSize,
    total: initialData.total,
  };

  const columns = getProductColumns(handleRowAction);

  const rowActions = (row: ProductWithRelations) => (
    <Dropdown
      menu={{ items: getProductRowActions(row, handleRowAction) }}
      trigger={["click"]}
    >
      <Button
        type="text"
        icon={<MoreOutlined />}
        onClick={(e) => e.stopPropagation()}
      />
    </Dropdown>
  );

  // Bulk action items for toolbar
  const bulkActionsNode =
    selectedRowKeys.length > 0 ? (
      <Space>
        <Popconfirm
          title={`Архивировать ${selectedRowKeys.length} товар(ов)?`}
          onConfirm={handleBulkArchive}
          okText="Архивировать"
          cancelText="Отмена"
        >
          <Button loading={bulkLoading}>
            В архив ({selectedRowKeys.length})
          </Button>
        </Popconfirm>
        <Button onClick={handleBulkRestore} loading={bulkLoading}>
          Восстановить ({selectedRowKeys.length})
        </Button>
      </Space>
    ) : null;

  return (
    <div className="space-y-4">
      {/* PageHeader with primary action */}
      <PageHeader
        title="Товары — Каталог"
        actions={
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => router.push("/products/new")}
          >
            Новый товар
          </Button>
        }
      />

      {/* Filters */}
      <ProductFilterBar
        initialFilters={initialFilters}
        categories={categories}
      />

      {/* Toolbar with secondary actions (CSV export) */}
      <ERPToolbar
        selectedCount={selectedRowKeys.length}
        bulkActions={bulkActionsNode}
        extraActions={
          <Button
            icon={<DownloadOutlined />}
            onClick={handleCsvExport}
          >
            Экспорт CSV
          </Button>
        }
      />

      {/* Table */}
      <ERPTable<ProductWithRelations>
        data={initialData.items}
        columns={columns}
        pagination={pagination}
        selection={selection}
        rowActions={rowActions}
        rowKey="id"
        sticky
      />
    </div>
  );
}

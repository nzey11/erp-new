import Link from "next/link";
import Image from "next/image";
import { Tag, Tooltip, Badge, Space } from "antd";
import type { ERPColumn } from "@/components/erp/erp-table.types";
import { formatMoney } from "@/components/erp/columns";
import type { ProductWithRelations } from "@/lib/domain/products/queries";

export function getProductColumns(): ERPColumn<ProductWithRelations>[] {
  return [
    {
      key: "image",
      title: "",
      width: 56,
      render: (_value, row) => {
        if (!row.imageUrl) {
          return (
            <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center text-gray-400 text-xs">
              —
            </div>
          );
        }
        return (
          <Image
            src={row.imageUrl}
            alt={row.name}
            width={40}
            height={40}
            className="rounded object-cover"
            style={{ width: 40, height: 40 }}
          />
        );
      },
    },
    {
      key: "name",
      title: "Наименование",
      dataIndex: "name",
      sortable: true,
      ellipsis: true,
      render: (_value, row) => (
        <Space orientation="vertical" size={0}>
          <Link
            href={`/products/${row.id}`}
            className="font-medium text-blue-600 hover:text-blue-800 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {row.name}
          </Link>
          {row.sku && (
            <span className="text-xs text-gray-400">SKU: {row.sku}</span>
          )}
          {row.masterProduct && (
            <span className="text-xs text-gray-400">
              Вариант: {row.masterProduct.name}
            </span>
          )}
        </Space>
      ),
    },
    {
      key: "category",
      title: "Категория",
      dataIndex: "category",
      width: 160,
      ellipsis: true,
      render: (_value, row) =>
        row.category ? (
          <span className="text-sm text-gray-600">{row.category.name}</span>
        ) : (
          <span className="text-gray-300">—</span>
        ),
    },
    {
      key: "unit",
      title: "Ед.",
      dataIndex: "unit",
      width: 70,
      render: (_value, row) => (
        <span className="text-sm text-gray-500">{row.unit.shortName}</span>
      ),
    },
    {
      key: "purchasePrice",
      title: "Закупка",
      dataIndex: "purchasePrice",
      width: 110,
      align: "right",
      render: (_value, row) => (
        <span className="text-sm font-mono">{formatMoney(row.purchasePrice)}</span>
      ),
    },
    {
      key: "salePrice",
      title: "Продажа",
      dataIndex: "salePrice",
      width: 120,
      align: "right",
      render: (_value, row) => {
        if (row.discountedPrice !== null && row.salePrice !== null) {
          return (
            <Space orientation="vertical" size={0} style={{ textAlign: "right" }}>
              <Tooltip
                title={
                  row.discountName
                    ? `Скидка: ${row.discountName}${row.discountValidTo ? ` до ${new Date(row.discountValidTo).toLocaleDateString("ru-RU")}` : ""}`
                    : "Скидка"
                }
              >
                <span className="text-xs line-through text-gray-400 font-mono">
                  {formatMoney(row.salePrice)}
                </span>
              </Tooltip>
              <span className="text-sm font-mono text-green-600">
                {formatMoney(row.discountedPrice)}
              </span>
            </Space>
          );
        }
        return (
          <span className="text-sm font-mono">{formatMoney(row.salePrice)}</span>
        );
      },
    },
    {
      key: "variants",
      title: "Варианты",
      width: 100,
      align: "center",
      render: (_value, row) => {
        const count = row.variantCount + row.childVariantCount;
        if (count === 0) {
          return <span className="text-gray-300 text-sm">—</span>;
        }
        return (
          <Badge
            count={count}
            style={{ backgroundColor: "#52c41a" }}
            overflowCount={99}
          />
        );
      },
    },
    {
      key: "status",
      title: "Статус",
      width: 130,
      render: (_value, row) => (
        <Space size={4} wrap>
          <Tag color={row.isActive ? "success" : "default"} bordered={false}>
            {row.isActive ? "Активен" : "В архиве"}
          </Tag>
          {row.publishedToStore && (
            <Tag color="blue" bordered={false}>
              На сайте
            </Tag>
          )}
        </Space>
      ),
    },
  ];
}

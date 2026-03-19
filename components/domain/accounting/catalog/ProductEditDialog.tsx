"use client";

import { Modal } from "antd";
import { ProductFormContent } from "./ProductFormContent";

interface Unit { id: string; name: string; shortName: string; }
interface Category { id: string; name: string; parentId: string | null; }

// Local Product type for dialog (matches API response)
interface Product {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  description: string | null;
  unitId: string;
  categoryId: string | null;
  purchasePrice: number | null;
  salePrice: number | null;
  imageUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string | null;
  slug: string | null;
  publishedToStore: boolean;
}

interface ProductEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingProduct: Product | null;
  units: Unit[];
  categories: Category[];
  onSaved: () => void;
}

export function ProductEditDialog({
  open,
  onOpenChange,
  editingProduct,
  units,
  categories,
  onSaved,
}: ProductEditDialogProps) {
  return (
    <Modal
      open={open}
      onCancel={() => onOpenChange(false)}
      footer={null}
      title={editingProduct ? "Редактировать товар" : "Новый товар"}
      width={700}
    >
      <ProductFormContent
        editingProduct={editingProduct}
        units={units}
        categories={categories}
        onSaved={() => { onSaved(); onOpenChange(false); }}
        onCancel={() => onOpenChange(false)}
        inDialog
      />
    </Modal>
  );
}

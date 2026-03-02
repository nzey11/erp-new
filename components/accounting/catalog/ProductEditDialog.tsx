"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Product } from "../ProductsTable";
import { ProductFormContent } from "./ProductFormContent";

interface Unit { id: string; name: string; shortName: string; }
interface Category { id: string; name: string; parentId: string | null; }

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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editingProduct ? "Редактировать товар" : "Новый товар"}
          </DialogTitle>
        </DialogHeader>
        <ProductFormContent
          editingProduct={editingProduct}
          units={units}
          categories={categories}
          onSaved={() => { onSaved(); onOpenChange(false); }}
          onCancel={() => onOpenChange(false)}
          inDialog
        />
      </DialogContent>
    </Dialog>
  );
}

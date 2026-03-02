"use client";

import { cn } from "@/lib/shared/utils";
import { formatRub } from "@/lib/shared/utils";

type Variant = {
  id: string;
  option: string;
  type: string;
  priceAdjustment: number;
};

interface ProductVariantChipsProps {
  variants: Variant[];
  selectedVariantId: string;
  onSelect: (variantId: string) => void;
}

export function ProductVariantChips({
  variants,
  selectedVariantId,
  onSelect,
}: ProductVariantChipsProps) {
  if (variants.length === 0) return null;

  // Group variants by type
  const grouped = variants.reduce<Record<string, Variant[]>>((acc, v) => {
    const key = v.type || "Вариант";
    if (!acc[key]) acc[key] = [];
    acc[key].push(v);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([type, typeVariants]) => (
        <div key={type}>
          <label className="text-sm font-medium mb-2 block">{type}</label>
          <div className="flex flex-wrap gap-2">
            {typeVariants.map((variant) => (
              <button
                key={variant.id}
                onClick={() =>
                  onSelect(selectedVariantId === variant.id ? "" : variant.id)
                }
                className={cn(
                  "px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors",
                  selectedVariantId === variant.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background hover:border-primary/50 hover:bg-accent"
                )}
              >
                {variant.option}
                {variant.priceAdjustment !== 0 && (
                  <span className="ml-1 text-xs opacity-75">
                    ({variant.priceAdjustment > 0 ? "+" : ""}
                    {formatRub(variant.priceAdjustment)})
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

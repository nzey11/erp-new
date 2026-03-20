/**
 * Verify ProductCatalogProjection
 *
 * Dual-read comparison between original and projection endpoints.
 * Used to verify projection correctness before switch.
 *
 * Usage:
 *   npx tsx scripts/verify-product-catalog-projection.ts
 *
 * Comparison policy (Phase 1):
 * - Strict: id, name, slug, sku, price, discountedPrice, discount, rating, reviewCount,
 *           unit, category, childVariantCount, priceRange, description
 * - Ignore order: variants (compare as sets)
 * - Ignore: seoTitle, seoDescription (not in projection Phase 1)
 */

import "dotenv/config";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

interface Product {
  id: string;
  name: string;
  slug: string | null;
  sku: string | null;
  description: string | null;
  imageUrl: string | null;
  unit: { id: string; shortName: string } | null;
  category: { id: string; name: string } | null;
  price: number;
  discountedPrice: number | null;
  discount: { name: string; type: string; value: number } | null;
  rating: number;
  reviewCount: number;
  variants: Array<{ id: string; sku: string | null; priceAdjustment: number; option: string; type: string }>;
  childVariantCount: number;
  priceRange: { min: number; max: number } | null;
  seoTitle: string | null;
  seoDescription: string | null;
}

interface Diff {
  type: "missing" | "extra" | "field_mismatch" | "variant_mismatch";
  id: string;
  field?: string;
  old?: unknown;
  new?: unknown;
}

interface DiffReport {
  match: boolean;
  totalOld: number;
  totalNew: number;
  diffs: Diff[];
}

// Fields to compare strictly
const STRICT_FIELDS = [
  "name",
  "slug",
  "sku",
  "description",
  "price",
  "discountedPrice",
  "rating",
  "reviewCount",
  "childVariantCount",
] as const;

// Fields to ignore (defined for reference but not used in current strict comparison)
// const IGNORE_FIELDS = ["seoTitle", "seoDescription", "imageUrl"];

async function fetchProducts(endpoint: string): Promise<{ data: Product[]; total: number }> {
  const response = await fetch(`${BASE_URL}${endpoint}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${endpoint}: ${response.status}`);
  }
  return response.json();
}

function compareProducts(oldProducts: Product[], newProducts: Product[]): DiffReport {
  const diffs: Diff[] = [];

  const oldById = new Map(oldProducts.map((p) => [p.id, p]));
  const newById = new Map(newProducts.map((p) => [p.id, p]));

  // Check for missing products (in old but not in new)
  for (const [id, oldItem] of oldById) {
    const newItem = newById.get(id);
    if (!newItem) {
      diffs.push({ type: "missing", id });
      continue;
    }

    // Compare strict fields
    for (const field of STRICT_FIELDS) {
      const oldVal = oldItem[field];
      const newVal = newItem[field];
      if (oldVal !== newVal) {
        diffs.push({
          type: "field_mismatch",
          id,
          field,
          old: oldVal,
          new: newVal,
        });
      }
    }

    // Compare unit
    if (
      (oldItem.unit?.id !== newItem.unit?.id) ||
      (oldItem.unit?.shortName !== newItem.unit?.shortName)
    ) {
      diffs.push({
        type: "field_mismatch",
        id,
        field: "unit",
        old: oldItem.unit,
        new: newItem.unit,
      });
    }

    // Compare category
    if (
      (oldItem.category?.id !== newItem.category?.id) ||
      (oldItem.category?.name !== newItem.category?.name)
    ) {
      diffs.push({
        type: "field_mismatch",
        id,
        field: "category",
        old: oldItem.category,
        new: newItem.category,
      });
    }

    // Compare discount
    const oldDiscount = oldItem.discount ? `${oldItem.discount.name}:${oldItem.discount.type}:${oldItem.discount.value}` : null;
    const newDiscount = newItem.discount ? `${newItem.discount.name}:${newItem.discount.type}:${newItem.discount.value}` : null;
    if (oldDiscount !== newDiscount) {
      diffs.push({
        type: "field_mismatch",
        id,
        field: "discount",
        old: oldItem.discount,
        new: newItem.discount,
      });
    }

    // Compare priceRange
    const oldRange = oldItem.priceRange ? `${oldItem.priceRange.min}-${oldItem.priceRange.max}` : null;
    const newRange = newItem.priceRange ? `${newItem.priceRange.min}-${newItem.priceRange.max}` : null;
    if (oldRange !== newRange) {
      diffs.push({
        type: "field_mismatch",
        id,
        field: "priceRange",
        old: oldItem.priceRange,
        new: newItem.priceRange,
      });
    }

    // Compare variants (ignore order)
    const oldVariantIds = oldItem.variants.map((v) => v.id).sort().join(",");
    const newVariantIds = newItem.variants.map((v) => v.id).sort().join(",");
    if (oldVariantIds !== newVariantIds) {
      diffs.push({
        type: "variant_mismatch",
        id,
        field: "variants",
        old: oldItem.variants.length,
        new: newItem.variants.length,
      });
    }
  }

  // Check for extra products (in new but not in old)
  for (const id of newById.keys()) {
    if (!oldById.has(id)) {
      diffs.push({ type: "extra", id });
    }
  }

  return {
    match: diffs.length === 0,
    totalOld: oldProducts.length,
    totalNew: newProducts.length,
    diffs,
  };
}

async function main() {
  console.log("=== ProductCatalogProjection Dual-Read Verify ===\n");

  console.log(`Base URL: ${BASE_URL}\n`);

  // Fetch from both endpoints
  console.log("Fetching from original endpoint (/api/ecommerce/products)...");
  const oldResult = await fetchProducts("/api/ecommerce/products");
  console.log(`  Total: ${oldResult.total} products\n`);

  console.log("Fetching from projection endpoint (/api/ecommerce/products-projection)...");
  const newResult = await fetchProducts("/api/ecommerce/products-projection");
  console.log(`  Total: ${newResult.total} products\n`);

  // Compare
  console.log("Comparing results...\n");
  const report = compareProducts(oldResult.data, newResult.data);

  // Print summary
  console.log("=== Comparison Report ===\n");
  console.log(`Original endpoint: ${report.totalOld} products`);
  console.log(`Projection endpoint: ${report.totalNew} products`);
  console.log(`Match: ${report.match ? "✅ YES" : "❌ NO"}\n`);

  if (report.diffs.length > 0) {
    console.log(`Differences found: ${report.diffs.length}\n`);

    // Group by type
    const byType = new Map<string, Diff[]>();
    for (const diff of report.diffs) {
      const existing = byType.get(diff.type) ?? [];
      existing.push(diff);
      byType.set(diff.type, existing);
    }

    for (const [type, diffs] of byType) {
      console.log(`\n--- ${type} (${diffs.length}) ---`);
      for (const diff of diffs.slice(0, 5)) {
        if (diff.type === "field_mismatch") {
          console.log(`  [${diff.id}] ${diff.field}: "${diff.old}" → "${diff.new}"`);
        } else {
          console.log(`  [${diff.id}] ${diff.type}`);
        }
      }
      if (diffs.length > 5) {
        console.log(`  ... and ${diffs.length - 5} more`);
      }
    }

    console.log("\n❌ Projection does NOT match original. Fix differences before switch.");
    process.exit(1);
  }

  console.log("✅ Projection matches original. Safe to switch.\n");
}

main()
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exit(1);
  });

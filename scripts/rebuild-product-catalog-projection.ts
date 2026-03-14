/**
 * Rebuild ProductCatalogProjection
 *
 * Full rebuild of the storefront catalog read model.
 * Used for:
 * - Initial population after schema migration
 * - Recovery from corruption
 * - Periodic full sync (e.g., weekly via cron)
 *
 * Usage:
 *   npx tsx scripts/rebuild-product-catalog-projection.ts
 *
 * Strategy:
 * 1. Clear existing projection
 * 2. Build projection from current Product + Price + Discount + Review data
 * 3. Verify row count matches source
 */

import { db } from "@/lib/shared/db";

async function main() {
  console.log("=== ProductCatalogProjection Rebuild ===\n");

  const startTime = Date.now();

  // Step 1: Count source products
  console.log("Step 1: Counting source products...");
  const sourceCount = await db.product.count({
    where: {
      masterProductId: null, // Only master products for storefront list
    },
  });
  console.log(`  Found ${sourceCount} master products to project.\n`);

  // Step 2: Clear existing projection
  console.log("Step 2: Clearing existing projection...");
  const deleteResult = await db.productCatalogProjection.deleteMany({});
  console.log(`  Deleted ${deleteResult.count} existing projection rows.\n`);

  // Step 3: Build projection via raw SQL for performance
  console.log("Step 3: Building projection from source data...");

  const insertResult = await db.$executeRaw`
    INSERT INTO "ProductCatalogProjection" (
      "productId",
      "tenantId",
      "name",
      "slug",
      "sku",
      "imageUrl",
      "description",
      "unitId",
      "unitShortName",
      "categoryId",
      "categoryName",
      "price",
      "discountedPrice",
      "discountName",
      "discountType",
      "discountValue",
      "avgRating",
      "reviewCount",
      "childVariantCount",
      "priceRangeMin",
      "priceRangeMax",
      "isActive",
      "publishedToStore",
      "updatedAt"
    )
    SELECT
      p.id AS "productId",
      p."tenantId",
      p.name,
      p.slug,
      p.sku,
      p."imageUrl",
      p.description,
      u.id AS "unitId",
      u."shortName" AS "unitShortName",
      p."categoryId",
      pc.name AS "categoryName",
      COALESCE(sp.price, 0) AS price,
      CASE
        WHEN d.id IS NOT NULL THEN
          CASE
            WHEN d.type = 'percentage' THEN
              GREATEST(0, COALESCE(sp.price, 0) * (1 - d.value / 100))
            ELSE
              GREATEST(0, COALESCE(sp.price, 0) - d.value)
          END
        ELSE NULL
      END AS "discountedPrice",
      d.name AS "discountName",
      d.type AS "discountType",
      d.value AS "discountValue",
      COALESCE(r.avg_rating, 0) AS "avgRating",
      COALESCE(r.review_count, 0) AS "reviewCount",
      COALESCE(cv.variant_count, 0) AS "childVariantCount",
      cv.price_min AS "priceRangeMin",
      cv.price_max AS "priceRangeMax",
      p."isActive",
      p."publishedToStore",
      NOW() AS "updatedAt"
    FROM "Product" p
    LEFT JOIN "Unit" u ON p."unitId" = u.id
    LEFT JOIN "ProductCategory" pc ON p."categoryId" = pc.id
    LEFT JOIN LATERAL (
      SELECT price
      FROM "SalePrice"
      WHERE "productId" = p.id
        AND "isActive" = true
        AND "priceListId" IS NULL
      ORDER BY "validFrom" DESC
      LIMIT 1
    ) sp ON true
    LEFT JOIN LATERAL (
      SELECT id, name, type, value
      FROM "ProductDiscount"
      WHERE "productId" = p.id
        AND "isActive" = true
        AND "validFrom" <= NOW()
        AND ("validTo" IS NULL OR "validTo" >= NOW())
      LIMIT 1
    ) d ON true
    LEFT JOIN LATERAL (
      SELECT
        AVG(rating) AS avg_rating,
        COUNT(*) AS review_count
      FROM "Review"
      WHERE "productId" = p.id
        AND "isPublished" = true
    ) r ON true
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) AS variant_count,
        MIN(COALESCE(vsp.price, sp.price, 0)) AS price_min,
        MAX(COALESCE(vsp.price, sp.price, 0)) AS price_max
      FROM "Product" cv
      LEFT JOIN LATERAL (
        SELECT price
        FROM "SalePrice"
        WHERE "productId" = cv.id
          AND "isActive" = true
          AND "priceListId" IS NULL
        ORDER BY "validFrom" DESC
        LIMIT 1
      ) vsp ON true
      WHERE cv."masterProductId" = p.id
        AND cv."isActive" = true
        AND cv."publishedToStore" = true
    ) cv ON true
    WHERE p."masterProductId" IS NULL
  `;

  console.log(`  Inserted ${insertResult} projection rows.\n`);

  // Step 4: Verify row count
  console.log("Step 4: Verifying projection...");
  const projectionCount = await db.productCatalogProjection.count();

  if (projectionCount !== sourceCount) {
    console.error(`❌ ERROR: Row count mismatch!`);
    console.error(`   Source: ${sourceCount}`);
    console.error(`   Projection: ${projectionCount}`);
    process.exit(1);
  }

  console.log(`✓ Projection count matches source: ${projectionCount} rows.\n`);

  // Step 5: Distribution stats
  const stats = await db.$queryRaw<{ tenantId: string; count: bigint }[]>`
    SELECT "tenantId", COUNT(*) as count
    FROM "ProductCatalogProjection"
    GROUP BY "tenantId"
    ORDER BY count DESC
  `;

  console.log("Distribution by tenant:");
  stats.forEach(s => {
    console.log(`   - Tenant ${s.tenantId}: ${s.count} product(s)`);
  });

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n=== Rebuild Complete (${duration}s) ===`);
}

main()
  .catch((e) => {
    console.error("Fatal error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });

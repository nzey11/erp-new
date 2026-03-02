/**
 * Variant Matcher - Smart suggestion algorithm for product variants
 *
 * Three matching strategies:
 * 1. SKU Pattern (85-95% confidence) - e.g., PHONE-001-BLK, PHONE-001-WHT
 * 2. Name Similarity (60-80% confidence) - e.g., "iPhone 15 Черный" → "iPhone 15 Белый"
 * 3. Category + Characteristics (40-60% confidence) - same category + similar custom fields
 */

import { db } from "@/lib/shared/db";

// Common variant keywords for name parsing
const COLOR_KEYWORDS = [
  "черный", "белый", "красный", "синий", "зеленый", "желтый", "серый", "розовый",
  "оранжевый", "фиолетовый", "коричневый", "бежевый", "голубой", "бордовый",
  "black", "white", "red", "blue", "green", "yellow", "gray", "grey", "pink",
  "orange", "purple", "brown", "beige",
];

const SIZE_KEYWORDS = [
  "xs", "s", "m", "l", "xl", "xxl", "xxxl",
  "36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46",
  "100г", "200г", "250г", "500г", "1кг",
  "100ml", "200ml", "250ml", "500ml", "1l",
  "маленький", "средний", "большой",
];

export interface VariantSuggestion {
  productId: string;
  product: {
    id: string;
    name: string;
    sku: string | null;
    imageUrl: string | null;
    salePrice: number | null;
    categoryId: string | null;
  };
  confidence: number;
  matchType: "sku" | "name" | "characteristics";
  matchDetails: {
    skuPattern?: string;
    nameSimilarity?: number;
    matchingFields?: string[];
    differentFields?: string[];
  };
  suggestedGroupName: string;
}

interface ProductForMatching {
  id: string;
  name: string;
  sku: string | null;
  imageUrl: string | null;
  categoryId: string | null;
  unitId: string;
  createdAt: Date;
  salePrices: { price: number }[];
  customFields: { definitionId: string; value: string; definition: { name: string } }[];
}

/**
 * Extract base SKU pattern from a full SKU
 * e.g., "PHONE-001-BLK" → { base: "PHONE-001", suffix: "BLK" }
 */
function extractSkuPattern(sku: string): { base: string; suffix: string } | null {
  // Pattern: BASE-SUFFIX or BASE_SUFFIX where suffix is typically color/size code
  const match = sku.match(/^(.+?)[-_]([A-Z0-9]{2,6})$/i);
  if (match) {
    return { base: match[1], suffix: match[2] };
  }

  // Alternative pattern: last segment after dash
  const parts = sku.split(/[-_]/);
  if (parts.length >= 2) {
    const suffix = parts.pop()!;
    const base = parts.join("-");
    if (suffix.length >= 2 && suffix.length <= 6) {
      return { base, suffix };
    }
  }

  return null;
}

/**
 * Extract variant keywords from product name
 * Returns the base name and detected variant attributes
 */
function extractNameVariants(name: string): {
  baseName: string;
  colorVariant: string | null;
  sizeVariant: string | null;
} {
  const lowerName = name.toLowerCase();
  let baseName = name;
  let colorVariant: string | null = null;
  let sizeVariant: string | null = null;

  // Find color keywords
  for (const color of COLOR_KEYWORDS) {
    if (lowerName.includes(color)) {
      colorVariant = color;
      baseName = baseName.replace(new RegExp(`\\s*${color}\\s*`, "gi"), " ");
      break;
    }
  }

  // Find size keywords
  for (const size of SIZE_KEYWORDS) {
    if (lowerName.includes(size.toLowerCase())) {
      sizeVariant = size;
      baseName = baseName.replace(new RegExp(`\\s*${size}\\s*`, "gi"), " ");
      break;
    }
  }

  // Clean up base name
  baseName = baseName.replace(/\s+/g, " ").trim();

  return { baseName, colorVariant, sizeVariant };
}

/**
 * Calculate simple string similarity (Jaccard index on words)
 */
function calculateNameSimilarity(name1: string, name2: string): number {
  const words1 = new Set(name1.toLowerCase().split(/\s+/).filter((w) => w.length > 2));
  const words2 = new Set(name2.toLowerCase().split(/\s+/).filter((w) => w.length > 2));

  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = new Set([...words1].filter((w) => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return intersection.size / union.size;
}

/**
 * Calculate confidence score with bonuses
 */
function calculateConfidence(
  baseScore: number,
  sourceProduct: ProductForMatching,
  candidateProduct: ProductForMatching
): number {
  let confidence = baseScore;

  // Same category bonus
  if (sourceProduct.categoryId && sourceProduct.categoryId === candidateProduct.categoryId) {
    confidence += 5;
  }

  // Same unit bonus
  if (sourceProduct.unitId === candidateProduct.unitId) {
    confidence += 3;
  }

  // Price within 20% bonus
  const sourcePrice = sourceProduct.salePrices[0]?.price;
  const candidatePrice = candidateProduct.salePrices[0]?.price;
  if (sourcePrice && candidatePrice) {
    const priceDiff = Math.abs(sourcePrice - candidatePrice) / Math.max(sourcePrice, candidatePrice);
    if (priceDiff <= 0.2) {
      confidence += 5;
    }
  }

  // Recently created bonus (within 7 days)
  const daysDiff = (Date.now() - candidateProduct.createdAt.getTime()) / (1000 * 60 * 60 * 24);
  if (daysDiff <= 7) {
    confidence += 2;
  }

  return Math.min(100, Math.max(0, confidence));
}

/**
 * Match products by SKU pattern
 */
async function matchBySku(
  sourceProduct: ProductForMatching,
  candidates: ProductForMatching[]
): Promise<VariantSuggestion[]> {
  const suggestions: VariantSuggestion[] = [];

  if (!sourceProduct.sku) return suggestions;

  const sourcePattern = extractSkuPattern(sourceProduct.sku);
  if (!sourcePattern) return suggestions;

  for (const candidate of candidates) {
    if (!candidate.sku || candidate.id === sourceProduct.id) continue;

    const candidatePattern = extractSkuPattern(candidate.sku);
    if (!candidatePattern) continue;

    // Check if base patterns match
    if (sourcePattern.base.toLowerCase() === candidatePattern.base.toLowerCase()) {
      const baseScore = 90; // High confidence for SKU match
      const confidence = calculateConfidence(baseScore, sourceProduct, candidate);

      suggestions.push({
        productId: candidate.id,
        product: {
          id: candidate.id,
          name: candidate.name,
          sku: candidate.sku,
          imageUrl: candidate.imageUrl,
          salePrice: candidate.salePrices[0]?.price ?? null,
          categoryId: candidate.categoryId,
        },
        confidence,
        matchType: "sku",
        matchDetails: {
          skuPattern: sourcePattern.base,
        },
        suggestedGroupName: detectGroupName(sourcePattern.suffix, candidatePattern.suffix),
      });
    }
  }

  return suggestions;
}

/**
 * Match products by name similarity
 */
async function matchByName(
  sourceProduct: ProductForMatching,
  candidates: ProductForMatching[]
): Promise<VariantSuggestion[]> {
  const suggestions: VariantSuggestion[] = [];

  const sourceExtracted = extractNameVariants(sourceProduct.name);
  if (!sourceExtracted.baseName) return suggestions;

  for (const candidate of candidates) {
    if (candidate.id === sourceProduct.id) continue;

    const candidateExtracted = extractNameVariants(candidate.name);

    // Calculate similarity on base names
    const similarity = calculateNameSimilarity(sourceExtracted.baseName, candidateExtracted.baseName);

    // Need high similarity and at least one different variant attribute
    if (similarity >= 0.7) {
      const hasDifferentColor =
        sourceExtracted.colorVariant !== candidateExtracted.colorVariant &&
        (sourceExtracted.colorVariant || candidateExtracted.colorVariant);
      const hasDifferentSize =
        sourceExtracted.sizeVariant !== candidateExtracted.sizeVariant &&
        (sourceExtracted.sizeVariant || candidateExtracted.sizeVariant);

      if (hasDifferentColor || hasDifferentSize) {
        const baseScore = 60 + similarity * 20; // 60-80 based on similarity
        const confidence = calculateConfidence(baseScore, sourceProduct, candidate);

        let suggestedGroupName = "Вариант";
        if (hasDifferentColor) suggestedGroupName = "Цвет";
        else if (hasDifferentSize) suggestedGroupName = "Размер";

        suggestions.push({
          productId: candidate.id,
          product: {
            id: candidate.id,
            name: candidate.name,
            sku: candidate.sku,
            imageUrl: candidate.imageUrl,
            salePrice: candidate.salePrices[0]?.price ?? null,
            categoryId: candidate.categoryId,
          },
          confidence,
          matchType: "name",
          matchDetails: {
            nameSimilarity: Math.round(similarity * 100),
          },
          suggestedGroupName,
        });
      }
    }
  }

  return suggestions;
}

/**
 * Match products by category and characteristics
 */
async function matchByCharacteristics(
  sourceProduct: ProductForMatching,
  candidates: ProductForMatching[]
): Promise<VariantSuggestion[]> {
  const suggestions: VariantSuggestion[] = [];

  if (!sourceProduct.categoryId || sourceProduct.customFields.length === 0) {
    return suggestions;
  }

  // Build source field map
  const sourceFields = new Map(
    sourceProduct.customFields.map((cf) => [cf.definitionId, { value: cf.value, name: cf.definition.name }])
  );

  for (const candidate of candidates) {
    if (candidate.id === sourceProduct.id) continue;
    if (candidate.categoryId !== sourceProduct.categoryId) continue;
    if (candidate.customFields.length === 0) continue;

    const matchingFields: string[] = [];
    const differentFields: string[] = [];

    for (const cf of candidate.customFields) {
      const sourceField = sourceFields.get(cf.definitionId);
      if (sourceField) {
        if (sourceField.value === cf.value) {
          matchingFields.push(sourceField.name);
        } else {
          differentFields.push(sourceField.name);
        }
      }
    }

    // Need at least 2 matching fields and 1 different field
    if (matchingFields.length >= 2 && differentFields.length >= 1) {
      const baseScore = 40 + matchingFields.length * 5; // 40-60 based on matching fields
      const confidence = calculateConfidence(baseScore, sourceProduct, candidate);

      suggestions.push({
        productId: candidate.id,
        product: {
          id: candidate.id,
          name: candidate.name,
          sku: candidate.sku,
          imageUrl: candidate.imageUrl,
          salePrice: candidate.salePrices[0]?.price ?? null,
          categoryId: candidate.categoryId,
        },
        confidence,
        matchType: "characteristics",
        matchDetails: {
          matchingFields,
          differentFields,
        },
        suggestedGroupName: differentFields[0] || "Вариант",
      });
    }
  }

  return suggestions;
}

/**
 * Detect group name based on SKU suffixes
 */
function detectGroupName(suffix1: string, suffix2: string): string {
  const colorSuffixes = ["BLK", "WHT", "RED", "BLU", "GRN", "YLW", "GRY", "PNK", "ORG", "PRP", "BRN"];
  const sizeSuffixes = ["XS", "S", "M", "L", "XL", "XXL", "XXXL"];

  const isColor = colorSuffixes.some(
    (c) => suffix1.toUpperCase().includes(c) || suffix2.toUpperCase().includes(c)
  );
  const isSize = sizeSuffixes.some(
    (s) => suffix1.toUpperCase() === s || suffix2.toUpperCase() === s
  );

  if (isColor) return "Цвет";
  if (isSize) return "Размер";
  return "Вариант";
}

/**
 * Main function: Find variant suggestions for a product
 */
export async function findVariantSuggestions(
  productId: string,
  options: {
    strategy?: "all" | "sku" | "name" | "characteristics";
    minConfidence?: number;
    limit?: number;
  } = {}
): Promise<VariantSuggestion[]> {
  const { strategy = "all", minConfidence = 50, limit = 20 } = options;

  // Fetch source product with details
  const sourceProduct = await db.product.findUnique({
    where: { id: productId },
    include: {
      salePrices: {
        where: { isActive: true, priceListId: null },
        orderBy: { validFrom: "desc" },
        take: 1,
        select: { price: true },
      },
      customFields: {
        include: { definition: { select: { name: true } } },
      },
    },
  });

  if (!sourceProduct) {
    return [];
  }

  // Fetch candidate products (same category or similar SKU pattern)
  const candidates = await db.product.findMany({
    where: {
      id: { not: productId },
      isActive: true,
      masterProductId: null, // Don't suggest products that are already variants
      OR: [
        { categoryId: sourceProduct.categoryId },
        ...(sourceProduct.sku
          ? [{ sku: { startsWith: sourceProduct.sku.split("-").slice(0, -1).join("-") } }]
          : []),
      ],
    },
    include: {
      salePrices: {
        where: { isActive: true, priceListId: null },
        orderBy: { validFrom: "desc" },
        take: 1,
        select: { price: true },
      },
      customFields: {
        include: { definition: { select: { name: true } } },
      },
    },
    take: 100, // Limit candidates for performance
  });

  const suggestions: VariantSuggestion[] = [];

  // Run matching strategies
  if (strategy === "all" || strategy === "sku") {
    const skuMatches = await matchBySku(sourceProduct, candidates);
    suggestions.push(...skuMatches);
  }

  if (strategy === "all" || strategy === "name") {
    const nameMatches = await matchByName(sourceProduct, candidates);
    suggestions.push(...nameMatches);
  }

  if (strategy === "all" || strategy === "characteristics") {
    const charMatches = await matchByCharacteristics(sourceProduct, candidates);
    suggestions.push(...charMatches);
  }

  // Remove duplicates (same product matched by multiple strategies)
  const uniqueSuggestions = new Map<string, VariantSuggestion>();
  for (const s of suggestions) {
    const existing = uniqueSuggestions.get(s.productId);
    if (!existing || existing.confidence < s.confidence) {
      uniqueSuggestions.set(s.productId, s);
    }
  }

  // Filter by confidence and sort
  return Array.from(uniqueSuggestions.values())
    .filter((s) => s.confidence >= minConfidence)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, limit);
}

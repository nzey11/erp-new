-- Migration: Add StorePage model
-- Description: CMS pages for the store (about, delivery, FAQ, etc.)

-- Step 1: Create StorePage table
CREATE TABLE "StorePage" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "seoTitle" TEXT,
  "seoDescription" TEXT,
  "isPublished" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "showInFooter" BOOLEAN NOT NULL DEFAULT true,
  "showInHeader" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StorePage_pkey" PRIMARY KEY ("id")
);

-- Step 2: Create unique index on slug
CREATE UNIQUE INDEX "StorePage_slug_key" ON "StorePage"("slug");

-- Step 3: Create composite index for published pages ordering
CREATE INDEX "StorePage_isPublished_sortOrder_idx" ON "StorePage"("isPublished", "sortOrder");

-- Step 4: Create index on slug for fast lookups
CREATE INDEX "StorePage_slug_idx" ON "StorePage"("slug");

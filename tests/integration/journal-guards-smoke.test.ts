/**
 * Block 3 Safety Patch — Smoke Tests
 *
 * Verifies the critical guard behaviors before release:
 * 1. Regular manual entry reverse → success
 * 2. Restricted manual entry reverse without permission → 403
 * 3. Auto-entry reverse → 400 with redirect message
 * 4. Restricted manual entry reverse with permission → success
 *
 * Run: npm run test:integration -- tests/integration/journal-guards-smoke.test.ts
 */

import { describe, it, expect, beforeAll } from "vitest";
import { db } from "@/lib/shared/db";
import {
  createJournalEntry,
  reverseEntry,
  autoPostDocument,
  CannotReverseAutoEntryError,
  RestrictedAccountPermissionError,
} from "@/lib/modules/accounting/finance/journal";
import {
  createDocument,
  createDocumentItem,
  createProduct,
  createWarehouse,
  seedTestAccounts,
  seedCompanySettings,
} from "../helpers/factories";

let accountIds: Record<string, string>;

describe("Block 3 Safety Patch — Smoke Tests", () => {
  beforeAll(async () => {
    accountIds = await seedTestAccounts();
    await seedCompanySettings(accountIds);
  });

  describe("Critical Guard Behaviors", () => {
    it("✅ reverse regular manual entry → success", async () => {
      const entry = await createJournalEntry(
        { lines: [{ debitAccountCode: "50", creditAccountCode: "91.1", amount: 1000 }], isManual: true }
      );

      const reversal = await reverseEntry(entry.id);

      expect(reversal).toBeDefined();
      expect(reversal.reversedById).toBe(entry.id);
      expect(reversal.lines).toHaveLength(2);
    });

    it("🚫 reverse restricted manual entry without permission → RestrictedAccountPermissionError", async () => {
      const entry = await createJournalEntry(
        { lines: [{ debitAccountCode: "60", creditAccountCode: "91.1", amount: 1000 }], isManual: true },
        { allowRestrictedAccounts: true }
      );

      await expect(reverseEntry(entry.id)).rejects.toThrow(RestrictedAccountPermissionError);
    });

    it("🚫 reverse auto-entry → CannotReverseAutoEntryError with redirect message", async () => {
      // Create auto-entry via document posting
      const warehouse = await createWarehouse();
      const product = await createProduct();
      const doc = await createDocument({
        type: "incoming_shipment",
        status: "confirmed",
        warehouseId: warehouse.id,
        totalAmount: 5000,
      });
      await createDocumentItem(doc.id, product.id, { quantity: 10, price: 500 });
      await autoPostDocument(doc.id, doc.number, doc.date);

      const entry = await db.journalEntry.findFirst({
        where: { sourceId: doc.id, isManual: false },
      });

      expect(entry).not.toBeNull();

      try {
        await reverseEntry(entry!.id);
        // Should not reach here
        expect.fail("Expected CannotReverseAutoEntryError");
      } catch (error) {
        expect(error).toBeInstanceOf(CannotReverseAutoEntryError);
        const e = error as CannotReverseAutoEntryError;
        expect(e.message).toContain("автоматически");
        expect(e.message).toContain("документа");
        expect(e.sourceType).toBe("incoming_shipment");
        expect(e.sourceId).toBe(doc.id);
      }
    });

    it("✅ reverse restricted manual entry with permission → success", async () => {
      const entry = await createJournalEntry(
        { lines: [{ debitAccountCode: "62", creditAccountCode: "90.1", amount: 2000 }], isManual: true },
        { allowRestrictedAccounts: true }
      );

      const reversal = await reverseEntry(entry.id, { allowRestrictedAccounts: true });

      expect(reversal).toBeDefined();
      expect(reversal.reversedById).toBe(entry.id);
    });
  });

  describe("Error Order Verification", () => {
    it("auto-entry check runs BEFORE restricted accounts check", async () => {
      // Create auto-entry with restricted account (60)
      const warehouse = await createWarehouse();
      const product = await createProduct();
      const doc = await createDocument({
        type: "incoming_shipment",
        status: "confirmed",
        warehouseId: warehouse.id,
        totalAmount: 5000,
      });
      await createDocumentItem(doc.id, product.id, { quantity: 10, price: 500 });
      await autoPostDocument(doc.id, doc.number, doc.date);

      const entry = await db.journalEntry.findFirst({
        where: { sourceId: doc.id, isManual: false },
        include: { lines: { include: { account: true } } },
      });

      // Even if entry has 60* accounts, should throw CannotReverseAutoEntryError (not RestrictedAccountPermissionError)
      await expect(reverseEntry(entry!.id)).rejects.toThrow(CannotReverseAutoEntryError);
    });
  });
});

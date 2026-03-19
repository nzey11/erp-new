import { describe, it, expect, beforeEach } from "vitest";
import {
  seedTestAccounts,
  seedTenantSettings,
  createDocument,
  createDocumentItem,
  createCounterparty,
  createWarehouse,
  createProduct,
  createTenant,
} from "../../helpers/factories";
import { getTestDb } from "../../helpers/test-db";
import { buildPostingLines, resolvePostingAccounts } from "@/lib/modules/accounting/finance/posting-rules";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Seed chart of accounts + tenant settings for a given tax regime */
async function seedAccounting(taxRegime: "usn_income" | "osno" = "usn_income") {
  const accountIds = await seedTestAccounts();
  // Create a test tenant and seed TenantSettings with the requested tax regime
  const tenant = await createTenant({ id: `test-tax-${taxRegime}` });
  const settings = await seedTenantSettings(tenant.id, accountIds, { taxRegime });
  return { accountIds, settings, tenantId: tenant.id };
}

// ─────────────────────────────────────────────────────────────────────────────
// Suite 1: buildPostingLines — USN (simplified tax regime, no VAT)
// ─────────────────────────────────────────────────────────────────────────────

describe("buildPostingLines — USN (no VAT)", () => {
  let taxCtx: Awaited<ReturnType<typeof seedAccounting>>;

  beforeEach(async () => {
    taxCtx = await seedAccounting("usn_income");
  });

  it("incoming_shipment → single line Дт 41.1 Кт 60 (full amount, no VAT split)", async () => {
    const doc = await createDocument({ type: "incoming_shipment", totalAmount: 1200, tenantId: taxCtx.tenantId });

    const lines = await buildPostingLines(doc.id);

    expect(lines).not.toBeNull();
    expect(lines).toHaveLength(1);
    expect(lines![0].debitCode).toBe("41.1");
    expect(lines![0].creditCode).toBe("60");
    expect(lines![0].amount).toBeCloseTo(1200, 2);
  });

  it("outgoing_shipment → Дт 62 Кт 90.1 (revenue) + Дт 90.2 Кт 41.1 (COGS = 0 when no avg cost)", async () => {
    const doc = await createDocument({ type: "outgoing_shipment", totalAmount: 5000, tenantId: taxCtx.tenantId });
    const product = await createProduct({ tenantId: taxCtx.tenantId });
    await createDocumentItem(doc.id, product.id, { quantity: 5, price: 1000 });

    const lines = await buildPostingLines(doc.id);

    expect(lines).not.toBeNull();
    // Revenue line always present; COGS line with amount=0 is filtered out
    const revLine = lines!.find((l) => l.debitCode === "62" && l.creditCode === "90.1");
    expect(revLine).toBeDefined();
    expect(revLine!.amount).toBeCloseTo(5000, 2);
    // COGS with amount=0 should be filtered by the "l.amount > 0" guard
    const cogsLine = lines!.find((l) => l.debitCode === "90.2");
    expect(cogsLine).toBeUndefined();
  });

  it("incoming_payment → Дт 51 Кт 62", async () => {
    const doc = await createDocument({ type: "incoming_payment", totalAmount: 3000, tenantId: taxCtx.tenantId });

    const lines = await buildPostingLines(doc.id);

    expect(lines).toHaveLength(1);
    expect(lines![0].debitCode).toBe("51");
    expect(lines![0].creditCode).toBe("62");
    expect(lines![0].amount).toBeCloseTo(3000, 2);
  });

  it("outgoing_payment → Дт 60 Кт 51", async () => {
    const doc = await createDocument({ type: "outgoing_payment", totalAmount: 2500, tenantId: taxCtx.tenantId });

    const lines = await buildPostingLines(doc.id);

    expect(lines).toHaveLength(1);
    expect(lines![0].debitCode).toBe("60");
    expect(lines![0].creditCode).toBe("51");
    expect(lines![0].amount).toBeCloseTo(2500, 2);
  });

  it("customer_return → Дт 41.1 Кт 62", async () => {
    const doc = await createDocument({ type: "customer_return", totalAmount: 800, tenantId: taxCtx.tenantId });

    const lines = await buildPostingLines(doc.id);

    expect(lines).toHaveLength(1);
    expect(lines![0].debitCode).toBe("41.1");
    expect(lines![0].creditCode).toBe("62");
    expect(lines![0].amount).toBeCloseTo(800, 2);
  });

  it("supplier_return → Дт 60 Кт 41.1", async () => {
    const doc = await createDocument({ type: "supplier_return", totalAmount: 600, tenantId: taxCtx.tenantId });

    const lines = await buildPostingLines(doc.id);

    expect(lines).toHaveLength(1);
    expect(lines![0].debitCode).toBe("60");
    expect(lines![0].creditCode).toBe("41.1");
  });

  it("stock_receipt → Дт 41.1 Кт 91.1 (surplus posting)", async () => {
    const doc = await createDocument({ type: "stock_receipt", totalAmount: 400, tenantId: taxCtx.tenantId });

    const lines = await buildPostingLines(doc.id);

    expect(lines).toHaveLength(1);
    expect(lines![0].debitCode).toBe("41.1");
    expect(lines![0].creditCode).toBe("91.1");
    expect(lines![0].amount).toBeCloseTo(400, 2);
  });

  it("write_off → Дт 94 Кт 41.1 (shortage posting)", async () => {
    const doc = await createDocument({ type: "write_off", totalAmount: 300, tenantId: taxCtx.tenantId });

    const lines = await buildPostingLines(doc.id);

    expect(lines).toHaveLength(1);
    expect(lines![0].debitCode).toBe("94");
    expect(lines![0].creditCode).toBe("41.1");
    expect(lines![0].amount).toBeCloseTo(300, 2);
  });

  it("inventory_count → returns null (no posting at confirm stage)", async () => {
    const doc = await createDocument({ type: "inventory_count", totalAmount: 0, tenantId: taxCtx.tenantId });

    const lines = await buildPostingLines(doc.id);

    expect(lines).toBeNull();
  });

  it("purchase_order → returns null (no posting at draft stage)", async () => {
    const doc = await createDocument({ type: "purchase_order", totalAmount: 0, tenantId: taxCtx.tenantId });

    const lines = await buildPostingLines(doc.id);

    expect(lines).toBeNull();
  });

  it("sales_order → returns null", async () => {
    const doc = await createDocument({ type: "sales_order", totalAmount: 0, tenantId: taxCtx.tenantId });

    const lines = await buildPostingLines(doc.id);

    expect(lines).toBeNull();
  });

  it("zero-amount lines are filtered out", async () => {
    // A doc with totalAmount = 0 → amount = 0 → filtered
    const doc = await createDocument({ type: "write_off", totalAmount: 0, tenantId: taxCtx.tenantId });

    const lines = await buildPostingLines(doc.id);

    // Returns empty array (after filter), not null
    expect(lines).not.toBeNull();
    expect(lines).toHaveLength(0);
  });

  it("throws if document not found", async () => {
    await expect(buildPostingLines("non-existent-id")).rejects.toThrow("not found");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 2: buildPostingLines — ОСНО (standard VAT regime)
// ─────────────────────────────────────────────────────────────────────────────

describe("buildPostingLines — ОСНО (with VAT 20%)", () => {
  let taxCtx: Awaited<ReturnType<typeof seedAccounting>>;

  beforeEach(async () => {
    taxCtx = await seedAccounting("osno");
  });

  it("incoming_shipment → splits into Дт 41.1 Кт 60 (ex-VAT) + Дт 19 Кт 60 (VAT)", async () => {
    // totalAmount = 1200 includes 20% VAT: net = 1000, VAT = 200
    const doc = await createDocument({ type: "incoming_shipment", totalAmount: 1200, tenantId: taxCtx.tenantId });

    const lines = await buildPostingLines(doc.id);

    expect(lines).toHaveLength(2);

    const goodsLine = lines!.find((l) => l.debitCode === "41.1");
    expect(goodsLine).toBeDefined();
    expect(goodsLine!.creditCode).toBe("60");
    expect(goodsLine!.amount).toBeCloseTo(1000, 1); // 1200 / 1.2

    const vatLine = lines!.find((l) => l.debitCode === "19");
    expect(vatLine).toBeDefined();
    expect(vatLine!.creditCode).toBe("60");
    expect(vatLine!.amount).toBeCloseTo(200, 1); // 1200 - 1000
  });

  it("outgoing_shipment → revenue + COGS + VAT line Дт 90.3 Кт 68.02", async () => {
    const doc = await createDocument({ type: "outgoing_shipment", totalAmount: 1200, tenantId: taxCtx.tenantId });
    const product = await createProduct({ tenantId: taxCtx.tenantId });
    await createDocumentItem(doc.id, product.id, { quantity: 1, price: 1200 });

    const lines = await buildPostingLines(doc.id);

    // Revenue (full amount incl. VAT)
    const revLine = lines!.find((l) => l.debitCode === "62" && l.creditCode === "90.1");
    expect(revLine).toBeDefined();
    expect(revLine!.amount).toBeCloseTo(1200, 2);

    // VAT line present on ОСНО
    const vatLine = lines!.find((l) => l.debitCode === "90.3" && l.creditCode === "68.02");
    expect(vatLine).toBeDefined();
    expect(vatLine!.amount).toBeCloseTo(200, 1); // 1200 - 1200/1.2
  });

  it("incoming_payment — no VAT line even on ОСНО (payments don't split)", async () => {
    const doc = await createDocument({ type: "incoming_payment", totalAmount: 5000, tenantId: taxCtx.tenantId });

    const lines = await buildPostingLines(doc.id);

    expect(lines).toHaveLength(1);
    expect(lines![0].debitCode).toBe("51");
    expect(lines![0].creditCode).toBe("62");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suite 3: resolvePostingAccounts — account code → DB ID resolution
// ─────────────────────────────────────────────────────────────────────────────

describe("resolvePostingAccounts", () => {
  beforeEach(async () => {
    await seedAccounting("usn_income");
  });

  it("resolves account codes to DB IDs", async () => {
    const db = getTestDb();
    const acc41 = await db.account.findUnique({ where: { code: "41.1" } });
    const acc60 = await db.account.findUnique({ where: { code: "60" } });

    const resolved = await resolvePostingAccounts([
      { debitCode: "41.1", creditCode: "60", amount: 500 },
    ]);

    expect(resolved).toHaveLength(1);
    expect(resolved[0].debitAccountId).toBe(acc41!.id);
    expect(resolved[0].creditAccountId).toBe(acc60!.id);
    expect(resolved[0].amount).toBe(500);
  });

  it("passes through optional fields (counterpartyId, warehouseId, description)", async () => {
    const counterparty = await createCounterparty();
    const warehouse = await createWarehouse();

    const resolved = await resolvePostingAccounts([
      {
        debitCode: "62",
        creditCode: "90.1",
        amount: 1000,
        counterpartyId: counterparty.id,
        warehouseId: warehouse.id,
        description: "Test posting",
      },
    ]);

    expect(resolved[0].counterpartyId).toBe(counterparty.id);
    expect(resolved[0].warehouseId).toBe(warehouse.id);
    expect(resolved[0].description).toBe("Test posting");
  });

  it("throws if account code does not exist in chart of accounts", async () => {
    await expect(
      resolvePostingAccounts([{ debitCode: "99.99", creditCode: "60", amount: 100 }])
    ).rejects.toThrow("Account 99.99 not found");
  });
});

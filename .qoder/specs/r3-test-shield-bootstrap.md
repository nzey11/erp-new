# R3 — Tenant Test Shield Bootstrap

**Document Status:** ACTIVE — EXECUTION START  
**Phase:** R3 — Tenant Test Shield  
**Governed By:** `.qoder/specs/erp-recovery-roadmap.md`, `.qoder/specs/erp-recovery-execution-plan.md`  
**Prerequisites:** R1 (Tenant Isolation Lockdown) ✅, R2 (Migration Governance Recovery) ✅  

---

## 1. Objective

Create the minimum automated test shield required to protect the tenant isolation architecture established in R1 and the migration governance established in R2.

R3 ensures that:
- Cross-tenant access attempts are explicitly denied (404 semantics)
- Tenant-scoped queries return only owned resources
- Migration gate scripts run automatically and block on failure
- The CI pipeline enforces tenant data integrity

This is not a comprehensive test refactor. It is a targeted, defensive test layer for the Recovery Program's core guarantees.

---

## 2. Why R3 Exists

### Recovery Baseline Context

R1 established tenant isolation at the handler and service level:
- Products, Documents, Counterparties all enforce `tenantId` predicates
- `confirmDocumentTransactional()` and `cancelDocumentTransactional()` require `tenantId`
- Foreign-tenant access returns 404 (not 403) to prevent information leakage

R2 established migration governance:
- 12 historical migrations baselined in `_prisma_migrations`
- 2 provenance migrations documenting `Product.tenantId` and `Document.tenantId`
- Verification gates (`verify-*-tenant-gate.ts`) confirming data integrity

### The Gap

Without R3, the tenant isolation guarantees are:
- **Unverified** — no automated proof that cross-tenant denial works
- **Unprotected** — future code changes could break isolation undetected
- **Unenforced** — migration gates run manually, not in CI

R3 closes this gap with the minimum test coverage required to detect regressions.

---

## 3. Inputs from Previous Phases

### From R1 (Tenant Isolation Lockdown)

| Module | Isolation Mechanism | Test Target |
|--------|---------------------|-------------|
| Products | `findFirst({ where: { id, tenantId } })` in GET/PUT/DELETE; `where: { tenantId }` in list | Cross-tenant access denial, list filtering |
| Documents | `findFirst({ where: { id, tenantId } })` in GET/PUT/DELETE; `where: { tenantId }` in list | Cross-tenant access denial, list filtering |
| Counterparties | `findFirst({ where: { id, tenantId } })` in GET/PUT/DELETE; `where: { tenantId }` in list | Cross-tenant access denial, list filtering |
| Document Confirm | `confirmDocumentTransactional(id, actor, tenantId)` | Service-level tenant enforcement |
| Document Cancel | `cancelDocumentTransactional(id, actor, tenantId)` | Service-level tenant enforcement |

### From R2 (Migration Governance Recovery)

| Asset | Location | Purpose |
|-------|----------|---------|
| Product tenant gate | `scripts/verify-product-tenant-gate.ts` | Verify no NULL `tenantId`, no SKU conflicts |
| Document tenant gate | `scripts/verify-document-tenant-gate.ts` | Verify no NULL `tenantId`, warehouse alignment |
| Counterparty tenant gate | `scripts/verify-counterparty-tenant-gate.ts` | Verify no NULL `tenantId`, FK integrity |
| Migration baseline | `_prisma_migrations` (12 rows) | Historical migration authority |
| Provenance migrations | `20260315_add_*_tenantId_provenance` | Documentation-only migrations (pending) |

---

## 4. R3 Task Inventory

### R3-01 — Products Tenant Isolation Tests

**Goal:** Verify that product handlers enforce tenant isolation correctly.

**Target Files:**
- `tests/integration/api/products.test.ts` (extend existing)

**Test Scenarios:**
1. `GET /api/accounting/products` returns only products from authenticated tenant
2. `GET /api/accounting/products/[id]` returns 404 for foreign-tenant product
3. `PUT /api/accounting/products/[id]` returns 404 for foreign-tenant product
4. `DELETE /api/accounting/products/[id]` returns 404 for foreign-tenant product

**Dependencies:**
- R1-01 through R1-04 (Product handlers have tenant isolation)
- Factory alignment: `createProduct()` must accept explicit `tenantId`

**Expected Output:**
- 4+ new test cases
- All tests use explicit two-tenant setup
- Cross-tenant requests verify 404 response
- Integration test suite passes

---

### R3-02 — Documents Tenant Isolation Tests

**Goal:** Verify that document handlers enforce tenant isolation correctly.

**Target Files:**
- `tests/integration/api/documents.test.ts` (extend existing)

**Test Scenarios:**
1. `GET /api/accounting/documents` returns only documents from authenticated tenant
2. `GET /api/accounting/documents/[id]` returns 404 for foreign-tenant document
3. `PUT /api/accounting/documents/[id]` returns 404 for foreign-tenant document
4. `DELETE /api/accounting/documents/[id]` returns 404 for foreign-tenant document
5. `POST /api/accounting/documents/[id]/confirm` returns 404 for foreign-tenant document
6. `POST /api/accounting/documents/[id]/cancel` returns 404 for foreign-tenant document

**Dependencies:**
- R1-05 through R1-10 (Document handlers and services have tenant isolation)
- Factory alignment: `createDocument()` must accept explicit `tenantId`

**Expected Output:**
- 6+ new test cases
- All tests use explicit two-tenant setup
- Cross-tenant requests verify 404 response
- Integration test suite passes

---

### R3-03 — Counterparties Tenant Isolation Tests

**Goal:** Verify that counterparty handlers enforce tenant isolation correctly.

**Target Files:**
- Create `tests/integration/api/counterparties.test.ts` (new file)

**Test Scenarios:**
1. `GET /api/accounting/counterparties` returns only counterparties from authenticated tenant
2. `GET /api/accounting/counterparties/[id]` returns 404 for foreign-tenant counterparty
3. `PUT /api/accounting/counterparties/[id]` returns 404 for foreign-tenant counterparty
4. `DELETE /api/accounting/counterparties/[id]` returns 404 for foreign-tenant counterparty

**Dependencies:**
- R1-11, R1-12 (Counterparty handlers have tenant isolation)
- Factory: `createCounterparty()` must accept explicit `tenantId`

**Expected Output:**
- New test file with 4+ test cases
- All tests use explicit two-tenant setup
- Cross-tenant requests verify 404 response
- Integration test suite passes

---

### R3-04 — Migration Gate Automated Tests

**Goal:** Convert manual gate scripts into automated tests that run in the test suite.

**Target Files:**
- Create `tests/integration/gates/tenant-gates.test.ts` (new file)

**Test Scenarios:**
1. **Product Gate — Pass State:**
   - All products have non-NULL `tenantId`
   - No SKU conflicts across tenants
   - Gate returns exit 0 equivalent

2. **Product Gate — Fail State (simulated):**
   - Create product with NULL `tenantId` (direct DB insert)
   - Gate detects violation
   - Gate returns non-zero / failure indication

3. **Document Gate — Pass State:**
   - All documents have non-NULL `tenantId`
   - All documents match their warehouse tenant
   - Gate returns exit 0 equivalent

4. **Document Gate — Fail State (simulated):**
   - Create document with warehouse tenant mismatch
   - Gate detects violation
   - Gate returns non-zero / failure indication

5. **Counterparty Gate — Pass State:**
   - All counterparties have non-NULL `tenantId`
   - All `tenantId` values reference valid Tenant rows
   - Gate returns exit 0 equivalent

6. **Counterparty Gate — Fail State (simulated):**
   - Create counterparty with NULL `tenantId`
   - Gate detects violation
   - Gate returns non-zero / failure indication

**Dependencies:**
- R2-05 (Gate scripts exist and pass manually)
- Direct DB access for failure-case setup
- Proper test isolation and cleanup

**Expected Output:**
- New test file with 6 test scenarios
- Both pass and fail states verified
- Tests clean up after failure-case inserts
- Integration test suite passes

---

### R3-05 — CI Verification Integration

**Goal:** Ensure migration gates run automatically in CI and block on failure.

**Target Files:**
- `.github/workflows/ci.yml` (or equivalent CI config)

**Integration Points:**
1. Add gate script execution to CI workflow
2. Ensure gate failure fails the build
3. Run gates after integration tests (to verify DB state)

**CI Step Example:**
```yaml
- name: Verify Tenant Data Integrity
  run: |
    npx tsx scripts/verify-product-tenant-gate.ts
    npx tsx scripts/verify-document-tenant-gate.ts
    npx tsx scripts/verify-counterparty-tenant-gate.ts
```

**Dependencies:**
- R3-04 (Gate tests confirm gate logic is correct)
- CI configuration access

**Expected Output:**
- CI workflow updated with gate verification step
- Gate failures block merge/deploy
- Documentation of CI integration in bootstrap

---

## 5. Proposed Execution Order

| Order | Task | Rationale |
|-------|------|-----------|
| 1 | R3-01 Products tests | Smallest test surface; existing test file; validate pattern |
| 2 | R3-02 Documents tests | Builds on product pattern; more scenarios (confirm/cancel) |
| 3 | R3-03 Counterparties tests | New test file; completes handler coverage |
| 4 | R3-04 Gate automated tests | Requires stable DB state from previous tests; complex setup |
| 5 | R3-05 CI integration | Final step; only after all gate logic verified |

**Why this order:**
- Handler tests (R3-01/02/03) validate the isolation mechanisms directly
- Gate tests (R3-04) validate data integrity checks; require careful DB manipulation
- CI integration (R3-05) is the final enforcement layer; must be correct before activation

---

## 6. Test Design Principles

### Two-Tenant Minimum
Every cross-tenant test must explicitly create and use at least two distinct tenants:
```typescript
const tenantA = `tenant-${userA.id}`;
const tenantB = `tenant-${userB.id}`;
```

### Cross-Tenant Denial Must Be Explicit
Tests must verify that foreign-tenant access returns 404, not 403 or 200:
```typescript
expect(response.status).toBe(404);
expect(response.body.error).toContain("не найден"); // or equivalent
```

### No Random Tenant Defaults
Do not rely on factory auto-created tenants. Always pass explicit `tenantId`:
```typescript
// Good
const product = await createProduct({ name: "Test", tenantId: tenantA });

// Bad (may create random tenant)
const product = await createProduct({ name: "Test" });
```

### Mock Alignment
Ensure `mockAuthUser()` includes correct `tenantId`:
```typescript
mockAuthUser({ ...userA, tenantId: `tenant-${userA.id}` });
```

### Gate Tests Verify Both States
Each gate must have:
- Pass test: clean state → gate passes
- Fail test: inject violation → gate fails → cleanup

### Test Isolation
Gate failure-case tests must clean up injected violations:
```typescript
afterEach(async () => {
  // Remove test data that violates constraints
  await db.product.deleteMany({ where: { tenantId: null } });
});
```

---

## 7. Risks / Cautions

### Factory Auto-Created Tenants
**Risk:** Factories may auto-create warehouses/counterparties with random tenants, causing tenant mismatch.
**Mitigation:** Always pass explicit `tenantId` to factories; verify factory behavior before writing tests.

### Route Auth Mock Defaults
**Risk:** `mockAuthUser(user)` without `tenantId` may default to `"test-tenant"`, causing 404s on valid requests.
**Mitigation:** Always spread full user object with explicit `tenantId`.

### Gate Test DB Cleanup
**Risk:** Gate failure-case tests insert invalid data that may break subsequent tests.
**Mitigation:** Use `afterEach` or `finally` blocks to clean up; run gate tests in isolated transaction if possible.

### Warehouse-Document Tenant Alignment
**Risk:** Document tests require warehouses with matching tenants; factory defaults may mismatch.
**Mitigation:** Create warehouse explicitly with correct `tenantId`, then create document with that `warehouseId`.

### Confirm/Cancel Service Tests
**Risk:** Document confirm/cancel tests require confirmed document state; may conflict with existing tests.
**Mitigation:** Use unique document numbers; clean up confirmed documents in `afterEach`.

---

## 8. Definition of Done for R3

R3 is complete when ALL of the following are true:

1. **Handler Tests**
   - [ ] R3-01: Products tenant isolation tests exist and pass
   - [ ] R3-02: Documents tenant isolation tests exist and pass
   - [ ] R3-03: Counterparties tenant isolation tests exist and pass

2. **Gate Tests**
   - [ ] R3-04: All three gate scripts have automated pass/fail tests
   - [ ] Gate tests verify both success and failure states
   - [ ] Gate tests properly clean up after failure-case inserts

3. **CI Integration**
   - [ ] R3-05: CI workflow runs gate scripts automatically
   - [ ] Gate failure blocks CI pipeline
   - [ ] CI integration documented

4. **Quality Gates**
   - [ ] `npm run test:integration` passes (all existing + new tests)
   - [ ] No test relies on random tenant factory defaults
   - [ ] All cross-tenant tests verify 404 semantics explicitly

5. **Documentation**
   - [ ] R3 execution is documented in phase tracking
   - [ ] Any test infrastructure changes are noted

---

## 9. Immediate Next Step

**Execute R3-01: Products Tenant Isolation Tests**

### Action
Extend `tests/integration/api/products.test.ts` with cross-tenant isolation tests.

### Starting Point
1. Review existing product tests to understand current patterns
2. Identify where `mockAuthUser()` is called without explicit `tenantId`
3. Add explicit `tenantId` to existing tests if needed
4. Create new test block: "tenant isolation"
5. Implement 4 test scenarios from R3-01

### Success Criteria
- New tests fail if R1 product isolation is reverted
- New tests pass with current R1 implementation
- `npm run test:integration` passes

---

*End of R3 Test Shield Bootstrap*

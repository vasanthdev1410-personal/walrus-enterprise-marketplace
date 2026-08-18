# WALRUS Enterprise Marketplace Platform

## Module 05 — Inventory Management Implementation Plan

**Document ID:** WEMP-M05-PLAN-001
**Version:** Review Draft 1.0
**Status:** APPROVED (M05-M1 … M05-M4) — signed by the Product/Architecture
Owner 2026-08-15. Per WEMP-M05-APPROVAL-001 §4, gates M05-M1 … M05-M4 are
✓ **SATISFIED** (external conditions 1–4 **RECORDED 2026-08-15** per
WEMP-M05-APPROVAL-001 §3/§6); **M05-M5 is NOT authorized** and remains gated
per WEMP-M05-APPROVAL-001 §4 (conditions recorded, gate not marked
SATISFIED).
**Effective date:** 2026-08-15 (M05-M1 authorized now; M05-M2 … M05-M4
authorized as their gates in WEMP-M05-APPROVAL-001 §4 were satisfied;
M05-M5 only when its §4 gate carries the SATISFIED verdict)
**Classification:** Confidential — Internal Use Only

> Companion to WEMP-M05-SPEC-001, WEMP-M05-AUTHZ-001, and
> WEMP-M05-DECISIONS-001. Milestone IDs below are proposed working
> identifiers (M05-M1 … M05-M5) and become formal only upon approval of this
> plan. No milestone authorizes implementation before the Module 05
> specification, its owner decisions, and the required external sign-offs are
> approved.

Milestone dependency rule: each milestone validates with the repository gate
(jest + coverage thresholds, lint, typecheck, Prisma validate, builds) and is
locally committed before the next milestone begins. No milestone touches
Module 00/01/02/03/04 production behavior except M05-M4, which is an
explicitly approved additive Module 02 change. Owner decisions D-01…D-18 gate
their milestones per WEMP-M05-DECISIONS-001 §2.

---

## Milestone M05-M1 — Inventory Domain Foundation

- **Scope:** Pure domain layer for the inventory aggregate. No schema, no
  controllers, no DI, no API.
- **Deliverables:** Domain entities (`StockPool`, `InventoryMovementRecord`,
  `InventoryAuditRecord`); value objects (quantity, delta, movement type,
  availability outcome, derived stock labels); the stock-pool model with
  `onHand` + `reserved` and derived `available` (D-01/D-02); delta
  application with negative-availability denial (D-02); typed adjustment
  events `STOCK_IN`/`STOCK_OUT`/`ADJUSTMENT`/`COUNT_CORRECTION` (D-04);
  domain-level version-checked `reserve`/`release` (D-06); validation and
  quantity bounds incl. ≤ 1,000,000 unit bound, mandatory reason rules,
  reserve/release bounds (D-08); derived availability outcome + read-model
  low/out-of-stock labels from configured thresholds (D-03, D-14 — label
  enforcement fail-closed without valid config); no reconciliation workflow
  (D-18); domain ports for repositories and the Module 02/04 contracts.
- **Database changes:** none.
- **APIs:** none.
- **Tests:** domain unit tests for every delta path (allowed, denied on
  negative available, stale version, unknown/non-PUBLISHED SKU fail-closed),
  reserve/release bounds, lifecycle fail-closed, label derivation with and
  without config (fail closed).
- **Security acceptance:** deny on any missing/unknown/inconsistent state;
  pure and deterministic (mirrors M03-M1/M04-M1 standard).
- **Completion criteria:** domain cases covered by unit tests; no file
  outside `modules/inventory/domain` touched.
- **Owner decisions required before start:** D-01, D-02, D-03, D-04, D-06,
  D-08, D-18 (all OWNER-APPROVED 2026-08-14).

## Milestone M05-M2 — Inventory Persistence

- **Scope:** Additive Prisma schema for Module 05-owned tables, forward-only
  migrations, repository ports implemented over Prisma, mappers.
- **Deliverables:** Tables per WEMP-M05-SPEC-001 §14 (UUIDv7 PKs, snake_case
  maps, `aggregateVersion`, timestamps, append-only movement and audit
  records, unique/partial-unique indexes — one `StockPool` per SKU per seller
  scope); no Module 00/01/02/03/04 table modified; `skuId`/
  `sellerProfileId`/`actorIdentityId` as logical UUIDv7 references with
  **no cross-module FKs** (A-06).
- **Database changes:** new `2026xxxx_module_05_inventory` migration(s),
  additive only.
- **APIs:** none (repository-level only).
- **Tests:** mapper roundtrips; unique-constraint and partial-index behavior;
  append-only movement/audit immutability (D-09); version-stale conflict
  rejection; migration-safety tests on a clean database (established
  pattern).
- **Security acceptance:** no PII in plaintext columns; no monetary values
  stored (A-17); fail closed on missing repository or migration state;
  retention fail-closed per D-12 (no deletion without a valid configured
  duration — **Legal/Compliance durations RECORDED 2026-08-15**:
  InventoryMovementRecord 2555 days; InventoryAuditRecord 2555 days).
- **Completion criteria:** migrations apply cleanly to a fresh database;
  full API suite + coverage thresholds pass; no Module 00/01/02/03/04 file
  modified.
- **Owner decisions required before start:** D-01, D-02, D-07, D-09, D-12,
  D-15 (all OWNER-APPROVED 2026-08-14); **D-12 retention durations
  RECORDED 2026-08-15** (InventoryMovementRecord 2555 days;
  InventoryAuditRecord 2555 days) — M05-M2 authorized 2026-08-15; M05-M3
  enforcement enabled but M05-M3 itself still gated on Gate #4.

## Milestone M05-M3 — Inventory Application Services

- **Scope:** Application services orchestrating stock-pool operations with
  idempotency, concurrency, validation, and audit.
- **Deliverables:** seller adjustment flow (D-04); admin correction flow
  (D-04); domain-level `reserve`/`release` (D-06, port-only, no HTTP);
  single-transaction mutations with `aggregateVersion` + PostgreSQL
  `FOR UPDATE` row lock (D-07); validation incl. SKU reference integrity via
  the Module 04 `ProductCatalogReadPort` (D-08, D-10); derived availability
  and low/out-of-stock labels from configured thresholds (D-03, D-14);
  append-only movement/audit recording (D-09); pool lifecycle across SKU
  lifecycle (D-15); rate-limit port integration (D-11 — values pending
  Security/Platform confirmation — **recorded 2026-08-15**, fail-closed
  default A-13 until M05-M5 exposure); retention mechanism (D-12 —
  durations pending Legal/Compliance, fail closed).
- **Database changes:** none new (uses M2 tables).
- **APIs:** application-level commands/queries only (no controllers).
- **Tests:** lifecycle integration tests through the application layer;
  idempotent re-submission; optimistic-concurrency conflicts; row-lock
  behavior under concurrent mutations; cross-seller access denied; SKU
  reference integrity fail-closed (unknown/non-PUBLISHED SKU denied);
  retention fail-closed (no deletion without valid config).
- **Security acceptance:** every mutation version-checked and row-locked in
  a single transaction; every quantity change audited; no monetary values;
  fail closed on any inconsistency.
- **Completion criteria:** negative security tests (cross-seller, stale
  version, negative available, unknown SKU) all pass; no presentation layer
  added.
- **Owner decisions required before start:** D-03, D-04, D-06, D-07, D-08,
  D-09, D-12, D-14, D-15, D-16, D-17, D-18 (all OWNER-APPROVED 2026-08-14);
  **D-14 threshold values (LOW_STOCK_THRESHOLD=1; OUT_OF_STOCK_THRESHOLD=0)
  and D-12 retention durations (2555/2555 days) RECORDED 2026-08-15** —
  M05-M3 authorized 2026-08-15 (fail-closed config mechanism remains in
  force; no values invented or hard-coded).

## Milestone M05-M4 — Authorization & Cross-Module Integration

- **Scope:** The approved Module 02 additions and the third resource-
  ownership resolver; Module 03 seller-association gate wiring; Module 04
  SKU-fact wiring and the fail-closed inventory contract port implemented by
  Module 05. **This is the only milestone that changes Module 02, and only
  after explicit approval.**
- **Deliverables:** `inventory.*` permission identifiers and matrix rows per
  WEMP-M05-AUTHZ-001; ownership-resolver contract extension (third scope —
  inventory, seller-organization-scoped) consumed by the permission guard;
  seller-eligibility gate (approved/ACTIVE seller) at the inventory-operation
  boundary; `getAvailability(skuId)` implementation per D-10 (from Module
  05's own quantities, PUBLISHED-gated via `ProductCatalogReadPort`);
  fail-closed `InventoryReservationPort` (D-06); replacement of the Module 04
  fail-closed adapter by wiring the Module 05 implementation at the port
  boundary.
- **Database changes:** Module 02 catalogs are code-owned configuration
  (existing pattern); no new table unless the ownership resolver needs
  persisted scope, which requires a separate approved decision.
- **APIs:** none new; existing guard chain (AAL2 → permission guard) applies.
- **Tests:** authorization matrix tests (each `inventory.*` row grant/deny);
  ownership-scope tests (seller A denied seller B); seller-eligibility gating
  tests; fail-closed resolver tests; no-bypass tests (Super Admin without
  `inventory.adjust.admin` cannot correct); availability-port tests
  (PUBLISHED/unknown/`available ≤ 0`/error outcomes); reservation-port
  fail-closed tests.
- **Security acceptance:** deny-by-default and explicit-deny precedence
  preserved; no hidden bypass; administrative scope unchanged; Module 02
  audit records every decision; **no `inventory.*` grant effective until
  M05-M4 implements the Module 02 additions** (D-05/A-09; Module 02 owner
  sign-off recorded 2026-08-15).
- **Completion criteria:** matrix + resolver tests green; full suite +
  coverage pass; Module 02 owner sign-off **recorded 2026-08-15** ✓.
- **Owner decisions required before start:** D-05 (Module 02 owner sign-off
  — **recorded 2026-08-15**), D-10 (integration), D-06 (reservation port),
  D-08 (contract-port shape).

## Milestone M05-M5 — Seller & Admin APIs and Web/Mobile Integration

- **Scope:** Presentation controllers for seller self-service and admin
  surfaces, plus web and mobile UI integration per WEMP-M05-SPEC-001
  §15–§18.
- **Deliverables:** `/api/v1/seller/inventory/...` and
  `/api/v1/admin/inventory/...` controllers (including
  `/api/v1/admin/inventory-config` for D-14 thresholds) with the AAL2 +
  permission guard chain, non-disclosing error model, idempotency keys
  (reusing `ApiIdempotencyRecord`), rate limiting, and request validation
  (D-08). Web seller inventory pages under the existing `(seller)` route
  group and admin inventory pages under the existing `(admin)` route group;
  mobile read-only inventory status/availability feature in
  `apps/mobile/lib/src/features/` (D-13, A-15 — no adjustments, no admin
  controls on mobile); typed API client mirroring `seller-api.ts`
  conventions; no client-side authorization (A-10).
- **Database changes:** none.
- **APIs:** the full proposed §15 table.
- **Tests:** controller integration/e2e specs; ownership tests via HTTP;
  anti-enumeration tests; idempotency tests; rate-limit tests;
  audit-presence assertions; web component/unit tests; Playwright E2E for
  the seller inventory flow and an admin correction/audit flow; mobile
  widget tests where the Flutter SDK is available.
- **Security acceptance:** every endpoint behind AAL2 + permission guard;
  generic errors; no policy/media disclosure; **no surface exposed before
  M05-M4 implements the Module 02 additions (sign-off recorded 2026-08-15)
  and the Security/Platform D-11 rate-limit confirmation (recorded
  2026-08-15)**; label enforcement requires valid D-14 config (fail
  closed); retention enforcement requires valid D-12 config (fail closed).
- **Completion criteria:** e2e specs green; OpenAPI surface matches §15;
  coverage thresholds met; web build/tests/E2E green; mobile tests green
  where the Flutter SDK is available (M05-R06 environment gating); full
  repository gate passes.
- **Owner decisions required before start:** D-13 (surface scope), D-14
  (threshold config — values pending authority input), D-11 (rate-limit
  policy — **Security/Platform confirmation recorded 2026-08-15**), D-16,
  D-17 (exclusions), D-03/D-04/D-08 (API-shaping decisions).

---

## Test strategy (module-wide, mandatory)

| Area                    | Requirement                                                                                    |
| ----------------------- | ---------------------------------------------------------------------------------------------- |
| Domain unit tests       | Delta application, negative-availability denial, reserve/release bounds, lifecycle fail-closed |
| API integration tests   | Every proposed §15 endpoint through the guard chain                                            |
| Database tests          | Mapper roundtrips, constraints, migration-safety on clean DB                                   |
| Ownership tests         | Cross-seller and cross-organization access denied                                              |
| Authorization tests     | Full `inventory.*` matrix grant/deny, role-state, association-state                            |
| Negative security tests | Privilege escalation, stale version, forged owner, negative available                          |
| Concurrency/race tests  | Version conflicts + row-lock behavior under concurrent mutations (D-07)                        |
| SKU reference tests     | Unknown/non-PUBLISHED SKU fail-closed (D-08, D-10)                                             |
| Retention tests         | Fail-closed deletion without valid config; legal-hold protection (D-12)                        |
| Audit tests             | Append-only movement/audit immutability; authorization decisions remain in Module 02           |
| E2E tests               | Web seller inventory + admin correction/audit; mobile widget tests                             |

Quality gates preserve repository thresholds (API coverage ≈ 91% lines,
web ≈ 89% lines; lint, typecheck, Prisma validate, builds, Playwright).

**End of review draft.** M05-M1 is authorized (approval signed 2026-08-15);
the Module 02 owner sign-off (Gate #1) and the Security/Platform D-11
rate-limit confirmation (Gate #2) were recorded 2026-08-15 (M05-M4 gate
satisfied; M05-M5 rate-limit gate satisfied). M05-M2…M05-M5 are NOT
authorized; each remains gated per WEMP-M05-APPROVAL-001 §4 on the
All external sign-offs are now RECORDED 2026-08-15 (D-12 retention
durations 2555/2555; D-14 threshold values 1/0). M05-M3 is authorized
2026-08-15; M05-M4–M05-M5 remain gated on sequential prerequisites.

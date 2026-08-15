# WALRUS Enterprise Marketplace Platform

## Module 05 — Inventory Management

**Document ID:** WEMP-M05-SPEC-001
**Version:** Review Draft 1.0
**Status:** APPROVED (M05-M1 ONLY) — signed by the Product/Architecture
Owner 2026-08-15. M05-M2…M05-M5 are **NOT** authorized; later milestones
remain gated per WEMP-M05-APPROVAL-001 §4 on the pending external
conditions (§3, all **PENDING — NOT RECORDED**).
**Effective date:** 2026-08-15 (M05-M1 only; later milestones per
WEMP-M05-APPROVAL-001 §4)
**Classification:** Confidential — Internal Use Only

> This document is not an authorization to implement. It preserves Module 00,
> Module 01, Module 02, Module 03, and Module 04 exactly as they are. Every
> item marked **PROPOSED / REQUIRES APPROVAL** or **OWNER DECISION REQUIRED**
> is non-binding until the product/architecture owner records explicit
> approval. This document defines the inventory business domain only; it does
> not duplicate Module 01 authentication, Module 02 authorization, Module 03
> seller management, or Module 04 product catalog, and it must not be read as
> authorizing any database migration, controller, role change, or UI. All
> decisions D-01 through D-18 are preserved exactly as recorded in
> WEMP-M05-DECISIONS-001 §2 and §5.1; this document applies them, it does not
> restate them as new policy.

## 1. Authority and evidence classification

This review draft uses the evidence labels established by
WEMP-M02-SPEC-001, WEMP-M03-SPEC-001, and WEMP-M04-SPEC-001:

- **BINDING:** directly required by accepted Module 00 architecture, the
  approved Module 01 specification/contracts, the approved Module 03
  specification/contracts, or the approved Module 04 specification/contracts.
- **DERIVED:** necessary to satisfy a binding contract without adding a new
  business policy; requires confirmation as part of approving this document.
- **PROPOSED / REQUIRES APPROVAL:** policy, vocabulary, scope, or protocol not
  fully specified by an approved source. It must not be implemented merely
  because it appears here.
- **OWNER DECISION REQUIRED:** a business rule or scope choice with no
  repository authority and no safe architecture-supported default. It is a
  recorded condition on a milestone and must never be silently assumed.

Authoritative inputs used for this draft:

1. `docs/module-05/decision-register-review-draft.md` (WEMP-M05-DECISIONS-001,
   review draft) — decisions **D-01 … D-18**, all **OWNER-APPROVED
   2026-08-14** (option A), and binding architecture facts A-01 … A-17. Every
   decision referenced below is recorded there verbatim.
2. `docs/module-04/formal-specification-review-draft.md` (approved
   WEMP-M04-SPEC-001) — product/SKU model, PUBLISHED visibility gate
   (Module 04 D-12), `ProductSku` as the sellable-unit reference, the
   fail-closed
   `ProductInventoryContractPort` (WEMP-M04-CONTRACT-001 Part C), and the
   Module 05 ownership boundary in §11.
3. `docs/module-04/cross-module-contracts-review-draft.md` (approved
   WEMP-M04-CONTRACT-001) — the Module 04 ↔ Module 05 inventory boundary,
   the fail-closed contract port, and the D-08-adopted split.
4. `docs/module-03/formal-specification-review-draft.md` (approved
   WEMP-M03-SPEC-001) — seller eligibility gate (§6), derived `complianceState`
   summary pattern (§5), audit requirements (§12.9), and the
   `SellerWarehouse` minimal-record model (decision D-09).
5. `docs/module-03/cross-module-contracts-review-draft.md` (approved
   WEMP-M03-CONTRACT-001) and `docs/module-02/implementation-spec.md` —
   the Module 02 ownership-resolver contract precedent and the
   `resource.action` permission format.
6. `docs/architecture/decisions/ADR-001-018.md` and the ADR register —
   ADR-006 (PostgreSQL + Prisma forward-only migrations), ADR-008 (R2),
   ADR-009/013 (AWS ECS Fargate multi-instance), ADR-015/016 (single Next.js
   app with isolated route groups; single Flutter app, mobile admin
   excluded), ADR-017 (Clean Architecture layers).
7. `apps/api/prisma/schema.prisma` and the migration directory — repository
   schema conventions (UUIDv7 string PKs, snake_case `@map`,
   `@db.Timestamptz(6)`, `aggregateVersion`, append-only transition and audit
   records, forward-only migration naming `2026MMDDHHMMSS_module_XX_...`),
   `ApiIdempotencyRecord`, and the rate-limit port.
8. `apps/web` and `apps/mobile` — no inventory routes or features exist today;
   this specification proposes them (decision D-13).

## 2. Purpose and ownership

### 2.1 Binding purpose

**BINDING (approved Module 01 landscape):** Module 05 – Inventory Management
is a named future module in the approved architecture; its consumers and
suppliers are governed by approved contracts (A-01). Module 05 implements the
fail-closed inventory contract port exposed by Module 04
(`ProductInventoryContractPort.getAvailability(skuId)`); the exact shape
becomes normative at Module 05 spec approval (A-04).

**BINDING (Module 01 v1.12 §7):** seller permissions shall be determined
exclusively by Module 02. Module 05 shall not implement its own authorization
engine, roles, or permission checks (A-02).

**BINDING (Module 04 decision D-08, owner-approved 2026-08-14):** Module 04
is definition-only and stores no stock; **Module 05 owns stock levels,
availability, reservations, stock movements, and warehouse/location stock
association** (A-03).

**BINDING (Module 01 Part 7.3 §12 and Module 02/03/04 implementation
rules):** cross-module storage isolation: no cross-module foreign keys;
integration through approved ports; Module 05 never reads Module 04/03
storage and vice versa (A-06).

**BINDING (Module 03 spec §6; Module 04 D-01 ownership pattern):** only a
verified, approved, and role-assigned seller (ACTIVE seller + ACTIVE
`SellerIdentityAssociation`) may operate inventory for its own products
(A-07).

### 2.2 Proposed ownership and Phase 1 scope

**PROPOSED / REQUIRES APPROVAL:** Module 05 owns the inventory business
domain: the per-SKU stock pool (D-01), stock quantities (`onHand` +
`reserved`, `available` derived — D-02), availability derivation (D-03),
typed stock movements (D-04), domain-level reservations for future trading
modules (D-06), stock-pool lifecycle across the SKU lifecycle (D-15), and
the quantity and audit evidence records (D-09).

Explicit exclusions from Module 05 Phase 1 (all owner-decided):

- No warehouse/location stock dimension (D-01 — single pool per SKU;
  warehouse↔stock association deferred).
- No stored stock lifecycle state; low/out-of-stock are derived read-model
  labels only (D-03, D-14).
- No batch/bulk inventory operations (D-16).
- No inventory notifications or alert delivery (D-17).
- No reconciliation/stock-count workflow (D-18).
- No cart/order behavior; reservations are a fail-closed port for future
  modules 07/08 only, with no expiry, allocation, or checkout logic (D-06;
  A-16).
- No finance/commission/settlement logic; stock quantities are not monetary
  values (A-17).
- No customer-facing inventory surface exists today (D-06 — no approved
  customer inventory surface).

## 3. Business purpose

Module 05 enables governed inventory management for approved sellers:

- Each sellable unit (SKU, owned by the seller organization) has a single
  stock pool whose `available` quantity is always derived and never negative
  (D-01/D-02).
- Stock changes are typed, reason-referenced, version-checked, and recorded
  on an append-only movement ledger — never blind overwrites (D-04, D-07,
  D-09).
- Availability for future trading modules (07/08) is served through the
  approved fail-closed contract port, derived from Module 05's own quantities
  and gated on the Module 04 PUBLISHED visibility fact (D-10).
- Inventory data never touches authentication state (Module 01), never
  duplicates authorization policy (Module 02), never reads seller or catalog
  storage beyond the approved association and SKU facts it is given (A-06),
  and never stores monetary or finance data (A-17).

## 4. Stock pool model (decision D-01, D-02)

**RESOLVED — OWNER-APPROVED (2026-08-14, decisions D-01/D-02, option A).**

- **One stock pool per sellable unit (SKU).** Module 05 Phase 1 tracks a
  single stock pool per SKU — no warehouse/location dimension. This matches
  the approved fail-closed contract port shape
  (`getAvailability(skuId) → availableQuantity`); no new warehouse business
  rules are invented (Module 03 D-09 has no activation gate).
  Warehouse↔stock association is recorded as a deferred future concern
  (Module 04 D-08).
- **Quantities.** The single per-SKU stock pool tracks `onHand` + `reserved`;
  `available = onHand − reserved` is **derived, never stored**. Any mutation
  that would make `available < 0` is **denied** (version-checked, fail
  closed). Negative quantities are never stored.
- Reservation expiry semantics are deferred to the 07/08 specs
  (forward-looking, not built now).

## 5. Availability and stock status (decision D-03)

**RESOLVED — OWNER-APPROVED (2026-08-14, decision D-03, option A).**

- **No stored stock lifecycle state** — inventory is quantity-driven.
- The contract port outcome is derived: `AVAILABLE` when `available > 0`,
  `UNAVAILABLE` when `available ≤ 0` or the SKU is unknown/non-PUBLISHED
  (Module 04 D-12 visibility gate), `FAILED` on error.
- "Low stock"/"out of stock" are **derived read-model labels** computed from
  configurable thresholds (never stored business state; mirrors the Module 03
  `complianceState` derived-summary precedent §5). Threshold values are
  configuration (never hard-coded; fail closed on missing config — Module 04
  D-17 config precedent; value pending — see §22).
- No storefront/discovery behavior built (Module 04 D-13 respected).

## 6. Stock adjustment model (decision D-04)

**RESOLVED — OWNER-APPROVED (2026-08-14, decision D-04, option A).**

- Typed adjustment events — `STOCK_IN`, `STOCK_OUT`, `ADJUSTMENT`,
  `COUNT_CORRECTION` — applied as **deltas** to the current pool, each
  carrying actor identity, reason reference, correlation ID, and version;
  append-only inventory movement ledger; pool state is version-checked
  (never blind overwrite; negative available denied per D-02).
- Seller self-service adjustments resolve to the **OWNER** association
  (MEMBER read-only — Module 04 D-01 product pattern); administrative
  corrections by ADMIN/SUPER_ADMIN via an explicit grant (Module 02
  sign-off required, A-09/D-05); no hidden override (Module 04 D-11
  precedent).

## 7. Reservation model and 07/08 boundary (decision D-06)

**RESOLVED — OWNER-APPROVED (2026-08-14, decision D-06, option A).**

- Domain-level, version-checked `reserve(skuId, quantity)` /
  `release(skuId, quantity)` operating on the D-02 quantities (`reserved`
  up, derived `available` down; release never below zero; both denied
  fail-closed on insufficient/unknown state).
- Fail-closed `InventoryReservationPort` exposed for future cart/orders
  (07/08) to wire through approved contracts — **no expiry timers,
  allocation policies, or checkout logic now** (deferred to 07/08/10 specs).
- Idempotent via `ApiIdempotencyRecord` (A-11).
- No customer-facing reservation surface exists today (no approved customer
  inventory surface).

## 8. Concurrency / race protection (decision D-07)

**RESOLVED — OWNER-APPROVED (2026-08-14, decision D-07, option A).**

- Every quantity mutation uses the approved `aggregateVersion` optimistic
  guard (A-11) **plus** a PostgreSQL pessimistic row lock
  (`SELECT … FOR UPDATE`) on the stock-pool row, executed in a **single
  transaction** (load → validate version + quantities → apply delta → write
  movement + pool → commit; any failure rolls back fully).
- Row locking is the architecture-supported default for the contended
  numeric aggregate (D-02 hard no-negative rule; ADR-006 PostgreSQL); no
  application-level mutex/queue (breaks multi-instance ECS, ADR-009/013).

## 9. Validation and quantity bounds (decision D-08)

**RESOLVED — OWNER-APPROVED (2026-08-14, decision D-08, option A).**

- Integer quantities; `quantity ≥ 0`; per-event delta `> 0`; upper bound
  **≤ 1,000,000 units per mutation** (mirrors the approved Module 04 D-16
  1e6 price-scale bound); reserve/release `≥ 1` with reserve ≤ available and
  release ≤ reserved (D-02/D-06).
- **Mandatory reason reference** on every `STOCK_OUT`/`ADJUSTMENT`/
  `COUNT_CORRECTION` and on admin corrections (non-disclosing externally —
  Module 03 §12.9); `STOCK_IN` optional reference.
- **SKU reference integrity** enforced through the approved Module 04→05
  contract port — SKU must exist in Module 04 `ProductSku`, belong to the
  caller's seller organization (D-05 resolver), and be PUBLISHED (Module 04
  D-12 visibility gate); fail closed on unknown/non-PUBLISHED SKU;
  storage
  isolation preserved (never reads Module 04 storage, A-06).
- Idempotency key mandatory on all mutations (A-11); version-checked (D-07).

## 10. Audit and evidence requirements (decision D-09)

**RESOLVED — OWNER-APPROVED (2026-08-14, decision D-09, option A).**

Two record kinds:

1. **Append-only `InventoryMovementRecord` ledger** — the primary quantity
   evidence: event type, SKU reference, delta, resulting onHand/reserved
   snapshot, actor identity (logical UUIDv7), reason reference, correlation
   ID, causation ID, timestamps, version; no update/delete API.
2. **Append-only `InventoryAuditRecord`** — the secondary business audit for
   non-quantity events (pool activation/closure, admin visibility events,
   config/threshold changes) mirroring `ProductAuditRecord`.

**Never stored:** roles/permissions/policy internals (Module 02 only —
Module 03 §12.9), authentication material (A-10), PII beyond logical
identity references, **monetary values or ledger/finance data (A-17)**, and
raw reason text (reason references only; non-disclosing). Audit immutability
tests are part of the module test strategy.

## 11. Cross-module contract wiring (decision D-10)

**RESOLVED — OWNER-APPROVED (2026-08-14, decision D-10, option A).**

- Module 05 **implements `getAvailability(skuId)`** (→ `{AVAILABLE,
availableQuantity}` when the SKU is PUBLISHED per the Module 04 contract
  fact and `available > 0`; `UNAVAILABLE` when not PUBLISHED/unknown or
  `available ≤ 0`; `FAILED` on internal error), computing availability from
  **its own** quantities.
- Module 04 **keeps** the PUBLISHED visibility gate (Module 04 D-12) and
  publishes
  SKU-existence + PUBLISHED-state facts through its approved
  `ProductCatalogReadPort`, which Module 05 consumes — **Module 05 never
  reads Module 04 storage** (A-06).
- The existing fail-closed adapter is replaced by wiring the Module 05
  implementation at the port boundary (the D-08-anticipated normative
  integration, not a Module 04 behavior change).
- No new availability endpoint; the port is consumed by future trading
  modules (07/08) via their approved contracts.

### 11.1 Contract port shapes (proposed — D-06/D-10)

- `Module05InventoryContractPort.getAvailability(skuId)` →
  `{ status: 'AVAILABLE' | 'UNAVAILABLE' | 'FAILED', availableQuantity? }`
  (A-04; shape normative at this spec's approval). This is the same
  boundary port named `ProductInventoryContractPort` in WEMP-M04-CONTRACT-001
  Part C; both names refer to the one Module 04 ↔ Module 05 inventory port.
- `InventoryReservationPort.reserve(skuId, quantity)` /
  `.release(skuId, quantity)` — domain-level, fail-closed, idempotent,
  version-checked (D-06). Consumed by 07/08 through their approved contracts
  only.
- Module 05 consumes `ProductCatalogReadPort` (Module 04) for
  SKU-existence + PUBLISHED-state facts (D-10). No direct Module 04 storage
  access.

## 12. Permission vocabulary (decision D-05 — summary)

**RESOLVED — OWNER-APPROVED (2026-08-14, decision D-05, option A):** four
additive identifiers in the approved `resource.action` format —
`inventory.read` (SELLER, org-scoped), `inventory.adjust.self` (SELLER
OWNER, org-scoped), `inventory.adjust.admin` (ADMIN/SUPER_ADMIN),
`inventory.audit.view` (ADMIN/SUPER_ADMIN). **No new role** (`RoleName`
unchanged — Module 04 D-10 no-new-role precedent); **no override** (Module
04 D-11 precedent).
Seller org-scoping through the existing ownership-resolver contract —
Module 05 adds an inventory resource scope (third scope); the **Module 02
owner sign-off was RECORDED 2026-08-15** (A-09/D-05, additive and
non-weakening). MEMBER associations read-only. Full vocabulary and matrix:
WEMP-M05-AUTHZ-001.

## 13. Stock-pool lifecycle across the SKU lifecycle (decision D-15)

**RESOLVED — OWNER-APPROVED (2026-08-14, decision D-15, option A).**

- A pool exists per SKU (D-01) and **activates** when the SKU first becomes
  PUBLISHED or receives its first recorded movement (activation = auditable
  event, D-09).
- **Quantities persist unchanged** across `UNPUBLISHED`/re-`PUBLISHED`
  cycles (Module 04 D-02 reversible): **no reset, zeroing, or silent
  modification** — any quantity change is a recorded movement
  (D-04/D-09, append-only).
- While non-PUBLISHED: availability `UNAVAILABLE` (D-10) and movement
  mutations denied (D-08) — unchanged.
- SKU `CLOSED` (Module 04 terminal): pool **read-only** for quantity
  mutations, availability `UNAVAILABLE`; ledger/audit records **retained**
  per D-12 (retention, never closure, governs lifespan). No silent
  auto-deletion on any transition.

## 14. Domain/database models required (proposed)

All entities are **PROPOSED / REQUIRES APPROVAL** and Module 05-owned,
following the repository schema conventions (UUIDv7 string PKs, snake_case
`@map`, `@db.Timestamptz(6)`, `aggregateVersion`, `createdAt`/`updatedAt`,
append-only records, no cross-module FKs — `skuId`, `sellerProfileId`, and
`actorIdentityId` are logical UUIDv7 references).

| Entity                    | Responsibility                                       | Key fields (proposed)                                                                                                                                                                              |
| ------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `StockPool`               | Per-SKU quantity aggregate (D-01/D-02)               | `stockPoolId`, `skuId` (logical), `sellerProfileId` (logical), `onHand`, `reserved`, `aggregateVersion`, timestamps                                                                                |
| `InventoryMovementRecord` | Append-only primary quantity ledger (D-04/D-09)      | `movementId`, `stockPoolId`, `movementType`, `delta`, `resultingOnHand`, `resultingReserved`, `actorIdentityId`, `reasonReference`, `correlationId`, `causationId`, `aggregateVersion`, timestamps |
| `InventoryAuditRecord`    | Append-only secondary business audit (D-09)          | `auditEventId`, `stockPoolId`/`skuId`, `eventType`, `actorIdentityId`, `correlationId`, `evidenceDigest`, timestamps                                                                               |
| `InventoryConfigRecord`   | Platform-defined, admin-managed configuration (D-14) | `configId`, `configKey`, `configValue`, `state`, `aggregateVersion`, `changedByIdentityId`, timestamps                                                                                             |

**RESOLVED — implementation details (no new owner decision required):**
the exact table set and index/unique shapes (e.g., one `StockPool` per SKU per seller scope), the
reservation record representation (none in Phase 1 — D-06 domain-port-only),
and whether `InventoryConfigRecord` is a table or code-owned configuration
are implementation details confirmed at M05-M2/M05-M3 per the recorded
decisions; no new business rule is introduced here.

## 15. API endpoints required (proposed)

Base path follows the repository convention (`/api/v1`). All **PROPOSED /
REQUIRES APPROVAL**; exact paths are proposals. Every endpoint behind the
AAL2 session guard + Module 02 permission guard (A-10); every mutation
requires an `Idempotency-Key` (reusing `ApiIdempotencyRecord`, A-11); errors
are non-disclosing. No endpoint exists for `reserve`/`release` (D-06 — port
only, D-11).

| Method      | Path (proposed)                              | Permission (proposed)                             | Purpose                                                               |
| ----------- | -------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------- |
| `GET`       | `/api/v1/seller/inventory`                   | `inventory.read`                                  | Non-enumerating own-SKU stock list + derived labels                   |
| `GET`       | `/api/v1/seller/inventory/:skuId`            | `inventory.read`                                  | Own SKU stock detail (onHand/reserved/available)                      |
| `POST`      | `/api/v1/seller/inventory/:skuId/movements`  | `inventory.adjust.self`                           | Seller adjustment (`STOCK_IN`/`STOCK_OUT`/`ADJUSTMENT`), owner-only   |
| `GET`       | `/api/v1/seller/inventory/:skuId/movements`  | `inventory.read`                                  | Own movement ledger (non-disclosing)                                  |
| `GET`       | `/api/v1/admin/inventory`                    | `inventory.audit.view`                            | Non-enumerating admin stock list/filter                               |
| `GET`       | `/api/v1/admin/inventory/:skuId`             | `inventory.audit.view`                            | Stock detail + audit records                                          |
| `POST`      | `/api/v1/admin/inventory/:skuId/corrections` | `inventory.adjust.admin`                          | Admin correction (`COUNT_CORRECTION`, mandatory reason)               |
| `GET`       | `/api/v1/admin/inventory/:skuId/movements`   | `inventory.audit.view`                            | Movement ledger                                                       |
| `GET/PATCH` | `/api/v1/admin/inventory-config`             | `inventory.audit.view` / `inventory.adjust.admin` | Read/update low-stock & out-of-stock thresholds (D-14, admin-managed) |

**RESOLVED — implementation details (no new owner decision required):**
exact endpoint list, paths, and pagination/filtering shape are
implementation details confirmed at M05-M5;
the recorded decisions fix the permission model (D-05), the mutation rules
(D-08), and the surface scope (D-13).

## 16. Web seller UI requirements (decision D-13)

**RESOLVED — OWNER-APPROVED (2026-08-14, decision D-13, option A).**

- Web = **full seller inventory management**: view stock per SKU
  (onHand/reserved/available, D-02); seller adjustments (D-04); own movement
  ledger (D-09).
- Plus **full admin inventory surface**: corrections via explicit grant
  (D-04); audit view (D-05); low/out-of-stock derived labels from configured
  thresholds (D-03/D-14).
- Under the existing `(seller)` and `(admin)` route groups in `apps/web`;
  consistency with `@walrus/ui` and the Module 03/04 seller dashboard
  patterns; typed API client mirroring the `seller-api.ts` conventions;
  generic, non-disclosing error states; no client-side authorization.

## 17. Admin UI requirements (decision D-13)

**RESOLVED — OWNER-APPROVED (2026-08-14, decision D-13, option A):** admin
inventory list/detail, corrections (with mandatory reason), audit view, and
threshold configuration management — mirroring the Module 03/04
`AdminSellerList`/`AdminSellerDetail` pattern. No client-side authorization
decisions; denied grants surface as generic access-denied states.

## 18. Mobile requirements (decision D-13; A-15)

**BINDING (ADR-016):** one Flutter app; mobile admin is excluded.

**RESOLVED — OWNER-APPROVED (2026-08-14, decision D-13, option A):** mobile
= **read-only inventory status/availability only** (mirrors the M03/M04
mobile-scope pattern) — **no stock adjustments, no admin controls**;
authorization enforced server-side (A-10 — never client-side). Structure
mirrors the Module 03 `seller` feature with an injectable API client.

## 19. Security requirements (proposed)

- **BINDING:** all endpoints require a Module 01 authenticated session; the
  AAL2 session guard precedes the Module 02 permission guard; no anonymous
  inventory API; no client-side authorization decisions (A-10).
- **BINDING:** authorization exclusively via Module 02 permission guard;
  Module 05 never evaluates roles itself (A-02).
- **PROPOSED:** `inventory.*` permissions are seller-organization-scopedthrough the approved ownership-resolver contract (third scope — Module 02
  owner sign-off recorded 2026-08-15, A-09/D-05); absence of an ACTIVE
  association denies.
- **PROPOSED:** anti-enumeration, idempotency (A-11), optimistic
  concurrency + row lock (D-07), rate limiting (D-11/A-13), non-disclosing
  errors, and audit per the recorded decisions.
- No secrets or real credentials appear in this or any Module 05 document.

## 20. Rate limiting (decision D-11; A-13)

**RESOLVED — OWNER-APPROVED (2026-08-14, decision D-11, option A):**
production numeric policy mirroring the approved Module 04 D-15 classes —
seller inventory **adjustments 30/hour** (update-class mirror), seller
inventory **reads 60/hour**, admin **corrections/audit 50/hour**
(admin-class mirror). **No rate class for `reserve`/`release`** —
domain-level, port-only (D-06); no seller HTTP surface exists today; policy
for future 07/08 port wiring is set by their specs. Reuses the repository
rate-limit port (Module 04 D-15 mechanism).

**External gate — RECORDED 2026-08-15:** Security/Platform confirmed the
D-11 values on 2026-08-15 (adjustments 30/hr, reads 60/hr, admin 50/hr; no
rate class for `reserve`/`release` — D-06). The policy takes effect when
M05-M5 APIs are exposed; until then the recorded production policy classes
apply as the fail-closed default per A-13 (Module 04 D-15 classes: 10/30/50
per hour).

## 21. Evidence/audit retention (decision D-12)

**RESOLVED — OWNER-APPROVED (2026-08-14, decision D-12, option A):** the
approved configurable per-record-category retention architecture applied
**verbatim** (Module 03 D-03 → Module 04 D-17): **configurable retention
durations** (never hard-coded, never invented now), **auditable deletion
with legal-hold protection**, **fail closed on missing/invalid retention
configuration** (no deletion without a valid configured duration); no
compliance claim. Applies to both D-09 record kinds
(`InventoryMovementRecord` and `InventoryAuditRecord`).

**External gate — RECORDED 2026-08-15 (owner-approved D-12 retention
values):** jurisdiction-specific retention durations were approved and
recorded on 2026-08-15 — **`InventoryMovementRecord`: retentionDays =
2555; `InventoryAuditRecord`: retentionDays = 2555** (see
WEMP-M05-APPROVAL-001 §3/§6). Fail-closed remains in force: no deletion
occurs without a valid configured duration (auditable deletion with
legal-hold protection; no compliance claim).

## 22. Low/out-of-stock threshold configuration (decision D-14)

**RESOLVED — OWNER-APPROVED (2026-08-14, decision D-14, option A):**
low-stock/out-of-stock thresholds are **platform-defined, admin-managed
configuration** — **not seller-configurable and no per-SKU seller overrides
in Phase 1**; values **never hard-coded**; **fail closed when required
configuration is missing or invalid** (no label enforcement without valid
config); values remain pending authority input before label enforcement.
Mirrors the Module 03 §5 `complianceState` derived-summary pattern and the
Module 04 D-17 config pattern (D-03 derived-label model).

**External gate — RECORDED 2026-08-15 (owner-approved D-14 threshold
values):** threshold values were approved and recorded on 2026-08-15 —
**`LOW_STOCK_THRESHOLD` = 1; `OUT_OF_STOCK_THRESHOLD` = 0** (see
WEMP-M05-APPROVAL-001 §3/§6). OUT_OF_STOCK is derived when `available ≤ 0`
(mirroring the D-03 UNAVAILABLE availability outcome); LOW_STOCK when
`available ≤ 1`; IN_STOCK otherwise. Fail-closed remains in force: no label
enforcement without valid configured thresholds (values stored in
`inventory_config_records`, admin-managed, never hard-coded).

## 23. Exclusions: batch, notifications, reconciliation (decisions D-16/D-17/D-18)

**RESOLVED — OWNER-APPROVED (2026-08-14, option A):**

- **D-16 — no batch/bulk inventory API in Phase 1.** Every mutation stays
  single-SKU, single-movement (D-04), preserving per-mutation idempotency,
  version + row-lock transaction (D-07), ≤ 1,000,000 unit bound (D-08),
  per-class rate limits (D-11), and audit (D-09). Batch/bulk explicitly out
  of scope, deferred to a future approved module/milestone only if a real
  consumer requirement is established (no trading consumers today — A-16).
- **D-17 — no inventory notifications or alert delivery in Phase 1.**
  Low/out-of-stock remain derived read-model labels only (D-03/D-14),
  exposed only through the approved web/mobile surfaces (D-13). No email,
  push, in-app alerts, notification preferences, scheduling infrastructure,
  or recipient-PII collection (D-09; A-10). Future alerting deferred to a
  separately approved module/milestone with a real consumer requirement.
- **D-18 — no reconciliation/stock-count workflow in Phase 1.**
  `COUNT_CORRECTION` remains a direct, single-SKU, single-movement operation
  under all already-approved controls. No count sheets, variance reporting,
  pending-count state, or review/approval workflow. Deferred to a future
  approved module/milestone only if a real consumer requirement is recorded.

## 24. Testing requirements (proposed)

Mirrors the Module 03/04 test strategy (mandatory, module-wide):

- Domain unit tests: delta application, negative-availability denial,
  reserve/release bounds, lifecycle fail-closed, unknown-SKU denial.
- Authorization tests: full `inventory.*` matrix grant/deny; owner vs MEMBER;
  cross-seller ownership denial; no bypass.
- API integration tests: every proposed endpoint through the guard chain;
  anti-enumeration; idempotency; rate-limit; audit-presence assertions.
- Concurrency/race tests: version-conflict rejection and row-lock behavior
  under concurrent mutations (D-07).
- Database tests: mapper roundtrips, constraints, migration-safety on a
  clean database, append-only immutability (D-09).
- E2E tests: web seller inventory flow and admin correction/audit flow
  (Playwright); mobile widget tests where the Flutter SDK is available
  (A-15; M05-R06 environment gating).
- Quality gates preserve repository thresholds (API coverage ≈ 91% lines;
  lint, typecheck, Prisma validate, builds, Playwright).

## 25. Dependencies on Modules 00–04

| Module | Dependency (binding unless marked)                                                                                                                                                                                           |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 00     | Monorepo/Turborepo conventions; Clean Architecture layers; PostgreSQL/Prisma forward-only migrations; AAL2 session guard; idempotency and rate-limit ports; `@walrus/*` packages                                             |
| 01     | Authenticated identity context and AAL2 session guard; no inventory data ever enters Module 01                                                                                                                               |
| 02     | Permission guard, `resource.action` identifiers, role matrix, ownership-resolver contract — **Module 02 owner approval of additive `inventory.*` entries and the third resolver (WEMP-M05-AUTHZ-001) — RECORDED 2026-08-15** |
| 03     | Approved/ACTIVE seller + ACTIVE `SellerIdentityAssociation` as the inventory-operations gate; owner association for adjustments; Module 05 never reads Module 03 storage; integration through approved contracts             |
| 04     | `ProductSku` as the sellable-unit reference; PUBLISHED visibility gate + SKU facts via `ProductCatalogReadPort`; fail-closed `ProductInventoryContractPort` implemented by Module 05 (D-10); no Module 04 storage reads      |

## 26. Explicit exclusions for future modules

- Customer profiles/customer business data — Module 06.
- Shopping cart / order behavior — Modules 07/08 (reservations are port-only
  today, D-06; A-16).
- Payments — Module 09.
- Shipping & logistics — Module 10.
- Notifications — Module 11 (D-17: no independent inventory alert delivery).
- Reporting & analytics — Module 12.
- Warehouse/location stock association — deferred future concern
  (D-01; Module 04 D-08).
- Commission/fees/settlement/ledger logic — future Finance/Commission module
  (A-17; Module 03 D-05).
- Storefront, marketplace discovery, and search — no owning module recorded
  (Module 04 D-13 exclusion; no storefront behavior built, D-03).

## 27. Milestones (summary)

M05-M1 Inventory Domain Foundation → M05-M2 Inventory Persistence → M05-M3
Inventory Application Services → M05-M4 Authorization & Cross-Module
Integration → M05-M5 Seller & Admin APIs and Web/Mobile Integration. Full
per-milestone scope, deliverables, tests, gates, and acceptance criteria:
WEMP-M05-PLAN-001.

## 28. Owner decision catalogue

See WEMP-M05-DECISIONS-001 for the full register. Every decision D-01 …
D-18 is **OWNER-APPROVED (2026-08-14)** and is preserved exactly there.
External-authority conditions recorded against specific milestones:
Module 02 owner sign-off (D-05/A-09 — M05-M4) **recorded 2026-08-15**;
Security/Platform D-11 rate-limit confirmation (M05-M5) **recorded
2026-08-15**; Legal/Compliance D-12 retention durations (M05-M2/M05-M3)
**recorded 2026-08-15** (2555/2555 days); D-14 low/out-of-stock threshold
values (M05-M3/M05-M5 — label enforcement) **recorded 2026-08-15**
(LOW_STOCK_THRESHOLD=1; OUT_OF_STOCK_THRESHOLD=0). None may be silently
assumed.

## 29. Approval register

| ID        | Topic                                                                            | Status                       |
| --------- | -------------------------------------------------------------------------------- | ---------------------------- |
| M05-AR-01 | Stock pool model, quantities, availability, adjustments, reservations, lifecycle | PROPOSED — REQUIRES APPROVAL |
| M05-AR-02 | Validation, audit/evidence, retention, rate limiting, threshold configuration    | PROPOSED — REQUIRES APPROVAL |
| M05-AR-03 | `inventory.*` permissions + third ownership resolver (Module 02 sign-off)        | PROPOSED — REQUIRES APPROVAL |
| M05-AR-04 | Cross-module contract wiring with Module 04 (D-10)                               | PROPOSED — REQUIRES APPROVAL |
| M05-AR-05 | Milestone plan, Phase 1 scope, exclusions (D-13/D-16/D-17/D-18)                  | PROPOSED — REQUIRES APPROVAL |

**End of review draft.** Nothing in this document authorizes implementation,
migration, commit, or deployment.

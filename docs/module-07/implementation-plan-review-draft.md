# WALRUS Enterprise Marketplace Platform

## Module 07 — Shopping Cart Implementation Plan

**Document ID:** WEMP-M07-PLAN-001
**Version:** Review Draft 1.0
**Status:** M07-M1 AUTHORIZED (2026-08-18); M07-M2…M07-M5 NOT AUTHORIZED
**Effective date:** 2026-08-18 (M07-M1)
**Classification:** Confidential — Internal Use Only

---

## 1. Module overview

Module 07 implements the Shopping Cart business domain: the customer's
active shopping cart, its SKU-level line items, price snapshots, the
reservation lifecycle against Module 05 inventory, and the immutable
snapshot handed off to Module 08 orders at checkout.

Cart (07) → Order (08) → Payment (09) → Shipping (10).

---

## 2. Approved milestones

### M07-M1 — Domain Foundation (AUTHORIZED 2026-08-18)

**Scope:** Pure domain layer only. No schema, no migration, no API, no UI.

**Deliverables:**

- `CartId` value object (UUIDv7)
- `CartLineId` value object (UUIDv7)
- `Quantity` value object (min 1, max configurable)
- `MoneyAmount` value object (cents, non-negative)
- `CartState` value object (ACTIVE, CHECKED_OUT, ARCHIVED, AUTO_EXPIRED)
- `Cart` aggregate root (properties, constructor validation)
- `CartLine` entity (properties, constructor validation)
- `CartItemSnapshot` value object (immutable line snapshot for checkout)
- `CartSnapshot` value object (immutable cart snapshot for M08 handoff)
- `CartLifecycle` policy (state machine, mutations, validation)
- `CartRetentionPolicy` (retention evaluation, configurable)
- `CartDomainError` typed error codes
- `CartReadPort` (find active cart, find line by id)
- `CartWritePort` (insert, save with version guard)
- `CartReservationPort` (reserve, release — wraps M05 port)
- Domain entity tests

**Dependencies:** M06 (CustomerReference, CustomerProfileReadPort),
M04 (ProductCatalogReadPort), M05 (InventoryReservationPort)

**Security:** No API surface; no authorization; no rate limiting in M07-M1.

**Tests:** Domain entity value-object tests, lifecycle policy tests,
error-code tests.

**Exclusions:** No schema/migration, no application services, no
controllers, no DTOs, no web/mobile UI, no authorization wiring, no
idempotency, no rate limiting.

---

### M07-M2 — Persistence (NOT AUTHORIZED)

**Scope:** Prisma schema, migration, repository adapters.

**Planned deliverables:** Cart/CartLine/CartStateTransition/CartAuditRecord
tables; PrismaCartRepository; Prisma schema validation.

---

### M07-M3 — Application Services (NOT AUTHORIZED)

**Scope:** Use cases: add item, update quantity, remove item, clear cart,
checkout handoff, cart expiry, item validation.

**Planned deliverables:** CartApplicationService; CartExpirationService;
price revalidation; inventory reservation wiring; idempotency (A-09).

---

### M07-M4 — Authorization & Cross-Module Integration (NOT AUTHORIZED)

**Scope:** Module 02 permission integration; cart.* catalog; ownership
resolver wiring.

**Planned deliverables:** Module 02 owner sign-off for cart.*;
CartPermissionGuard; wiring of CustomerProfileReadPort.

---

### M07-M5 — APIs & Web/Mobile Integration (NOT AUTHORIZED)

**Scope:** HTTP controllers, DTOs, web UI, mobile read-only surface.

**Planned deliverables:** CartController; AdminCartController;
CustomerCartWebSurface; MobileCartReadSurface; E2E tests; Playwright tests.

---

## 3. Cross-module contracts consumed by M07

| Contract                   | Source module | Consumed in M07 | Gate   |
| -------------------------- | ------------- | --------------- | ------ |
| `CustomerProfileReadPort`  | M06           | M07-M1 (domain) | M07-M1 |
| `CustomerReference`        | M06           | M07-M1 (domain) | M07-M1 |
| `ProductCatalogReadPort`   | M04           | M07-M2/M03      | M07-M2 |
| `InventoryReservationPort` | M05           | M07-M3          | M07-M3 |

---

## 4. Milestone gating

| Milestone | Gate                                        | Status                   |
| --------- | ------------------------------------------- | ------------------------ |
| M07-M1    | Owner approval (D-01…D-08)                  | ✓ SATISFIED — 2026-08-18 |
| M07-M2    | M07-M1 complete + persistence decisions     | NOT AUTHORIZED           |
| M07-M3    | M07-M2 complete + application decisions     | NOT AUTHORIZED           |
| M07-M4    | M07-M3 complete + Module 02 sign-off (D-09) | NOT AUTHORIZED           |
| M07-M5    | M07-M4 complete + Security/Platform D-10    | NOT AUTHORIZED           |

---

## 5. Explicit exclusions (A-13)

- No order creation (Module 08)
- No payment processing (Module 09)
- No shipping/logistics (Module 10)
- No notifications (Module 11)
- No analytics/reporting (Module 12)
- No guest/anonymous cart (D-01, deferred to Phase 2)
- No cart merge on login (D-15, deferred to Phase 2)

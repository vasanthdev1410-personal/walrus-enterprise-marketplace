# WALRUS Enterprise Marketplace Platform

## Module 08 — Checkout & Order Lifecycle Implementation Plan

**Document ID:** WEMP-M08-PLAN-001
**Version:** Review Draft 1.0
**Status:** M08-M1…M08-M5 AUTHORIZED (2026-08-19/20) — all milestones authorized.
**Effective date:** 2026-08-19 (M08 planning)
**Classification:** Confidential — Internal Use Only

---

## 1. Module overview

Module 08 implements the Checkout & Order Lifecycle business domain: receiving
the immutable CartSnapshot from Module 07, creating an Order aggregate,
revalidating prices, confirming inventory, and managing the order lifecycle
through delivery or cancellation. Module 08 hands off to Module 09 (Payments)
and Module 10 (Shipping & Logistics) at the appropriate lifecycle boundaries.

Cart (07) → **Order (08)** → Payment (09) → Shipping (10).

---

## 2. Approved milestones

### M08-M1 — Domain Foundation

**Status:** ✓ **AUTHORIZED** (2026-08-19)

**Scope:** Pure domain layer only. No schema, no migration, no API, no UI.

**Deliverables:**

- `OrderId` value object (UUIDv7)
- `OrderLineId` value object (UUIDv7)
- `OrderState` value object (PENDING, CONFIRMED, PAID, SHIPPED, DELIVERED, CANCELLED, CLOSED)
- `Order` aggregate root (properties, constructor validation)
- `OrderLine` entity (properties, constructor validation)
- `OrderSnapshot` value object (immutable snapshot for audit)
- `OrderLifecycle` policy (state machine, transitions, validation)
- `OrderRetentionPolicy` (retention evaluation, configurable)
- `OrderDomainError` typed error codes
- `OrderRepository` port (insert, save, findById, findByCustomerProfileId, findLines, findTransitions, findAuditRecords)
- `OrderSnapshotReadPort` (read CartSnapshot for order creation)
- Domain entity tests

**Dependencies:** M07 (CartSnapshot, checkoutHandoff), M06 (CustomerProfileReadPort),
M04 (ProductCatalogReadPort), M05 (InventoryReservationPort)

**Security:** No API surface; no authorization; no rate limiting in M08-M1.

**Tests:** Domain entity value-object tests, lifecycle policy tests,
error-code tests.

**Exclusions:** No schema/migration, no application services, no
controllers, no DTOs, no web/mobile UI, no authorization wiring, no
idempotency, no rate limiting.

---

### M08-M2 — Persistence

**Status:** ✓ **AUTHORIZED** (2026-08-19)

**Scope:** Prisma schema, migration, repository adapters.

**Deliverables:**

- Prisma schema: Order, OrderLine, OrderStateTransition, OrderAuditRecord tables
- Forward-only additive migration (A-07)
- Prisma/domain mappers
- PrismaOrderRepository (implements OrderRepository port)
- Configurable retention (ORDER_RECORD_RETENTION_DAYS, default per D-07)
- Retention configuration adapter
- Repository tests

**Dependencies:** M08-M1 complete

**Security:** No API surface; no authorization; no rate limiting in M08-M2.

**Tests:** Migration safety tests, mapper round-trip tests,
repository create/read/update tests, optimistic concurrency tests,
retention configuration tests.

**Exclusions:** No application services, no controllers, no DTOs,
no web/mobile UI, no authorization wiring.

---

### M08-M3 — Application Services

**Status:** ✓ **AUTHORIZED** (2026-08-19)

**Scope:** Use cases: create order from CartSnapshot, read order,
list orders, price revalidation, inventory confirmation.

**Deliverables:**

- `OrderApplicationService` (primary use-case orchestrator)
- CreateOrder use case (from CartSnapshot)
- Price revalidation adapter (wraps M04 ProductCatalogReadPort)
- Inventory confirmation adapter (wraps M05 InventoryReservationPort)
- Customer profile read adapter (wraps M06 CustomerProfileReadPort)
- CartSnapshot read adapter (wraps M07 CartSnapshotReadPort)
- DTOs, error codes, result objects
- Idempotency via ApiIdempotencyRecord (A-09 pattern)
- Rate limiting (configurable per D-10 precedent)
- Application service tests

**Dependencies:** M08-M2 complete + M04/M05/M06 ports available

**Security:** No API surface; no authorization; rate limiting enforced
inside application services.

**Tests:** Application service unit tests, price revalidation tests,
inventory confirmation tests, idempotency tests, error mapping tests.

**Exclusions:** No controllers, no DTOs for HTTP, no web/mobile UI,
no authorization wiring.

---

### M08-M4 — Authorization & Cross-Module Integration

**Status:** ✓ **AUTHORIZED** (2026-08-20)

**Scope:** Module 02 permission integration; order.* catalog; ownership
resolver wiring.

**Deliverables:**

- Order permission catalog (order.read, order.create, order.admin.read, order.admin.manage)
- Role-to-permission mappings (CUSTOMER, ADMIN, SUPER_ADMIN)
- `OrderSelfServicePermissionGuard` (customer-identity-scoped)
- `OrderAdminPermissionGuard`
- `Module02OrderAdminAuthorizationAdapter` (replaces deny-all placeholder)
- Real Module04/05/06/07 adapters (replace fail-closed placeholders)
- Order error mapping (HTTP responses)
- Authorization tests

**Dependencies:** M08-M3 complete + Module 02 owner sign-off (D-09)

**Security:** Full authorization wiring; deny-by-default; fail-closed;
no wildcards; no role-only bypass; no hidden SUPER_ADMIN bypass.

**Tests:** Permission catalog tests, role-catalog tests, guard tests,
adapter tests, error mapping tests, authorization regression tests.

**Exclusions:** No controllers, no web/mobile UI, no rate-limit wiring.

---

### M08-M5 — APIs & Web/Mobile Integration

**Status:** ✓ **AUTHORIZED** (2026-08-20)

**Scope:** HTTP controllers, DTOs, web UI, mobile read-only surface.

**Deliverables:**

- `OrderSelfServiceController` (customer self-service APIs)
- `OrderAdminController` (admin APIs)
- Web/mobile API clients
- Rate limits (order.read 60/hr, order.mutation 120/hr, order.admin 50/hr)
- Correlation helpers
- API integration tests
- Web/mobile client tests

**Dependencies:** M08-M4 complete + Security/Platform D-10 rate-limit confirmation

**Security:** Full API surface with authorization guards; rate limiting;
non-enumerating errors; no PII exposure.

**Tests:** Controller tests, API integration tests, web/mobile client tests,
rate-limit tests, error mapping tests.

**Exclusions:** No payment processing (M09), no shipping (M10),
no notifications (M11).

---

## 3. Cross-module contracts consumed by M08

| Contract                   | Source module | Consumed in M08 | Gate   |
| -------------------------- | ------------- | --------------- | ------ |
| `CartSnapshot` (immutable) | M07           | M08-M1 (domain) | M08-M1 |
| `CustomerProfileReadPort`  | M06           | M08-M1 (domain) | M08-M1 |
| `ProductCatalogReadPort`   | M04           | M08-M3 (app)    | M08-M3 |
| `InventoryReservationPort` | M05           | M08-M3 (app)    | M08-M3 |

---

## 4. Cross-module contracts provided by M08

| Contract             | Consumed by | Description                                   | Gate   |
| -------------------- | ----------- | --------------------------------------------- | ------ |
| `OrderSnapshot`      | M09, M10    | Immutable order snapshot for payment/shipping | M08-M1 |
| `OrderReadPort`      | M09, M10    | Read order details for callbacks              | M08-M2 |
| `OrderStateCallback` | M09, M10    | State transition callbacks from M09/M10       | M08-M5 |

---

## 5. Milestone gating

| Milestone | Gate                                                           | Status                   |
| --------- | -------------------------------------------------------------- | ------------------------ |
| M08-M1    | Owner approval (D-01/D-02/D-04/D-05/D-06/D-13)                 | ✓ SATISFIED — 2026-08-19 |
| M08-M2    | M08-M1 complete + D-07/D-11 decisions                          | ✓ SATISFIED — 2026-08-19 |
| M08-M3    | M08-M2 complete + D-03/D-04/D-12 decisions + M04/M05/M06 ports | ✓ SATISFIED — 2026-08-19 |
| M08-M4    | M08-M3 complete + Module 02 sign-off (D-09)                    | ✓ SATISFIED — 2026-08-20 |
| M08-M5    | M08-M4 complete + Security/Platform D-10                       | ✓ SATISFIED — 2026-08-20 |

---

## 6. Explicit exclusions (A-09)

- No payment processing (Module 09)
- No shipping/logistics (Module 10)
- No notifications (Module 11)
- No analytics/reporting (Module 12)
- No cart behavior (Module 07 — M08 consumes the snapshot only)
- No guest/anonymous checkout (deferred to Phase 2)
- No order modification after confirmation (M09 callback)

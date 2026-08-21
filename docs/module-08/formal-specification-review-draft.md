# WALRUS Enterprise Marketplace Platform

## Module 08 — Checkout & Order Lifecycle Formal Specification

**Document ID:** WEMP-M08-SPEC-001
**Version:** Review Draft 1.0
**Status:** OWNER-APPROVED — M08-M1…M08-M5 all authorized (2026-08-19/20). Implementation complete.
**Effective date:** 2026-08-19 (M08 planning)
**Classification:** Confidential — Internal Use Only

---

## 1. Purpose

This document specifies Module 08 — Orders: the checkout and order lifecycle
domain. Module 08 consumes the immutable CartSnapshot produced by Module 07
Shopping Cart at checkout handoff, creates an Order aggregate, revalidates
prices, confirms inventory, and manages the order lifecycle through delivery
or cancellation. Module 08 hands off to Module 09 (Payments) and
Module 10 (Shipping & Logistics) at the appropriate lifecycle boundaries.

---

## 2. Module landscape position

```
Module 04 — Product Catalog
Module 05 — Inventory
Module 06 — Customer Management
Module 07 — Shopping Cart ──CartSnapshot──▶ Module 08 — Orders
                                           │
                                           ├──▶ Module 09 — Payments
                                           │
                                           └──▶ Module 10 — Shipping & Logistics
```

M08 is downstream of M07. M08 is upstream of M09 and M10. M08 never reads
M07 live cart data — it consumes only the immutable CartSnapshot.

---

## 3. Scope

### 3.1 In scope

- Order aggregate root and line entities
- Order lifecycle state machine (PENDING → CONFIRMED → PAID → SHIPPED → DELIVERED → CLOSED; CANCELLED from PENDING/CONFIRMED)
- CartSnapshot consumption and order creation
- Price revalidation at checkout (M07 D-05: "Revalidate at checkout (M08)")
- Inventory reservation confirmation (M05 port)
- Customer profile validation (M06 port)
- Order state transitions (append-only records)
- Order audit records (append-only, lifecycle events only)
- Configurable order record retention
- Optimistic concurrency via aggregateVersion
- Idempotent order creation (Idempotency-Key)
- Self-service and admin authorization
- REST APIs for order self-service and admin operations
- Web/mobile API clients

### 3.2 Explicit exclusions (A-09)

- Payment processing (Module 09)
- Shipping/logistics (Module 10)
- Notifications (Module 11)
- Cart behavior (Module 07 — M08 consumes the snapshot only)
- Product catalog management (Module 04)
- Inventory management (Module 05)
- Customer profile management (Module 06)
- Guest/anonymous checkout (deferred to Phase 2)
- Order modification after confirmation (M09 callback)

---

## 4. Domain model

### 4.1 Order aggregate root

The Order is the aggregate root keyed by `orderId`. Each order is owned by
exactly one customer profile (identical to M07 D-02). One order is created
from one CartSnapshot.

| Field               | Type             | Description                               |
| ------------------- | ---------------- | ----------------------------------------- |
| orderId             | UUIDv7           | Unique order identifier                   |
| customerProfileId   | UUIDv7           | Owner (logical reference to M06)          |
| snapshotId          | UUIDv7           | Reference to the originating CartSnapshot |
| cartId              | UUIDv7           | Reference to the originating Cart (M07)   |
| state               | OrderState       | Current lifecycle state                   |
| totalLines          | number           | Count of order lines                      |
| totalItems          | number           | Sum of quantities                         |
| subtotalAmountCents | number           | Subtotal in cents (from CartSnapshot)     |
| subtotalCurrency    | string           | Currency code                             |
| aggregateVersion    | AggregateVersion | Optimistic concurrency version            |
| createdAt           | DateTime         | Creation timestamp                        |
| updatedAt           | DateTime         | Last modification timestamp               |
| correlationId       | UUIDv7?          | Optional request correlation              |

### 4.2 OrderLine entity

Each OrderLine is owned by one Order. Lines are immutable after creation
(price revalidation happens at order creation time, not per-line mutation).

| Field               | Type     | Description                               |
| ------------------- | -------- | ----------------------------------------- |
| orderLineId         | UUIDv7   | Unique line identifier                    |
| orderId             | UUIDv7   | Parent order reference                    |
| cartLineId          | UUIDv7   | Reference to originating M07 CartLine     |
| skuId               | UUIDv7   | SKU identity (M04)                        |
| productId           | UUIDv7   | Product identity (M04)                    |
| skuCode             | string   | Human-readable SKU code                   |
| quantity            | number   | Ordered quantity                          |
| unitPriceAmount     | number   | Price at checkout (cents)                 |
| unitPriceCurrency   | string   | Currency code                             |
| snapshotTaxIncluded | boolean  | Whether price includes tax                |
| revalidated         | boolean  | Whether price was revalidated at checkout |
| createdAt           | DateTime | Creation timestamp                        |
| updatedAt           | DateTime | Last modification timestamp               |

### 4.3 OrderState value object

| State     | Description                                       | Terminal |
| --------- | ------------------------------------------------- | -------- |
| PENDING   | Order created from CartSnapshot, awaiting payment | No       |
| CONFIRMED | Payment received (M09 callback)                   | No       |
| PAID      | Payment verified and captured (M09 callback)      | No       |
| SHIPPED   | Shipping dispatched (M10 callback)                | No       |
| DELIVERED | Customer received (M10 callback)                  | Yes      |
| CANCELLED | Order cancelled (before payment or by admin)      | Yes      |
| CLOSED    | Order fully completed (after delivery)            | Yes      |

### 4.4 OrderSnapshot value object

An immutable snapshot of the CartSnapshot at order creation time. Stored
for audit and retention purposes. Identical structure to the input
CartSnapshot but with an Order-scoped snapshotId.

---

## 5. State machine

```
                    ┌──────────────┐
                    │   PENDING    │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
      ┌──────────┐  ┌──────────┐  ┌──────────┐
      │CONFIRMED │  │CANCELLED │  │CANCELLED │
      └────┬─────┘  └──────────┘  └──────────┘
           │            (from PENDING)  (from CONFIRMED)
           ▼
      ┌──────────┐
      │   PAID   │
      └────┬─────┘
           │
           ▼
      ┌──────────┐
      │ SHIPPED  │
      └────┬─────┘
           │
           ▼
      ┌──────────┐
      │DELIVERED │
      └────┬─────┘
           │
           ▼
      ┌──────────┐
      │  CLOSED  │
      └──────────┘
```

**Transition rules:**

- PENDING → CONFIRMED: M09 payment initiation callback
- PENDING → CANCELLED: Customer or admin cancellation
- CONFIRMED → PAID: M09 payment completion callback
- CONFIRMED → CANCELLED: Admin cancellation (pre-shipment)
- PAID → SHIPPED: M10 shipping dispatch callback
- SHIPPED → DELIVERED: M10 delivery confirmation callback
- DELIVERED → CLOSED: System or admin closure

All transitions are append-only state-transition records (per M06 D-08 pattern).

---

## 6. CartSnapshot consumption

### 6.1 Order creation from CartSnapshot

M08 receives the CartSnapshot from M07's `checkoutHandoff` endpoint. The
snapshot is the authoritative input for order creation.

**Order creation flow:**

1. Receive CartSnapshot reference (snapshotId)
2. Validate customer profile is ACTIVE (M06, fail closed)
3. Revalidate prices against M04 ProductCatalogReadPort (D-05)
4. Confirm inventory reservations with M05 InventoryReservationPort
5. Create Order aggregate with OrderLines derived from CartSnapshot items
6. Persist Order + OrderLines atomically
7. Append OrderCreated audit record
8. Return OrderId to caller

**Fail-closed behavior:**

- Unknown/missing CartSnapshot → deny (CART_NOT_FOUND equivalent)
- Customer profile not ACTIVE → deny (CART_CUSTOMER_NOT_FOUND equivalent)
- Price mismatch during revalidation → deny (CART_PRICE_MISMATCH equivalent)
- Inventory insufficient during confirmation → deny (CART_INVENTORY_INSUFFICIENT equivalent)
- Any internal error → deny (fail closed, no partial order)

---

## 7. Price revalidation

### 7.1 Rule (M07 D-05)

> "Revalidate at checkout (M08)."

At order creation time, M08 revalidates each line's unitPrice against the
current M04 sellingPrice. This ensures the customer pays the current
published price, not a stale snapshot.

### 7.2 Revalidation behavior

- **Exact match:** Order proceeds with the current M04 price
- **Price changed:** Order proceeds with the current M04 price (customer sees the updated price)
- **Product unpublished:** Order denied (CART_PRODUCT_UNAVAILABLE)
- **SKU unpublished:** Order denied (CART_SKU_UNAVAILABLE)
- **Product/SKU not found:** Order denied (CART_PRODUCT_NOT_FOUND)

The revalidated price replaces the snapshot price on the OrderLine. The
original CartSnapshot price is preserved in the OrderSnapshot for audit.

---

## 8. Inventory confirmation

### 8.1 Rule

At order creation time, M08 confirms inventory reservations with M05.
M07 already holds soft reservations (15-minute TTL). M08 converts these
to order-level allocations.

### 8.2 Confirmation behavior

- **All SKUs available:** Order proceeds; reservations converted to allocations
- **Any SKU insufficient:** Order denied; M07 reservations remain until TTL expiry
- **M05 port failure:** Order denied (fail closed)

---

## 9. Payment handoff boundary (M09)

### 9.1 Boundary

M08 creates orders in PENDING state. M09 (Payments) transitions orders
through CONFIRMED → PAID via callback.

**M08 provides M09:**

- OrderId
- CustomerProfileId
- SubtotalAmountCents + SubtotalCurrency
- OrderLines (SKU, quantity, unit price)

**M09 provides M08:**

- Payment initiation callback (PENDING → CONFIRMED)
- Payment completion callback (CONFIRMED → PAID)
- Payment failure/timeout (CONFIRMED → CANCELLED)

**M08 never:**

- Initiates payment
- Stores payment tokens
- Processes refunds
- Handles payment failures directly

---

## 10. Shipping handoff boundary (M10)

### 10.1 Boundary

M08 provides order details to M10 (Shipping & Logistics) after payment
confirmation (PAID state). M10 transitions orders through SHIPPED → DELIVERED.

**M08 provides M10:**

- OrderId
- CustomerProfileId
- OrderLines
- Shipping address (from M06 CustomerProfile)

**M10 provides M08:**

- Shipping dispatch callback (PAID → SHIPPED)
- Delivery confirmation callback (SHIPPED → DELIVERED)

**M08 never:**

- Manages shipping carriers
- Calculates shipping costs
- Tracks shipments
- Handles delivery exceptions

---

## 11. Ownership and security model

### 11.1 Ownership (M07 D-02 pattern)

- One order belongs to exactly one customer profile (customerProfileId)
- Customer-identity ownership resolver (M06 fourth scope)
- Server-side ownership verification (never client-supplied)
- Cross-customer isolation enforced by ownership resolver

### 11.2 Authorization

- Self-service: order.read, order.create (customer-identity-scoped)
- Admin: order.admin.read, order.admin.manage (admin scope)
- Deny by default; explicit grants only; no wildcards
- Fail-closed on authorization dependency failure

### 11.3 Rate limits

- Self-service reads: 60/hour per identity
- Self-service mutations: 120/hour per identity
- Admin: 50/hour per identity
- Isolated from M06/M07 rate-limit buckets

---

## 12. Concurrency and idempotency

### 12.1 Concurrency (M07 D-16 pattern)

- Optimistic locking via `aggregateVersion` on Order aggregate root
- Every mutation checks and increments the version
- Stale version → CONFLICT error

### 12.2 Idempotency (M07 D-17 pattern)

- `createOrder` requires Idempotency-Key header
- Replay of completed order creation returns cached success response
- Follows M01 A-09 pattern exactly

---

## 13. Audit and history

### 13.1 Audit records (M07 D-11 pattern)

Append-only OrderAuditRecord for lifecycle events only:

- ORDER_CREATED
- ORDER_CONFIRMED (payment initiated)
- ORDER_PAID
- ORDER_SHIPPED
- ORDER_DELIVERED
- ORDER_CANCELLED
- ORDER_CLOSED

Do NOT record every price revalidation or inventory check as a separate
audit entry.

### 13.2 State transitions (M07 D-07 pattern)

Append-only OrderStateTransition records for every state change.

### 13.3 Retention

Configurable per record category (ORDER_RECORD_RETENTION_DAYS).
Default: owner-resolved per M07 D-11 precedent.
Legal/Compliance review deferred to deployment-time configuration.

---

## 14. Non-disclosing errors

All error codes are internal and non-disclosing. Presentation layers map
them to generic HTTP responses. No policy, ownership, inventory, or pricing
internals are ever exposed to clients.

---

## 15. Architecture principles

| Principle                            | Reference |
| ------------------------------------ | --------- |
| Cross-module storage isolation       | A-03      |
| Logical UUIDv7 references only       | A-03/A-05 |
| Fail-closed authorization            | A-05      |
| Append-only audit/transition records | A-06      |
| Forward-only additive migrations     | A-07      |
| Configurable rate limiting           | A-08      |
| Separate module boundaries           | A-09      |
| No independent authentication        | Module 01 |
| Module 02 exclusive authorization    | A-02      |

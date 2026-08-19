# WALRUS Enterprise Marketplace Platform

## Module 08 — Checkout & Order Lifecycle Decision and Approval Register

**Document ID:** WEMP-M08-DECISIONS-001
**Version:** Review Draft 1.0
**Status:** DRAFT — NOT YET AUTHORIZED
**Effective date:** 2026-08-19 (M08 planning)
**Classification:** Confidential — Internal Use Only

> Every business/security decision required by Module 08 is recorded here.
> Each decision is either **APPROVED FROM EXISTING ARCHITECTURE** (binding
> source cited), **RESOLVED — ARCHITECTURE-SUPPORTED DEFAULT** (safest
> default derivable from approved Module 00–07 architecture), or
> **OWNER-APPROVED** (decision resolved by the owner's explicit selection,
> recorded with its date in §5).

---

## 1. APPROVED FROM EXISTING ARCHITECTURE (binding)

| ID   | Decision                                                                                                                                                                                | Binding source                                                     |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| A-01 | Module 08 — Orders is a named future module in the approved landscape; it receives the immutable CartSnapshot from Module 07 and creates an Order aggregate                               | Module 01 v1.12 §6; Module 07 A-01/A-09                           |
| A-02 | Order permissions are determined exclusively by Module 02; Module 08 implements no authorization engine, roles, or permission checks                                                     | Module 01 v1.12 §6; Module 07 A-02                                 |
| A-03 | Cross-module storage isolation: no cross-module FKs; logical UUIDv7 references; integration through approved ports; Module 08 never reads Module 04/05/06/07 storage directly            | Module 01 Part 7.3 §12; A-05/A-06 precedent                        |
| A-04 | Permission identifiers use immutable `resource.action`; no wildcards; deny-by-default; explicit-deny precedence; fail closed                                                            | WEMP-M02-SPEC-001 §4, §14; Module 04/05/06/07 precedent            |
| A-05 | AAL2 session guard precedes the Module 02 permission guard; no anonymous order API; no client-side authorization decisions                                                               | Module 01/02 guard chain; Module 03/04/05/06/07 precedent          |
| A-06 | Idempotency reuses `ApiIdempotencyRecord` on all mutations; optimistic concurrency via `aggregateVersion` on all mutations; append-only transition/audit records; non-disclosing errors | Module 03 §12; Module 04 D-15/D-16; Module 05 A-11; Module 06 D-11; Module 07 D-16 |
| A-07 | Forward-only additive migrations; no Module 00–07 table modified                                                                                                                        | ADR-006; Module 02/03/04/05/06/07 migration patterns               |
| A-08 | Rate limiting per the recorded production policy classes until a Module 08-specific policy is approved (Security/Platform authority to confirm at the M08-M5 gate)                      | Module 04 D-15; Module 05 D-11; Module 06 D-10; Module 07 D-10    |
| A-09 | Shopping cart (07), orders (08), payments (09), shipping & logistics (10) are separate future modules; M08 must not implement payment/shipping behavior                                 | Module 04 §27; Module 05 §26; Module 06 §20; Module 07 A-09        |
| A-10 | Module 06 exposes `CustomerProfileReadPort` for M08 consumption; only ACTIVE profiles resolve (fail closed)                                                                             | Module 06 D-13; WEMP-M06-SPEC-001 §11                              |
| A-11 | Module 04 exposes `ProductCatalogReadPort.getConsumableProductFacts` and `getConsumableSkuFacts` for M08 consumption; PUBLISHED-only visibility gate                                    | Module 04 D-08/D-12; WEMP-M04-SPEC-001 §5                          |
| A-12 | Module 05 exposes `InventoryReservationPort.reserve/release` for M08 consumption; fail-closed; reservation with TTL                                                                     | Module 05 D-06; WEMP-M05-SPEC-001 §7/§11.1                         |
| A-13 | Mobile admin is excluded; one Flutter app with isolated features                                                                                                                        | ADR-016                                                            |

---

## 2. Decision resolutions (D-01 … D-13)

| ID   | Decision                                         | Resolution         | Adopted default / required owner input                                                                                                                                                                                                                                                                                                                                                                 | Authority for default / gate                                                                        |
| ---- | ------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| D-01 | Order lifecycle state machine                    | **OWNER-APPROVED** | **Seven states: PENDING, CONFIRMED, PAID, SHIPPED, DELIVERED, CANCELLED, CLOSED.** PENDING = order created from CartSnapshot awaiting payment. CONFIRMED = payment initiated (M09 callback). PAID = payment verified (M09 callback). SHIPPED = shipping dispatched (M10 callback). DELIVERED = customer received (M10 callback). CANCELLED = cancelled before delivery. CLOSED = fully completed. Terminal states: DELIVERED, CANCELLED, CLOSED. **Gate: M08-M1 (domain).** | Owner input; Module 07 D-07 lifecycle precedent; Module 06 D-08 transition pattern                 |
| D-02 | Order ownership model                             | **OWNER-APPROVED** | **One order belongs to exactly one customer profile (customerProfileId).** Identical to M07 D-02 ownership model. CartSnapshot carries customerProfileId; order inherits it. Cross-customer isolation enforced by the customer-identity ownership resolver (M06 fourth scope). **Gate: M08-M1 (domain).**                                                                                                                                                            | Owner input; Module 07 D-02 precedent; Module 06 D-02/D-13 precedent                               |
| D-03 | Price revalidation at checkout                    | **OWNER-APPROVED** | **Revalidate each line's unitPrice against current M04 sellingPrice at order creation time.** Exact price from M04 replaces snapshot price on OrderLine. Original CartSnapshot price preserved in OrderSnapshot for audit. Product/SKU unpublished → deny order. Price mismatch → proceed with current M04 price (customer sees updated price). **Gate: M08-M3 (application).**                                                                                      | Owner input; Module 07 D-05 ("Revalidate at checkout (M08)"); Module 04 D-07 pricing boundary       |
| D-04 | Inventory confirmation at checkout                | **OWNER-APPROVED** | **Confirm all SKU reservations with M05 at order creation time.** M07 holds soft reservations (15-minute TTL). M08 converts these to order-level allocations. Any SKU insufficient → deny order (fail closed). M05 port failure → deny order. **Gate: M08-M3 (application).**                                                                                                                                                                                        | Owner input; Module 07 D-06 reservation wiring; Module 05 D-06                                      |
| D-05 | Payment handoff boundary                          | **OWNER-APPROVED** | **M08 creates PENDING orders. M09 (Payments) transitions PENDING → CONFIRMED → PAID via callback.** M08 provides OrderId, CustomerProfileId, SubtotalAmount, OrderLines. M09 provides payment initiation/completion callbacks. M08 never initiates payment, stores tokens, processes refunds, or handles failures. **Gate: M08-M1 (domain) / M08-M5 (APIs).**                                                                                                        | Owner input; A-09 module boundary; Module 09 scope definition                                       |
| D-06 | Shipping handoff boundary                         | **OWNER-APPROVED** | **M08 provides order details to M10 (Shipping) after payment confirmation (PAID). M10 transitions PAID → SHIPPED → DELIVERED via callback.** M08 provides OrderId, CustomerProfileId, OrderLines, Shipping address. M10 provides shipping dispatch/delivery callbacks. M08 never manages carriers, calculates costs, tracks shipments, or handles exceptions. **Gate: M08-M1 (domain) / M08-M5 (APIs).**                                                               | Owner input; A-09 module boundary; Module 10 scope definition                                       |
| D-07 | Order record retention                            | **OWNER-APPROVED** | **Configurable per record category (ORDER_RECORD_RETENTION_DAYS).** Default: owner-resolved per M07 D-11 precedent. Applies to OrderStateTransition and OrderAuditRecord. Legal/Compliance review deferred to deployment-time configuration. **Gate: M08-M2 (persistence).**                                                                                                                                                                                         | Owner input; Module 07 D-11 precedent; Module 03 D-03 retention architecture                       |
| D-08 | Order permission catalog                          | **OWNER-APPROVED** | **Self-service: `order.read`, `order.create`. Admin: `order.admin.read`, `order.admin.manage`.** Self-service enforced by customer-identity ownership resolver (M06 fourth scope). Admin enforced by admin scope. No role-only bypass, no hidden SUPER_ADMIN bypass, no wildcard. **Gate: M08-M4 (authorization).**                                                                                                                                                 | Owner input; Module 07 D-09 permission catalog pattern; Module 06 D-07/A-07 precedent               |
| D-09 | Module 02 authorization sign-off                  | **OWNER-APPROVED** | **Additive `order.*` permission identifiers.** Non-weakening sign-off required from Module 02 owner. Identical pattern to M07 D-09. **Gate: M08-M4 (authorization).**                                                                                                                                                                                                                                                                                             | Owner input; Module 02 §13.2 ownership resolvers; Module 07 D-09 precedent                          |
| D-10 | Rate-limit classes                                | **OWNER-APPROVED** | **order.read: 60/hour (self), 50/hour (admin). order.mutation (create): 120/hour (self), 50/hour (admin).** Keyed by identity (self-service) and identityId (admin), isolated from M06/M07 buckets. **Gate: M08-M5 (APIs — Security/Platform sign-off).**                                                                                                                                                                                                         | Owner input; Module 07 D-10; Module 06 D-10; Module 05 D-11; **Security/Platform confirmation required** |
| D-11 | Order concurrency model                           | **OWNER-APPROVED** | **Optimistic locking via `aggregateVersion` on the Order aggregate root, identical to M07 D-16.** Every mutation checks and increments the version. Conflicts return CONFLICT error. **Gate: M08-M2 (persistence).**                                                                                                                                                                                                                                                | Owner input; Module 07 D-16; Module 06 D-11; Module 05 D-07                                        |
| D-12 | Order idempotency behavior                        | **OWNER-APPROVED** | **Idempotency-Key header required on: createOrder (POST).** Naturally idempotent operations: readOrder, listOrders. Replay of completed order creation returns cached success response. Follows M01 A-09 pattern exactly. **Gate: M08-M3 (application).**                                                                                                                                                                                                            | Owner input; Module 07 D-17; Module 01 A-09; Module 06 D-11                                        |
| D-13 | Order maximum size                                | **OWNER-APPROVED** | **Max 50 lines per order. Max 100 total items (sum of quantities across all lines). Both configurable.** Prevents abuse; generous for normal checkout. Identical to M07 D-18. **Gate: M08-M1 (domain).**                                                                                                                                                                                                                                                             | Owner input; Module 07 D-18; D-03 economic-unit convention                                          |

---

## 3. Recording of approvals

Sign the approval statement in the Module 08 approval pack (WEMP-M08-APPROVAL-001 §5).
Upon signature, all **RESOLVED** and **OWNER-APPROVED** decisions become BINDING
for Module 08 implementation; **OWNER** items remain conditions on the
milestones listed. Unapproved decisions remain non-implementable.

---

## 4. Milestone gating after approval

| Milestone                          | Gate                                                                                   |
| ---------------------------------- | -------------------------------------------------------------------------------------- |
| M08-M1 Domain Foundation           | Owner approval (D-01/D-02/D-04/D-05/D-06/D-13)                                        |
| M08-M2 Persistence                 | M08-M1 complete + D-07/D-11 decisions                                                  |
| M08-M3 Application Services        | M08-M2 complete + D-03/D-04/D-12 decisions + M04/M05/M06 ports available                |
| M08-M4 Authorization & Integration | M08-M3 complete + D-08/D-09 + Module 02 owner sign-off                                 |
| M08-M5 APIs & Web/Mobile           | M08-M4 complete + D-10 Security/Platform rate-limit confirmation                       |

---

## 5. Final owner approval statement (sign to authorize)

*To be signed upon M08 planning review completion.*

---

## 6. External-authority sign-off record

| Condition                                     | Required from     | Status                                                | Date |
| --------------------------------------------- | ----------------- | ----------------------------------------------------- | ---- |
| `order.*` permission identifiers (D-09)       | Module 02 owner   | **PENDING — NOT RECORDED**                            | —    |
| D-10 rate-limit values (60/120/50)            | Security/Platform | **PENDING — NOT RECORDED**                            | —    |
| D-11 retention durations (order audit)        | Owner-resolved    | **PENDING — NOT RECORDED** (configurable, per M07 D-11 precedent) | —    |

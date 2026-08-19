# WALRUS Enterprise Marketplace Platform

## Module 07 — Shopping Cart Decision and Approval Register

**Document ID:** WEMP-M07-DECISIONS-001
**Version:** Review Draft 1.0
**Status:** OWNER-APPROVED (D-01…D-18) — signed by the Product/Architecture
Owner 2026-08-18. M07-M1…M07-M3 authorized 2026-08-18.
**Effective date:** 2026-08-18 (M07-M1…M07-M3)
**Classification:** Confidential — Internal Use Only

> Every business/security decision required by Module 07 is recorded here.
> Each decision is either **APPROVED FROM EXISTING ARCHITECTURE** (binding
> source cited), **RESOLVED — ARCHITECTURE-SUPPORTED DEFAULT** (safest
> default derivable from approved Module 00–06 architecture), or
> **OWNER-APPROVED** (decision resolved by the owner's explicit selection,
> recorded with its date in §5).

---

## 1. APPROVED FROM EXISTING ARCHITECTURE (binding)

| ID   | Decision                                                                                                                                                                                | Binding source                                                     |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| A-01 | Module 07 — Shopping Cart is a named future module in the approved landscape; it owns the customer's active shopping cart and hands off an immutable snapshot to Module 08 Orders       | Module 01 v1.12 §6; Module 04 §27; Module 05 §26; A-13             |
| A-02 | Cart permissions are determined exclusively by Module 02; Module 07 implements no authorization engine, roles, or permission checks                                                     | Module 01 v1.12 §6; Module 06 A-02 precedent                       |
| A-03 | Cross-module storage isolation: no cross-module FKs; logical UUIDv7 references; integration through approved ports; Module 07 never reads Module 04/05/06 storage directly              | Module 01 Part 7.3 §12; A-05/A-06 precedent                        |
| A-04 | Permission identifiers use immutable `resource.action`; no wildcards; deny-by-default; explicit-deny precedence; fail closed                                                            | WEMP-M02-SPEC-001 §4, §14; Module 04/05/06 D-11/D-07 precedent     |
| A-05 | AAL2 session guard precedes the Module 02 permission guard; no anonymous cart API; no client-side authorization decisions                                                               | Module 01/02 guard chain; Module 03/04/05/06 precedent             |
| A-06 | Idempotency reuses `ApiIdempotencyRecord` on all mutations; optimistic concurrency via `aggregateVersion` on all mutations; append-only transition/audit records; non-disclosing errors | Module 03 §12; Module 04 D-15/D-16; Module 05 A-11; Module 06 D-11 |
| A-07 | Forward-only additive migrations; no Module 00–06 table modified                                                                                                                        | ADR-006; Module 02/03/04/05/06 migration patterns                  |
| A-08 | Rate limiting per the recorded production policy classes until a Module 07-specific policy is approved (Security/Platform authority to confirm at the M07-M5 gate)                      | Module 04 D-15; Module 05 D-11; Module 06 D-10                     |
| A-09 | Shopping cart (07), orders (08), payments (09), shipping & logistics (10) are separate future modules; M07 must not implement order/payment/shipping behavior                           | Module 04 §27; Module 05 §26; Module 06 §20; A-13                  |
| A-10 | Module 06 exposes `CustomerProfileReadPort` and `CustomerReference` for M07 consumption; only ACTIVE profiles resolve (fail closed)                                                     | Module 06 D-13; WEMP-M06-SPEC-001 §11                              |
| A-11 | Module 04 exposes `ProductCatalogReadPort.getConsumableProductFacts` and `getConsumableSkuFacts` for M07 consumption; PUBLISHED-only visibility gate                                    | Module 04 D-08/D-12; WEMP-M04-SPEC-001 §5                          |
| A-12 | Module 05 exposes `InventoryReservationPort.reserve/release` for M07 consumption; fail-closed; reservation with TTL                                                                     | Module 05 D-06; WEMP-M05-SPEC-001 §7/§11.1                         |
| A-13 | Mobile admin is excluded; one Flutter app with isolated features                                                                                                                        | ADR-016                                                            |

## 2. Decision resolutions (D-01 … D-18)

| ID   | Decision                                         | Resolution         | Adopted default / required owner input                                                                                                                                                                                                                                                                                                                                                                 | Authority for default / gate                                                                        |
| ---- | ------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| D-01 | Scope / MVP surface                              | **OWNER-APPROVED** | **Authenticated customer cart only. Guest cart deferred to Phase 2.** No anonymous carts; every cart associates with an authenticated customer profile. Guest cart complexity (session management without identity, merge on login) is explicitly deferred. **Gate: M07-M1 (domain).**                                                                                                                 | Owner input 2026-08-18; A-01/A-09                                                                   |
| D-02 | Cart ownership model                             | **OWNER-APPROVED** | **One active cart per customer profile (customerProfileId).** Cart is the aggregate root keyed by `customerProfileId`. The customer profile (M06 D-13) is the commerce identity. One-per-profile prevents proliferation, simplifies M08 orders, makes ownership resolution identical to M06. Cross-customer isolation enforced by the customer-identity ownership resolver. **Gate: M07-M1 (domain).** | Owner input 2026-08-18; Module 06 D-02/D-13 precedent                                               |
| D-03 | Line-unit identity (line uniqueness within cart) | **OWNER-APPROVED** | **SKU-level (skuId is the uniqueness key within a cart).** Product/productType are metadata, not part of the identity. Same-SKU adds aggregate quantity. Variant/attribute metadata snapshotted for display but not part of the uniqueness key. **Gate: M07-M1 (domain).**                                                                                                                             | Owner input 2026-08-18; Module 04 D-08/D-12; Module 05 D-06                                         |
| D-04 | Quantity constraints                             | **OWNER-APPROVED** | **min 1, max 100 per line, max 50 lines per cart, max 100 total items (sum of quantities). All configurable. Zero quantity = remove the line (not store zero).** Prevents abuse while being generous for normal shopping. Configurable allows tuning per environment. **Gate: M07-M1 (domain).**                                                                                                       | Owner input 2026-08-18; D-03 economic-unit convention                                               |
| D-05 | Price snapshot behavior                          | **OWNER-APPROVED** | **Snapshot M04 sellingPrice (cents, inclusive of tax per D-07) at add-time. Store as `unitPriceAmount` + `currencyCode` + `snapshotTaxIncluded`. Revalidate at checkout (M08). Prohibit client-supplied authoritative prices (server-side only, per M04 D-07).** Snapshot prevents price surprise; revalidation at checkout ensures accuracy. **Gate: M07-M1 (domain).**                               | Owner input 2026-08-18; Module 04 D-07 pricing boundary                                             |
| D-06 | Inventory reservation wiring                     | **OWNER-APPROVED** | **Reserve at add-to-cart (quantity change = adjust delta reservation). Release on cart clear, line remove, cart expiry, or checkout handoff. Use M05 InventoryReservationPort with 15-minute TTL. Validate availability before reserving; fail closed if insufficient.** Prevents overselling during the shopping session. **Gate: M07-M2 (persistence) / M07-M3 (application).**                      | Owner input 2026-08-18; Module 05 D-06/A-16                                                         |
| D-07 | Cart lifecycle / expiry                          | **OWNER-APPROVED** | **ACTIVE → CHECKED_OUT (M08 handoff) → ARCHIVED (retention). AUTO_EXPIRED (abandoned, 30-day TTL).** Transitions are append-only state-transition records (per M06 D-08 pattern). 30-day TTL configurable. Reservations released on every terminal state. **Gate: M07-M1 (domain) / M07-M3 (application).**                                                                                            | Owner input 2026-08-18; Module 06 D-02/D-08 precedent                                               |
| D-08 | Checkout handoff boundary                        | **OWNER-APPROVED** | **M07 creates an immutable CartSnapshot (full cart contents, price snapshots, totals, line metadata) and passes the snapshot reference to M08. M08 consumes the snapshot, not the live cart. M07 marks the cart as CHECKED_OUT.** Clean module boundary; immutable handoff prevents race conditions. **Gate: M07-M1 (domain) / M07-M3 (application).**                                                 | Owner input 2026-08-18; A-09 cross-module contract pattern                                          |
| D-09 | Permission catalog (cart.*)                      | **OWNER-APPROVED** | **Self-service: `cart.read`, `cart.item.add`, `cart.item.update`, `cart.item.remove`, `cart.clear`. Admin: `cart.admin.read`, `cart.admin.manage`.** Self-service enforced by customer-identity ownership resolver (M06 fourth scope). Admin enforced by `customer.*` admin scope. No role-only bypass, no hidden SUPER_ADMIN bypass, no wildcard. **Gate: M07-M4 (authorization).**                        | Owner input 2026-08-18; Module 06 D-07/A-07 precedent; **Module 02 owner sign-off required**        |
| D-10 | Rate-limit classes                               | **OWNER-APPROVED** | **cart.read: 60/hour (self), 50/hour (admin). cart.mutation (add/update/remove/clear): 120/hour (self), 50/hour (admin).** Keyed by identity (self-service) and identityId (admin), isolated from M06 buckets. **Gate: M07-M5 (APIs — Security/Platform sign-off).**                                                                                                                                   | Owner input 2026-08-18; Module 06 D-10; Module 05 D-11; **Security/Platform confirmation required** |
| D-11 | Audit scope                                      | **OWNER-APPROVED** | **Lifecycle events only (cart created, item added, item removed, cart checked out, cart expired). Do NOT record every quantity update as a separate audit entry. Retention: 90 days (configurable). Append-only records per M06 D-08 pattern. No PII beyond identity and cart reference.** **Gate: M07-M2 (persistence) / M07-M3 (application).**                                                      | Owner input 2026-08-18; Module 06 D-08/D-09; **Owner-resolved 2026-08-19** (D-15/M06 precedent; configurable 90-day default; Legal/Compliance deferred to deployment-time) |
| D-12 | Product deactivation behavior                    | **OWNER-APPROVED** | **Item remains visible in cart with "product unavailable" flag. Item CANNOT proceed to checkout (M08 blocks it). Product not silently removed — customer sees why they can't check out.** **Gate: M07-M3 (application).**                                                                                                                                                                              | Owner input 2026-08-18; UX best practice                                                            |
| D-13 | SKU deactivation behavior                        | **OWNER-APPROVED** | **Same as D-12 (visible + blocked at checkout). If SKU is completely deleted from M04 (not just soft-deactivated), auto-remove from cart and record the removal in audit.** Different treatment for soft deactivation vs. hard deletion. **Gate: M07-M3 (application).**                                                                                                                               | Owner input 2026-08-18; Module 04 D-12                                                              |
| D-14 | Minimum order value                              | **OWNER-APPROVED** | **No minimum order value in Phase 1.** Can be added later as additive feature without breaking changes. **Gate: N/A — no enforcement in Phase 1.**                                                                                                                                                                                                                                                     | Owner input 2026-08-18                                                                              |
| D-15 | Cart merge on login                              | **OWNER-APPROVED** | **Deferred entirely — no guest carts in Phase 1, no merge needed.** If guest cart added in Phase 2, merge strategy is a Phase 2 decision. **Gate: N/A — deferred.**                                                                                                                                                                                                                                    | Owner input 2026-08-18; D-01 scope control                                                          |
| D-16 | Concurrency model                                | **OWNER-APPROVED** | **Optimistic locking via `aggregateVersion` on the Cart aggregate root, identical to M06 CustomerProfile.** Every mutation checks and increments the version. Conflicts return CONFLICT error. Inventory race conditions handled by M05's InventoryReservationPort (server-side atomic reserve/release). **Gate: M07-M2 (persistence) / M07-M3 (application).**                                        | Owner input 2026-08-18; Module 06 D-11; Module 05 D-07                                              |
| D-17 | Idempotency behavior                             | **OWNER-APPROVED** | **Idempotency-Key header required on: addItem (POST), clearCart (POST).** Update-quantity and remove-item are naturally idempotent (setting quantity 5 is idempotent; removing line X is idempotent). Replay of completed operations returns cached success response. Follows M01 A-09 pattern exactly. **Gate: M07-M3 (application).**                                                                | Owner input 2026-08-18; Module 01 A-09; Module 06 D-11                                              |
| D-18 | Maximum cart size                                | **OWNER-APPROVED** | **Max 50 lines per cart. Max 100 total items (sum of quantities across all lines). Both configurable.** Prevents abuse (memory, processing), generous for normal shopping. **Gate: M07-M1 (domain).**                                                                                                                                                                                                  | Owner input 2026-08-18                                                                              |

## 3. Recording of approvals

Sign the approval statement in the Module 07 approval pack (WEMP-M07-APPROVAL-001 §5).
Upon signature, all **RESOLVED** and **OWNER-APPROVED** decisions become BINDING
for Module 07 implementation; **OWNER** items remain conditions on the
milestones listed. Unapproved decisions remain non-implementable.

## 4. Milestone gating after approval

| Milestone                          | Gate                                                                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M07-M1 Domain Foundation           | ✓ **SATISFIED** — §5 approval signed 2026-08-18 (D-01/D-02/D-03/D-04/D-05/D-06/D-07/D-08 owner-approved) — **M07-M1 authorized 2026-08-18**            |
| M07-M2 Persistence                 | ✓ **SATISFIED** — §5 approval signed 2026-08-18; D-06/D-11 OWNER-APPROVED (retention configurable per D-11) — **M07-M2 authorized 2026-08-18**          |
| M07-M3 Application Services        | ✓ **SATISFIED** — §5 approval signed 2026-08-18; D-06/D-07/D-08/D-12/D-13/D-17 OWNER-APPROVED — **M07-M3 authorized 2026-08-18**                      |
| M07-M4 Authorization & Integration | ✓ **SATISFIED** — §5 approval signed 2026-08-18; Module 02 owner sign-off (D-09, **RECORDED 2026-08-19**) — **M07-M4 authorized 2026-08-19**                        |
| M07-M5 APIs & Web/Mobile           | ✓ **SATISFIED** — §5 approval signed 2026-08-18; Module 02 sign-off (D-09, **RECORDED 2026-08-19**); Security/Platform D-10 confirmation (D-10, **RECORDED 2026-08-19**) — **M07-M5 authorized 2026-08-19** |

## 5. Final owner approval statement (sign to authorize)

**Signed — Product/Architecture Owner, 2026-08-18 (authorizes M07-M1…M07-M3)**

Date: 2026-08-18

> **Sign-off scope (recorded):** the §5 signature authorizes milestones
> M07-M1 (Domain Foundation), M07-M2 (Persistence), and M07-M3 (Application
> Services). Milestones M07-M4 and M07-M5 are authorized via subsequent
> sign-offs (D-09 recorded 2026-08-19; D-10 recorded 2026-08-19).

Signed (Product/Architecture Owner): ✓ **SIGNED — Product/Architecture
Owner, 2026-08-18 (authorizes M07-M1…M07-M3)**

## 6. External-authority sign-off record

| Condition                                     | Required from     | Status                                                | Date |
| --------------------------------------------- | ----------------- | ----------------------------------------------------- | ---- |
| `cart.*` permission identifiers (D-09)        | Module 02 owner   | **RECORDED 2026-08-19** — additive non-weakening sign-off (D-09) | 2026-08-19 |
| D-10 rate-limit values (60/120/50)            | Security/Platform | **RECORDED 2026-08-19** — 60/120/50 per hour confirmed; cart buckets isolated from M06 | 2026-08-19 |
| D-11 retention durations (cart audit, 90-day) | Owner-resolved   | **RECORDED 2026-08-19** — owner-resolved per D-15/M06 precedent; configurable 90-day default; Legal/Compliance review deferred to deployment-time configuration | 2026-08-19 |

> **Sign-off record (2026-08-19):** the §5 signatures authorize **M07-M1
> through M07-M5**. The Module 02 owner sign-off for the additive `cart.*`
> permission catalog is **RECORDED 2026-08-19** (D-09). The
> Security/Platform D-10 rate-limit confirmation is **RECORDED 2026-08-19**
> (D-10: 60/120/50 per hour, cart buckets isolated from M06). D-11
> retention durations are **OWNER-RESOLVED 2026-08-19** (90-day configurable
> default; Legal/Compliance review deferred to deployment-time configuration
> per M06 D-15 precedent).

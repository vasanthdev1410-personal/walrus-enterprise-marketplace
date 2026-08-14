# WALRUS Enterprise Marketplace Platform

## Module 04 — Product Catalog Cross-Module Contracts

**Document ID:** WEMP-M04-CONTRACT-001
**Version:** Review Draft 1.0
**Status:** APPROVED — signed by the Product/Architecture Owner 2026-08-14
**Effective date:** 2026-08-14
**Classification:** Confidential — Internal Use Only

> Companion to WEMP-M04-SPEC-001. This document defines the contract shapes
> Module 04 must satisfy: the Module 03 ↔ Module 04 seller/product boundary
> (binding facts from the approved Module 03 package), the Module 02 ↔
> Module 04 authorization boundary (proposed), and the Module 04 ↔ Module 05
> inventory boundary (proposed shape only — Module 05 has no approved
> specification). No contract here authorizes implementation.

---

## Part A — Module 03 ↔ Module 04: Seller and Product Association

### A.1 Binding facts

- A verified, approved, and role-assigned seller may list products
  (WEMP-M03-SPEC-001 §6). Product catalog capabilities belong to future
  module 04 (WEMP-M03-SPEC-001 §2.2).
- Module 03 owns seller profiles, organizations, onboarding, verification,
  warehouses, agreements, and seller business status. Module 04 never
  receives, stores, or derives seller credentials, MFA, recovery material, or
  Session data (Module 01 rules apply unchanged).
- Cross-module storage isolation: no cross-module foreign keys; Module 04
  never reads Module 03 storage and vice versa (approved Module 01 Part 7.3
  §12; Module 02/03 implementation rules).
- Seller permissions are determined exclusively by Module 02.

### A.2 Product ownership scope (proposed)

- Every product belongs to exactly one seller organization, referenced by the
  seller's `sellerProfileId` (logical UUIDv7 reference, no FK).
- The Module 02 ownership resolver (Module 03 precedent, decision D-11)
  resolves the caller's ACTIVE `SellerIdentityAssociation` to the target
  seller organization; Module 04 owns the product facts, Module 02 evaluates
  scope. This is the second ownership resolver and requires explicit Module 02
  owner approval (WEMP-M04-AUTHZ-001).
- A seller organization may only manage products it owns; cross-seller access
  denies (fail closed).

### A.3 Listing gate (proposed)

- `product.create` and catalog mutations require the seller organization to
  have an approved, role-assigned seller (Module 03 `APPROVED → ACTIVE`
  gate). Module 04 validates eligibility through the approved Module 02/03
  contract facts; it never duplicates seller state. **OWNER DECISION
  REQUIRED:** exact eligibility recheck rules (e.g., whether suspension
  blocks catalog mutations — the Module 03 identity-effect matrix precedent
  suggests fail-closed denial).

### A.4 Warehouse reference (proposed)

- Module 03 owns warehouses (`SellerWarehouse`, decision D-09, no activation
  gate in Phase 1). **OWNER DECISION REQUIRED:** whether products must
  reference a warehouse or location in Module 04 Phase 1, or whether that
  association belongs to Module 05 inventory (proposed: Module 05, so Module
  04 Phase 1 stores no warehouse reference).

---

## Part B — Module 02 ↔ Module 04: PRODUCT Authorization

### B.1 Binding facts

- The `SELLER`, `ADMIN`, and `SUPER_ADMIN` roles exist in the Module 02
  `RoleName` enum. No `product.*` or `catalog.*` permission exists in the
  approved catalog.
- "Future business permissions belong to their owning business-module
  specifications" (WEMP-M02-SPEC-001 §5). Module 04 is that owner for the
  product catalog.
- Module 02 is the single authorization authority; Module 04 must not
  implement its own authorization engine.

### B.2 Required Module 02 changes (all PROPOSED — WEMP-M04-AUTHZ-001)

1. Add the proposed `product.*`/`catalog.*` permission identifiers to the
   Module 02 permission catalog and grant them to the `SELLER` role
   (self-service, organization-scoped) and the proposed moderation
   permissions to `ADMIN`/`SUPER_ADMIN`.
2. Extend the ownership-resolver contract to the product resource scope
   (second resolver), evaluated against the seller organization established
   by `SellerIdentityAssociation`.
3. Keep deny-by-default, explicit-deny precedence, administrative scope, and
   fail-closed behavior unchanged.

### B.3 Contract boundaries (proposed)

- Module 04 never reads Module 02 storage directly; every authorization
  decision goes through the permission guard and ownership resolver.
- Module 02 never reads Module 04 storage; the resolver receives an opaque
  product/seller reference from the authenticated context and returns the
  organization-scope decision through the approved contract port.
- Authorization decision audit remains in Module 02. Module 04 business
  audit (`ProductAuditRecord`) never records roles, permissions, or policy
  internals.

### B.4 Fail-closed behavior

Any failure in the ownership resolver, association lookup, role catalog,
permission evaluation, or mandatory audit denies the operation.

---

## Part C — Module 04 ↔ Module 05: Inventory Boundary

### C.1 Status

**RESOLVED — OWNER-APPROVED (2026-08-14, decision D-08, option A):**
Module 04 is definition-only and stores no stock data; the inventory contract
port is fail-closed (returns no availability) until an approved Module 05
specification adopts the boundary. Module 05 – Inventory Management has **no
approved specification**; the exact contract shape becomes normative when that
specification is approved.

### C.2 Adopted split

- **Module 04 owns:** product/variant/SKU definition, catalog lifecycle,
  pricing definition data, media references, moderation state.
- **Module 05 owns (proposed):** stock levels, availability, reservations,
  stock movements, and warehouse/location stock association.
- Module 04 exposes SKU facts (sellable-unit references) that Module 05
  consumes; Module 05 exposes availability/stock that trading modules
  (07/08) consume. Neither reads the other's storage.

### C.3 Proposed contract port

- `ProductInventoryContractPort` (Module 04 application port): queries the
  approved Module 05 contract for a SKU's availability; returns fail-closed
  (`unavailable`) today.
- No Module 04 table persists stock quantities. **RESOLVED — OWNER-APPROVED
  (2026-08-14, decision D-08, option A):** the exact Module 04 ↔ Module 05
  contract shape is confirmed when the Module 05 specification is approved
  (forward-looking confirmation, not an open owner decision).

---

## Part D — Module 01 ↔ Module 04: Identity (no new contract)

- Module 01 provides the authenticated identity context (identity ID +
  verification state, never credentials) through the existing AAL2 session
  guard; Module 04 references `identityId` only as a logical actor reference
  in transitions/audit records.
- Module 01 recovery, approval, and KYC channels never grant product
  moderation or catalog authority.
- No new Module 01 contract is proposed.

**End of review draft.** Nothing in this document authorizes implementation,
migration, commit, or deployment.

# WALRUS Enterprise Marketplace Platform

## Module 05 — INVENTORY Role and Permission Vocabulary (Authorization Proposal)

**Document ID:** WEMP-M05-AUTHZ-001
**Version:** Review Draft 1.0
**Status:** REVIEW ONLY — PROPOSED / REQUIRES OWNER APPROVAL (Module 02
owner sign-off on the additive `inventory.*` catalog and the third ownership
resolver **RECORDED 2026-08-15**)
**Effective date:** Not effective until the Module 05 approval statement is
signed; the Module 02 owner sign-off was recorded 2026-08-15
**Classification:** Confidential — Internal Use Only

> This proposal defines what Module 02 must add for Module 05. It does not
> modify the approved Module 02 matrix, the approved Module 03 `seller.*`
> entries, or the approved Module 04 `product.*`/`catalog.*` entries, and it
> authorizes no role change, migration, or code. All identifiers follow the
> approved `resource.action` canonical format (WEMP-M02-SPEC-001 §4).
> Identifiers are immutable once approved. The four identifiers below are
> **OWNER-APPROVED as a proposal** (decision D-05, 2026-08-14) and the
> **Module 02 owner sign-off was RECORDED 2026-08-15** (additive,
> non-weakening, as required by decision D-05/A-09); the identifiers become
> effective when M05-M4 implements the Module 02 additions.

---

## 1. Current state (binding facts)

- `RoleName` already contains `CUSTOMER`, `SELLER`, `ADMIN`, `SUPER_ADMIN`
  (`apps/api/prisma/schema.prisma`). No new role is proposed (D-10
  no-new-role precedent).
- The approved Module 02 Phase 1 matrix grants the `SELLER` role the approved
  `seller.*` self-service permissions (WEMP-M03-AUTHZ-001) and the approved
  `product.*`/`catalog.*` permissions (WEMP-M04-AUTHZ-001). No
  `inventory.*` permission exists in the approved catalog.
- The resource-ownership resolver contract was introduced by Module 03
  (Module 03 decision D-11) for the seller organization scope (first
  resolver) and
  extended by Module 04 to the product scope (second resolver). Module 05
  proposes the **third scope**: inventory, resolved against the seller
  organization owning the SKU.
- Module 02 §13.2 originally marked ownership resolvers MISSING/DEFERRED;
  the seller resolver is approved, general owner-policy resolution remains
  deferred (ADR-M02-001 §8).

## 2. Proposed permission vocabulary

All entries are **PROPOSED / REQUIRES APPROVAL** and additive. `resource.action`
is the canonical format; `action` in the table is the uppercase canonical
verb. Identifier set and ownership semantics are **OWNER-APPROVED**
(decision D-05, option A, 2026-08-14); Module 02 owner sign-off **RECORDED
2026-08-15**.

### 2.1 Seller self-service permissions (granted to `SELLER`, organization-scoped)

| Permission identifier (proposed) | Protected resource | Action | Intended use                                                                         |
| -------------------------------- | ------------------ | ------ | ------------------------------------------------------------------------------------ |
| `inventory.read`                 | `inventory`        | READ   | Read own-SKU stock (onHand/reserved/available) + derived low/out-of-stock labels     |
| `inventory.adjust.self`          | `inventory`        | ADJUST | Seller adjustments (`STOCK_IN`/`STOCK_OUT`/`ADJUSTMENT`), **OWNER association only** |

### 2.2 Administrative permissions (granted to `ADMIN` and `SUPER_ADMIN`)

| Permission identifier (proposed) | Protected resource | Action | Intended use                                                                                                     |
| -------------------------------- | ------------------ | ------ | ---------------------------------------------------------------------------------------------------------------- |
| `inventory.adjust.admin`         | `inventory`        | ADJUST | Administrative corrections (`COUNT_CORRECTION`, mandatory reason); admin-managed threshold config changes (D-14) |
| `inventory.audit.view`           | `inventory.audit`  | VIEW   | Admin stock list/detail, movement ledger, audit records, threshold config (read)                                 |

**RESOLVED — OWNER-APPROVED (2026-08-14, decision D-05, option A):** no
`inventory.manage.override` or similar administrative override is proposed —
the Module 03 precedent (D-08 — no-override pattern) gives Super Admin only
explicit matrix grants with no hidden override. `reserve`/`release` have **no permission
identifier** — they are domain-level, port-only operations for future
modules 07/08 (D-06, D-11).

## 3. Proposed role-to-permission matrix (inventory-related rows)

**PROPOSED / REQUIRES APPROVAL.** A check mark is an explicit grant; blank is
denial. Existing Module 02/03/04 rows are unchanged (shown as `—`).

| Permission                                 | Customer | Seller | Admin | Super Admin |
| ------------------------------------------ | :------: | :----: | :---: | :---------: |
| (all existing Module 02/03/04 permissions) |    —     |   —    |   —   |      —      |
| `inventory.read`                           |          |   ✓    |       |             |
| `inventory.adjust.self`                    |          |   ✓    |       |             |
| `inventory.adjust.admin`                   |          |        |   ✓   |      ✓      |
| `inventory.audit.view`                     |          |        |   ✓   |      ✓      |

## 4. Resource ownership rules (proposed — third ownership resolver)

- Every `inventory.*` self-service permission is **seller-organization-scoped**:
  the decision requires an ACTIVE `SellerIdentityAssociation` binding the
  caller to the seller organization that owns the target SKU (Module 04
  ownership precedent), resolved through the approved ownership-resolver
  contract. Module 02 evaluates; Module 03 owns the association facts;
  Module 04 owns the SKU facts; Module 05 owns the stock facts.
- **RESOLVED — OWNER-APPROVED (2026-08-14, decision D-05, option A):**
  `inventory.adjust.self` resolves to the **OWNER** association only;
  MEMBER associations are read-only (`inventory.read`). Mirrors the approved
  Module 03 `seller.member.manage` owner-only pattern and the Module 04 D-01
  product pattern.
- This is the **third ownership-resolver scope**; per decision D-05/A-09 the
  explicit **Module 02 owner sign-off was RECORDED 2026-08-15** (verified
  additive and non-weakening). The grants become effective when M05-M4
  implements the Module 02 additions; until then every `inventory.*`
  evaluation continues to deny (deny-by-default, fail closed).
- Ownership grants nothing beyond the explicitly mapped permission rows;
  there is no generic owner-equals-subject shortcut.
- No administrative override exists (D-05); Super Admin has exactly the
  matrix grants.

## 5. Deny-by-default and fail-closed guarantees (unchanged)

- Unknown, retired, suspended, revoked, stale, or failed evaluation denies.
- Explicit denial wins.
- No wildcard, implicit, identity-direct, or client-defined permission.
- Administrative scope and the permission grant must both pass.
- No hidden Super Admin or SELLER bypass.
- **Deny-by-default remains in force:** every `inventory.*` evaluation
  fails closed (denies) until M05-M4 implements the Module 02 additions.
  No inventory surface may be exposed before M05-M4 is implemented (gate
  M05-M4; the Module 02 owner sign-off was recorded 2026-08-15).

## 6. Impact on existing modules

- **Module 02:** additive `inventory.*` catalog entries and the third
  ownership-resolver scope only; no existing grant is weakened; **the Module
  02 owner sign-off was RECORDED 2026-08-15** (D-05/A-09).
- **Module 03:** no change; Module 05 consumes seller association facts
  through the approved resolver contract only.
- **Module 04:** no change; Module 05 consumes SKU-existence + PUBLISHED
  facts through `ProductCatalogReadPort` and implements the fail-closed
  inventory contract port (D-10). Module 04's PUBLISHED visibility gate
  (Module 04 D-12) is unchanged.
- **Module 01:** no change; roles and permissions never enter Module 01
  Identity, Sessions, or JWTs.
- **Module 00:** no change.

## 7. External approval gate

| Condition                                                                                  | Owner             | Status                                                                                                         | Gate          |
| ------------------------------------------------------------------------------------------ | ----------------- | -------------------------------------------------------------------------------------------------------------- | ------------- |
| Additive `inventory.*` permission identifiers + third ownership-resolver scope (D-05/A-09) | Module 02 owner   | ✓ **RECORDED** 2026-08-15                                                                                      | M05-M4        |
| D-11 production rate-limit values (30/60/50 per hour) confirmation                         | Security/Platform | ✓ **RECORDED** 2026-08-15                                                                                      | M05-M5        |
| D-12 jurisdiction-specific retention durations                                             | Legal/Compliance  | ✓ **RECORDED 2026-08-15** — InventoryMovementRecord 2555 days; InventoryAuditRecord 2555 days (owner-approved) | M05-M2/M05-M3 |
| D-14 low/out-of-stock threshold values (label enforcement)                                 | Authority input   | ✓ **RECORDED 2026-08-15** — LOW_STOCK_THRESHOLD=1; OUT_OF_STOCK_THRESHOLD=0 (owner-approved)                   | M05-M3/M05-M5 |

**End of review draft.** The Module 02 owner sign-off (2026-08-15) and the
Module 05 approval statement (WEMP-M05-APPROVAL-001 §5, 2026-08-15,
M05-M1 only) are recorded. The inventory permission vocabulary takes effect
only when M05-M4 implements the Module 02 additions; this proposal authorizes
no implementation, migration, commit, or deployment.

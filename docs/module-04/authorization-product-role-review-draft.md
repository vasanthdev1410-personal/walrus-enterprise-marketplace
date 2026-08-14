# WALRUS Enterprise Marketplace Platform

## Module 04 — PRODUCT Role and Permission Vocabulary (Authorization Proposal)

**Document ID:** WEMP-M04-AUTHZ-001
**Version:** Review Draft 1.0
**Status:** APPROVED — signed by the Product/Architecture Owner 2026-08-14 (Module 02 owner sign-off on the additive catalog + second resolver recorded 2026-08-14)
**Effective date:** 2026-08-14
**Classification:** Confidential — Internal Use Only

> This proposal defines what Module 02 must add for Module 04. It does not
> modify the approved Module 02 matrix or the approved Module 03 `seller.*`
> entries, and it authorizes no role change, migration, or code. All
> identifiers follow the approved `resource.action` canonical format
> (WEMP-M02-SPEC-001 §4). Identifiers are immutable once approved.

---

## 1. Current state (binding facts)

- `RoleName` already contains `CUSTOMER`, `SELLER`, `ADMIN`, `SUPER_ADMIN`
  (`apps/api/prisma/schema.prisma`). No `MODERATOR` or similar role exists.
- The approved Module 02 Phase 1 matrix grants the `SELLER` role the
  approved `seller.*` self-service permissions (WEMP-M03-AUTHZ-001) and no
  `product.*` permissions.
- The resource-ownership resolver contract was introduced by Module 03
  (decision D-11) for the seller organization scope; it is the first and
  only ownership resolver today.
- Module 02 §13.2 originally marked ownership resolvers MISSING/DEFERRED;
  the seller resolver is approved, general owner-policy resolution remains
  deferred (ADR-M02-001 §8).

## 2. Proposed permission vocabulary

All entries are **PROPOSED / REQUIRES APPROVAL**. `resource.action` is the
canonical format; `action` in the table is the uppercase canonical verb.
Identifier naming (`product.*` vs. `catalog.*`) is **OWNER DECISION
REQUIRED** — this draft proposes `product.*` for product resources and a
single read-only `catalog.category.read` for the shared taxonomy.

### 2.1 Seller self-service permissions (granted to `SELLER`, organization-scoped)

| Permission identifier (proposed) | Protected resource | Action | Intended use                                        |
| -------------------------------- | ------------------ | ------ | --------------------------------------------------- |
| `product.create`                 | `product`          | CREATE | Create a `DRAFT` product                            |
| `product.read`                   | `product`          | READ   | Read own products (never another seller)            |
| `product.update`                 | `product`          | UPDATE | Update own products (version-checked)               |
| `product.submit`                 | `product`          | SUBMIT | Submit product for moderation (idempotent)          |
| `product.close`                  | `product`          | CLOSE  | Withdraw/unpublish own product                      |
| `product.media.read`             | `product.media`    | READ   | Read own product media metadata                     |
| `product.media.manage`           | `product.media`    | MANAGE | Upload/replace own product media references+digests |
| `product.sku.manage`             | `product.sku`      | MANAGE | Manage SKUs on own products                         |
| `catalog.category.read`          | `catalog.category` | READ   | Read platform categories                            |

### 2.2 Administrative permissions (granted to `ADMIN` and `SUPER_ADMIN`)

| Permission identifier (proposed) | Protected resource | Action | Intended use                               |
| -------------------------------- | ------------------ | ------ | ------------------------------------------ |
| `product.review.decide`          | `product.review`   | DECIDE | Approve, reject, or request corrections    |
| `product.audit.view`             | `product.audit`    | VIEW   | Product list/detail and audit records      |
| `product.media.read`             | `product.media`    | READ   | Inspect product media metadata (sensitive) |
| `catalog.category.manage`        | `catalog.category` | MANAGE | Create/update/retire platform categories   |     | `catalog.attribute.manage` | `catalog.attribute` | MANAGE | Create/update/retire attribute definitions |

**RESOLVED — OWNER-APPROVED (2026-08-14, decision D-11, option A):** the
`product.manage.override` permission is **not approved** — Module 03
precedent (D-08) gives Super Admin only explicit matrix grants with no hidden
override.

## 3. Proposed role-to-permission matrix (product-related rows)

**PROPOSED / REQUIRES APPROVAL.** A check mark is an explicit grant; blank is
denial. Existing Module 02/03 rows are unchanged (shown as `—`).

| Permission                              | Customer | Seller | Admin | Super Admin |
| --------------------------------------- | :------: | :----: | :---: | :---------: |
| (all existing Module 02/03 permissions) |    —     |   —    |   —   |      —      |
| `product.create`                        |          |   ✓    |       |             |
| `product.read`                          |          |   ✓    |       |             |
| `product.update`                        |          |   ✓    |       |             |
| `product.submit`                        |          |   ✓    |       |             |
| `product.close`                         |          |   ✓    |       |             |
| `product.media.read`                    |          |   ✓    |       |             |
| `product.media.manage`                  |          |   ✓    |       |             |
| `product.sku.manage`                    |          |   ✓    |       |             |
| `catalog.category.read`                 |          |   ✓    |   ✓   |      ✓      |
| `catalog.category.manage`               |          |        |   ✓   |      ✓      |
| `catalog.attribute.manage`              |          |        |   ✓   |      ✓      |
| `product.review.decide`                 |          |        |   ✓   |      ✓      |
| `product.audit.view`                    |          |        |   ✓   |      ✓      |
| `product.media.read` (admin)            |          |        |   ✓   |      ✓      |
| `catalog.category.manage`               |          |        |   ✓   |      ✓      |
| `catalog.attribute.manage`              |          |        |   ✓   |      ✓      |

## 4. Resource ownership rules (proposed — second ownership resolver)

- Every `product.*` self-service permission is **seller-organization-scoped**:
  the decision requires an ACTIVE `SellerIdentityAssociation` binding the
  caller to the target seller organization, resolved through the approved
  ownership-resolver contract (Module 03 precedent). Module 02 evaluates;
  Module 03 owns the association facts.
- Ownership grants nothing beyond the explicitly mapped permission rows;
  there is no generic owner-equals-subject shortcut.
- **RESOLVED — OWNER-APPROVED (2026-08-14, decision D-01):** management
  actions (`product.update`, `product.media.manage`, `product.sku.manage`)
  resolve to owner-only; MEMBER associations are read-only. Mirrors the
  approved Module 03 `seller.member.manage` owner-only pattern.
- No administrative override exists (decision D-11: `product.manage.override`
  is not approved); Super Admin has exactly the matrix grants.

## 5. Deny-by-default and fail-closed guarantees (unchanged)

- Unknown, retired, suspended, revoked, stale, or failed evaluation denies.
- Explicit denial wins.
- No wildcard, implicit, identity-direct, or client-defined permission.
- Administrative scope and the permission grant must both pass.
- No hidden Super Admin or SELLER bypass.

## 6. Impact on existing modules

- **Module 02:** additive catalog entries and the second ownership-resolver
  scope only; no existing grant is weakened; the Module 02 owner approved the
  matrix extension and resolver extension — **sign-off recorded 2026-08-14**.
- **Module 03:** no change; Module 04 consumes seller association facts
  through the approved resolver contract only.
- **Module 01:** no change; roles and permissions never enter Module 01
  Identity, Sessions, or JWTs.
- **Module 00:** no change.

**End of review draft.** The Module 02 owner sign-off was recorded on
2026-08-14; this proposal still authorizes no implementation until the
Module 04 approval statement (WEMP-M04-APPROVAL-001 §4) is signed.

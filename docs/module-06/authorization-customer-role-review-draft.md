# WALRUS Enterprise Marketplace Platform

## Module 06 — CUSTOMER Role and Permission Vocabulary (Authorization Proposal)

**Document ID:** WEMP-M06-AUTHZ-001
**Version:** Review Draft 1.0
**Status:** **APPROVED — Module 02 owner sign-off RECORDED 2026-08-17** for
the additive `customer.*` catalog and the fourth ownership resolver
(WEMP-M06-APPROVAL-001 §3/§6; D-17). M06-M4 implements the Module 02
additions; M06-M5 authorized 2026-08-18 (Security/Platform D-10 rate-limit
confirmation **RECORDED 2026-08-18**).
**Effective date:** 2026-08-17 (M06-M4 implemented and validated)
**Classification:** Confidential — Internal Use Only

> This proposal defines what Module 02 must add for Module 06. It does not
> modify the approved Module 02 matrix, the approved Module 03 `seller.*`
> entries, the approved Module 04 `product.*`/`catalog.*` entries, or the
> approved Module 05 `inventory.*` entries, and it authorizes no role change,
> migration, or code. All identifiers follow the approved `resource.action`
> canonical format (WEMP-M02-SPEC-001 §4). Identifiers are immutable once
> approved. The identifiers below are **PROPOSED / REQUIRES APPROVAL**
> (decision D-07, 2026-08-17 owner input); they become effective only when
> M06-M4 implements the Module 02 additions and the **Module 02 owner
> sign-off is RECORDED** (additive, non-weakening, as required by decision
> D-07/A-07). **Module 02 owner sign-off RECORDED 2026-08-17.**

---

## 1. Current state (binding facts)

- `RoleName` already contains `CUSTOMER`, `SELLER`, `ADMIN`, `SUPER_ADMIN`
  (`apps/api/prisma/schema.prisma`). The seeded `CUSTOMER` role exists in
  `apps/api/src/modules/authorization/domain/role-catalog.ts` with
  **`grantedPermissionIds: []`** (empty). **No new role is proposed**
  (D-10 no-new-role precedent).
- The role hierarchy is `SUPER_ADMIN → ADMIN → SELLER → CUSTOMER`
  (`role-hierarchy.ts`); CUSTOMER inherits nothing; all other roles inherit
  CUSTOMER.
- The approved Module 02 Phase 1 matrix grants the `SELLER` role the
  approved `seller.*` (WEMP-M03-AUTHZ-001), `product.*`/`catalog.*`
  (WEMP-M04-AUTHZ-001), and `inventory.*` (WEMP-M05-AUTHZ-001, sign-off
  recorded 2026-08-15) permissions. **No `customer.*` permission exists in
  the approved catalog** (`permission-catalog.ts` contains zero customer
  identifiers).
- The resource-ownership resolver contract was introduced by Module 03
  (seller organization scope — first resolver), extended by Module 04
  (product scope — second) and Module 05 (inventory scope — third). Module
  06 proposes the **fourth scope**: customer identity — the caller's own
  Identity owns the target customer profile.
- Module 02 §13.2 originally marked ownership resolvers MISSING/DEFERRED;
  the seller resolver is approved, general owner-policy resolution remains
  deferred (ADR-M02-001 §8).

## 2. Proposed permission vocabulary

All entries are **PROPOSED / REQUIRES APPROVAL** and additive. `resource.action`
is the canonical format; `action` in the table is the uppercase canonical
verb. Identifier set and ownership semantics are the owner-approved proposal
(decision D-07, 2026-08-17); Module 02 owner sign-off **PENDING**.

### 2.1 Customer self-service permissions (granted to `CUSTOMER`, customer-identity-scoped)

| Permission identifier (proposed) | Protected resource    | Action | Intended use                                                          |
| -------------------------------- | --------------------- | ------ | --------------------------------------------------------------------- |
| `customer.profile.read`          | `customer.profile`    | READ   | Read own customer profile                                             |
| `customer.profile.update`        | `customer.profile`    | UPDATE | Update own profile fields (version-checked)                           |
| `customer.address.read`          | `customer.address`    | READ   | List/read own addresses                                               |
| `customer.address.manage`        | `customer.address`    | MANAGE | Create/update/soft-remove own addresses; set default shipping/billing |
| `customer.business.read`         | `customer.business`   | READ   | Read own optional business profile                                    |
| `customer.business.manage`       | `customer.business`   | MANAGE | Create/update own optional business profile (version-checked)         |
| `customer.preference.read`       | `customer.preference` | READ   | Read own basic account preferences                                    |
| `customer.preference.manage`     | `customer.preference` | MANAGE | Update own basic preferences (allow-listed keys, version-checked)     |

### 2.2 Administrative permissions (granted to `ADMIN` and `SUPER_ADMIN`)

| Permission identifier (proposed) | Protected resource   | Action | Intended use                                                     |
| -------------------------------- | -------------------- | ------ | ---------------------------------------------------------------- |
| `customer.read`                  | `customer`           | READ   | Admin customer list/detail (non-enumerating)                     |
| `customer.lifecycle.manage`      | `customer.lifecycle` | MANAGE | Suspend / reinstate / close customer profiles (mandatory reason) |
| `customer.audit.view`            | `customer.audit`     | VIEW   | Admin customer audit trail                                       |

**RESOLVED — OWNER-APPROVED (2026-08-17, decision D-07, option A):** no
`customer.manage.override` or similar administrative override is proposed —
the Module 03/05 precedent (D-08/D-05 no-override pattern) gives Super Admin
only explicit matrix grants with no hidden override. Self-service
`customer.*` identifiers carry **no administrative meaning**; administrative
identifiers carry **no self-service meaning**.

## 3. Proposed role-to-permission matrix (customer-related rows)

**PROPOSED / REQUIRES APPROVAL.** A check mark is an explicit grant; blank is
denial. Existing Module 02/03/04/05 rows are unchanged (shown as `—`).

| Permission                                    | Customer | Seller | Admin | Super Admin |
| --------------------------------------------- | :------: | :----: | :---: | :---------: |
| (all existing Module 02/03/04/05 permissions) |    —     |   —    |   —   |      —      |
| `customer.profile.read`                       |    ✓     |        |       |             |
| `customer.profile.update`                     |    ✓     |        |       |             |
| `customer.address.read`                       |    ✓     |        |       |             |
| `customer.address.manage`                     |    ✓     |        |       |             |
| `customer.business.read`                      |    ✓     |        |       |             |
| `customer.business.manage`                    |    ✓     |        |       |             |
| `customer.preference.read`                    |    ✓     |        |       |             |
| `customer.preference.manage`                  |    ✓     |        |       |             |
| `customer.read`                               |          |        |   ✓   |      ✓      |
| `customer.lifecycle.manage`                   |          |        |   ✓   |      ✓      |
| `customer.audit.view`                         |          |        |   ✓   |      ✓      |

## 4. Resource ownership rules (proposed — fourth ownership resolver)

- Every `customer.*` self-service permission is **customer-identity-scoped**:
  the decision requires the caller's authenticated Identity (`subject`) to be
  the owner of the target customer profile (`CustomerProfile.identityId`),
  resolved through the approved ownership-resolver contract. Module 02
  evaluates; Module 01 owns identity facts; Module 06 owns customer-profile
  facts.
- **RESOLVED — OWNER-APPROVED (2026-08-17, decision D-07, option A):**
  self-service permissions resolve to the caller's own profile only; there
  is **no delegate/agent scope in Phase 1** (no other-identity access to a
  profile's private data). Mirrors the Module 03/05 owner-scoped pattern.
- This is the **fourth ownership-resolver scope**; per decision D-07/A-07
  the explicit **Module 02 owner sign-off is REQUIRED (PENDING — NOT
  RECORDED)**. The grants become effective only when M06-M4 implements the
  Module 02 additions; until then every `customer.*` evaluation continues to
  deny (deny-by-default, fail closed).
- Ownership grants nothing beyond the explicitly mapped permission rows;
  there is no generic owner-equals-subject shortcut and no cross-customer
  access (horizontal privilege escalation denied — M06-R03).
- No administrative override exists (D-07); Super Admin has exactly the
  matrix grants.

## 5. Deny-by-default and fail-closed guarantees (unchanged)

- Unknown, retired, suspended, revoked, stale, or failed evaluation denies.
- Explicit denial wins.
- No wildcard, implicit, identity-direct, or client-defined permission.
- Administrative scope and the permission grant must both pass.
- No hidden Super Admin or CUSTOMER bypass; no role-name authorization
  (grants are by permission identifier only).
- **Deny-by-default remains in force:** every `customer.*` evaluation fails
  closed (denies) until M06-M4 implements the Module 02 additions. No
  customer surface may be exposed before M06-M4 is implemented (gate
  M06-M4; the Module 02 owner sign-off **PENDING — NOT RECORDED**).
- Malformed or missing ownership reference denies (fail closed,
  non-disclosing).

## 6. Impact on existing modules

- **Module 02:** additive `customer.*` catalog entries and the fourth
  ownership-resolver scope only; no existing grant is weakened; **Module 02
  owner sign-off REQUIRED — PENDING** (D-07/A-07).
- **Module 01:** no change; roles and permissions never enter Module 01
  Identity, Sessions, or JWTs; identity records carry no customer fields
  (A-14).
- **Module 03:** no change; Module 06 consumes no seller facts.
- **Module 04:** no change.
- **Module 05:** no change; the `InventoryReservationPort` remains port-only
  for future 07/08 (A-13).
- **Module 00:** no change.

## 7. External approval gate

| Condition                                                                                  | Owner             | Status                                                           | Gate          |
| ------------------------------------------------------------------------------------------ | ----------------- | ---------------------------------------------------------------- | ------------- |
| Additive `customer.*` permission identifiers + fourth ownership-resolver scope (D-07/A-07) | Module 02 owner   | **RECORDED 2026-08-17** — additive non-weakening sign-off (D-17) | M06-M4        |
| D-10 production rate-limit values (self reads 60/hr, self mutations 30/hr, admin 50/hr)    | Security/Platform | **RECORDED 2026-08-18** — 60/30/50 per hour confirmed            | M06-M5        |
| D-09 jurisdiction-specific retention durations for customer records                        | Legal/Compliance  | **PENDING — NOT RECORDED** (no duration invented in M06)         | M06-M2/M06-M3 |

**End of review draft.** This proposal authorizes no implementation,
migration, commit, or deployment. **Module 02 owner sign-off RECORDED
2026-08-17** (D-17): the additive `customer.*` catalog and the fourth
ownership-resolver scope are approved and implemented by M06-M4; every
`customer.*` evaluation now runs through the Module 02 engine with the
customer-identity ownership resolver (fail closed). M06-M5 authorized
2026-08-18 — Security/Platform D-10 rate-limit confirmation **RECORDED
2026-08-18** (60/30/50 per hour).

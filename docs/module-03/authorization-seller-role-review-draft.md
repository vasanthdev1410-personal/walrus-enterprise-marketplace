# WALRUS Enterprise Marketplace Platform

## Module 03 — SELLER Role and Permission Vocabulary (Authorization Proposal)

**Document ID:** WEMP-M03-AUTHZ-001
**Version:** Review Draft 1.0
**Status:** REVIEW ONLY — PROPOSED / REQUIRES OWNER APPROVAL
**Effective date:** Not effective until formally approved
**Classification:** Confidential — Internal Use Only

> This proposal defines what Module 02 must add for Module 03. It does not
> modify the approved Module 02 matrix and it authorizes no role change,
> migration, or code. All identifiers below follow the approved
> `resource.action` canonical format (WEMP-M02-SPEC-001 §4). Identifiers are
> immutable once approved.

---

## 1. Current state (binding facts)

- `RoleName` enum already contains `SELLER` (`CUSTOMER`, `SELLER`, `ADMIN`,
  `SUPER_ADMIN`) in `apps/api/prisma/schema.prisma`.
- The approved Module 02 Phase 1 matrix grants the `SELLER` role **no
  permissions**. No `seller.*` identifier exists in the catalog.
- Module 02 §6 administrative scope (PROPOSED in M02): Admin may administer
  Seller and Customer role assignments; Seller administers Customer only with
  a future explicit permission; hierarchy grants no permission inheritance.
- Module 02 §13.2: resource-owner resolver contracts are MISSING / DEFERRED.

## 2. Proposed permission vocabulary

All entries are **PROPOSED / REQUIRES APPROVAL**. `resource.action` is the
canonical format; `action` in the table is the uppercase canonical verb.

### 2.1 Seller self-service permissions (granted to `SELLER`, organization-scoped)

| Permission identifier        | Protected resource    | Action | Intended use                                      |
| ---------------------------- | --------------------- | ------ | ------------------------------------------------- |
| `seller.profile.create`      | `seller.profile`      | CREATE | Start onboarding (create `DRAFT` seller profile)  |
| `seller.profile.read`        | `seller.profile`      | READ   | Read own seller profile and business status       |
| `seller.profile.update`      | `seller.profile`      | UPDATE | Update own profile fields (version-checked)       |
| `seller.profile.close`       | `seller.profile`      | CLOSE  | Voluntarily close own seller (terminal)           |
| `seller.organization.read`   | `seller.organization` | READ   | Read own organization/business information        |
| `seller.organization.update` | `seller.organization` | UPDATE | Update own business information                   |
| `seller.onboarding.create`   | `seller.onboarding`   | CREATE | Create onboarding draft                           |
| `seller.onboarding.submit`   | `seller.onboarding`   | SUBMIT | Submit onboarding for review (idempotent)         |
| `seller.onboarding.read`     | `seller.onboarding`   | READ   | Read own onboarding progress/status               |
| `seller.verification.submit` | `seller.verification` | SUBMIT | Submit KYC/KYB verification evidence              |
| `seller.verification.read`   | `seller.verification` | READ   | Read own verification status (never others')      |
| `seller.warehouse.read`      | `seller.warehouse`    | READ   | Read own warehouse/location records               |
| `seller.warehouse.manage`    | `seller.warehouse`    | MANAGE | Create/update/close own warehouse records         |
| `seller.agreement.read`      | `seller.agreement`    | READ   | Read own agreements (incl. commission terms)      |
| `seller.member.read`         | `seller.membership`   | READ   | Read own organization membership                  |
| `seller.member.manage`       | `seller.membership`   | MANAGE | Manage members of own organization (owner action) |

### 2.2 Administrative permissions (granted to `ADMIN` and `SUPER_ADMIN`)

| Permission identifier   | Protected resource | Action | Intended use                                       |
| ----------------------- | ------------------ | ------ | -------------------------------------------------- |
| `seller.review.decide`  | `seller.review`    | DECIDE | Request corrections, approve, or reject onboarding |
| `seller.suspend.manage` | `seller.suspend`   | MANAGE | Suspend/reactivate a seller                        |
| `seller.evidence.read`  | `seller.evidence`  | READ   | Inspect KYC/KYB verification evidence (sensitive)  |
| `seller.audit.view`     | `seller.audit`     | VIEW   | Read seller business audit records and list/detail |

## 3. Proposed role-to-permission matrix (seller-related rows)

**PROPOSED / REQUIRES APPROVAL.** A check mark is an explicit grant; blank is
denial. Existing Module 02 rows are unchanged (shown as `—`).

| Permission                                   | Customer | Seller | Admin | Super Admin |
| -------------------------------------------- | :------: | :----: | :---: | :---------: |
| (all existing Module 02 Phase 1 permissions) |    —     |   —    |   —   |      —      |
| `seller.profile.create`                      |          |   ✓    |       |             |
| `seller.profile.read`                        |          |   ✓    |       |             |
| `seller.profile.update`                      |          |   ✓    |       |             |
| `seller.profile.close`                       |          |   ✓    |       |             |
| `seller.organization.read`                   |          |   ✓    |       |             |
| `seller.organization.update`                 |          |   ✓    |       |             |
| `seller.onboarding.create`                   |          |   ✓    |       |             |
| `seller.onboarding.submit`                   |          |   ✓    |       |             |
| `seller.onboarding.read`                     |          |   ✓    |       |             |
| `seller.verification.submit`                 |          |   ✓    |       |             |
| `seller.verification.read`                   |          |   ✓    |       |             |
| `seller.warehouse.read`                      |          |   ✓    |       |             |
| `seller.warehouse.manage`                    |          |   ✓    |       |             |
| `seller.agreement.read`                      |          |   ✓    |       |             |
| `seller.member.read`                         |          |   ✓    |       |             |
| `seller.member.manage`                       |          |   ✓    |       |             |
| `seller.review.decide`                       |          |        |   ✓   |      ✓      |
| `seller.suspend.manage`                      |          |        |   ✓   |      ✓      |
| `seller.evidence.read`                       |          |        |   ✓   |      ✓      |
| `seller.audit.view`                          |          |        |   ✓   |      ✓      |

## 4. Resource ownership rules (proposed — first ownership resolver)

- Every `seller.*` self-service permission is **organization-scoped**: the
  decision requires an ACTIVE `SellerIdentityAssociation` binding the caller to
  the target seller profile. Membership (OWNER/MEMBER) is a Module 03-owned
  fact exposed to Module 02 through the approved resolver contract; Module 02
  evaluates, Module 03 owns the association data.
- Ownership grants nothing beyond the explicitly mapped permission rows above;
  there is no generic owner-equals-subject shortcut.
- `seller.member.manage` is further restricted to the OWNER association
  (**PROPOSED**); a MEMBER may read only.
- No administrative override permission exists; Super Admin has exactly the
  matrix grants.

## 5. Membership model decision (decision D-01)

**PROPOSED option A (recommended):** single `SELLER` role; owner/member
distinction carried by `SellerIdentityAssociation.associationRole`, with
`seller.member.manage` resolving to owner-only through the ownership resolver.
Least privilege, no role proliferation.

**PROPOSED option B:** introduce a separate `SELLER_MANAGER` role for members
with management permissions. Rejected in this draft as unnecessary
proliferation; presented for owner confirmation.

## 6. Deny-by-default and fail-closed guarantees (unchanged)

- Unknown, retired, suspended, revoked, stale, or failed evaluation denies.
- Explicit denial wins.
- No wildcard, implicit, identity-direct, or client-defined permission.
- Administrative scope and the permission grant must both pass.
- No hidden Super Admin or SELLER bypass: bootstrap/privileged-provisioning
  paths remain Module 02-owned and are not touched by this proposal.

## 7. Impact on existing modules

- **Module 02:** additive catalog entries and the ownership resolver contract
  only; no existing grant is weakened; requires the Module 02 owner to approve
  the matrix extension and resolver contract.
- **Module 01:** no change; roles and permissions never enter Module 01
  Identity, Sessions, or JWTs.
- **Module 00:** no change.

**End of review draft.** Authorizes nothing until the Module 02 owner and the
product/architecture owner record explicit approval.

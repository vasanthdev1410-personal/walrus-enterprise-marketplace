# WALRUS Enterprise Marketplace Platform

## Module 03 — Cross-Module Contracts

**Document ID:** WEMP-M03-CONTRACT-001
**Version:** Review Draft 1.0
**Status:** REVIEW ONLY — PROPOSED / REQUIRES OWNER APPROVAL
**Effective date:** Not effective until formally approved
**Classification:** Confidential — Internal Use Only

> Companion to WEMP-M03-SPEC-001. This document defines the two approved-shape
> contracts Module 03 must satisfy: the Module 01 ↔ Module 03 Identity/Seller
> association contract (binding shape fixed by the approved Module 01 v1.12 §7)
> and the Module 02 ↔ Module 03 SELLER authorization contract (proposed). No
> contract here authorizes implementation.

---

## Part A — Module 01 ↔ Module 03: Identity and Seller Association

### A.1 Binding contract shape (from approved Module 01 v1.12 §7)

Seller self-registration **shall**:

1. Create or locate the Module 01 Identity.
2. Complete the required identity verification.
3. Request creation or association of a Seller profile through an approved
   Module 03 contract.
4. Request any required seller role assignment through an approved Module 02
   contract.

**BINDING rules:**

- Creating a Seller profile or assigning a Seller role shall not create a
  second Identity.
- Module 01 may create and authenticate the underlying Identity but shall not
  own seller-profile or seller-onboarding data.
- Seller permissions shall be determined exclusively by Module 02.
- Recovery shall not be used for business approval, KYC, or seller onboarding.
- Module 01 identifiers and Identity are the only identity facts Module 03 may
  reference; Module 03 never receives, stores, or derives authentication
  credentials, MFA secrets, recovery material, or Session data.

### A.2 Association model (proposed)

`SellerIdentityAssociation` records every Identity ↔ Seller link:

| Field | Proposal |
| ----- | -------- |
| `associationId` | UUIDv7 PK |
| `sellerProfileId` | Logical reference to `SellerProfile` |
| `identityId` | Logical reference to Module 01 Identity UUIDv7 — **no FK** |
| `associationRole` | `OWNER` (one per seller) or `MEMBER` |
| `isPrimary` | Indicates the owning/primary association |
| `state` | `ACTIVE` / `REMOVED` |
| `aggregateVersion`, timestamps | Concurrency and audit |

Proposed invariants:

- One `OWNER` association per seller profile; additional members require the
  owner's action and are recorded with audit.
- A seller profile cannot exist without an `OWNER` association
  (fail closed at creation).
- An identity may hold associations to multiple seller profiles (approved §7:
  multiple business profiles per Identity).

### A.3 Seller self-registration flow (proposed)

1. Identity signs in through Module 01 (AAL2).
2. Module 03 contract `requestSellerProfileCreation` receives the verified
   identity context (identity ID + verification state) — never credentials.
3. Module 03 validates: identity is `ACTIVE` and `VERIFIED` (**PROPOSED**
   eligibility gate, decision D-04), no duplicate active seller for the same
   business registration (decision D-02), and creates `SellerProfile` in
   `DRAFT` with the OWNER association.
4. Seller completes onboarding (Part B lifecycle in WEMP-M03-SPEC-001 §4).
5. On approval, Module 03 requests the SELLER role assignment through the
   approved Module 02 contract (Part B below). `APPROVED → ACTIVE` is gated on
   the successful role assignment — fail closed if assignment fails.

### A.4 Duplicate prevention (proposed — decision D-02)

- Business registration number is normalized and stored as
  `registrationLookupDigest` with a unique constraint; a second active seller
  with the same digest is rejected.
- The OWNER identity is never duplicated; re-association of the same identity
  to the same seller is idempotent (returns the existing association).

### A.5 Account recovery implications

**BINDING:** Module 01 recovery never grants seller business approval, KYC, or
onboarding authority. A recovered identity re-enters Module 01 normally; seller
state is untouched by recovery.

### A.6 Identity suspension/deactivation effects (proposed — decision D-04)

| Module 01 Identity state | Seller effect (proposed) |
| ------------------------ | ------------------------ |
| `ACTIVE`, `VERIFIED` | Full seller operations permitted (per seller state) |
| `PENDING_VERIFICATION` | Seller operations denied (identity not verified) |
| `LOCKED` / `SUSPENDED` | Seller operations denied while locked/suspended; seller state unchanged; fail closed |
| `DISABLED` | Seller operations denied; administrative review recommended |
| `DELETED` | Association removed; seller record retained append-only (no personal data retained beyond retention policy) |

The effect matrix is enforced by the association resolver, never by copying
identity state into Module 03 (no duplicated authentication state).

---

## Part B — Module 02 ↔ Module 03: SELLER Authorization

### B.1 Binding facts

- The `SELLER` role identifier already exists in the Module 02 `RoleName` enum
  (`CUSTOMER`, `SELLER`, `ADMIN`, `SUPER_ADMIN`) — schema-verified.
- The approved Module 02 Phase 1 matrix grants **no** `seller.*` permissions to
  any role; "Future business permissions belong to their owning business-module
  specifications" (WEMP-M02-SPEC-001 §5). Module 03 is that owner.
- Module 02 is the single authorization authority; Module 03 must not implement
  its own authorization engine, roles, or permission checks.

### B.2 Required Module 02 changes (all PROPOSED — WEMP-M03-AUTHZ-001)

1. Define the `SELLER` role catalog entry (role state `ACTIVE`).
2. Add the `seller.*` permission identifiers to the Module 02 permission
   catalog and grant them to the `SELLER` role (self-service, org-scoped) and
   the admin review permissions to `ADMIN`/`SUPER_ADMIN`.
3. Introduce the first **resource-ownership resolver**: permissions are
   evaluated against the organization scope established by
   `SellerIdentityAssociation`. Module 02 §13.2 currently marks ownership
   resolvers MISSING/DEFERRED — Module 03 is the first consumer and requires
   explicit approval of the resolver contract.
4. Keep deny-by-default, explicit-deny precedence, and fail-closed behavior
   unchanged.

### B.3 Contract boundaries (proposed)

- Module 03 never reads Module 02 storage directly; role assignment is
  requested through the approved `authorization.role.assign` path with the
  target identity and `SELLER` role, under Admin/Super Admin administrative
  scope.
- Module 02 never reads Module 03 storage; the ownership resolver receives an
  opaque seller/association reference from the authenticated context and
  returns the organization scope decision through the approved contract port.
- Authorization decision audit remains in Module 02. Module 03 business audit
  never records roles, permissions, or policy internals.

### B.4 Fail-closed behavior

Any failure in the ownership resolver, association lookup, role catalog,
permission evaluation, or mandatory audit denies the operation. There is no
cached-ownership shortcut without an explicit bounded-staleness approval.

**End of review draft.**

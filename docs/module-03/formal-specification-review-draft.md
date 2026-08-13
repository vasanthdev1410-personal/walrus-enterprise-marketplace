# WALRUS Enterprise Marketplace Platform

## Module 03 — Seller Management

**Document ID:** WEMP-M03-SPEC-001
**Version:** Review Draft 1.0
**Status:** REVIEW ONLY — PROPOSED / REQUIRES OWNER APPROVAL
**Effective date:** Not effective until formally approved
**Classification:** Confidential — Internal Use Only

> This document is not an authorization to implement. It preserves Module 00,
> Module 01, and Module 02 exactly as they are. Every item marked
> **PROPOSED / REQUIRES APPROVAL** is non-binding until the product/architecture
> owner records explicit approval. This document defines the seller business
> domain only; it does not duplicate Module 01 authentication or Module 02
> authorization, and it must not be read as authorizing any database migration,
> controller, or role change.

## 1. Authority and evidence classification

This review draft uses three evidence labels, identical to WEMP-M02-SPEC-001:

- **BINDING:** directly required by accepted Module 00 architecture or the
  approved Module 01 specification/contracts.
- **DERIVED:** necessary to satisfy a binding contract without adding a new
  business policy; requires confirmation as part of approving this document.
- **PROPOSED / REQUIRES APPROVAL:** policy, vocabulary, scope, or protocol not
  fully specified by an approved source. It must not be implemented merely
  because it appears here.

Authoritative inputs used for this draft:

1. `docs/module-01/specifications/Module 01 Corrected Draft v1.12.txt`
   (approved) — in particular Section 7 `[WEMP-M01-001 §7] Seller Profile
Boundary` and the approved ownership model.
2. `docs/module-02/formal-specification-review-draft.md` and
   `docs/architecture/decisions/ADR-M02-001-enterprise-authorization-architecture-review-draft.md`
   (review drafts) — permission vocabulary, role matrix, and audit conventions.
3. `apps/api/prisma/schema.prisma` — current Module 01/02 schema conventions
   (UUIDv7 string PKs, snake_case mapping, `aggregateVersion`, `createdAt`/
   `updatedAt`, append-only transition and audit records).
4. `docs/module-01/archive/Module 02 Part 6 Authorization Source Material.txt`
   (unapproved archive) — module landscape only; no policy is taken from it.
5. Web and mobile placeholder routes
   (`apps/web/app/(seller)/seller/`, `apps/mobile/lib/src/features/seller/`).

## 2. Purpose and ownership

### 2.1 Binding purpose

**BINDING (Module 01 v1.12 §7):** Module 03 – Seller Management shall own
Seller profiles, Seller organizations, Seller business onboarding, Seller
approval, GST verification, PAN verification, Bank verification, Warehouse
setup, Commission agreements, and Seller business status.

**BINDING:** Module 01 may create and authenticate the underlying Identity but
shall not own seller-profile or seller-onboarding data.

**BINDING:** Seller permissions shall be determined exclusively by Module 02.

**BINDING:** Creating a Seller profile or assigning a Seller role shall not
create a second Identity. A single Identity may be associated with multiple
business profiles and multiple Module 02 roles without creating duplicate
identities.

**BINDING:** Module 01 Identity shall not contain Seller profile data, Seller
business status, or business onboarding state (approved ownership model,
Module 01 v1.12).

### 2.2 Phase 1 scope (proposed)

**PROPOSED / REQUIRES APPROVAL:** Phase 1 covers the seller business domain
through the operational lifecycle (draft through active trading, suspension,
reactivation, and closure), including KYC/KYB verification evidence management
and commission agreements. Explicit exclusions:

- Authentication, credentials, MFA, recovery, Sessions, and AAL — Module 01.
- Roles, permissions, assignment, authorization decisions, and authorization
  audit — Module 02 (Module 03 consumes them through approved contracts).
- Product catalog, inventory, shopping cart, orders, and customer profiles —
  future modules (04, 05, 07, 08, and 06 respectively). Payments/financial
  processing is not assigned to a recorded module in the current landscape.
- Seller storefront/store-builder, catalog management UI, and marketplace
  discovery surfaces — **PROPOSED** to be a later milestone or module; a
  storefront is not part of this specification.

## 3. Domain model (proposed)

All entities are **PROPOSED / REQUIRES APPROVAL**. They are Module 03-owned and
must not be read or written by Module 01 or Module 02 storage (cross-module
storage isolation, see §9).

| Entity                       | Responsibility                                                             | Key fields (proposed)                                                                                                                                                                                |
| ---------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SellerProfile`              | The seller aggregate root; owns lifecycle, compliance, and business status | `sellerProfileId`, `organizationId`, `state` (SellerState), `complianceState`, `aggregateVersion`, `createdAt`, `updatedAt`, `submittedAt`, `approvedAt`, `suspendedAt`, `closedAt`, `correlationId` |
| `SellerOrganization`         | The legal business entity (KYC/KYB subject)                                | `organizationId`, `legalName`, `tradeName`, `businessType`, `registrationNumber`, `registrationLookupDigest` (unique), `businessAddress` (protected fields), `state`, `aggregateVersion`, timestamps |
| `SellerIdentityAssociation`  | Identity ↔ Seller membership (owner and members)                           | `associationId`, `sellerProfileId`, `identityId` (logical Module 01 reference), `associationRole` (OWNER/MEMBER), `isPrimary`, `state` (ACTIVE/REMOVED), `aggregateVersion`, timestamps              |
| `SellerBusinessVerification` | Per-type KYC/KYB verification record                                       | `verificationId`, `sellerProfileId`, `verificationType` (GST/PAN/BANK/ADDRESS), `state`, `submittedByIdentityId`, `reviewedByIdentityId`, `reviewedAt`, `aggregateVersion`, generation               |
| `SellerVerificationEvidence` | Append-only evidence references and digests                                | `evidenceId`, `verificationId`, `evidenceType`, `evidenceReference` (opaque), `evidenceDigest`, `uploadedByIdentityId`, `state`, timestamps                                                          |
| `SellerWarehouse`            | Warehouse/location records                                                 | `warehouseId`, `sellerProfileId`, `name`, `address` (protected fields), `state`, timestamps                                                                                                          |
| `SellerAgreement`            | Agreements incl. commission agreements                                     | `agreementId`, `sellerProfileId`, `agreementType` (COMMISSION, ...), `reference`, `state`, `effectiveFrom`, `effectiveTo`, `signedAt`, timestamps                                                    |
| `SellerStateTransition`      | Append-only lifecycle episode log (mirrors `IdentityStateTransition`)      | `transitionId`, `sellerProfileId`, `fromState`, `toState`, `actorIdentityId`, `reasonReference`, `correlationId`, `causationId`, `occurredAt`                                                        |
| `SellerBusinessAuditRecord`  | Append-only Module 03 business audit events                                | `auditEventId`, `sellerProfileId`, `eventType`, `actorIdentityId`, `correlationId`, `evidenceDigest`, `occurredAt`                                                                                   |

Identity is never duplicated. `identityId` columns are logical references to
Module 01 Identities — UUIDv7 values, **no foreign key** to the Module 01
`identities` table (storage isolation, §9). Module 03 never stores passwords,
MFA secrets, recovery codes, or any authentication credential.

## 4. Seller lifecycle (proposed state machine)

**PROPOSED / REQUIRES APPROVAL:** the seller lifecycle is an append-only state
machine on `SellerProfile.state`. Transitions are recorded in
`SellerStateTransition`; every transition requires an authenticated actor, an
explicit reason reference where required, and a mandatory audit record.
Optimistic concurrency (`aggregateVersion`) is mandatory on every mutation;
duplicate transitions and stale versions are rejected. Any missing, unknown,
or inconsistent state fails closed (deny).

| From                                               | To                      | Permitted actor                                        | Required evidence                                                         | Notes                                                 |
| -------------------------------------------------- | ----------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------- | ----------------------------------------------------- |
| `DRAFT`                                            | `SUBMITTED`             | Seller OWNER (SELLER role, `seller.onboarding.submit`) | Mandatory onboarding fields complete; at least one verification submitted | Idempotent via request key                            |
| `SUBMITTED`                                        | `UNDER_REVIEW`          | Admin (reviewer)                                       | Review claim recorded                                                     | First reviewer assignment                             |
| `UNDER_REVIEW`                                     | `CORRECTIONS_REQUESTED` | Admin (reviewer)                                       | Reason reference (non-disclosing externally)                              | Seller may resubmit                                   |
| `CORRECTIONS_REQUESTED`                            | `SUBMITTED`             | Seller OWNER                                           | Corrected fields/evidence                                                 | New review cycle                                      |
| `UNDER_REVIEW`                                     | `APPROVED`              | Admin (approver ≠ reviewer)                            | All mandatory verifications approved; compliance checks pass              | Separation of duties (§8)                             |
| `APPROVED`                                         | `ACTIVE`                | System (activation) after SELLER role assignment       | SELLER role assigned via approved Module 02 contract                      | Selling enabled only after role assignment            |
| `ACTIVE`                                           | `SUSPENDED`             | Admin (`seller.suspend.manage`)                        | Reason reference + audit                                                  | Reversible                                            |
| `SUSPENDED`                                        | `ACTIVE`                | Admin (`seller.suspend.manage`)                        | Reactivation approval + audit                                             | Requires identity still eligible                      |
| `ACTIVE`/`SUSPENDED`                               | `CLOSED`                | Seller OWNER (voluntary) or Admin (administrative)     | Reason reference; no open obligations (proposed gate)                     | Terminal                                              |
| `UNDER_REVIEW`/`SUBMITTED`/`CORRECTIONS_REQUESTED` | `REJECTED`              | Admin (approver)                                       | Reason reference (non-disclosing)                                         | Terminal; new onboarding creates a new seller profile |
| `DRAFT`                                            | `DRAFT`                 | Seller OWNER                                           | —                                                                         | Update of incomplete onboarding; version-checked      |

Proposed invariants:

1. Only one seller profile may transition to `ACTIVE` per organization per
   seller identity owner (no duplicate active business).
2. `REJECTED` and `CLOSED` are terminal; reactivation of a closed seller is a
   new onboarding.
3. Identity `SUSPENDED`/`DISABLED`/`DELETED` (Module 01 state) does not change
   `SellerProfile.state` but denies all seller operations until the identity is
   eligible again (see WEMP-M03-CONTRACT-001 §A.6). Fail closed.
4. Business approval never uses Module 01 recovery, approval, or KYC channels
   (approved Module 01 rule).

## 5. Seller compliance and verification state (proposed)

Verification is modeled per type on `SellerBusinessVerification`:

`PENDING → SUBMITTED → IN_REVIEW → APPROVED | REJECTED` (plus `EXPIRED` for
documents with validity windows — **PROPOSED**).

- `SellerProfile.complianceState` is a **derived** summary: `NOT_STARTED`,
  `IN_PROGRESS`, `VERIFICATION_REQUIRED`, `COMPLIANT`, `NON_COMPLIANT`
  (all **PROPOSED**). It is never a writable input; it is recomputed from
  verification records on read.
- Evidence files are stored as opaque references with SHA-256 digests
  (**PROPOSED:** object storage with signed read references; Module 03
  database stores only references and digests, never file contents).
- Re-verification creates a new verification generation; the previous
  generation is retained append-only.

## 6. Business purpose

Module 03 enables governed seller participation in the marketplace:

- A verified, approved, and role-assigned seller may list products and trade
  (product/inventory/order capabilities belong to future modules 04/05/08).
- Admins operate a compliant onboarding/verification pipeline with full audit.
- The marketplace maintains a single source of truth for seller business
  identity, status, and compliance without ever touching authentication state.

## 7. Contracts (summary)

Detailed contracts are in WEMP-M03-CONTRACT-001 (Module 01 ↔ Module 03) and
WEMP-M03-AUTHZ-001 (Module 02 ↔ Module 03). Summary:

- **Module 01 ↔ Module 03:** seller self-registration creates/locates the
  Identity through Module 01, completes identity verification, then requests
  Seller-profile creation/association through the approved Module 03 contract.
  Membership is `SellerIdentityAssociation`; identity suspension/deactivation
  effects are defined in the contract.
- **Module 02 ↔ Module 03:** the `SELLER` role identifier already exists in the
  Module 02 `RoleName` enum (schema). Module 03 requires an approved SELLER
  role-catalog definition, `seller.*` permission identifiers, and the first
  resource-ownership resolver so permissions are organization-scoped.

## 8. Security requirements (summary)

Full requirements in §12 of this document and WEMP-M03-CONTRACT-001. Summary:

- Authentication by Module 01 (AAL2 session guard) precedes authorization by
  Module 02 (permission guard) — the established guard chain.
- Ownership checks via `SellerIdentityAssociation`; no cross-tenant access.
- KYC/KYB evidence is sensitive PII: protected storage, digests only in audit,
  admin-only `seller.evidence.read`, no PII in audit or denial responses.
- Anti-enumeration, idempotency (reuse `ApiIdempotencyRecord`), optimistic
  concurrency, rate limiting, and separation of duties (reviewer ≠ approver,
  applicant never self-approves).
- No secrets or real credentials appear in this or any Module 03 document.

## 9. Storage and schema rules (proposed)

- Module 03 adds tables only; no Module 01/02 table is modified. All changes
  are forward-only migrations.
- No foreign keys across module boundaries: `identityId` is a logical UUIDv7
  reference. Integration happens through application ports, never direct
  cross-module table reads (consistent with Module 02 implementation rules).
- Schema conventions follow the existing repository: string UUIDv7 PKs with
  `@db.Uuid`, snake_case `@map`, `@db.Timestamptz(6)`, `aggregateVersion`,
  `createdAt`/`updatedAt`, append-only transition/audit records, partial
  unique indexes where a "one active" invariant is required (as Module 02
  established for role episodes).
- PII-like business fields use protected storage patterns analogous to
  `IdentityIdentifier` (protected normalized values plus lookup digests) where
  lookup is required (e.g., business registration number).

## 10. API surface (summary)

Full proposal in WEMP-M03-PLAN-001 and §13 below. Two groups, both **PROPOSED**:

- Seller self-service: onboarding create/submit, profile read/update,
  verification submit/status, business and warehouse management, agreement
  read, member management.
- Admin: seller list/detail with non-enumerating filtering, review actions
  (request corrections, approve, reject), suspend/reactivate, evidence
  inspection, audit view.

## 11. Owner decisions required

Every item in §4–§10 marked **PROPOSED / REQUIRES APPROVAL** requires explicit
owner approval. The complete register with a decision identifier for each item
is WEMP-M03-DECISIONS-001. Nothing in this document authorizes implementation.

## 12. Security requirements (full)

### 12.1 Authentication requirements

**BINDING:** all seller and admin endpoints require a Module 01 authenticated
session. **PROPOSED:** AAL2 session guard (existing pattern) applies to all
Module 03 endpoints; no anonymous seller API.

### 12.2 Authorization permissions

**BINDING:** seller permissions are determined exclusively by Module 02 via the
permission guard. Module 03 never evaluates roles itself. **PROPOSED:**
`seller.*` permissions are organization-scoped through the approved ownership
resolver; absence of an active association denies.

### 12.3 Seller ownership checks

**PROPOSED:** every seller-scoped operation resolves the caller's
`SellerIdentityAssociation` for the target seller; the caller must be an ACTIVE
association and the seller must be in a state that permits the operation
(lifecycle §4). No owner-equals-subject shortcut outside the approved
association model.

### 12.4 Admin/Super Admin boundaries

**PROPOSED:** Admin may review/suspend/reactivate sellers with the matching
`seller.review.*`/`seller.suspend.manage` grants. Super Admin inherits only the
explicit matrix grants; no hidden override permission is proposed.

### 12.5 Sensitive KYC/KYB protection and PII

**PROPOSED:** verification evidence is encrypted at rest (platform KMS),
accessed only through signed, short-lived read references, and never logged.
Audit records store digests and references only. Denial reasons returned to
sellers are generic and never disclose reviewer policy or evidence content.

### 12.6 Upload/evidence security

**PROPOSED:** file-type allowlist, size limits, malware scanning before
persistence, server-side validation of content, and evidence immutability after
submission (append-only generations).

### 12.7 Anti-enumeration, rate limiting, idempotency, concurrency

- **PROPOSED:** generic errors for missing/forbidden sellers; no id/state
  enumeration in list APIs.
- **PROPOSED:** rate limiting on onboarding submit, verification submit, and
  evidence upload (repository `NonProductionRateLimitRecord` pattern is
  non-production; a production policy requires approval).
- **DERIVED:** idempotency reuses `ApiIdempotencyRecord` (approved Module 00
  pattern) for onboarding submit, verification submit, and review decisions.
- **DERIVED:** optimistic concurrency via `aggregateVersion` on all mutations.

### 12.8 Separation of duties

**PROPOSED:** the reviewer who assigns `UNDER_REVIEW`/`CORRECTIONS_REQUESTED`
may not be the approver for the same seller profile; the applicant identity can
never approve their own onboarding. Enforced in the application layer.

### 12.9 Audit requirements

**PROPOSED:** Module 03 business audit (`SellerBusinessAuditRecord`) records
seller lifecycle, verification, member, and agreement events (append-only, no
update/delete API). Authorization decisions remain exclusively in Module 02
`AuthorizationDecisionRecord`; Module 03 stores only the approved decision
reference when needed to explain its own action.

## 13. API specification (proposed — no controllers to be implemented)

Base path follows the repository convention (`/api/v1`). All **PROPOSED**.

| Method            | Path                                   | Permission                                                | Purpose                                |
| ----------------- | -------------------------------------- | --------------------------------------------------------- | -------------------------------------- |
| `POST`            | `/api/v1/seller/onboarding`            | `seller.onboarding.create`                                | Create `DRAFT` seller profile          |
| `POST`            | `/api/v1/seller/onboarding/submit`     | `seller.onboarding.submit`                                | Submit for review (idempotent)         |
| `GET`             | `/api/v1/seller/profile`               | `seller.profile.read`                                     | Read own seller profile                |
| `PATCH`           | `/api/v1/seller/profile`               | `seller.profile.update`                                   | Update own profile (version-checked)   |
| `POST`            | `/api/v1/seller/verification`          | `seller.verification.submit`                              | Submit KYC/KYB evidence                |
| `GET`             | `/api/v1/seller/verification`          | `seller.verification.read`                                | View own verification status           |
| `GET/PATCH`       | `/api/v1/seller/business`              | `seller.organization.read` / `seller.organization.update` | Business information                   |
| `GET/POST`        | `/api/v1/seller/warehouses`            | `seller.warehouse.read` / `seller.warehouse.manage`       | Warehouse records                      |
| `GET`             | `/api/v1/seller/agreements`            | `seller.agreement.read`                                   | Commission/agreement read              |
| `GET/POST/DELETE` | `/api/v1/seller/members`               | `seller.member.read` / `seller.member.manage`             | Seller organization members            |
| `GET`             | `/api/v1/admin/sellers`                | `seller.audit.view` (list)                                | Non-enumerating seller list/filter     |
| `GET`             | `/api/v1/admin/sellers/:id`            | `seller.audit.view`                                       | Seller detail                          |
| `POST`            | `/api/v1/admin/sellers/:id/review`     | `seller.review.decide`                                    | Approve / reject / request corrections |
| `POST`            | `/api/v1/admin/sellers/:id/suspend`    | `seller.suspend.manage`                                   | Suspend                                |
| `POST`            | `/api/v1/admin/sellers/:id/reactivate` | `seller.suspend.manage`                                   | Reactivate                             |
| `GET`             | `/api/v1/admin/sellers/:id/evidence`   | `seller.evidence.read`                                    | Inspect verification evidence          |

Error model follows the repository standard: non-disclosing, versioned
responses; no policy/evidence internals exposed.

## 14. Milestones (summary)

M03-M1 Seller Domain Foundation → M03-M2 Seller Persistence → M03-M3 Seller
Onboarding & Verification → M03-M4 Authorization & Cross-Module Integration →
M03-M5 Seller & Admin APIs → M03-M6 Web/Mobile Integration. Full per-milestone
scope, deliverables, tests, and acceptance criteria: WEMP-M03-PLAN-001.

## 15. Approval register

| ID        | Topic                                                             | Status                       |
| --------- | ----------------------------------------------------------------- | ---------------------------- |
| M03-AR-01 | Domain model, lifecycle, verification model                       | PROPOSED — REQUIRES APPROVAL |
| M03-AR-02 | SELLER role catalog + `seller.*` permissions + ownership resolver | PROPOSED — REQUIRES APPROVAL |
| M03-AR-03 | Module 01 ↔ 03 identity-association contract                      | PROPOSED — REQUIRES APPROVAL |
| M03-AR-04 | KYC/KYB evidence handling (storage, retention, encryption)        | PROPOSED — REQUIRES APPROVAL |
| M03-AR-05 | Milestone plan and Phase 1 scope                                  | PROPOSED — REQUIRES APPROVAL |

## 16. Owner decision catalogue

See WEMP-M03-DECISIONS-001 for the full register. Representative items:

- Seller membership model: single `SELLER` role + membership flags vs a
  `SELLER_MANAGER` role (decision D-01).
- Duplicate-business prevention rule (decision D-02).
- Evidence retention and expiry policy (decision D-03).
- Identity-state effect matrix on seller operations (decision D-04).
- Commission agreement model scope (decision D-05).
- Phase 1 exclusions, including storefront (decision D-06).

**End of review draft.** Nothing in this document authorizes implementation,
migration, commit, or deployment.

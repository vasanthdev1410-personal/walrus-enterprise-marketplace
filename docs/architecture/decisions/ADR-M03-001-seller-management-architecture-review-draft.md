# ADR-M03-001 — Seller Management Architecture

**Status:** REVIEW ONLY — PROPOSED / REQUIRES OWNER APPROVAL
**Date:** 2026-08-12
**Owners:** Product/Architecture, Security, Operations, Legal
**Supersedes:** nothing; it is additive to the approved Module 00/01 decisions
and to the review-only Module 02 authorization architecture (ADR-M02-001).

> This ADR is non-binding until explicitly approved. It authorizes no code,
> migration, commit, or deployment.

## Context

Module 01 proves who an identity is and owns Identity/authentication state.
Module 02 decides what an identity may do and owns roles, permissions,
assignments, and authorization decisions. The approved Module 01 v1.12 §7
assigns Seller profiles, Seller organizations, Seller onboarding, Seller
approval, GST/PAN/Bank verification, Warehouse setup, Commission agreements,
and Seller business status to Module 03, with the explicit rule that seller
permissions are determined exclusively by Module 02. No Module 03
specification currently exists; the web and mobile seller routes are
placeholders stating that seller functionality begins only in an approved
future module. A Module 03-owned decision is therefore required before any
seller capability is implemented.

## Decision proposed for approval

### 1. Module 03 is the sole owner of the seller business domain

Module 03 owns Seller profiles, organizations, onboarding, approval, business
verification (KYC/KYB incl. GST/PAN/bank), warehouses, agreements/commission
terms, and seller business status. The seller domain is implemented as a
Clean Architecture module (`presentation` / `application` / `domain` /
`infrastructure`) consistent with Module 00 conventions and the identity
module structure. Module 01 never stores seller fields; Module 03 never stores
or duplicates authentication state (credentials, MFA, recovery, Sessions).
Cross-module integration uses approved ports and logical UUIDv7 references
with no cross-module foreign keys.

### 2. Seller lifecycle is an audited, fail-closed state machine

The seller lifecycle is an append-only, version-checked state machine
(`DRAFT → SUBMITTED → UNDER_REVIEW → CORRECTIONS_REQUESTED → APPROVED → ACTIVE`,
plus `REJECTED` and `CLOSED` terminals and `SUSPENDED`/reactivation), each
transition requiring an authenticated actor, evidence, and a mandatory audit
record. Unknown or inconsistent state denies. `APPROVED → ACTIVE` is gated on
the SELLER role assignment through Module 02 — no assignment, no activation.

### 3. Seller membership without role proliferation

The `SELLER` role (already present in the Module 02 `RoleName` enum) is the
single seller role; owner/member distinction lives in
`SellerIdentityAssociation`. A seller has exactly one OWNER and any number of
MEMBER associations; membership is audited and owner-managed
(**PROPOSED — D-01**).

### 4. First resource-ownership resolver

Seller self-service permissions are organization-scoped. Module 03 owns the
association facts; Module 02 evaluates through the approved ownership-resolver
contract. This is the first ownership resolver in the platform and requires
explicit Module 02 owner approval (**PROPOSED — D-11**). There is no generic
owner-equals-subject shortcut and no administrative override.

### 5. KYC/KYB evidence is reference-only and protected

Verification evidence is stored outside the Module 03 database (object storage
with signed, short-lived read references); the database stores opaque
references and SHA-256 digests. Evidence is immutable per generation, scanned
and size/type-limited at upload, accessible only through `seller.evidence.read`
to Admin/Super Admin, and never logged or included in audit or denial
responses (**PROPOSED — D-03**).

## Consequences

- Approved: defines the Module 03 boundary, prevents duplicate identity/
  authorization/authentication logic, and provides the first governed
  seller-participation capability.
- Cost: an additive Module 02 change (SELLER catalog + `seller.*` matrix +
  ownership resolver) must be approved and implemented in M03-M4 before seller
  activation.
- Risk: KYC/KYB handling, retention, and identity-effect matrix depend on
  owner decisions D-02/D-03/D-04; these are prerequisites for M03-M3+.

**REQUIRES APPROVAL:** the exact lifecycle vocabulary (WEMP-M03-SPEC-001 §4),
Phase 1 scope (WEMP-M03-SPEC-001 §2.2), permission matrix
(WEMP-M03-AUTHZ-001), and decision register (WEMP-M03-DECISIONS-001) are
normative only after approval.

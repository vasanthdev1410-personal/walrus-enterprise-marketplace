# WALRUS Enterprise Marketplace Platform

## Module 03 — Seller Management Implementation Plan

**Document ID:** WEMP-M03-PLAN-001
**Version:** Review Draft 1.0
**Status:** REVIEW ONLY — PROPOSED / REQUIRES OWNER APPROVAL
**Effective date:** Not effective until formally approved
**Classification:** Confidential — Internal Use Only

> Companion to WEMP-M03-SPEC-001, WEMP-M03-CONTRACT-001,
> WEMP-M03-AUTHZ-001, and WEMP-M03-DECISIONS-001. Milestone IDs below are
> proposed working identifiers (M03-M1 … M03-M6) and become formal only upon
> approval of this plan. No milestone authorizes implementation before the
> Module 03 specification and the required Module 02 authorization changes are
> approved.

Milestone dependency rule: each milestone validates with the repository gate
(jest + coverage thresholds, lint, typecheck, Prisma validate, builds) and is
locally committed before the next milestone begins. No milestone touches
Module 00/01/02 production behavior except M03-M4, which is an explicitly
approved additive Module 02 change.

---

## Milestone M03-M1 — Seller Domain Foundation

- **Scope:** Pure domain layer for the seller aggregate. No schema, no
  controllers, no DI, no API.
- **Deliverables:** Domain entities (`SellerProfile`, `SellerOrganization`,
  `SellerIdentityAssociation`, `SellerBusinessVerification`,
  `SellerVerificationEvidence`, `SellerWarehouse`, `SellerAgreement`); value
  objects (`SellerState`, `VerificationType`, `VerificationState`,
  `AssociationRole`, `ComplianceState`); the seller lifecycle state machine
  with validated transitions and actor/evidence rules; domain ports for
  repositories and the Module 01/02 contracts.
- **Database changes:** none.
- **APIs:** none.
- **Tests:** domain unit tests for every lifecycle transition (allowed,
  denied, terminal, stale-version, unknown-state fail-closed), compliance
  derivation, duplicate-owner invariant, membership invariants.
- **Security acceptance:** deny on any missing/unknown/terminal-state
  transition; no cross-actor transition possible without an approved actor;
  pure and deterministic (mirrors M02-M1 standard).
- **Completion criteria:** 100% of lifecycle transition cases covered by unit
  tests; no file outside `modules/seller-management/domain` touched.

## Milestone M03-M2 — Seller Persistence

- **Scope:** Additive Prisma schema for the Module 03-owned tables, forward-only
  migrations, repository ports implemented over Prisma, mappers.
- **Deliverables:** Tables per WEMP-M03-SPEC-001 §3 (§9 storage rules: UUIDv7
  PKs, snake_case maps, `aggregateVersion`, timestamps, append-only transition
  and audit records, partial unique index for one-ACTIVE-owner, unique
  `registrationLookupDigest`); `SellerStateTransition` and
  `SellerBusinessAuditRecord` append-only write paths (no update/delete API).
- **Database changes:** new `2026xxxx_module_03_seller_management` migration(s);
  no Module 01/02 table modified; `identityId` as logical UUIDv7 reference with
  **no cross-module FK**.
- **APIs:** none (repository-level only).
- **Tests:** mapper roundtrips; unique-constraint and partial-index behavior;
  append-only audit immutability; version-stale conflict rejection;
  migration-safety tests on a clean database (established pattern).
- **Security acceptance:** no PII in plaintext columns beyond the approved
  protected-value/digest pattern; audit records store digests/references only;
  fail closed on missing repository or migration state.
- **Completion criteria:** migrations apply cleanly to a fresh database; full
  API suite + coverage thresholds pass; no Module 01/02 file modified.

## Milestone M03-M3 — Seller Onboarding & Verification (application)

- **Scope:** Application services orchestrating the onboarding lifecycle and
  KYC/KYB verification, with idempotency and concurrency.
- **Deliverables:** `requestSellerProfileCreation` (Module 01 association
  entry), onboarding submit, review-cycle handling
  (submit/corrections/approve/reject), verification submit/status,
  compliance-state derivation, evidence reference/digest recording, seller
  suspension/reactivation/closure application flows.
- **Database changes:** none new (uses M2 tables).
- **APIs:** application-level commands/queries only (no controllers).
- **Tests:** lifecycle integration tests through the application layer;
  duplicate-seller rejection; idempotent re-submission; optimistic-concurrency
  conflicts; approval-of-own-onboarding denied; reviewer≠approver enforced.
- **Security acceptance:** every mutation version-checked; every state
  transition audited; no evidence content persisted in Module 03 database
  (references + digests only); fail closed on any verification/evidence
  inconsistency.
- **Completion criteria:** negative security tests (cross-identity, stale
  version, self-approval) all pass; no presentation layer added.

## Milestone M03-M4 — Authorization & Cross-Module Integration

- **Scope:** The approved Module 02 additions and the first resource-ownership
  resolver; Module 01 association contract wiring. **This is the only
  milestone that changes Module 02, and only after explicit approval.**
- **Deliverables:** SELLER role catalog entry; `seller.*` permission
  identifiers and matrix rows per WEMP-M03-AUTHZ-001; ownership resolver
  contract and port consumed by the permission guard; Module 01 →
  Module 03 `requestSellerProfileCreation` port; gating of `APPROVED → ACTIVE`
  on the SELLER role assignment (fail closed if the assignment fails);
  identity-eligibility gate (decision D-04) at the association boundary.
- **Database changes:** Module 02 catalog is code-owned configuration
  (existing pattern — no new table required unless the ownership resolver
  needs persisted scope, which requires a separate approved decision).
- **APIs:** none new; existing guard chain (AAL2 → permission guard) applies.
- **Tests:** authorization matrix tests (each `seller.*` row grant/deny);
  ownership-scope tests (member of org A denied org B); role-assignment
  gating tests; fail-closed resolver tests; no bypass tests (Super Admin
  without `seller.review.decide` cannot review).
- **Security acceptance:** deny-by-default and explicit-deny precedence
  preserved; no hidden bypass; administrative scope unchanged; Module 02
  audit records every decision.
- **Completion criteria:** matrix + resolver tests green; full suite +
  coverage pass; Module 02 owner sign-off recorded.

## Milestone M03-M5 — Seller & Admin APIs

- **Scope:** Presentation controllers for seller self-service and admin
  surfaces per WEMP-M03-SPEC-001 §13.
- **Deliverables:** `/api/v1/seller/...` and `/api/v1/admin/sellers/...`
  controllers with the AAL2 + permission guard chain, non-disclosing error
  model, idempotency keys (reusing `ApiIdempotencyRecord`), rate limiting
  (per approved policy), and request validation.
- **Database changes:** none.
- **APIs:** the full §13 table (onboarding, profile, business, verification,
  warehouses, agreements, members, admin review/suspend/reactivate/evidence).
- **Tests:** controller integration/e2e specs (repository pattern used for
  Module 01/02 controllers); ownership tests via HTTP; anti-enumeration tests;
  idempotency tests; rate-limit tests; audit-presence assertions.
- **Security acceptance:** every endpoint behind AAL2 + permission guard;
  generic errors; no evidence/policy disclosure; KYC endpoints admin-only via
  `seller.evidence.read`.
- **Completion criteria:** e2e specs green; OpenAPI surface matches §13;
  coverage thresholds met.

## Milestone M03-M6 — Web/Mobile Seller Integration

- **Scope:** Replace the seller placeholders
  (`apps/web/app/(seller)/seller/`, `apps/mobile/lib/src/features/seller/`)
  with onboarding/verification/profile UI, and add the admin seller-review UI
  under the existing admin route.
- **Deliverables:** Web seller onboarding + profile + verification-status
  pages; admin seller review/suspend pages; mobile seller onboarding feature
  (Flutter); portal-shell integration consistent with `@walrus/ui`.
- **Database changes:** none.
- **APIs:** consumes M5 APIs only.
- **Tests:** web component/unit tests; Playwright E2E for the seller onboarding
  flow and an admin review flow; mobile widget tests (requires Flutter SDK,
  which is an environment prerequisite already declared for the repository).
- **Security acceptance:** no client-side authorization decisions; UI only
  reflects server decisions; no PII rendering outside approved screens; no
  secrets in client bundles.
- **Completion criteria:** web build/tests/E2E green; mobile tests green where
  the Flutter SDK is available; full repository gate passes.

---

## Test strategy (module-wide, mandatory)

| Area                       | Requirement                                                             |
| -------------------------- | ----------------------------------------------------------------------- |
| Domain unit tests          | Lifecycle state machine, invariants, compliance derivation              |
| API integration tests      | Every §13 endpoint through the guard chain                              |
| Database tests             | Mapper roundtrips, constraints, migration-safety on clean DB            |
| Ownership tests            | Cross-organization and cross-seller access denied                       |
| Authorization tests        | Full `seller.*` matrix grant/deny, role-state, assignment-state         |
| Negative security tests    | Privilege escalation, self-approval, stale version, forged owner        |
| Duplicate seller tests     | Registration-digest uniqueness; identity re-association idempotency     |
| Concurrency tests          | Optimistic version conflicts on all mutations                           |
| Lifecycle transition tests | Every allowed/denied/terminal transition                                |
| KYC/KYB access tests       | Evidence readable only via `seller.evidence.read`; no PII in audit      |
| Audit tests                | Append-only business audit; authorization decisions remain in Module 02 |
| E2E tests                  | Web seller onboarding + admin review; mobile widget tests               |

Quality gates preserve repository thresholds (current API coverage
≈ 90.7% lines / 89.3% functions / 80.2% branches; lint, typecheck, Prisma
validate, builds, Playwright).

**End of review draft.** No milestone is authorized until the Module 03
specification and the Module 02 authorization proposal are approved.

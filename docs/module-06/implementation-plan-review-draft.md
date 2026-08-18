# WALRUS Enterprise Marketplace Platform

## Module 06 — Customer Management Implementation Plan

**Document ID:** WEMP-M06-PLAN-001
**Version:** Review Draft 1.0
**Status:** APPROVED (M06-M1 + M06-M2 + M06-M3 + M06-M4) — signed by the
Product/Architecture Owner 2026-08-17; the M06-M4 authorization gate
(Module 02 owner sign-off, D-07/A-07) **RECORDED 2026-08-17**. M06-M5 is
**NOT** authorized and remains gated per WEMP-M06-APPROVAL-001 §4 on the
pending Security/Platform D-10 rate-limit confirmation (**PENDING — NOT
RECORDED**).
**Effective date:** 2026-08-17 (M06-M1, M06-M2, M06-M3 and M06-M4
authorized; M06-M5 only when its gate in WEMP-M06-APPROVAL-001 §4 is
satisfied)
**Classification:** Confidential — Internal Use Only

> Companion to WEMP-M06-SPEC-001, WEMP-M06-AUTHZ-001, and
> WEMP-M06-DECISIONS-001. Milestone IDs below are proposed working
> identifiers (M06-M1 … M06-M5) and become formal only upon approval of this
> plan. No milestone authorizes implementation before the Module 06
> specification, its owner decisions, and the required external sign-offs are
> approved.

Milestone dependency rule: each milestone validates with the repository gate
(jest + coverage thresholds, lint, typecheck, Prisma validate, builds) and is
locally committed before the next milestone begins. No milestone touches
Module 00/01/02/03/04/05 production behavior except M06-M4, which is an
explicitly approved additive Module 02 change. Owner decisions D-01…D-13 gate
their milestones per WEMP-M06-DECISIONS-001 §2.

---

## Milestone M06-M1 — Customer Domain Foundation

- **Scope:** Pure domain layer for the customer aggregate. No schema, no
  controllers, no DI, no API.
- **Deliverables:** Domain entities (`CustomerProfile`, `CustomerAddress`,
  `CustomerBusinessProfile`, `CustomerPreference`, `CustomerAuditRecord`,
  `CustomerStateTransition`); value objects (customer state, address role
  tags, preference key/value, customer reference, address snapshot); the
  lifecycle state machine with strict allowed transitions (D-02, fail closed
  on any invalid transition); default-address invariants (at most one
  default shipping / one default billing per profile, D-04); soft-removal
  semantics for addresses (D-04); business-profile optionality and
  registration-digest handling (D-05); allow-listed preference keys (D-06);
  version-checked profile/address/business/preference updates (D-11);
  domain ports for repositories and the future cross-module contracts
  (`CustomerProfileReadPort`, `CustomerAddressReadPort` — D-13, port-only).
- **Database changes:** none.
- **APIs:** none.
- **Files/modules expected:** `apps/api/src/modules/customer/domain/**` only.
- **Tests:** domain unit tests — creation/association with an identity
  reference; lifecycle transition matrix (allowed and denied); suspended/
  closed restrictions; default-address set/clear/remove invariants;
  address soft-removal; business-profile optionality; preference
  allow-list rejection; version-stale denial; fail-closed on any
  missing/unknown/inconsistent state.
- **Security requirements:** deny on any missing/unknown/inconsistent state;
  pure and deterministic (mirrors M03-M1/M04-M1/M05-M1 standard).
- **Acceptance criteria:** domain cases covered by unit tests; no file
  outside `modules/customer/domain` touched.
- **Authorization gate:** none (pure domain; D-01, D-02, D-04, D-05, D-06,
  D-08, D-11, D-13 owner-approved/resolved).
- **Explicit exclusions:** no persistence, no controllers, no cart/order/
  payment/shipping/notification behavior (A-13).
- **Definition of done:** unit suite green; no dependency outside the domain
  layer.

## Milestone M06-M2 — Customer Persistence

- **Scope:** Additive Prisma schema for Module 06-owned tables, forward-only
  migrations, repository ports implemented over Prisma, mappers.
- **Deliverables:** Tables per WEMP-M06-SPEC-001 §13 (UUIDv7 PKs,
  snake_case maps, `aggregateVersion`, timestamps, append-only transition
  and audit records, unique/partial-unique indexes — one profile per
  identity; at most one default shipping/billing per profile); no Module
  00/01/02/03/04/05 table modified; `identityId`/`actorIdentityId` as
  logical UUIDv7 references with **no cross-module FKs** (A-05).
- **Database changes:** new `2026xxxx_module_06_customer` migration(s),
  additive only.
- **APIs:** none (repository-level only).
- **Files/modules expected:**
  `apps/api/src/modules/customer/infrastructure/**`,
  `apps/api/prisma/schema.prisma` (additive `customer_*` section),
  `apps/api/prisma/migrations/<forward-only migration>`.
- **Tests:** mapper roundtrips; unique-constraint and partial-index behavior
  (one profile per identity; one default per role); append-only
  transition/audit immutability (D-08); version-stale conflict rejection;
  migration-safety tests on a clean database (established pattern).
- **Security requirements:** no PII in plaintext beyond required profile/
  address fields; registration references stored as lookup digests (D-05);
  no credentials/authentication material (D-01); retention fail-closed per
  D-09 (**RESOLVED 2026-08-17 via D-15 — CUSTOMER_RECORD_RETENTION_DAYS =
  2555 for CustomerStateTransition/CustomerAuditRecord; enforced by the
  M06-M3 retention processor, never by the migration**).
- **Acceptance criteria:** migrations apply cleanly to a fresh database;
  full API suite + coverage thresholds pass; no Module 00/01/02/03/04/05
  file modified.
- **Authorization gate:** ✓ **SATISFIED** — M06-M2 authorized 2026-08-17
  (WEMP-M06-APPROVAL-001 §5); D-09 retention durations **RESOLVED via
  D-15** (CUSTOMER_RECORD_RETENTION_DAYS = 2555, audit/history categories).
- **Explicit exclusions:** no controllers; no cross-module FKs; no
  notification/shipping/order tables (A-13).
- **Definition of done:** repository suite green; retention enforcement
  fail-closed without valid config.

## Milestone M06-M3 — Customer Application Services

**STATUS: AUTHORIZED 2026-08-17 (WEMP-M06-APPROVAL-001 §5, decision D-16).**

- **Scope:** Application services orchestrating customer operations with
  idempotency, concurrency, validation, and audit.
- **Deliverables:** self-service flows — profile read/update (D-01/D-11),
  address CRUD + default management (D-04), business-profile read/update
  (D-05), preference read/update (D-06); registration/association flow that
  reuses the Module 01 identity contract and requests role assignment only
  through the Module 02 contract (D-03 — no direct role mutation); lifecycle
  administration flow (D-02, mandatory reason, version-checked);
  single-transaction default-address changes with `aggregateVersion` (+
  PostgreSQL `FOR UPDATE` where contended — D-11); validation incl. DTO
  allow-listing (whitelist, reject unknown fields); append-only
  transition/audit recording (D-08); rate-limit port integration (D-10 —
  values pending Security/Platform confirmation, fail-closed default A-11);
  retention mechanism (D-09 — **RESOLVED 2026-08-17 via D-15:**
  CUSTOMER_RECORD_RETENTION_DAYS = 2555 for
  CustomerStateTransition/CustomerAuditRecord; enforcement fail-closed).
- **Database changes:** none new (uses M2 tables).
- **APIs:** application-level commands/queries only (no controllers).
- **Files/modules expected:** `apps/api/src/modules/customer/application/**`.
- **Tests:** lifecycle integration through the application layer; idempotent
  re-submission; optimistic-concurrency conflicts; default-address atomic
  swap; cross-customer access denied; suspended/closed restrictions;
  unknown/malformed ownership fail-closed; preference allow-list rejection;
  retention fail-closed (no deletion without valid config).
- **Security requirements:** every mutation version-checked and audited;
  every profile/address change scoped to the owning identity; no
  client-supplied ownership claims; fail closed on any inconsistency.
- **Acceptance criteria:** negative security tests (cross-customer, stale
  version, forged owner, malformed ownership) all pass; no presentation
  layer added.
- **Authorization gate:** none (permission guard integration is M06-M4);
  application-level authorization re-checks use the fail-closed adapter
  until then.
- **Explicit exclusions:** no controllers; no cart/order/payment/shipping/
  notification behavior (A-13); no direct role mutation (D-03).
- **Definition of done:** application suite green; every mutation audited.

## Milestone M06-M4 — Authorization & Cross-Module Integration

- **Scope:** The approved Module 02 additions and the fourth resource-
  ownership resolver (customer-identity scope); the customer self-service
  permission guard; the port contracts for future M07/M08/M10.
  **This is the only milestone that changes Module 02, and only after
  explicit approval.**
- **Deliverables:** `customer.*` permission identifiers and matrix rows per
  WEMP-M06-AUTHZ-001; ownership-resolver contract extension (fourth scope —
  customer identity) consumed by the permission guard; the customer
  self-service guard (AAL2 → permission guard → ownership) following the
  `SellerSelfServicePermissionGuard`/`InventorySellerPermissionGuard`
  pattern; fail-closed `CustomerProfileReadPort` and `CustomerAddressReadPort`
  (D-13, port-only, no consumers wired yet); replacement of any fail-closed
  customer authorization adapter by wiring the Module 02 additions at the
  port boundary.
- **Database changes:** Module 02 catalogs are code-owned configuration
  (existing pattern); no new table unless the ownership resolver needs
  persisted scope, which requires a separate approved decision.
- **APIs:** none new; existing guard chain (AAL2 → permission guard)
  applies.
- **Files/modules expected:**
  `apps/api/src/modules/authorization/**` (additive `customer.*` catalog +
  resolver scope only), `apps/api/src/modules/customer/presentation/guards/**`.
- **Tests:** authorization matrix tests (each `customer.*` row grant/deny);
  ownership-scope tests (customer A denied customer B — horizontal
  privilege escalation); fail-closed resolver tests (missing/malformed
  ownership); no-bypass tests (Super Admin without `customer.lifecycle.manage`
  cannot suspend); suspended/closed grant behavior; port-contract fail-closed
  tests; Module 02 audit-records-every-decision assertions.
- **Security requirements:** deny-by-default and explicit-deny precedence
  preserved; no hidden bypass; administrative scope unchanged; Module 02
  audit records every decision; **no `customer.*` grant effective until
  M06-M4 implements the Module 02 additions** (D-07/A-07 — Module 02 owner
  sign-off **RECORDED 2026-08-17**).
- **Acceptance criteria:** matrix + resolver tests green; full suite +
  coverage pass; Module 02 owner sign-off **RECORDED** (gate).
- **Authorization gate:** Module 02 owner sign-off (D-07/A-07) — **RECORDED
  2026-08-17** (WEMP-M06-AUTHZ-001 §7); M06-M4 authorized and complete.
- **Explicit exclusions:** no customer HTTP surface (M06-M5); no M07/M08/M10
  wiring.
- **Definition of done:** matrix + resolver tests green; sign-off recorded.

## Milestone M06-M5 — Customer APIs & Web/Mobile Integration

- **Scope:** Presentation controllers for customer self-service and admin
  surfaces, plus web and mobile UI integration per WEMP-M06-SPEC-001
  §14–§16.
- **Deliverables:** `/api/v1/customer/...` and `/api/v1/admin/customers/...`
  controllers (including the lifecycle-administration endpoint with
  mandatory reason and the audit-view endpoint) with the AAL2 + permission
  guard chain, non-disclosing error model, idempotency keys (reusing
  `ApiIdempotencyRecord`), rate limiting, and request validation
  (allow-listed DTOs, D-03/D-04/D-06). Web customer self-service pages under
  the existing `(customer)` route group and admin customer pages under the
  existing `(admin)` route group; typed API client mirroring `seller-api.ts`
  conventions; **no advanced UI design** (D-12). Mobile read-only own
  profile + address read in `apps/mobile/lib/src/features/` (D-12, A-12 —
  no mutations, no admin controls); no client-side authorization (A-08).
- **Database changes:** none.
- **APIs:** the full proposed §14 table.
- **Files/modules expected:** `apps/api/src/modules/customer/presentation/**`,
  `apps/web/app/(customer)/**`, `apps/web/app/(admin)/**`,
  `apps/web/src/features/customer/**`, `apps/web/src/lib/customer-api.ts` (+
  tests), `apps/mobile/lib/src/features/customer/**`, `apps/mobile/test/**`.
- **Tests:** controller integration/e2e specs; ownership tests via HTTP;
  anti-enumeration tests; idempotency tests; rate-limit tests;
  audit-presence assertions; web component/unit tests; Playwright E2E for
  the customer self-service flow and an admin lifecycle/audit flow; mobile
  widget tests where the Flutter SDK is available.
- **Security acceptance:** every endpoint behind AAL2 + permission guard;
  generic non-disclosing errors; DTO allow-listing (mass-assignment
  protection); **no surface exposed before M06-M4 implements the Module 02
  additions (sign-off PENDING) and the Security/Platform D-10 rate-limit
  confirmation (PENDING)**; retention enforcement requires valid D-09
  config (fail closed); cross-customer access denied end-to-end.
- **Acceptance criteria:** e2e specs green; OpenAPI surface matches §14;
  coverage thresholds met; web build/tests/E2E green; mobile tests green
  where the Flutter SDK is available (M06-R06 environment gating); full
  repository gate passes.
- **Authorization gate:** Module 02 sign-off (D-07/A-07) — **RECORDED
  2026-08-17** — + Security/Platform rate-limit confirmation (D-10/A-11) —
  **PENDING — NOT RECORDED** (blocks M06-M5 only).
- **Explicit exclusions:** no advanced UI design; no cart/order/payment/
  shipping/notification surfaces (A-13); no mobile mutation.
- **Definition of done:** full gate green; web + mobile surfaces render
  server-authoritative data only.

---

## Test strategy (module-wide, mandatory)

| Area                        | Requirement                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| Domain unit tests           | Creation/association; lifecycle transition matrix; default-address invariants; fail-closed |
| API integration tests       | Every proposed §14 endpoint through the guard chain                                        |
| Database tests              | Mapper roundtrips, constraints, migration-safety on clean DB                               |
| Ownership tests             | Cross-customer and cross-identity access denied (horizontal privilege escalation)          |
| Authorization tests         | Full `customer.*` matrix grant/deny, role-state, resolver behavior                         |
| Negative security tests     | Privilege escalation, stale version, forged owner, malformed ownership, mass assignment    |
| Concurrency/race tests      | Version conflicts + default-address atomic swap under concurrency (D-11)                   |
| Idempotency tests           | Idempotent re-submission of every mutation (A-09)                                          |
| Retention tests             | Fail-closed deletion without valid config; legal-hold protection (D-09)                    |
| Audit tests                 | Append-only transition/audit immutability; authorization decisions remain in Module 02     |
| Anti-enumeration tests      | Unknown profile/address references indistinguishable and denied                            |
| Suspended/closed tests      | Self-service mutations deny while SUSPENDED/CLOSED; audit visibility retained              |
| Cross-module contract tests | `CustomerProfileReadPort`/`CustomerAddressReadPort` fail-closed shapes (D-13)              |
| E2E tests                   | Web customer self-service + admin lifecycle/audit; mobile read-only widget tests           |

Quality gates preserve repository thresholds (API coverage ≈ 91% lines,
web ≈ 89% lines; lint, typecheck, Prisma validate, builds, Playwright).

**End of review draft.** No milestone is authorized. Each milestone remains
gated per WEMP-M06-APPROVAL-001 §4 on the pending external conditions
(Module 02 owner sign-off; Security/Platform rate-limit confirmation;
Legal/Compliance customer-record retention durations).

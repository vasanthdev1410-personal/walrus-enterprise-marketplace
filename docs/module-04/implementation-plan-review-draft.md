# WALRUS Enterprise Marketplace Platform

## Module 04 — Product Catalog Implementation Plan

**Document ID:** WEMP-M04-PLAN-001
**Version:** Review Draft 1.0
**Status:** APPROVED — signed by the Product/Architecture Owner 2026-08-14
**Effective date:** 2026-08-14 (M04-M1/M04-M2 authorized now; later milestones gated per §3 of WEMP-M04-APPROVAL-001)
**Classification:** Confidential — Internal Use Only

> Companion to WEMP-M04-SPEC-001, WEMP-M04-CONTRACT-001,
> WEMP-M04-AUTHZ-001, and WEMP-M04-DECISIONS-001. Milestone IDs below are
> proposed working identifiers (M04-M1 … M04-M6) and become formal only upon
> approval of this plan. No milestone authorizes implementation before the
> Module 04 specification, its owner decisions, and the required Module 02
> authorization changes are approved.

Milestone dependency rule: each milestone validates with the repository gate
(jest + coverage thresholds, lint, typecheck, Prisma validate, builds) and is
locally committed before the next milestone begins. No milestone touches
Module 00/01/02/03 production behavior except M04-M4, which is an explicitly
approved additive Module 02 change. Owner decisions D-01…D-17 gate their
milestones per WEMP-M04-DECISIONS-001.

---

## Milestone M04-M1 — Product Domain Foundation

- **Scope:** Pure domain layer for the product-catalog aggregate. No schema,
  no controllers, no DI, no API.
- **Deliverables:** Domain entities (`Product`, `ProductVariant`,
  `ProductSku`, `ProductCategory`, `ProductAttributeDefinition`,
  `ProductAttributeValue`, `ProductMedia`, `ProductStateTransition`,
  `ProductAuditRecord`); value objects (proposed lifecycle state,
  attribute value types, SKU value object); the product lifecycle state
  machine with validated transitions and actor rules (subject to decision
  D-02); category/attribute/SKU validation policies (subject to D-03/D-04/
  D-06/D-16); domain ports for repositories and the Module 02/03/05
  contracts.
- **Database changes:** none.
- **APIs:** none.
- **Tests:** domain unit tests for every lifecycle transition (allowed,
  denied, terminal, stale-version, unknown-state fail-closed), category/
  attribute validation, variant/SKU invariants, ownership invariants.
- **Security acceptance:** deny on any missing/unknown/terminal-state
  transition; pure and deterministic (mirrors M03-M1 standard).
- **Completion criteria:** lifecycle and validation cases covered by unit
  tests; no file outside `modules/product-catalog/domain` touched.
- **Owner decisions required before start:** D-01, D-02, D-03 (taxonomy
  shape), D-04, D-05, D-06, D-16.

## Milestone M04-M2 — Product Persistence

- **Scope:** Additive Prisma schema for Module 04-owned tables, forward-only
  migrations, repository ports implemented over Prisma, mappers.
- **Deliverables:** Tables per WEMP-M04-SPEC-001 §17 (UUIDv7 PKs, snake_case
  maps, `aggregateVersion`, timestamps, append-only transition and audit
  records, unique/partial-unique indexes per approved scope); no Module
  01/02/03 table modified; `sellerProfileId`/`identityId` as logical UUIDv7
  references with **no cross-module FKs**.
- **Database changes:** new `2026xxxx_module_04_product_catalog`
  migration(s), additive only.
- **APIs:** none (repository-level only).
- **Tests:** mapper roundtrips; unique-constraint and partial-index behavior;
  append-only audit immutability; version-stale conflict rejection;
  migration-safety tests on a clean database (established pattern).
- **Security acceptance:** no PII in plaintext columns; media stores
  references/digests only; fail closed on missing repository or migration
  state.
- **Completion criteria:** migrations apply cleanly to a fresh database;
  full API suite + coverage thresholds pass; no Module 00/01/02/03 file
  modified.

## Milestone M04-M3 — Catalog Application Services

- **Scope:** Application services orchestrating product lifecycle, category/
  attribute/variant/SKU management, media reference recording, and
  moderation state, with idempotency and concurrency.
- **Deliverables:** create/update/submit/close product flows; variant and
  SKU management; media reference+digest recording (never content);
  category read; moderation state transitions (subject to D-10); compliance
  with pricing-data boundaries (D-07 — no fee/tax/commission computation).
- **Database changes:** none new (uses M2 tables).
- **APIs:** application-level commands/queries only (no controllers).
- **Tests:** lifecycle integration tests through the application layer;
  duplicate-SKU rejection; idempotent re-submission; optimistic-concurrency
  conflicts; cross-seller access denied; moderation SoD enforced.
- **Security acceptance:** every mutation version-checked; every state
  transition audited; no media content persisted in Module 04 database
  (references + digests only); fail closed on any inconsistency.
- **Completion criteria:** negative security tests (cross-seller, stale
  version, self-approval) all pass; no presentation layer added.
- **Owner decisions required before start:** D-07 (pricing fields), D-09
  (media policy), D-10 (moderation flow), D-17 (retention) — all resolved;
  D-17 Legal/Compliance sign-off recorded 2026-08-14; enforcement of
  retention uses the fail-closed config mechanism until jurisdiction-specific
  durations are supplied (no durations invented or hard-coded).

## Milestone M04-M4 — Authorization & Cross-Module Integration

- **Scope:** The approved Module 02 additions and the second
  resource-ownership resolver; Module 03 seller-association gate wiring;
  fail-closed inventory contract port. **This is the only milestone that
  changes Module 02, and only after explicit approval.**
- **Deliverables:** `product.*`/`catalog.*` permission identifiers and
  matrix rows per WEMP-M04-AUTHZ-001; ownership-resolver contract extension
  consumed by the permission guard; seller-eligibility gate (approved/ACTIVE
  seller) at the product-creation boundary; fail-closed
  `ProductInventoryContractPort` (returns unavailable until Module 05).
- **Database changes:** Module 02 catalogs are code-owned configuration
  (existing pattern); no new table unless the ownership resolver needs
  persisted scope, which requires a separate approved decision.
- **APIs:** none new; existing guard chain (AAL2 → permission guard) applies.
- **Tests:** authorization matrix tests (each `product.*` row grant/deny);
  ownership-scope tests (seller A denied seller B); seller-eligibility gating
  tests; fail-closed resolver tests; no-bypass tests (Super Admin without
  `product.review.decide` cannot moderate).
- **Security acceptance:** deny-by-default and explicit-deny precedence
  preserved; no hidden bypass; administrative scope unchanged; Module 02
  audit records every decision.
- **Completion criteria:** matrix + resolver tests green; full suite +
  coverage pass; Module 02 owner sign-off recorded.
- **Owner decisions required before start:** D-01 (member vs owner),
  D-11 (Module 02 approval), D-12 (visibility gate), D-08 (inventory port
  shape).

## Milestone M04-M5 — Seller & Admin APIs

- **Scope:** Presentation controllers for seller self-service and admin
  surfaces per WEMP-M04-SPEC-001 §18.
- **Deliverables:** `/api/v1/seller/products/...` and
  `/api/v1/admin/products/...` controllers with the AAL2 + permission guard
  chain, non-disclosing error model, idempotency keys (reusing
  `ApiIdempotencyRecord`), rate limiting (per the recorded production policy
  — D-15, 2026-08-14: 10/30/50 per hour classes), and request validation
  (D-16).
- **Database changes:** none.
- **APIs:** the full proposed §18 table.
- **Tests:** controller integration/e2e specs; ownership tests via HTTP;
  anti-enumeration tests; idempotency tests; rate-limit tests;
  audit-presence assertions.
- **Security acceptance:** every endpoint behind AAL2 + permission guard;
  generic errors; no media/policy disclosure; media metadata admin-only via
  `product.media.read`.
- **Completion criteria:** e2e specs green; OpenAPI surface matches §18;
  coverage thresholds met.
- **Owner decisions required before start:** D-14 (endpoint/surface shape)
  (D-15 rate-limit policy resolved 2026-08-14).

## Milestone M04-M6 — Web/Mobile Catalog Integration

- **Scope:** Seller catalog-management UI under the existing `(seller)` web
  route group and the mobile seller feature; admin product-moderation UI
  under the existing `(admin)` route group.
- **Deliverables:** Web seller product list/create/edit/submit/status pages;
  admin product review/suspend-style moderation pages; mobile seller catalog
  feature (per approved surface scope, D-14); portal-shell integration
  consistent with `@walrus/ui`; typed API client mirroring the Module 03
  `seller-api.ts` conventions.
- **Database changes:** none.
- **APIs:** consumes M5 APIs only.
- **Tests:** web component/unit tests; Playwright E2E for the seller catalog
  flow and an admin moderation flow; mobile widget tests where the Flutter
  SDK is available.
- **Security acceptance:** no client-side authorization decisions; UI only
  reflects server decisions; no media content rendered outside approved
  screens; no secrets in client bundles.
- **Completion criteria:** web build/tests/E2E green; mobile tests green
  where the Flutter SDK is available; full repository gate passes.
- **Owner decisions required before start:** D-14 (surface scope).

---

## Test strategy (module-wide, mandatory)

| Area                       | Requirement                                                            |
| -------------------------- | ---------------------------------------------------------------------- |
| Domain unit tests          | Product lifecycle state machine, category/attribute/SKU invariants     |
| API integration tests      | Every proposed §18 endpoint through the guard chain                    |
| Database tests             | Mapper roundtrips, constraints, migration-safety on clean DB           |
| Ownership tests            | Cross-seller and cross-organization access denied                      |
| Authorization tests        | Full `product.*` matrix grant/deny, role-state, association-state      |
| Negative security tests    | Privilege escalation, self-approval, stale version, forged owner       |
| Duplicate/SKU tests        | SKU uniqueness scope; idempotent re-submission                         |
| Concurrency tests          | Optimistic version conflicts on all mutations                          |
| Lifecycle transition tests | Every allowed/denied/terminal transition                               |
| Media access tests         | Media readable only via approved permissions; no content in audit      |
| Audit tests                | Append-only product audit; authorization decisions remain in Module 02 |
| E2E tests                  | Web seller catalog + admin moderation; mobile widget tests             |

Quality gates preserve repository thresholds (API coverage ≈ 91% lines,
web ≈ 89% lines; lint, typecheck, Prisma validate, builds, Playwright).

**End of review draft.** No milestone is authorized until the Module 04
specification, its owner decisions, and the Module 02 authorization proposal
are approved.

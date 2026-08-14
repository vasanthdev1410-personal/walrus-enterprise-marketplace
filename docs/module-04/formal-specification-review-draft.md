# WALRUS Enterprise Marketplace Platform

## Module 04 — Product Catalog

**Document ID:** WEMP-M04-SPEC-001
**Version:** Review Draft 1.0
**Status:** APPROVED — signed by the Product/Architecture Owner 2026-08-14
**Effective date:** Not effective until formally approved
**Classification:** Confidential — Internal Use Only

> This document is not an authorization to implement. It preserves Module 00,
> Module 01, Module 02, and Module 03 exactly as they are. Every item marked
> **PROPOSED / REQUIRES APPROVAL** or **OWNER DECISION REQUIRED** is
> non-binding until the product/architecture owner records explicit approval.
> This document defines the product-catalog business domain only; it does not
> duplicate Module 01 authentication, Module 02 authorization, or Module 03
> seller management, and it must not be read as authorizing any database
> migration, controller, role change, or UI.

## 1. Authority and evidence classification

This review draft uses the three evidence labels established by
WEMP-M02-SPEC-001 and WEMP-M03-SPEC-001:

- **BINDING:** directly required by accepted Module 00 architecture, the
  approved Module 01 specification/contracts, or the approved Module 03
  specification/contracts.
- **DERIVED:** necessary to satisfy a binding contract without adding a new
  business policy; requires confirmation as part of approving this document.
- **PROPOSED / REQUIRES APPROVAL:** policy, vocabulary, scope, or protocol not
  fully specified by an approved source. It must not be implemented merely
  because it appears here.
- **OWNER DECISION REQUIRED:** a business rule or scope choice with no
  repository authority and no safe architecture-supported default. It is a
  recorded condition on a milestone and must never be silently assumed.

Authoritative inputs used for this draft:

1. `docs/module-01/specifications/Module 01 Corrected Draft v1.12.txt`
   (approved) — the module landscape ("Consumed By" lists of Parts 3, 4, 7, 9),
   the universal Identity model, cross-module storage isolation, and the
   rule that seller permissions are determined exclusively by Module 02.
2. `docs/module-03/formal-specification-review-draft.md` (approved
   WEMP-M03-SPEC-001) — Phase 1 exclusions (decision D-06), the seller
   eligibility statement ("a verified, approved, and role-assigned seller may
   list products"), and the Module 02 ↔ Module 03 SELLER authorization
   contract.
3. `docs/module-03/decision-register-review-draft.md` (approved
   WEMP-M03-DECISIONS-001) — decisions D-05 (commission/finance scope),
   D-06 (exclusions), D-09 (warehouse model), D-11 (Module 02 authorization
   changes and the first ownership resolver).
4. `docs/module-02/implementation-spec.md` and the Module 02 permission/role
   catalogs in `apps/api/src/modules/authorization/domain` — the
   `resource.action` identifier format, the role matrix
   (`CUSTOMER`/`SELLER`/`ADMIN`/`SUPER_ADMIN`), deny-by-default, and the
   resource-ownership-resolver contract precedent.
5. `apps/api/prisma/schema.prisma` and the migration directory — Module 00/01/02/03
   schema conventions (UUIDv7 string PKs, snake_case `@map`,
   `@db.Timestamptz(6)`, `aggregateVersion`, append-only transition and audit
   records, forward-only migration naming `2026MMDDHHMMSS_module_XX_...`).
6. `docs/architecture/decisions/ADR-001-018.md` and the ADR register — ADR-006
   (PostgreSQL + Prisma forward-only migrations), ADR-007 (Redis cache
   foundation), ADR-008 (Cloudflare R2 storage target), ADR-015/016 (single
   Next.js app with isolated route groups; single Flutter app, mobile admin
   excluded), ADR-017 (Clean Architecture layers).
7. `docs/module-03/cross-module-contracts-review-draft.md` (approved
   WEMP-M03-CONTRACT-001) — the Module 01 ↔ Module 03 identity/seller
   association contract and the Module 02 ↔ Module 03 ownership-resolver
   contract that Module 04 must consume.
8. Web and mobile catalog placeholders: there are **no** product/catalog
   routes or features in `apps/web` or `apps/mobile` today (catalog-management
   UI was explicitly excluded from Module 03, decision D-06).

## 2. Purpose and ownership

### 2.1 Binding purpose

**BINDING (approved Module 01 landscape):** Module 04 – Product Catalog is a
named future module in the approved architecture. The approved Module 01
Part 7 (API/DTO/validation/error/integration standards) and Part 9
(infrastructure and operations standards) outputs are declared consumed by
Module 04. No module shall define independent API, DTO, validation, or
database standards.

**BINDING (Module 01 v1.12 §7):** seller permissions shall be determined
exclusively by Module 02. Module 04 shall not implement its own authorization
engine, roles, or permission checks.

**BINDING (Module 03 §6 and WEMP-M03-SPEC-001 §2.2):** a verified, approved,
and role-assigned seller may list products; product catalog capabilities
belong to future module 04. Storefront/store-builder, catalog-management UI,
and marketplace discovery surfaces are explicitly excluded from Module 03
(decision D-06) and are therefore **PROPOSED** to be Module 04 scope or a
later module, per the D-06 exclusion.

**BINDING (Module 01 Part 7.3 §12 and Module 02/03 implementation rules):**
cross-module storage isolation: no cross-module foreign keys; integration
through approved ports; Module 04 never reads Module 01/02/03 storage and
vice versa.

### 2.2 Proposed ownership and Phase 1 scope

**PROPOSED / REQUIRES APPROVAL:** Module 04 owns the product-catalog business
domain for approved sellers: product definitions, product categories, product
attributes, product variants, SKU records, product media references, product
lifecycle and approval state, and catalog audit. It does **not** own stock,
stock levels, reservations, or availability — those are **OWNER DECISION
REQUIRED** to be owned by Module 05 – Inventory Management (see §11).

Explicit exclusions from Module 04 Phase 1 (see §27 for the full list):

- Authentication, credentials, MFA, recovery, Sessions, and AAL — Module 01.
- Roles, permissions, assignments, authorization decisions, and
  authorization audit — Module 02 (consumed through approved contracts).
- Seller profiles, onboarding, verification, warehouses, agreements, and
  seller business status — Module 03 (consumed through approved contracts).
- Inventory/stock, cart, orders, payments, shipping — future modules 05, 07,
  08, 09, 10.
- Storefront, marketplace discovery, and search surfaces — **PROPOSED** to be
  a later module or milestone; not part of this specification
  (decision D-06 precedent).
- Commission rates, transaction/platform fees, settlement, payouts, tax and
  invoice calculation, and ledger logic — explicitly out of scope per
  Module 03 decision D-05 (future Finance/Commission module).

## 3. Business purpose

Module 04 enables a governed, sellable product catalog:

- Approved sellers define products with structured categories, attributes,
  variants, SKUs, pricing data, and media.
- The platform applies a product approval/moderation gate so only moderated
  products become visible to trading modules (05/07/08).
- The catalog is the single source of truth for product definition data that
  inventory (05), cart (07), orders (08), and future discovery surfaces
  consume through approved contracts.
- Catalog data never touches authentication state (Module 01) or
  authorization policy (Module 02), and never reads seller business data
  beyond the approved association facts it is given.

## 4. Seller → Product ownership model (proposed)

**BINDING:** products are listed by sellers; only an approved, role-assigned
seller may list products (Module 03 §6).

**PROPOSED / REQUIRES APPROVAL:** ownership follows the Module 03
`SellerIdentityAssociation` model:

- Every `Product` belongs to exactly one seller organization
  (`sellerProfileId` logical reference; no cross-module FK).
- The owning seller organization is resolved from the caller's ACTIVE
  `SellerIdentityAssociation` through the Module 02 ownership-resolver
  contract (the Module 03 precedent, decision D-11). This is the second
  ownership resolver in the platform and required explicit Module 02 owner
  approval (WEMP-M04-AUTHZ-001) — **sign-off recorded 2026-08-14**.
- An identity may hold associations to multiple seller organizations; catalog
  operations are always scoped to the target seller organization and deny
  cross-seller access (fail closed).

**RESOLVED — OWNER-APPROVED (2026-08-14, decision D-01):** catalog
management is owner-only. Management actions (`product.create`,
`product.update`, `product.close`, `product.media.manage`,
`product.sku.manage`) resolve to the OWNER association; MEMBER
associations are read-only (`product.read`, `catalog.category.read`).
Mirrors the approved Module 03 `seller.member.manage` owner-only pattern.

## 5. Product lifecycle/status model (proposed)

**RESOLVED — OWNER-APPROVED (2026-08-14, decision D-02, option A).** The
lifecycle is an append-only, version-checked state machine on
`Product.state`, mirroring the approved Module 03 seller lifecycle pattern
(audited transitions, mandatory actor, `aggregateVersion`, fail closed on
unknown/missing state). Adopted vocabulary:

`DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED → PUBLISHED`, plus
`CORRECTIONS_REQUESTED` (rework), `REJECTED` (terminal), `UNPUBLISHED`
(reversible withdrawal from trading), and `CLOSED` (terminal).

Adopted invariants:

1. Only products in `PUBLISHED` are visible/consumable by trading modules
   (05/07/08) — **RESOLVED — OWNER-APPROVED (2026-08-14, decision D-12,
   option A):** enforced through a fail-closed `ProductCatalogReadPort` that
   returns PUBLISHED products only; non-PUBLISHED/unknown states are
   excluded; consumers are wired only through future approved contracts.
2. `REJECTED` and `CLOSED` are terminal; reactivation is a new product
   (no reopening).
3. Edits to a `PUBLISHED` product start a new review cycle (re-moderation)
   before re-publication.
4. State transitions are recorded in an append-only
   `ProductStateTransition`; every mutation is version-checked; any missing,
   unknown, or inconsistent state denies (fail closed).

## 6. Product categories

**RESOLVED — OWNER-APPROVED (2026-08-14, decision D-03, option A).**
Categories are platform-defined and admin-managed:

- `ProductCategory` is a platform-owned taxonomy with an optional parent
  (hierarchical); category management is an Admin/Super Admin surface via an
  explicit `catalog.category.manage` permission (WEMP-M04-AUTHZ-001).
- Categories have a simple ACTIVE/RETIRED lifecycle; changes are audited.
- Sellers read categories only (`catalog.category.read`); no seller-defined
  categories in Phase 1.
- Products reference categories by ID (logical reference within Module 04
  storage; the category table is Module 04-owned).
- Category data must support future discovery surfaces, but no search or
  storefront behavior is implemented in Module 04 (decision D-13).

## 7. Product attributes

**RESOLVED — OWNER-APPROVED (2026-08-14, decision D-04, option A).**
Attribute vocabulary is platform-defined and admin-managed:

- `ProductAttributeDefinition`: platform-owned vocabulary (name, value
  type, unit where applicable, required/optional, allowed values or bounds,
  group); managed by Admin/Super Admin via an explicit
  `catalog.attribute.manage` permission (WEMP-M04-AUTHZ-001).
- `ProductAttributeValue`: per-product (or per-variant) values referencing
  ACTIVE definitions; validated against the definition at write time
  (typed, constrained).
- Storage is structured/typed (no free-form key/value).
- Whether attributes affect search/filtering is deferred to decision D-13
  (discovery ownership); no search behavior is implemented in Module 04.

## 8. Product variants

**RESOLVED — OWNER-APPROVED (2026-08-14, decision D-05, option A).**
Structured, single-level variants:

- A `Product` may be a single sellable item (no variants) or a parent with
  one or more `ProductVariant` children (one level only; no variant-of-
  variant nesting in Phase 1).
- Variant dimensions are a validated subset of the product's attribute
  definitions (D-04); variant attribute values are validated against those
  definitions.
- Each variant carries its own SKU (D-06), pricing data (D-07), media
  references, and lifecycle state; publication is gated on the parent
  product's approval state.

## 9. SKU model

**RESOLVED — OWNER-APPROVED (2026-08-14, decision D-06, option A).**

- `ProductSku` (one per product or per variant, per D-05) is the
  inventory-referenceable sellable-unit identifier.
- SKU uniqueness is scoped **per seller organization** (resolved through the
  ownership resolver); SKUs are **seller-supplied** with a validated format
  (charset/length bounds confirmed in decision D-16).
- SKUs are **immutable once the product/variant is `PUBLISHED`**; the domain
  enforces this version-checked, fail-closed.
- The SKU value is the reference Module 05 consumes for the sellable unit
  (inventory boundary, decision D-08).

## 10. Pricing data boundaries

**RESOLVED — OWNER-APPROVED (2026-08-14, decision D-07, option A).**
Record-only pricing definition data; the binding D-05 constraint (never
fees/tax/commission) is unchanged:

- Module 04 stores the **selling price** and an optional **compare-at/list
  price** (display only) for the configured single platform currency, with
  validity windows and a versioned/audited price history.
- No tax computation, fee, commission, or settlement logic exists in
  Module 04 (D-05/A-07).
- Sale/discount pricing is deferred to a future promotions capability (no
  promotions module exists in the approved landscape); Module 04 records the
  current selling price only.
- Price bounds/validation are confirmed in decision D-16.

## 11. Inventory integration boundary with future Module 05

**RESOLVED — OWNER-APPROVED (2026-08-14, decision D-08, option A).**

- Module 04 owns product/variant/SKU **definition** and publishes catalog
  facts (product, variant, SKU identifiers, sellable-unit references).
- Module 05 – Inventory Management owns stock levels, availability,
  reservations, and stock movements, and consumes SKU references from
  Module 04 through an approved contract (WEMP-M04-CONTRACT-001 Part C).
- Module 04 exposes a **fail-closed inventory contract port** and never
  persists stock quantities; until an approved Module 05 specification
  exists, the port returns no availability (fail closed), exactly as the
  Module 01 → Module 02 boundary ports behave today.
- Module 04 Phase 1 stores **no warehouse reference** on products or
  variants; warehouse↔stock association is a Module 05 inventory concern
  (Module 03 D-09 has no warehouse activation gate). Final contract shape is
  confirmed when the Module 05 specification is approved.

## 12. Product images/media

**BINDING (unchanged):** Cloudflare R2 is the approved storage target
(ADR-008); the Module 03 evidence pattern is binding (object storage with
signed, short-lived read references; DB stores references + SHA-256 digests
only; content never logged).

**RESOLVED — OWNER-APPROVED (2026-08-14, decision D-09, option A):**

- `ProductMedia` records store opaque storage references and SHA-256 digests
  in the Module 04 database; binary content lives in R2-compatible object
  storage with signed, short-lived read references.
- Policy: approved image file-type allowlist (exact list in D-16), per-file
  size and per-product count limits, malware/type verification before the
  reference is recorded, media moderation as part of the product approval
  flow (D-10), and configurable, audited retention durations per media
  category with legal-hold protection and auditable deletion (Module 03 D-03
  retention architecture, decision D-17; no compliance claim).
- No image processing pipeline (thumbnails/resizing) in Phase 1 — deferred
  (unestablished infrastructure).

## 13. Product approval/moderation flow

**RESOLVED — OWNER-APPROVED (2026-08-14, decision D-10, option A).**
Pre-approval with separation of duties, mirroring the approved Module 03
seller-onboarding pattern (Module 03 §12/D-08):

1. Seller submits a `DRAFT`/edited product for approval (`SUBMITTED`).
2. A moderator claims review (`UNDER_REVIEW`), may request corrections
   (`CORRECTIONS_REQUESTED`), and decides approve/reject.
3. Approval gates publication (`APPROVED → PUBLISHED`); only PUBLISHED
   products are consumable by trading modules (D-12). `REJECTED`/`CLOSED`
   are terminal (D-02).
4. Separation of duties enforced: reviewer ≠ approver; the submitting
   seller (or owner) can never approve their own product.
5. Moderation role: **no new role**. Moderation is performed by
   ADMIN/SUPER_ADMIN via the explicit `product.review.decide` grant
   (WEMP-M04-AUTHZ-001). The Module 02 `RoleName` enum is unchanged.
6. Re-moderation: edits to a PUBLISHED product start a new review cycle
   before re-publication (D-02).

## 14. Seller permissions (proposed)

Full vocabulary and matrix in WEMP-M04-AUTHZ-001. Summary — **all
PROPOSED / REQUIRES APPROVAL**, additive Module 02 catalog entries in the
approved `resource.action` format, granted to the `SELLER` role and scoped
through the ownership resolver:

| Identifier (proposed)   | Intended use                             |
| ----------------------- | ---------------------------------------- |
| `product.create`        | Create a `DRAFT` product                 |
| `product.read`          | Read own products (never another seller) |
| `product.update`        | Update own products (version-checked)    |
| `product.submit`        | Submit for moderation                    |
| `product.close`         | Withdraw/unpublish own product           |
| `product.media.manage`  | Upload/replace own product media         |
| `product.sku.manage`    | Manage SKUs on own products              |
| `catalog.category.read` | Read platform categories                 |

**RESOLVED — OWNER-APPROVED (2026-08-14, decision D-11, option A):** the
identifier set and the separate-permission structure (incl.
`product.media.manage` and `product.sku.manage` as distinct identifiers)
are approved as presented in WEMP-M04-AUTHZ-001; **Module 02 owner
sign-off recorded 2026-08-14**.

## 15. Admin/Super Admin permissions (proposed)

Full vocabulary and matrix in WEMP-M04-AUTHZ-001. Summary — **all
PROPOSED / REQUIRES APPROVAL**:

| Identifier (proposed)      | Intended use                               |
| -------------------------- | ------------------------------------------ |
| `product.review.decide`    | Approve/reject/request corrections         |
| `product.audit.view`       | Product list/detail and audit records      |
| `product.media.read`       | Inspect product media (sensitive)          |
| `catalog.category.manage`  | Create/update/retire platform categories   |
| `catalog.attribute.manage` | Create/update/retire attribute definitions |

**RESOLVED — OWNER-APPROVED (2026-08-14, decision D-11, option A):** the
`product.manage.override` administrative override is **not** approved; Super
Admin receives only explicit matrix grants (Module 03 D-08 precedent).

## 16. Cross-seller isolation (proposed)

- Every seller-scoped catalog operation resolves the caller's ACTIVE
  `SellerIdentityAssociation` for the target seller and denies without it
  (fail closed), through the Module 02 ownership-resolver contract.
- No client-supplied ownership claims; scope is always resolved server-side.
- No cross-seller enumeration: list APIs return only the caller's seller
  scope; admin list APIs are non-enumerating (Module 03 anti-enumeration
  pattern).
- No global catalog read exists in Module 04 for unauthenticated consumers;
  discovery surfaces are excluded from this module (§2.2, §27).

## 17. Domain/database models required (proposed)

All entities are **PROPOSED / REQUIRES APPROVAL** and Module 04-owned,
following Module 03 schema conventions (UUIDv7 string PKs, snake_case
`@map`, `@db.Timestamptz(6)`, `aggregateVersion`, `createdAt`/`updatedAt`,
append-only transition and audit records, no cross-module FKs —
`sellerProfileId` and `identityId` are logical UUIDv7 references).

| Entity                       | Responsibility                                                      | Key fields (proposed)                                                                                          |
| ---------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `Product`                    | Catalog aggregate root; owns lifecycle and approval state           | `productId`, `sellerProfileId` (logical), `state`, `categoryId` (logical), `aggregateVersion`, timestamps      |
| `ProductVariant`             | Sellable child of a product (optional)                              | `variantId`, `productId`, `skuReference`, `state`, `aggregateVersion`, timestamps                              |
| `ProductSku`                 | Inventory-referenceable unit                                        | `skuId`, `productId`/`variantId`, `skuCode` (unique per owner-approved scope), `state`, timestamps             |
| `ProductCategory`            | Platform taxonomy                                                   | `categoryId`, `name`, `parentCategoryId?`, `state`, `aggregateVersion`, timestamps                             |
| `ProductAttributeDefinition` | Attribute vocabulary                                                | `attributeId`, `name`, `valueType`, `unit?`, `constraints`, `state`, timestamps                                |
| `ProductAttributeValue`      | Per-product/variant values                                          | `attributeValueId`, `productId`/`variantId`, `attributeId`, `value`, `state`, timestamps                       |
| `ProductMedia`               | Media references + digests (content in R2)                          | `mediaId`, `productId`, `mediaType`, `mediaReference` (opaque), `mediaDigest`, `uploadedByIdentityId`, `state` |
| `ProductStateTransition`     | Append-only lifecycle episode log (mirrors `SellerStateTransition`) | `transitionId`, `productId`, `fromState`, `toState`, `actorIdentityId`, `reasonReference`, timestamps          |
| `ProductAuditRecord`         | Append-only Module 04 business audit events                         | `auditEventId`, `productId`, `eventType`, `actorIdentityId`, `correlationId`, `evidenceDigest`, timestamps     |

**OWNER DECISION REQUIRED:** exact table set and relationships (e.g., whether
SKU lives on `ProductVariant` rather than a separate table), index/unique
shapes (e.g., partial unique index for one ACTIVE product per SKU scope), and
whether pricing/media history require dedicated tables.

## 18. API endpoints required (proposed)

Base path follows the repository convention (`/api/v1`). All **PROPOSED /
REQUIRES APPROVAL**; exact paths are proposals. Every endpoint behind the
AAL2 session guard + Module 02 permission guard; every mutation requires an
`Idempotency-Key` (reusing `ApiIdempotencyRecord`); errors are
non-disclosing.

| Method           | Path (proposed)                               | Permission (proposed)         | Purpose                                |
| ---------------- | --------------------------------------------- | ----------------------------- | -------------------------------------- |
| `POST`           | `/api/v1/seller/products`                     | `product.create`              | Create `DRAFT` product                 |
| `GET`            | `/api/v1/seller/products`                     | `product.read`                | List own products (non-enumerating)    |
| `GET`            | `/api/v1/seller/products/:productId`          | `product.read`                | Read own product detail                |
| `PATCH`          | `/api/v1/seller/products/:productId`          | `product.update`              | Update own product (version-checked)   |
| `POST`           | `/api/v1/seller/products/:productId/submit`   | `product.submit`              | Submit for moderation (idempotent)     |
| `POST`           | `/api/v1/seller/products/:productId/close`    | `product.close`               | Withdraw/unpublish                     |
| `GET/POST/PATCH` | `/api/v1/seller/products/:productId/variants` | `product.update`              | Variant management                     |
| `GET/POST`       | `/api/v1/seller/products/:productId/media`    | `product.media.manage`/`read` | Media references + digests (metadata)  |
| `GET`            | `/api/v1/seller/categories`                   | `catalog.category.read`       | Read platform categories               |
| `GET`            | `/api/v1/admin/products`                      | `product.audit.view`          | Non-enumerating product list/filter    |
| `GET`            | `/api/v1/admin/products/:productId`           | `product.audit.view`          | Product detail + audit                 |
| `POST`           | `/api/v1/admin/products/:productId/review`    | `product.review.decide`       | Approve / reject / request corrections |
| `GET`            | `/api/v1/admin/products/:productId/media`     | `product.media.read`          | Inspect media metadata                 |

**OWNER DECISION REQUIRED:** exact endpoint list, paths, pagination/filtering
shape, and whether SKU/media/variants are sub-resources or separate
controllers.

## 19. Web seller UI requirements

**RESOLVED — OWNER-APPROVED (2026-08-14, decision D-14, option A).**
Catalog-management UI was excluded from Module 03 (D-06) and is Module 04
scope:

- Seller catalog pages under the existing `(seller)` route group in
  `apps/web`: product list, create/edit form (categories, attributes,
  variants, SKU, pricing fields, media metadata), submission, and approval
  status views — rendering server decisions only, never deciding access.
- Consistency with `@walrus/ui` and the Module 03 seller dashboard patterns;
  typed API client mirroring `seller-api.ts` conventions; generic,
  non-disclosing error states; no client-side authorization.

## 20. Admin UI requirements

**RESOLVED — OWNER-APPROVED (2026-08-14, decision D-14, option A):**

- Admin product-moderation UI under the existing `(admin)` route group:
  product list/detail, review actions (claim/request corrections/approve/
  reject), media metadata inspection, audit view, and category/attribute
  management — mirroring the Module 03 `AdminSellerList`/
  `AdminSellerDetail` pattern.
- No client-side authorization decisions; denied grants surface as generic
  access-denied states.

## 21. Mobile requirements

**BINDING (ADR-016):** one Flutter app; mobile admin is excluded.

**RESOLVED — OWNER-APPROVED (2026-08-14, decision D-14, option A):** the
mobile seller feature in `apps/mobile/lib/src/features/` mirrors the Module
03 mobile scope — catalog create, submit, and status views only; no full
variant/SKU/media management on mobile in Phase 1 (web-only). Structure
mirrors the Module 03 `seller` feature with an injectable API client.

## 22. Validation rules

**RESOLVED — OWNER-APPROVED (2026-08-14, decision D-16, option A).**
Adopted rules, mirroring Module 03 DTO validation and the repository's
non-disclosing validation model:

- Required fields: product name; category reference; at least one SKU on
  any sellable product or variant; pricing data (selling price); media per
  approved requirements.
- Length/bounds: product name 1–256 chars; SKU 1–64 chars, uppercase
  alphanumeric plus `-`/`_` (per D-06); price > 0 and ≤ 1,000,000 with
  2-decimal precision (per D-07).
- Media: allowlist JPEG/PNG/WebP; ≤ 10 MB per file; ≤ 10 images per product
  (per D-09).
- Reference integrity within Module 04: category and attribute definitions
  must exist and be ACTIVE (per D-03/D-04); attribute values validated
  against their ACTIVE definitions.
- Version-checked mutations; idempotency keys on all mutations; rate limits
  per the repository pattern — **RESOLVED — OWNER-APPROVED (2026-08-14,
  decision D-15, option A):** production numeric policy recorded
  (Security/Platform authority) — product create/submit 10/hour; product
  update/media/variant/SKU mutations 30/hour; admin review/suspend/
  reactivate 50/hour. Module 03 condition D-10 remains open.

## 23. Security requirements (proposed)

- **BINDING:** all endpoints require a Module 01 authenticated session; the
  AAL2 session guard (existing pattern) applies; no anonymous catalog API.
- **BINDING:** authorization exclusively via Module 02 permission guard;
  Module 04 never evaluates roles itself.
- **PROPOSED:** `product.*` permissions are seller-organization-scoped
  through the approved ownership resolver; absence of an ACTIVE association
  denies.
- **PROPOSED:** media content in object storage with signed short-lived read
  references; DB stores references and SHA-256 digests only; media never
  logged; no PII in audit or denial responses.
- **PROPOSED:** anti-enumeration, idempotency, optimistic concurrency, rate
  limiting, and SoD per Module 03 precedent.
- No secrets or real credentials appear in this or any Module 04 document.

## 24. Audit/evidence requirements (proposed)

- **PROPOSED:** `ProductAuditRecord` records product lifecycle, variant,
  SKU, category, attribute, media, and approval events (append-only, no
  update/delete API), mirroring `SellerBusinessAuditRecord`.
- **BINDING:** authorization decisions remain exclusively in Module 02
  (`AuthorizationDecisionRecord`); Module 04 stores only approved decision
  references when needed.
- **PROPOSED:** media digests and references in audit records only; raw media
  never logged; retention per owner-approved configuration (Module 03 D-03
  retention-architecture precedent, configurable, no compliance claim).

## 25. Testing requirements (proposed)

Mirrors the Module 03 test strategy (mandatory, module-wide):

- Domain unit tests: product lifecycle transitions (allowed/denied/terminal/
  stale-version/unknown-state fail-closed), category/attribute validation,
  variant/SKU invariants.
- Authorization tests: full `product.*` matrix grant/deny; cross-seller
  ownership denial; no bypass.
- API integration tests: every proposed endpoint through the guard chain;
  anti-enumeration; idempotency; rate-limit; audit-presence assertions.
- Database tests: mapper roundtrips, constraints, migration-safety on a
  clean database.
- E2E tests: web seller catalog flow and admin moderation flow (Playwright);
  mobile widget tests where the Flutter SDK is available.
- Quality gates preserve repository thresholds (API coverage ≈ 91% lines;
  lint, typecheck, Prisma validate, builds, Playwright).

## 26. Dependencies on Modules 00–03

| Module | Dependency (binding unless marked)                                                                                                                                                                                                              |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 00     | Monorepo/Turborepo conventions; Clean Architecture layers; PostgreSQL/Prisma forward-only migrations; R2 target; AAL2 session guard; idempotency and rate-limit ports; `@walrus/*` packages                                                     |
| 01     | Authenticated identity context and AAL2 session guard; no catalog data ever enters Module 01                                                                                                                                                    |
| 02     | Permission guard, `resource.action` identifiers, role matrix, ownership-resolver contract — **Module 02 owner approval of additive `product.*`/`catalog.*` entries and the second resolver (WEMP-M04-AUTHZ-001), sign-off recorded 2026-08-14** |
| 03     | Approved/ACTIVE seller + ACTIVE `SellerIdentityAssociation` as the listing gate; seller-owned product scope — Module 04 never reads Module 03 storage; integration through approved contracts                                                   |

## 27. Explicit exclusions for future modules

- Inventory stock, levels, reservations, availability — Module 05 (see §11).
- Customer profiles/customer business data — Module 06.
- Shopping cart — Module 07.
- Orders — Module 08.
- Payments — Module 09.
- Shipping & logistics — Module 10.
- Notifications — Module 11 (catalog events must not implement independent
  notification delivery).
- Reporting & analytics — Module 12.
- Storefront, marketplace discovery, and search — no owning module is
  recorded in the approved landscape; **RESOLVED — OWNER-APPROVED
  (2026-08-14, decision D-13, option A):** explicitly out of Module 04
  scope; ownership deferred to a future approved module/milestone (Module 03
  D-06 excludes them from Module 03).
- Commission rates, fees, settlement, payouts, tax/invoice calculation,
  ledger logic — future Finance/Commission module (Module 03 D-05).

## 28. Milestones (summary)

M04-M1 Product Domain Foundation → M04-M2 Product Persistence → M04-M3
Catalog Application Services → M04-M4 Authorization & Cross-Module
Integration → M04-M5 Seller & Admin APIs → M04-M6 Web/Mobile Catalog
Integration. Full per-milestone scope, deliverables, tests, and acceptance
criteria: WEMP-M04-PLAN-001.

## 29. Owner decision catalogue

See WEMP-M04-DECISIONS-001 for the full register. Every item marked
**OWNER DECISION REQUIRED** in this document is a recorded condition on the
milestone that depends on it and must not be silently assumed.

## 30. Approval register

| ID        | Topic                                                                    | Status                       |
| --------- | ------------------------------------------------------------------------ | ---------------------------- |
| M04-AR-01 | Scope, ownership model, lifecycle, categories, attributes, variants, SKU | PROPOSED — REQUIRES APPROVAL |
| M04-AR-02 | Pricing data boundaries and inventory boundary with Module 05            | PROPOSED — REQUIRES APPROVAL |
| M04-AR-03 | Media model and approval/moderation flow                                 | PROPOSED — REQUIRES APPROVAL |
| M04-AR-04 | `product.*`/`catalog.*` permissions + second ownership resolver          | PROPOSED — REQUIRES APPROVAL |
| M04-AR-05 | Milestone plan, Phase 1 scope, exclusions                                | PROPOSED — REQUIRES APPROVAL |

**End of review draft.** Nothing in this document authorizes implementation,
migration, commit, or deployment.

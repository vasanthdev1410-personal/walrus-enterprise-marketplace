# WALRUS Enterprise Marketplace Platform

## Module 06 — Customer Management

**Document ID:** WEMP-M06-SPEC-001
**Version:** Review Draft 1.0
**Status:** APPROVED (M06-M1 + M06-M2 + M06-M3 + M06-M4 + M06-M5) — signed by the
Product/Architecture Owner 2026-08-17; Module 02 owner sign-off for the
additive `customer.*` catalog and the fourth ownership-resolver scope
**RECORDED 2026-08-17** (WEMP-M06-AUTHZ-001 §7); Security/Platform D-10
rate-limit values **RECORDED 2026-08-18** (WEMP-M06-APPROVAL-001 §3/§6) —
M06-M5 authorized 2026-08-18.
**Effective date:** 2026-08-17 (M06-M1, M06-M2, M06-M3 and M06-M4); 2026-08-18 (M06-M5)
**Classification:** Confidential — Internal Use Only

> This document is not an authorization to implement. It preserves Module 00,
> Module 01, Module 02, Module 03, Module 04, and Module 05 exactly as they
> are. Every item marked **PROPOSED / REQUIRES APPROVAL** or **OWNER DECISION
> REQUIRED** is non-binding until the product/architecture owner records
> explicit approval. This document defines the customer business domain only;
> it does not duplicate Module 01 identity/authentication, Module 02
> authorization, Module 03 seller management, Module 04 product catalog, or
> Module 05 inventory, and it must not be read as authorizing any database
> migration, controller, role change, or UI. All decisions D-01 through D-13
> are preserved exactly as recorded in WEMP-M06-DECISIONS-001 §2 and §5; this
> document applies them, it does not restate them as new policy.

## 1. Authority and evidence classification

This review draft uses the evidence labels established by
WEMP-M02-SPEC-001 through WEMP-M05-SPEC-001:

- **BINDING:** directly required by accepted Module 00 architecture, the
  approved Module 01 specification/contracts, or the approved Module 02–05
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

1. `docs/module-06/decision-register-review-draft.md`
   (WEMP-M06-DECISIONS-001, review draft) — decisions **D-01 … D-13** and
   binding architecture facts **A-01 … A-15**. Every decision referenced
   below is recorded there verbatim.
2. `docs/module-01/specifications/Module 01 Corrected Draft v1.12.txt`
   (approved WEMP-M01-001) — §6 Customer Profile Boundary (lines 264–285)
   and Customer Profile Lifecycle (lines 533–537): Module 06 owns the
   Customer profile; Module 01 owns identity; customer permissions are
   exclusively Module 02; no second Identity; self-registration contract
   path.
3. `docs/module-02/implementation-spec.md` and the Module 02 role catalog —
   the `CUSTOMER` role (seeded, `grantedPermissionIds: []`),
   `resource.action` permission format, the ownership-resolver contract
   precedent, and the additive non-weakening sign-off process
   (`apps/api/src/modules/authorization/domain/role-catalog.ts`,
   `role-hierarchy.ts`, `permission-catalog.ts`).
4. `docs/module-03/formal-specification-review-draft.md` (approved
   WEMP-M03-SPEC-001) — profile lifecycle/state-machine precedent,
   audit-record shape (§12.9), configurable retention architecture (D-03),
   and the seller self-service guard pattern.
5. `docs/module-04/formal-specification-review-draft.md` and
   `docs/module-05/formal-specification-review-draft.md` (approved
   WEMP-M04-SPEC-001, WEMP-M05-SPEC-001) — §27/§26 explicit exclusions
   ("Customer profiles/customer business data — Module 06"; cart 07,
   orders 08, payments 09, shipping 10, notifications 11, analytics 12),
   cross-module port conventions (D-10/D-06), and the fail-closed guard
   and non-disclosing error model.
6. `apps/api/prisma/schema.prisma` and the migration directory — repository
   schema conventions (UUIDv7 string PKs, snake_case `@map`,
   `@db.Timestamptz(6)`, `aggregateVersion`, append-only transition and
   audit records, forward-only migration naming `2026MMDDHHMMSS_module_XX_...`),
   `ApiIdempotencyRecord`, and the rate-limit port.
7. `apps/web/app/(customer)/page.tsx` and
   `apps/mobile/lib/src/features/customer/presentation/customer_foundation_page.dart` —
   existing placeholder surfaces ("No customer business functionality is
   implemented in Module 00"; "Customer functionality requires a future
   approved module").

## 2. Purpose and ownership

### 2.1 Binding purpose

**BINDING (approved Module 01 landscape):** Module 06 – Customer Management is
a named future module in the approved architecture (A-01). Module 06 owns the
Customer profile and its lifecycle (Module 01 v1.12 §6). Customer permissions
are determined exclusively by Module 02 (A-02). Module 01 may create and
authenticate the underlying Identity but shall not own customer-profile data
or determine customer permissions (A-03).

**BINDING (Module 01 v1.12 §6):** creating a Customer profile or assigning a
Customer role shall not create a second Identity (A-04). Customer
self-registration requests profile creation/association through an approved
Module 06 contract and role assignment through an approved Module 02 contract.

**BINDING (Module 01 Part 7.3 §12 and Module 02–05 implementation rules):**
cross-module storage isolation — no cross-module foreign keys; integration
through approved ports; Module 06 never reads other modules' storage and vice
versa (A-05). Identity state-transition records contain no Module 06 profile
fields (A-14).

### 2.2 Proposed ownership and Phase 1 scope

**PROPOSED / REQUIRES APPROVAL:** Module 06 owns the customer business domain:
the Customer profile (D-01), the customer lifecycle (D-02), the customer
address book (D-04), the optional customer business profile (D-05), basic
account preferences (D-06), and the customer audit records (D-08). Identity,
credentials, sessions, MFA, and verification remain Module 01 (A-03/A-04).

Explicit exclusions from Module 06 Phase 1 (all owner-decided or
architecture-bound):

- No shopping cart, checkout, orders, order history, or order behavior
  (A-13 — Module 08).
- No payment processing, refunds, or payment instruments (A-13 — Module 09).
- No shipping/logistics, fulfillment, or delivery (A-13 — Module 10).
- No inventory reservations or stock interactions (A-13; Module 05 D-06
  port-only).
- No notification-domain behavior, notification preferences, scheduling, or
  delivery state (A-13 — Module 11; D-06).
- No analytics/reporting (A-13 — Module 12).
- No commission/fees/settlement/ledger logic (A-17 precedent — future
  Finance/Commission module).
- No storefront, marketplace discovery, or search (Module 04 D-13
  exclusion precedent).
- No advanced UI design in M06 architecture work (D-12).

## 3. Business purpose

**PROPOSED / REQUIRES APPROVAL:** Module 06 provides the single customer
business record that the marketplace platform associates with a Module 01
Identity — the profile the customer manages themselves, the address book
future trading modules (07/08) and shipping (10) will reference, and the
auditable record of customer lifecycle events. It is the customer-side
counterpart of Module 03 (seller) under the identical ownership, isolation,
and authorization conventions. No customer surface is exposed before M06-M4
implements the approved Module 02 additions.

## 4. Customer profile model (decision D-01)

**RESOLVED — OWNER-APPROVED (2026-08-17, decision D-01, option A).**

- `CustomerProfile` is the Module 06-owned aggregate: `customerProfileId`
  (UUIDv7 PK), `identityId` (logical UUIDv7 reference to the Module 01
  Identity — **the only identity linkage; no credentials, no identifiers,
  no authentication material duplicated**), `state`, `aggregateVersion`,
  `createdAt`, `updatedAt`, `correlationId`.
- Individual customers are the primary scope; optional company/B2B
  information is a separate `CustomerBusinessProfile` (D-05).
- One customer profile per identity in Phase 1 (unique `identityId`).
- Ownership: the profile is owned by its associated Identity; the
  ownership-resolver (D-07, fourth scope) evaluates the caller's identity
  against `identityId` — never from a client claim.
- Invariants: `aggregateVersion` strictly increasing; state transitions
  follow D-02; no negative/duplicate default addresses (D-04); timestamps
  immutable after write; `identityId` immutable after creation.
- Soft closure/anonymization boundaries: `CLOSED` (D-02) is a soft closure;
  anonymization follows Module 01 patterns; records retained per the
  approved configurable retention architecture (A-15/D-09).

## 5. Customer lifecycle (decision D-02)

**RESOLVED — OWNER-APPROVED (2026-08-17, decision D-02, option A).**

Exactly three states — `ACTIVE`, `SUSPENDED`, `CLOSED` — with strict allowed
transitions, version-checked and recorded as append-only transition records:

| From            | To          | Allowed | Actor (proposed)                            |
| --------------- | ----------- | :-----: | ------------------------------------------- |
| `ACTIVE`        | `SUSPENDED` |    ✓    | Admin (`customer.lifecycle.manage`, reason) |
| `ACTIVE`        | `CLOSED`    |    ✓    | Admin (`customer.lifecycle.manage`, reason) |
| `SUSPENDED`     | `ACTIVE`    |    ✓    | Admin (`customer.lifecycle.manage`, reason) |
| `SUSPENDED`     | `CLOSED`    |    ✓    | Admin (`customer.lifecycle.manage`, reason) |
| any → any other | —           |    ✗    | Denied (fail closed, non-disclosing)        |

- `CLOSED` is terminal — no transition out; no silent auto-deletion.
- While `SUSPENDED`: self-service mutations deny (fail closed); the profile
  owner's self-read may remain permitted per explicit grant only.
- While `CLOSED`: self-service reads and mutations deny; administrative
  audit visibility remains (per grant).
- Every transition is append-only (`CustomerStateTransition`), audited
  (D-08), version-checked, and requires a non-disclosing reason reference
  (Module 03 §12.9 pattern).

## 6. Customer registration (decision D-03)

**RESOLVED — OWNER-APPROVED (2026-08-17, decision D-03, option A).**

- Customer self-registration reuses the Module 01 identity architecture
  verbatim: create/locate Identity → complete required identity
  verification (Module 01 contract).
- Profile creation/association occurs **only** through an approved Module 06
  contract; CUSTOMER role/permission assignment occurs **only** through the
  approved Module 02 authorization contract.
- **No direct role mutation by Module 06; no hidden role assignment; no
  wildcard permission; no privilege escalation** (A-02/A-06/A-07).
- No second Identity is created by profile creation or role assignment
  (A-04).

## 7. Customer address book (decision D-04)

**RESOLVED — OWNER-APPROVED (2026-08-17, decision D-04, option A).**

- Module 06 owns the customer address book; multiple addresses per profile.
- Each address: `addressId` (UUIDv7 PK), `customerProfileId` (logical),
  recipient/contact name, address lines, city, region/state, postal code,
  country, optional phone, role tags (`SHIPPING`, `BILLING`), default flags,
  `state` (`ACTIVE` / `REMOVED`), `aggregateVersion`, timestamps.
- At most **one default shipping** and **one default billing** address per
  profile; setting a new default atomically clears the previous default;
  removing the default leaves none (single transaction, D-11).
- Soft removal (`REMOVED`) is auditable; a `REMOVED` address can never be a
  default; referenced records are never hard-deleted (retention governs
  lifespan, A-15).
- Future **M08 Orders** and **M10 Shipping** consume **stable address
  references and immutable snapshots** via `CustomerAddressReadPort` (D-13)
  without owning or mutating the M06 address book.

## 8. Customer B2B/company information (decision D-05)

**RESOLVED — OWNER-APPROVED (2026-08-17, decision D-05, option A).**

- Optional `CustomerBusinessProfile` (0..1 per customer profile): company
  name, optional registration reference (stored as a lookup digest, never
  raw in audit), optional business type.
- Separate from authentication identity (no credentials, no authentication
  material) and separate from the address book (company addresses are
  regular customer addresses tagged as needed).
- Individual customers may have no business profile; B2B enrichment is
  optional and non-blocking for profile activation.

## 9. Customer preferences (decision D-06)

**RESOLVED — OWNER-APPROVED (2026-08-17, decision D-06, option A).**

- Basic account preferences only (language, currency, locale — proposed
  allow-list); key/value with per-key validation.
- **No notification-domain behavior** — no notification preferences,
  scheduling, delivery state, or recipient PII (Module 11; D-06/A-13).
- Unknown preference keys are rejected (deny by default); preferences are
  version-checked and audited.

## 10. Audit and evidence requirements (decision D-08)

**RESOLVED — architecture-supported default (WEMP-M06-DECISIONS-001 D-08).**

- One append-only `CustomerAuditRecord` per profile (event type, actor
  identity (logical UUIDv7), correlation ID, evidence digest, timestamps)
  mirroring `SellerBusinessAuditRecord` / `ProductAuditRecord` /
  `InventoryAuditRecord`.
- **Never stored:** roles/permissions/policy internals (Module 02 only),
  authentication material, raw registration numbers, raw address data, PII
  beyond logical identity references, and monetary values.
- Authorization decisions remain recorded by Module 02
  (`AuthorizationDecisionRecord`).
- Audit immutability tests are part of the module test strategy.

## 11. Cross-module contract wiring (decision D-13)

**RESOLVED — architecture-supported default (WEMP-M06-DECISIONS-001 D-13).**

- `CustomerReference` — logical `customerProfileId` value object (UUIDv7).
- `CustomerProfileReadPort` — resolve a customer reference to minimal
  fail-closed facts (profile existence + `ACTIVE` gate) for future M07/M08
  association; unknown/CLOSED/SUSPENDED resolves to deny (fail closed).
- `CustomerAddressReadPort` — resolve a stable address reference to an
  **immutable snapshot** for future M10 shipping; unknown/`REMOVED`
  resolves to deny.
- Port-only; shapes become normative at each consuming module's spec
  approval; **M06 implements no M07/M08/M10 behavior** (A-13). M07 consumes
  customer identity/reference only where required; M08 associates an order
  with a stable customer reference; M10 consumes address snapshots without
  mutating the M06 address book.

## 12. Permission vocabulary (decision D-07 — summary)

Full proposal: WEMP-M06-AUTHZ-001. Summary of the **PROPOSED / REQUIRES
APPROVAL** additive identifiers (Module 02 owner sign-off required, A-07):

| Identifier (proposed)        | Resource              | Scope             | Role grant (proposed) |
| ---------------------------- | --------------------- | ----------------- | --------------------- |
| `customer.profile.read`      | `customer.profile`    | customer-identity | CUSTOMER              |
| `customer.profile.update`    | `customer.profile`    | customer-identity | CUSTOMER              |
| `customer.address.read`      | `customer.address`    | customer-identity | CUSTOMER              |
| `customer.address.manage`    | `customer.address`    | customer-identity | CUSTOMER              |
| `customer.business.read`     | `customer.business`   | customer-identity | CUSTOMER              |
| `customer.business.manage`   | `customer.business`   | customer-identity | CUSTOMER              |
| `customer.preference.read`   | `customer.preference` | customer-identity | CUSTOMER              |
| `customer.preference.manage` | `customer.preference` | customer-identity | CUSTOMER              |
| `customer.read`              | `customer`            | platform          | ADMIN, SUPER_ADMIN    |
| `customer.lifecycle.manage`  | `customer.lifecycle`  | platform          | ADMIN, SUPER_ADMIN    |
| `customer.audit.view`        | `customer.audit`      | platform          | ADMIN, SUPER_ADMIN    |

Deny by default; no wildcard; no hidden SUPER_ADMIN bypass; no role-name
authorization; explicit grants only; the fourth ownership resolver
(customer-identity scope) fails closed on missing/malformed ownership (D-07).

## 13. Domain/database models required (proposed)

All entities are **PROPOSED / REQUIRES APPROVAL** and Module 06-owned,
following the repository schema conventions (UUIDv7 string PKs, snake_case
`@map`, `@db.Timestamptz(6)`, `aggregateVersion`, `createdAt`/`updatedAt`,
append-only records, no cross-module FKs — `identityId` and
`actorIdentityId` are logical UUIDv7 references).

| Entity                    | Responsibility                             | Key fields (proposed)                                                                                                                                         |
| ------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CustomerProfile`         | Customer aggregate + lifecycle (D-01/D-02) | `customerProfileId`, `identityId` (logical), `state`, `aggregateVersion`, timestamps, `correlationId`                                                         |
| `CustomerStateTransition` | Append-only lifecycle ledger (D-02)        | `transitionId`, `customerProfileId`, `fromState`, `toState`, `stateVersion`, `actorIdentityId`, `reasonReference`, `correlationId`, `causationId`, timestamps |
| `CustomerAddress`         | Address book (D-04)                        | `addressId`, `customerProfileId`, contact/address fields, role tags, `isDefaultShipping`, `isDefaultBilling`, `state`, `aggregateVersion`, timestamps         |
| `CustomerBusinessProfile` | Optional B2B/company info (D-05)           | `customerBusinessProfileId`, `customerProfileId`, `companyName`, `registrationLookupDigest`, `businessType`, `aggregateVersion`, timestamps                   |
| `CustomerPreference`      | Basic account preferences (D-06)           | `preferenceId`, `customerProfileId`, `preferenceKey`, `preferenceValue`, `aggregateVersion`, timestamps                                                       |
| `CustomerAuditRecord`     | Append-only business audit (D-08)          | `auditEventId`, `customerProfileId`, `eventType`, `actorIdentityId`, `correlationId`, `evidenceDigest`, timestamps                                            |

**RESOLVED — implementation details (no new owner decision required):** the
exact table set, index/unique shapes (one profile per identity; one default
shipping/billing per profile), and whether preferences are rows or JSON are
implementation details confirmed at M06-M2/M06-M3 per the recorded decisions;
no new business rule is introduced here.

## 14. API endpoints required (proposed)

Base path follows the repository convention (`/api/v1`). All **PROPOSED /
REQUIRES APPROVAL**; exact paths are proposals. Every endpoint behind the
AAL2 session guard + Module 02 permission guard (A-08); every mutation
requires an `Idempotency-Key` (reusing `ApiIdempotencyRecord`, A-09); errors
are non-disclosing; ownership resolves through the fourth resolver (D-07).

| Method      | Path (proposed)                                        | Permission (proposed)                                     | Purpose                                                           |
| ----------- | ------------------------------------------------------ | --------------------------------------------------------- | ----------------------------------------------------------------- |
| `GET`       | `/api/v1/customer/profile`                             | `customer.profile.read`                                   | Read own customer profile                                         |
| `PATCH`     | `/api/v1/customer/profile`                             | `customer.profile.update`                                 | Update own profile fields (version-checked)                       |
| `GET`       | `/api/v1/customer/addresses`                           | `customer.address.read`                                   | List own addresses (non-enumerating)                              |
| `POST`      | `/api/v1/customer/addresses`                           | `customer.address.manage`                                 | Create own address                                                |
| `PATCH`     | `/api/v1/customer/addresses/:addressId`                | `customer.address.manage`                                 | Update own address / set default flags (version-checked)          |
| `DELETE`    | `/api/v1/customer/addresses/:addressId`                | `customer.address.manage`                                 | Soft-remove own address (idempotent)                              |
| `GET/PATCH` | `/api/v1/customer/business`                            | `customer.business.read` / `customer.business.manage`     | Read/update own optional business profile (version-checked)       |
| `GET/PATCH` | `/api/v1/customer/preferences`                         | `customer.preference.read` / `customer.preference.manage` | Read/update own basic preferences (allow-listed, version-checked) |
| `GET`       | `/api/v1/admin/customers`                              | `customer.read`                                           | Non-enumerating admin customer list                               |
| `GET`       | `/api/v1/admin/customers/:customerProfileId`           | `customer.read`                                           | Customer detail + audit records                                   |
| `POST`      | `/api/v1/admin/customers/:customerProfileId/lifecycle` | `customer.lifecycle.manage`                               | Suspend / reinstate / close (mandatory reason, version-checked)   |
| `GET`       | `/api/v1/admin/customers/:customerProfileId/audit`     | `customer.audit.view`                                     | Customer audit trail                                              |

**RESOLVED — implementation details (no new owner decision required):** exact
endpoint list, paths, and pagination/filtering shape are implementation
details confirmed at M06-M5; the recorded decisions fix the permission model
(D-07), the mutation rules (D-02/D-03/D-04/D-06), and the surface scope
(D-12).

## 15. Web customer UI requirements (decision D-12)

**RESOLVED — OWNER-APPROVED (2026-08-17, decision D-12, option A).**

- Web = **full customer self-service** (own profile, address book, optional
  business profile, preferences) plus **full admin customer surface**
  (customer list/detail, lifecycle administration with reason reference,
  audit view).
- Under the existing `(customer)` and `(admin)` route groups in `apps/web`;
  consistency with `@walrus/ui` and the Module 03/04/05 dashboard patterns;
  typed API client mirroring the `seller-api.ts` conventions; generic,
  non-disclosing error states; no client-side authorization (A-08).
- **No advanced UI design in M06 architecture work** (D-12).

## 16. Mobile requirements (decision D-12; A-12)

**BINDING (ADR-016):** one Flutter app; mobile admin is excluded.

**RESOLVED — OWNER-APPROVED (2026-08-17, decision D-12, option A):** mobile =
**read-only own profile and address read** (mirrors the M03/M04/M05
mobile-scope pattern) — **no profile mutation, no address mutation, no admin
controls**; authorization enforced server-side (A-08 — never client-side).
Structure mirrors the Module 03/05 seller features with an injectable API
client. The existing `(customer)` foundation page is replaced by the M06
read-only surface at M06-M5.

## 17. Security requirements (proposed)

- **BINDING:** all endpoints require a Module 01 authenticated session; the
  AAL2 session guard precedes the Module 02 permission guard; no anonymous
  customer API; no client-side authorization decisions (A-08).
- **BINDING:** authorization exclusively via Module 02 permission guard;
  Module 06 never evaluates roles itself (A-02).
- **PROPOSED:** `customer.*` self-service permissions are
  **customer-identity-scoped** through the approved ownership-resolver
  contract (fourth scope — Module 02 owner sign-off required, A-07/D-07);
  a caller whose identity does not own the target profile is denied.
  **No customer can access another customer's private profile or address
  data** (horizontal privilege-escalation prevention — M06-R03).
- **PROPOSED:** anti-enumeration (unknown profile/address references are
  indistinguishable and deny), idempotency (A-09), optimistic concurrency
  (D-11), rate limiting (D-10/A-11), non-disclosing errors, DTO
  allow-listing (whitelist validation; reject unknown fields — mass
  assignment protection), and audit per the recorded decisions.
- **PROPOSED:** PII minimization — customer data never enters Module 01
  records (A-14), audit holds no raw PII (D-08), registration references
  stored as lookup digests (D-05), log redaction follows platform
  conventions.
- **PROPOSED:** admin permission separation — `customer.read`,
  `customer.lifecycle.manage`, `customer.audit.view` are explicit admin
  grants; no role-only bypass; no hidden SUPER_ADMIN override (D-07).
- No secrets or real credentials appear in this or any Module 06 document.

## 18. Rate limiting (decision D-10; A-11)

**CONFIRMED — Security/Platform confirmation RECORDED 2026-08-18
(WEMP-M06-APPROVAL-001 §3/§6):** the architecture-supported default D-10
policy is confirmed — customer self-service **reads 60/hour**, self-service
**mutations 30/hour**, admin **read/lifecycle/audit 50/hour** (mirroring the
approved D-11 classes). Reuses the repository rate-limit port; the
fail-closed default (A-11) is superseded once the M06-M5 APIs are exposed
with these confirmed values.

## 19. Data retention and privacy (decision D-09; A-15)

**RESOLVED — architecture-supported default (WEMP-M06-DECISIONS-001 D-09):**
the approved configurable per-record-category retention architecture applied
verbatim — configurable durations (never hard-coded), auditable deletion with
legal-hold protection, **fail closed on missing/invalid retention
configuration** (no deletion without a valid configured duration). **No new
retention duration is invented in this document**; jurisdiction-specific
durations for customer records remain **PENDING authorized Legal/Compliance
configuration** before M06-M2 enforcement. Soft closure (D-02) never
auto-deletes; anonymization follows Module 01 identity anonymization
patterns.

**RESOLVED — owner-approved duration (decision D-15, 2026-08-17):**
CUSTOMER_RECORD_RETENTION_DAYS = **2555** (≈ 7 years) for the M06 records
the approved architecture explicitly requires to be retained for
audit/business/legal history — **CustomerStateTransition** and
**CustomerAuditRecord** only (D-02/D-08). This resolves the D-09 condition
for those categories; it grants **no** retention of authentication
credentials, passwords, tokens, sessions, unnecessary personal data,
deleted address data beyond approved retention, or unrelated Module 01
identity/security data (A-04; Module 01 owns identity). Enforcement is by
the application-layer retention processor (M06-M3), never by the migration;
fail-closed until then.

## 20. Exclusions (strict module boundaries)

**BINDING (A-13; Module 04 §27; Module 05 §26).** M06 must NOT implement:
shopping cart (07), checkout, orders (08), payment processing (09), refunds,
inventory reservations, shipping/logistics (10), notification delivery (11),
or analytics/reporting (12). No commission/fees/settlement logic (A-17
precedent). No storefront/search (Module 04 D-13 precedent).

## 21. Testing requirements (proposed)

Covered in full by WEMP-M06-PLAN-001 (module-wide mandatory strategy):
customer creation/association; self-profile access; cross-customer denial;
profile updates; address CRUD; default shipping/billing behavior; B2B
behavior; lifecycle transitions; suspended/closed restrictions; admin
authorization; ownership resolver incl. malformed ownership; concurrency;
idempotency; audit records; anti-enumeration; validation; cross-module
contract behavior; API E2E; web/mobile contract compatibility.

## 22. Dependencies on Modules 00–05

| Module | Dependency (binding unless marked)                                                                                                                                                                                          |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 00     | Monorepo/Turborepo conventions; Clean Architecture layers; PostgreSQL/Prisma forward-only migrations; AAL2 session guard; idempotency and rate-limit ports; `@walrus/*` packages                                            |
| 01     | Authenticated identity context, AAL2 session guard, identity verification; **no customer data ever enters Module 01** (A-14)                                                                                                |
| 02     | Permission guard, `resource.action` identifiers, role catalog (CUSTOMER role), ownership-resolver contract — **Module 02 owner approval of additive `customer.*` entries and the fourth resolver REQUIRED (A-07, PENDING)** |
| 03     | Profile lifecycle/state-machine precedent; audit-record shape; configurable retention architecture; self-service guard pattern (conventions only — no storage reads)                                                        |
| 04     | Category facts via approved contracts only if the customer surface renders catalog context (optional; no storage reads)                                                                                                     |
| 05     | `InventoryReservationPort` remains port-only for 07/08 (A-13); M06 never calls it                                                                                                                                           |

## 23. Explicit exclusions for future modules (unchanged landscape)

Same approved landscape as Modules 04/05: cart — Module 07; orders — Module
08; payments — Module 09; shipping & logistics — Module 10; notifications —
Module 11; reporting & analytics — Module 12. M06 defines only the customer
profile/address/business/preference/audit domain and the port contracts in
§11 for future consumers.

## 24. Milestones (summary)

M06-M1 Customer Domain Foundation → M06-M2 Customer Persistence → M06-M3
Customer Application Services → M06-M4 Authorization & Cross-Module
Integration → M06-M5 Customer APIs & Web/Mobile Integration. Full
per-milestone scope, deliverables, tests, gates, and acceptance criteria:
WEMP-M06-PLAN-001.

## 25. Owner decision catalogue

See WEMP-M06-DECISIONS-001 for the full register. Decisions D-01 … D-07 and
D-12 are **OWNER-APPROVED (2026-08-17, owner inputs for authoring)**; D-08 …
D-11 and D-13 are **RESOLVED — architecture-supported defaults** (binding
upon the approval statement). External-authority conditions recorded against
specific milestones: Module 02 owner sign-off (D-07/A-07 — M06-M4);
Security/Platform rate-limit confirmation (D-10/A-11 — M06-M5, **RECORDED 2026-08-18**);
Legal/Compliance customer-record retention durations (D-09/A-15 — M06-M2).

**End of review draft.** This specification authorizes no implementation,
migration, commit, or deployment.

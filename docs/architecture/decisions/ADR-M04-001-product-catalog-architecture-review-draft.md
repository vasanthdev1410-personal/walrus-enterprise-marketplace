# ADR-M04-001 — Product Catalog Architecture

**Status:** APPROVED — signed by the Product/Architecture Owner 2026-08-14
**Date:** 2026-08-14
**Owners:** Product/Architecture, Security, Operations, Legal
**Supersedes:** nothing; it is additive to the approved Module 00/01/02/03
decisions and to the review-only Module 02/03 architecture ADRs.

> This ADR is non-binding until explicitly approved. It authorizes no code,
> migration, commit, or deployment.

## Context

Module 01 proves who an identity is and owns Identity/authentication state.
Module 02 decides what an identity may do and owns roles, permissions,
assignments, and authorization decisions. Module 03 owns the seller business
domain: a verified, approved, and role-assigned seller may list products, and
product-catalog capabilities belong to future module 04 (WEMP-M03-SPEC-001
§6, §2.2). Storefront, catalog-management UI, and discovery surfaces were
explicitly excluded from Module 03 (decision D-06).

The approved Module 01 specification names Module 04 – Product Catalog in
the module landscape and declares Module 01 Part 7 (API standards) and
Part 9 (infrastructure/operations standards) outputs consumed by Module 04,
but no Module 04 specification exists in the repository. Web and mobile
contain no product/catalog routes or features today. A Module 04-owned
decision is therefore required before any catalog capability is implemented.

## Decision proposed for approval

### 1. Module 04 is the sole owner of the product-catalog business domain

Module 04 owns product definitions, product categories, product attributes,
product variants, SKU records, product media references, product lifecycle
and approval state, and catalog audit for approved sellers. The catalog
domain is implemented as a Clean Architecture module (`presentation` /
`application` / `domain` / `infrastructure`) consistent with Module 00
conventions and the Module 01/02/03 module structure. Module 04 never stores
or duplicates authentication state, authorization policy, or seller business
state. Cross-module integration uses approved ports and logical UUIDv7
references with no cross-module foreign keys.

### 2. Seller-owned, organization-scoped products

Products are listed by approved sellers and scoped to the seller organization
through the Module 02 ownership-resolver contract (the Module 03 precedent,
decision D-11). Module 04 owns the product facts; Module 02 evaluates scope.
This is the second ownership resolver and requires explicit Module 02 owner
approval (WEMP-M04-AUTHZ-001). There is no generic owner-equals-subject
shortcut and no administrative override unless explicitly approved.

### 3. Audited, fail-closed product lifecycle

The product lifecycle is an append-only, version-checked state machine with
an owner-approved vocabulary (decision D-02) and a moderation gate
(decision D-10) before publication. Unknown or inconsistent state denies.
Every mutation requires an authenticated actor, a mandatory audit record,
and optimistic concurrency — mirroring the Module 03 seller lifecycle.

### 4. Definition-only catalog; inventory boundary

Module 04 owns product/variant/SKU **definition** and pricing **definition
data** (decision D-07, never fees/tax/commission per Module 03 D-05). Stock
levels, availability, and reservations are proposed to belong to Module 05 –
Inventory Management (decision D-08); Module 04 exposes a fail-closed
inventory contract port and persists no stock quantities until an approved
Module 05 specification adopts the boundary.

### 5. Media as references and digests only

Product media content lives in object storage (Cloudflare R2 target,
ADR-008) with signed, short-lived read references; the Module 04 database
stores opaque references and SHA-256 digests only, per the approved Module 03
evidence pattern (decision D-03). Media is never logged and never included in
audit or denial responses.

### 6. Authorization through Module 02 only

`product.*`/`catalog.*` permissions are additive Module 02 catalog entries
in the approved `resource.action` format, granted to `SELLER`
(organization-scoped) and `ADMIN`/`SUPER_ADMIN` (moderation). Deny-by-default,
explicit-deny precedence, administrative scope, and fail-closed behavior are
unchanged. No new role is proposed (decision D-10 — moderation via matrix
grants unless the owner approves a moderator role).

## Consequences

- Approved: defines the Module 04 boundary, prevents duplicate identity/
  authorization/seller logic, and provides the governed catalog foundation
  that trading modules 05/07/08 will consume.
- Cost: an additive Module 02 change (PRODUCT catalog + second ownership
  resolver) must be approved and implemented in M04-M4 before publication.
- Risk: catalog vocabulary, pricing, moderation, media, and inventory-boundary
  decisions D-01…D-17 are owner conditions on specific milestones; none may
  be silently assumed.

**REQUIRES APPROVAL:** the exact lifecycle vocabulary (WEMP-M04-SPEC-001 §5),
Phase 1 scope (§2.2), permission matrix (WEMP-M04-AUTHZ-001), and decision
register (WEMP-M04-DECISIONS-001) are normative only after approval.

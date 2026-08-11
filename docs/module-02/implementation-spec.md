# Module 02 — Roles, Permissions & Authorization

## Internal Implementation Specification & Roadmap (working document)

- **Status:** Internal working document for implementation planning only. This is **not** an approved Module 02 specification and does not transfer approval status.
- **Authoritative sources:**
  1. Approved Module 01 contracts — the five Module 02 boundary ports (see §2.1).
  2. Module 01 specification (`docs/module-01/specifications/Module 01 Corrected Draft v1.12.txt`) ownership statements.
  3. Preserved Module 02 source material (`docs/module-01/archive/Module 02 Part 6 Authorization Source Material.txt`, WEMP-M01-006A..F, **Status: Draft — Unapproved**).
- **Effective date:** 2026-08-11.
- **Repository state at writing:** Module 01 complete, pushed, CI green at `b455c45`. Working tree clean except pre-existing `tmp/`.

---

## 1. Purpose

Establish a centralized, fail-closed authorization foundation owned by Module 02 while Module 01 continues to own identity/authentication state. The architecture must:

- Keep authentication separate from authorization.
- Make every access decision policy-driven, deterministic, auditable and **deny-by-default**.
- Keep permissions centrally managed and assigned to roles only (never directly to identities in Phase 1).
- Keep the five Module 01 authorization boundary ports intact and fail-closed until an approved Module 02 specification integrates them.

---

## 2. Evidence Triage

### 2.1 Approved (binding — from approved Module 01 milestones)

| Contract                                   | Owner milestone | Boundary                                           | Today's fail-closed behavior  |
| ------------------------------------------ | --------------- | -------------------------------------------------- | ----------------------------- |
| `ApprovalAuthorizationPort`                | M01-REC-005     | Recovery approval decisions                        | always `authorized: false`    |
| `IdentityStateChangeAuthorizationPort`     | M01-ID-004      | Identity authentication-state transitions          | always `authorized: false`    |
| `ClassificationTransitionCoordinationPort` | M01-CLS-001     | Authentication-security classification transitions | always `contractValid: false` |
| `PrivilegedProvisioningAuthorizationPort`  | M01-ADM-001     | Privileged identity provisioning                   | always `authorized: false`    |
| `BootstrapAuthorizationPort`               | M01-ADM-002     | Super Admin bootstrap                              | always `available: false`     |

All five adapters are intentionally fail-closed (never permissive) and each carries the exact command/decision shape the future Module 02 contract must satisfy. Module 01 storage is never read directly by Module 02; Module 02 storage is never read directly by Module 01. **These boundaries are NOT rewired by this document's milestones until an approved Module 02 specification explicitly requires it.**

Also approved: Module 01 v1.12 ownership statements — _"Module 02 owns roles, permissions, authorization decisions and approved assignments"_; Module 01 owns identity/authentication state.

### 2.2 Implied by approved contracts / preserved source material (implementable)

The preserved source material (Draft parts 6.1–6.6) defines the RBAC model that the five boundaries presuppose. Implementable now, consistently with those contracts:

- **Decision model (6.1 §5):** authenticated request → session validation → identity resolution → role evaluation → permission evaluation → policy evaluation → decision; outcomes `Access Granted` / `Access Denied` (+ reserved); deterministic; auditable; deny by default.
- **Roles (6.2 §6):** Phase 1 roles **Customer, Seller, Admin, Super Admin**; multiple roles per identity allowed; roles do not authenticate and do not auto-grant permissions.
- **Role hierarchy (6.2 §7):** Super Admin → Admin → Seller → Customer; **administrative scope only, never automatic permission inheritance**; must prevent privilege escalation.
- **Permission model (6.2 §8):** smallest authorization unit; immutable identifier; name; protected resource; allowed action; status; categories Read/Create/Update/Delete/Approve/Reject/Export/Configure/Audit/Manage; **implicit permissions prohibited**.
- **Permission assignment (6.2 §9):** permissions assigned to roles only; centrally managed; versioned; auditable; never to identities (Phase 1).
- **Role lifecycle (6.2 §10):** Created → Configured → Active | Suspended | Retired; retired roles not assignable; transitions audited.
- **Resource classification (6.3 §11):** Public / Protected / Restricted / Confidential / System; decisions based on classification + roles + permissions.
- **Guards (6.3 §14):** execute before protected operations; validate authenticated context; invoke evaluation; prevent unauthorized execution; generate audit events.
- **Least privilege (6.4 §16):** deny unapproved/implicit/orphaned permissions and privilege escalation.
- **Authorization audit logging (6.5 §22):** immutable records; timestamp, correlation id, identity id, session id, resource id/type, action, decision, source IP, user agent, device where available; **never record secrets**.
- **Error model (6.5 §24):** standardized responses; no internal policy/permission/role configuration disclosure.

### 2.3 Missing / ambiguous (blocked — NOT implemented speculatively)

- No approved Module 02 specification exists (draft is unapproved); **no formal M02 milestone IDs** exist anywhere — roadmap anchors use the draft's Part/section numbers instead of manufactured IDs.
- Exact **role → permission matrix** and **permission identifier vocabulary** are not formally approved; an internal Phase-1 policy is proposed below and must be confirmed at approval.
- **ADR-M01-004 (Enterprise Authorization Architecture)** is referenced by the draft as approved but no such ADR file exists in `docs/architecture/decisions/` (only `ADR-001-018.md`). Flagged for the record.
- Resource **ownership model** details (6.3 §12), **temporary permissions** (6.4 §18), **delegated administration** (6.4 §19), **notifications** (6.5 §23) and the **administrative API surface** have no approved contract — deferred.
- Module 02 **Prisma schema** is not approved; the persistence milestone below is additive-only (new tables, no change to Module 01 tables) and is presented for approval with this document.

---

## 3. Dependency-Ordered Roadmap

Milestones are anchored to draft Part/section numbers because no formal M02 IDs exist. Working tags are descriptive, not normative.

### Milestone 1 — RBAC Domain Core (anchors: 6.1 §5, 6.2 §6–10)

Pure domain layer, **no schema, no DI, no API**.

- Entities: `Permission`, `Role`, `IdentityRoleAssignment`.
- Value objects: `RoleName`, `RoleState`, `IdentityRoleAssignmentState`, `PermissionStatus`, `ResourceClassification`, `AllowedAction`, `AuthorizationDecisionOutcome`, `AuthorizationDenialReason`.
- `PermissionCatalog` and `RoleCatalog` (immutable, centrally managed in code; internal Phase-1 policy).
- `AuthorizationDecisionEngine` — pure, deterministic, deny-by-default.
- Unit tests: deny-by-default, unknown/retired permissions, suspended/retired roles, revoked assignments, privilege-escalation attempts, explicit-deny precedence, determinism.
- **Acceptance:** all 6.1/6.2 security principles demonstrable in tests; no Module 01 file touched.

### Milestone 2 — Persistence (anchor: 6.2 §9–10, 6.5 §22)

**Implemented.** Refinement from implementation: the immutable role/permission catalogs remain code-owned configuration (versioned in git, centrally managed — §4), so no catalog tables are persisted in Phase 1. Persisted state covers the two dynamic aggregates:

- `IdentityRoleAssignment` — one row per (identity, role), versioned for optimistic concurrency (unique `[identityId, roleName]`, `aggregateVersion`);
- `AuthorizationDecisionRecord` — append-only, immutable audit records (Part 6.5 §22).

Additive migration `20260811090237_module_02_authorization_role_assignments`, domain repository ports, Prisma repositories, mappers, and the `AuthorizationModule` wiring (registered once the application layer consumes it in Milestone 3). Tests cover mapper roundtrips, version-stale conflict rejection and append-only audit writes.

### Milestone 3 — Application, Guards & Admin API (anchors: 6.3 §13–14, 6.5 §22, §24)

**Implemented.** Refinement from implementation: the guard is a permission guard (`AuthorizationPermissionGuard`, 6.3 §14) that runs after the existing AAL2 session guard (authentication before authorization); role assignment/revocation is centrally managed through the application service (6.2 §9, server-controlled, never client-selected), with a `SUPER_ADMIN`-only rule for Super Admin assignments, version-checked writes, append-only decision audit records, and standardized non-disclosing error responses (6.5 §24). Endpoints: assign role, revoke role, list own role assignments, read role catalog. Tests include authorization-failure and privilege-escalation attempts.

### Milestone 4 — Boundary Integration (deferred)

Replace the five fail-closed adapters with real Module 02 decisions **only when the approved Module 02 specification explicitly requires it** and the role → permission matrix is approved. Until then the five adapters remain fail-closed.

### Deferred (require approved spec)

Temporary permissions, delegated administration, authorization notifications, resource-ownership enforcement, M02 administrative dashboard.

---

## 4. Internal Phase-1 Policy (proposed role → permission matrix)

Identifiers use the immutable `resource.action` form (draft §8: immutable permission identifiers). Marked **proposed** until Module 02 approval.

| Permission                       | Category  | Granted to (Phase 1)                                          |
| -------------------------------- | --------- | ------------------------------------------------------------- |
| `recovery.approval.decide`       | Approve   | Admin, Super Admin                                            |
| `identity.state.change`          | Manage    | Admin, Super Admin                                            |
| `identity.classification.change` | Configure | Admin, Super Admin                                            |
| `identity.privileged.provision`  | Manage    | Super Admin                                                   |
| `identity.superadmin.bootstrap`  | Manage    | Super Admin (bootstrap path only)                             |
| `authorization.role.assign`      | Manage    | Admin, Super Admin (Super Admin assignment: Super Admin only) |
| `authorization.role.revoke`      | Manage    | Admin, Super Admin                                            |
| `authorization.permission.view`  | Audit     | Admin, Super Admin                                            |

Customers/Sellers receive no authorization-domain permission in Phase 1 (Module 01 owns their identity/self-service flows). Explicit deny overrides all grants. This matrix is the only speculative element and is isolated in the two catalogs for easy correction at approval.

---

## 5. Engineering & Security Constraints

- No client-controlled privilege escalation; server-controlled assignment only.
- No hidden Super Admin bypass; bootstrap path remains `available: false` until the approved contract.
- No weakening of the five fail-closed adapters.
- No plaintext secrets in logs or audit records.
- No unnecessary schema changes (additive only).
- No duplicate authorization engine: Module 02 is the single engine; no module implements its own.
- Full validation after each milestone (jest, lint, typecheck, coverage, builds, `prisma validate`).

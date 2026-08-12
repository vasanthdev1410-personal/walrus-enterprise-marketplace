# WALRUS Enterprise Marketplace Platform

## Module 02 — Roles, Permissions and Authorization

**Document ID:** WEMP-M02-SPEC-001  
**Version:** Review Draft 1.0  
**Status:** REVIEW ONLY — PROPOSED / REQUIRES OWNER APPROVAL  
**Effective date:** Not effective until formally approved  
**Classification:** Confidential — Internal Use Only

> This document is not an authorization to implement. It preserves Module 00,
> Module 01, and Module 02 Milestones 1–3 exactly as they are. Every item marked
> **PROPOSED / REQUIRES APPROVAL** is non-binding until the product/architecture
> owner records explicit approval.

## 1. Authority and evidence classification

This review draft uses three evidence labels:

- **BINDING:** directly required by accepted Module 00 architecture or the
  approved Module 01 specification/contracts.
- **DERIVED:** necessary to satisfy a binding contract without adding a new
  business policy; requires confirmation as part of approving this document.
- **PROPOSED / REQUIRES APPROVAL:** policy, vocabulary, scope, or protocol not
  fully specified by an approved source. It must not be implemented merely
  because it appears here or in current Milestones 1–3.

Authoritative inputs used for this draft:

1. `docs/architecture/README.md` and `docs/architecture/decisions/ADR-001-018.md`.
2. `docs/module-01/specifications/Module 01 Corrected Draft v1.12.txt`, including
   its ownership model, authentication-to-authorization boundary, recovery
   policy matrix, endpoint catalogue, DTO catalogue, and validation rules.
3. The five approved Module 01 boundary ports and their fail-closed adapters.
4. `docs/module-01/archive/Module 02 Part 6 Authorization Source Material.txt`,
   which is **unapproved source material**, not authority by itself.
5. The implemented and locally committed Module 02 Milestones 1–3, used only to
   identify the present implementation and approval decisions—not to bootstrap
   policy approval from code.
6. `docs/module-02/implementation-spec.md`, an internal working document that is
   explicitly not an approved specification.

## 2. Purpose and ownership

### 2.1 Binding purpose

**BINDING:** Module 02 owns roles, permissions, role and permission assignments,
resource authorization policies, authorization evaluation, authorization
decisions, and authorization audit evidence. Module 01 owns universal Identity,
authentication state, authentication-security classification, Sessions,
Authentication Assurance, Recovery state and execution, and its own audit
evidence.

**BINDING:** Authentication and authorization remain independent. Module 02
consumes a current authenticated identity context and must never infer authority
from authentication-security classification, MFA enrollment, profile state, or
client-supplied roles/permissions.

**BINDING:** Direct cross-module database access is prohibited. A module invokes
the owning module through an approved narrow contract and may retain only the
approved non-sensitive decision/contract reference.

### 2.2 Phase 1 scope

**DERIVED, REQUIRES APPROVAL:** Limited Phase 1 comprises:

- the four fixed identity roles `CUSTOMER`, `SELLER`, `ADMIN`, `SUPER_ADMIN`;
- centrally managed immutable permission identifiers;
- permissions assigned only to roles, never directly to identities;
- independently stored identity-role assignments;
- deterministic, deny-by-default decisions;
- append-only authorization decision records;
- authorization guards for explicitly protected operations;
- centrally controlled assignment and revocation;
- integration of only the five existing Module 01 boundary ports after this
  document and ADR-M02-001 are approved.

Temporary permissions, delegated administration, policy notifications,
authorization dashboards, general ABAC/ReBAC, and cross-module resource-owner
resolution beyond the five boundaries are excluded pending separate approval.

## 3. Mandatory authorization invariants

The following are **BINDING** unless explicitly noted:

1. Deny by default; absence, ambiguity, dependency failure, stale context, or
   unexpected error never grants access.
2. Authentication completes before authorization.
3. A role is not authentication, assurance, or a permission grant by itself.
4. Role hierarchy never implies permission inheritance.
5. Only an explicit active permission on an active role held through an active
   assignment can grant an ordinary RBAC decision.
6. Explicit deny takes precedence over a grant.
7. Clients never select roles, permissions, a weaker recovery policy row,
   service authority, bootstrap availability, or an administrative override.
8. No hidden Super Admin bypass exists.
9. Module 01 JWTs and authenticated identity contexts contain authentication
   claims only; Module 02 resolves assignments from its own authoritative state.
10. Every protected mutation is authorized before business state changes.
11. Authorization failures use stable, non-disclosing errors and never reveal
    role membership, permission assignment, or policy internals.

## 4. Final proposed permission vocabulary

All entries in this section are **PROPOSED / REQUIRES APPROVAL**. Approval makes
the identifiers immutable Phase 1 contract identifiers. `resource.action` is
the canonical format.

| Permission identifier            | Protected resource         | Action      | Intended use                                                                                  |
| -------------------------------- | -------------------------- | ----------- | --------------------------------------------------------------------------------------------- |
| `recovery.approval.decide`       | `recovery.approval`        | `APPROVE`   | Eligibility to submit an M01-REC-005 approval decision                                        |
| `identity.state.change`          | `identity`                 | `MANAGE`    | M01-ID-004 identity authentication-state transition                                           |
| `identity.classification.change` | `identity.classification`  | `CONFIGURE` | Authorization component of M01-CLS-001 coordination                                           |
| `identity.privileged.provision`  | `identity.provisioning`    | `MANAGE`    | M01-ADM-001 privileged provisioning request                                                   |
| `identity.superadmin.bootstrap`  | `identity.bootstrap`       | `MANAGE`    | Post-bootstrap governance/audit vocabulary; not sufficient to authorize the initial bootstrap |
| `authorization.role.assign`      | `authorization.assignment` | `MANAGE`    | Assign an active role within administrative scope                                             |
| `authorization.role.revoke`      | `authorization.assignment` | `MANAGE`    | Revoke an active role assignment within administrative scope                                  |
| `authorization.permission.view`  | `authorization.catalog`    | `AUDIT`     | View the safe role catalog; never disclose the internal matrix publicly                       |

No wildcard, implicit, identity-direct, or client-defined permission exists in
Limited Phase 1.

## 5. Final proposed role-to-permission matrix

This complete matrix is **PROPOSED / REQUIRES APPROVAL** and matches the current
Milestones 1–3 catalogs. A check mark is an explicit grant; blank is denial.

| Permission                       | Customer | Seller | Admin | Super Admin |
| -------------------------------- | :------: | :----: | :---: | :---------: |
| `recovery.approval.decide`       |          |        |   ✓   |      ✓      |
| `identity.state.change`          |          |        |   ✓   |      ✓      |
| `identity.classification.change` |          |        |   ✓   |      ✓      |
| `identity.privileged.provision`  |          |        |       |      ✓      |
| `identity.superadmin.bootstrap`  |          |        |       |     ✓¹      |
| `authorization.role.assign`      |          |        |   ✓   |      ✓      |
| `authorization.role.revoke`      |          |        |   ✓   |      ✓      |
| `authorization.permission.view`  |          |        |   ✓   |      ✓      |

¹ The initial bootstrap cannot depend on this grant because no Super Admin
assignment exists yet. Section 11 defines the separate controlled-bootstrap
boundary. This permission must not become a bootstrap bypass.

Customer and Seller receive no authorization-domain administrative permission
in this limited scope. Future business permissions belong to their owning
business-module specifications and are not invented here.

## 6. Administrative scope

The hierarchy `SUPER_ADMIN → ADMIN → SELLER → CUSTOMER` appears in unapproved
Module 02 source material. The following operational rules are therefore
**PROPOSED / REQUIRES APPROVAL**, even though Milestones 1–3 implement them:

| Actor role  | May administer role assignments for                                                                             |
| ----------- | --------------------------------------------------------------------------------------------------------------- |
| Super Admin | Admin, Seller, Customer; Super Admin only under the special same-role rule below                                |
| Admin       | Seller, Customer                                                                                                |
| Seller      | Customer only if a future approved permission is also granted; no such permission exists in this Phase 1 matrix |
| Customer    | None                                                                                                            |

Additional rules:

1. Holding a higher role does not inherit lower-role permissions.
2. Administrative scope and `authorization.role.assign` or
   `authorization.role.revoke` must both pass.
3. Only an active Super Admin may assign `SUPER_ADMIN`; no other same-role
   assignment is allowed.
4. **PROPOSED / REQUIRES APPROVAL:** revocation uses the same target-scope rule
   as assignment, including Super Admin-target restrictions. The current
   Milestone 3 service must be reviewed because its revoke path does not itself
   evaluate target administrative scope after the route permission guard.
5. An identity may not use a client-selected actor identifier; actor identity is
   bound from the verified request/service context.
6. Role state, assignment state, optimistic version, and target scope are
   evaluated at decision time.

## 7. Authenticated context, Sessions, and AAL2

### 7.1 Ordinary protected operations

**BINDING:** Module 01 authenticates and validates bearer tokens and authoritative
Session state before Module 02 evaluates authorization. Protected requests must
reject invalid, expired, revoked, or stale Session/Session-Version context.

The context may contain identity ID, Session ID, token ID, authentication
methods, Authentication Assurance, Session Version, authenticated timestamps,
and correlation ID. It must not contain Module 02 roles or permissions.

### 7.2 AAL requirements

- M01-REC-005 requires a current ordinary **AAL2** Session plus a current Module
  02 approver decision. **BINDING.**
- Module 02 administrative endpoints in Milestone 3 use an ordinary AAL2
  Session before their permission guard. **CURRENT IMPLEMENTATION;
  PROPOSED / REQUIRES APPROVAL as Module 02 API policy.**
- M01-ID-004 is catalogued as ordinary Session plus current Module 02 decision;
  its approved source does not explicitly require AAL2. Adding AAL2 would be a
  stronger control and is **PROPOSED / REQUIRES APPROVAL**.
- M01-CLS-001 is an authenticated internal-service coordination contract, not
  an ordinary user Session. **BINDING.**
- M01-ADM-001 is an authenticated internal-service contract. **BINDING.** Its
  exact service authentication mechanism is **MISSING / REQUIRES APPROVAL**.
- M01-ADM-002 uses deployment/operations-controlled bootstrap authority, not an
  ordinary Session. **BINDING.**

Authentication-security classifications may require AAL2 but never grant a
role or permission. Recovery Assurance never maps automatically to AAL.

## 8. Exact proposed mapping for the five Module 01 boundaries

The port shapes and fail-closed behavior are **BINDING**. Permission mappings
and detailed evaluation rules below are **PROPOSED / REQUIRES APPROVAL** unless
stated otherwise.

| Boundary                                                        | Module 01 operation | Authentication prerequisite                | Proposed Module 02 evaluation                                                                                                                                                     | Success result                                                   | Secure failure             |
| --------------------------------------------------------------- | ------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------- |
| `ApprovalAuthorizationPort.authorizeApprover`                   | M01-REC-005         | Ordinary current AAL2 Session              | `recovery.approval.decide`; actor is `approverIdentityId`; bind decision to request, recovered identity and operation class; apply Section 9 eligibility                          | `{ authorized: true, authorizationReference }`                   | `{ authorized: false }`    |
| `IdentityStateChangeAuthorizationPort.authorizeStateChange`     | M01-ID-004          | Current ordinary Session; AAL2 unresolved  | `identity.state.change`; actor is server-bound `actorIdentityId`; resource is `targetIdentityId`; bind target state and source contract reference                                 | `{ authorized: true, authorizationReference }`                   | `{ authorized: false }`    |
| `ClassificationTransitionCoordinationPort.validateContract`     | M01-CLS-001         | Authenticated internal service             | First validate an approved versioned coordination contract and service authority; then evaluate `identity.classification.change` when an acting identity is part of that contract | `{ contractValid: true, contractReference }`                     | `{ contractValid: false }` |
| `PrivilegedProvisioningAuthorizationPort.authorizeProvisioning` | M01-ADM-001         | Authenticated internal service             | Validate provisioning contract/reference and service identity; evaluate `identity.privileged.provision`; bind actor and provisioning reference                                    | `{ authorized: true, authorizationReference }`                   | `{ authorized: false }`    |
| `BootstrapAuthorizationPort.authorizeBootstrap`                 | M01-ADM-002         | Controlled deployment/operations authority | Validate one-time approved bootstrap evidence and bootstrap lifecycle; do not use an existing-role prerequisite for initial bootstrap                                             | `{ available: true }` only while approved bootstrap is available | `{ available: false }`     |

For all five boundaries:

1. Module 01 storage is never read directly by Module 02 and vice versa.
2. A decision is current and request-bound; a prior grant is not a reusable
   bearer capability.
3. Correlation/decision references are non-sensitive.
4. A missing mapping, unknown contract version, dependency error, stale Session,
   malformed identifier, inactive assignment, or audit failure where audit is
   mandatory denies the operation.
5. Module 01 remains the only module that executes its owned state change.

## 9. Recovery separation of duties

### 9.1 Binding rules

Module 01 owns Recovery policy, evidence, request state, approval receipt,
execution, and final outcome. Module 02 only decides whether an identity is
eligible to act as an approver at decision time.

- The requester never approves their own Recovery.
- Where dual control applies, two distinct Module 02-authorized approvers are
  required; one identity cannot satisfy both approvals.
- For `PRIVILEGED_ADMIN_AUTHENTICATION`, no human approval is required when the
  approved strong self-service evidence set is fully satisfied; otherwise dual
  control applies.
- For `SUPER_ADMIN_AUTHENTICATION`, dual control is mandatory for every Recovery
  operation, together with controlled bootstrap evidence where applicable.
- Approval decisions bind recovery request, recovered identity, operation
  class, approver identity, decision, and expiration.
- Clients cannot select a weaker policy row.

### 9.2 Proposed eligibility policy

**PROPOSED / REQUIRES APPROVAL:** `ADMIN` and `SUPER_ADMIN` may be eligible under
`recovery.approval.decide`, subject to all binding checks. The following is not
resolved by approved sources and must be selected by the owner:

- whether Admin may approve recovery of another Admin;
- whether only Super Admin may approve privileged Admin recovery;
- whether Super Admin emergency recovery requires two other Super Admins, or an
  approved mixed Security/Operations authority model;
- minimum remaining approver population and lockout/emergency procedure;
- approval expiration limits and reason-code catalogue.

Until these are approved, the recovery boundary remains fail-closed.

## 10. Classification-transition coordination contract

### 10.1 Binding contract shape

The request contains acting service/identity ID, target identity ID, target
authentication-security classification, and versioned source contract
reference. The response contains `contractValid` and, on success, a
non-sensitive contract reference. Module 01 owns and executes classification
changes. Classification never grants permissions.

### 10.2 Proposed validation

**PROPOSED / REQUIRES APPROVAL:** a valid coordination decision requires all of:

1. authenticated, allowlisted service authority;
2. recognized active contract ID and schema/policy version;
3. actor bound by that contract, never taken from an untrusted body alone;
4. target identity and requested classification covered by the contract;
5. current `identity.classification.change` decision if a human actor governs
   the request;
6. idempotency/correlation and replay protection;
7. authorization/coordination audit record before success;
8. no direct role assignment or Module 01 mutation by Module 02.

The service identity mechanism, contract registry, valid transition matrix,
reason-code catalogue, expiry, signatures, and replay window are
**MISSING / REQUIRES APPROVAL**.

## 11. Privileged provisioning contract

### 11.1 Binding contract shape

M01-ADM-001 is an internal-service, idempotent operation. The Module 02 boundary
receives a provisioning reference and actor identity ID and returns an
authorization decision/reference. Public privileged registration is prohibited.
Module 01 provisions authentication state; Module 02 owns subsequent role
assignment. Failure on either side leaves privileged access unavailable.

### 11.2 Proposed validation and orchestration

**PROPOSED / REQUIRES APPROVAL:** authorization requires:

- authenticated internal-service context;
- `identity.privileged.provision` held by an active Super Admin;
- actor ID bound to that authenticated context;
- recognized, active, single-purpose provisioning reference;
- idempotency and replay protection;
- no client-selectable classification or role outside the approved workflow;
- an audit record and correlation reference.

The invitation/provisioning reference issuer, expiry, single-use semantics,
service authentication, coordination state machine, compensation/reconciliation,
and exact point at which Module 02 assigns Admin/Super Admin are
**MISSING / REQUIRES APPROVAL**. Until resolved, the port stays fail-closed.

## 12. Controlled bootstrap authorization contract

### 12.1 Binding rules

The initial Super Admin identity is created only through a controlled, auditable
deployment/operations process. Module 01 bootstrap does not grant the Super
Admin role. Module 02 remains the role owner. Direct database manipulation is
prohibited. Bootstrap is unavailable after approved completion, and every
bootstrap/role-coordination event is audited.

### 12.2 Proposed authority model

**PROPOSED / REQUIRES APPROVAL:** initial bootstrap is a distinct one-time
control-plane authority, not an ordinary RBAC decision. It requires:

1. an explicitly enabled deployment environment and one-time bootstrap state;
2. independently authenticated Operations/Security authority;
3. protected, single-use, expiring evidence bound to environment and intended
   universal identity;
4. atomic state transition or durable orchestration ensuring Module 01
   classification and Module 02 assignment cannot yield partial privileged
   access;
5. idempotent retry and reconciliation;
6. permanent closure after successful bootstrap;
7. immutable audit evidence in both owning modules without copying secrets.

The evidence format, authority identities, quorum/separation of duties, secret
storage/KMS policy, expiry, environment eligibility, bootstrap state owner,
atomicity protocol, break-glass process, and recovery procedure are
**MISSING / REQUIRES SECURITY AND OPERATIONS APPROVAL**.

`identity.superadmin.bootstrap` cannot authorize the first bootstrap. After
bootstrap it may remain an audit/governance identifier, but it must never reopen
bootstrap or serve as a hidden bypass.

## 13. Resource ownership

### 13.1 Binding ownership

| Resource/state                                                           | Authoritative owner |
| ------------------------------------------------------------------------ | ------------------- |
| Universal Identity, authentication state, classifications, Sessions, AAL | Module 01           |
| Roles, permissions, assignments, policies, authorization decisions       | Module 02           |
| Recovery request, evidence, approvals received, execution                | Module 01           |
| Customer profile and business data                                       | Module 06           |
| Seller profile, organization and onboarding                              | Module 03           |

### 13.2 Authorization ownership rules

**DERIVED, REQUIRES APPROVAL:** each authorization request names a protected
resource type, action/permission, subject identity, and an opaque resource
identifier owned by the appropriate module. Module 02 evaluates policy using an
approved contract; it does not query another module's database.

**PROPOSED / REQUIRES APPROVAL:** Limited Phase 1 contains no general
owner-equals-subject shortcut and no administrative override. Ownership grants
nothing unless an approved resource policy explicitly maps ownership to a
permission. For the five Module 01 boundaries, the narrow command fields are the
complete resource context; adding ownership attributes requires a versioned
contract change.

Resource-owner resolver contracts, organization/delegation ownership, owner
transfer, administrative override, and owner-policy caching are
**MISSING / DEFERRED**.

## 14. Audit and security requirements

### 14.1 Mandatory audit behavior

**BINDING/DERIVED:** every authorization decision and role assignment/revocation
supports an immutable, append-only audit record. Required fields, where present
in the approved calling context, are timestamp, correlation ID, subject/actor
identity ID, Session/service ID, resource identifier/type, permission/action,
decision, decision reference, and available source IP, user agent, and device
identifier. Secrets, credentials, tokens, MFA data, recovery evidence, bootstrap
evidence, full policies, and unnecessary personal data are prohibited.

Module 02 owns authorization evidence. Module 01 may store only the approved
non-sensitive Module 02 decision reference needed to explain its own action.

### 14.2 Mandatory security behavior

- Fail closed on policy, repository, contract, Session, service-authentication,
  or mandatory-audit failure.
- Prevent replay and stale decisions; use idempotency and optimistic concurrency
  for mutations.
- Never expose denial reasons or policy internals to ordinary callers.
- Never trust client-supplied actor identity, role, permission, assurance,
  resource ownership, or bootstrap availability.
- Enforce least privilege and explicit deny precedence.
- Prevent assignment outside administrative scope and Super Admin escalation.
- Keep authorization decision records immutable; no update/delete API.
- Propagate correlation identifiers without transferring ownership.
- Apply no authorization cache in Module 01. Any Module 02 cache requires
  explicit bounded staleness/revocation approval.

Audit retention, integrity chaining, KMS policy, SIEM export, legal hold, source
IP trust/proxy rules, clock-drift threshold, and mandatory-audit transaction
semantics beyond current persistence are **MISSING / REQUIRES APPROVAL**.

## 15. Proposed Milestone 4 — Boundary Integration

Everything in this section is **PROPOSED / REQUIRES APPROVAL**. Approval of this
document and ADR-M02-001 is a prerequisite, but implementation must also wait
for each missing protocol decision called out below.

### 15.1 Included scope

1. Add Module 02-owned adapters implementing the five existing Module 01 ports;
   do not change their public shapes without a separately approved contract
   version.
2. Wire adapters through dependency injection while preserving inward Clean
   Architecture dependencies and Module 01 storage isolation.
3. Map the boundaries exactly as defined in Section 8.
4. Enforce authentication/AAL/service/bootstrap prerequisites before Module 02
   evaluation.
5. Bind decisions to actor, target/resource, operation, Session/service context,
   correlation ID, and approved contract version.
6. Preserve fail-closed behavior on every missing or invalid prerequisite.
7. Record Module 02 authorization evidence and return only the approved
   non-sensitive reference.
8. Add unit, integration, API, cross-module contract, concurrency, replay,
   escalation, denial, audit-redaction, and dependency-failure tests.
9. Make no unrelated schema change. A schema change is allowed only if an
   approved contract proves current Milestone 2 storage insufficient and a
   separate forward migration is reviewed.

### 15.2 Explicit exclusions

- Temporary permissions or delegated administration
- General resource-ownership engine or administrative overrides
- Notification delivery or dashboards
- New public Module 01 endpoints
- Roles/permissions in JWTs or Module 01 storage
- Direct cross-module database reads/writes
- Client-controlled privileges
- Hidden Super Admin bypass
- Broad refactoring of Modules 00, 01, or Module 02 Milestones 1–3

### 15.3 Acceptance criteria

Milestone 4 is complete only when:

1. This specification and ADR-M02-001 have recorded owner approval.
2. The recovery eligibility matrix, classification contract registry/protocol,
   provisioning protocol, and bootstrap authority protocol are approved.
3. Every boundary succeeds only for its exact approved positive case.
4. Every boundary remains fail-closed for missing context, unknown/stale
   contract, inactive role/assignment, missing permission, insufficient AAL,
   invalid Session/service authority, replay, audit failure, and dependency
   failure.
5. Recovery tests prove requester exclusion, distinct approvers, applicable dual
   control, operation-class binding, and expiration behavior.
6. Classification tests prove contract validation precedes mutation and that
   classification never grants a permission.
7. Provisioning tests prove server-bound actor authority, idempotency, and no
   partial privileged access.
8. Bootstrap tests prove one-time availability, no pre-existing-Super-Admin
   dependency, permanent closure, idempotency, reconciliation, and no bypass.
9. Role assignment and revocation both enforce permission plus target scope,
   including Super Admin restrictions.
10. Cross-module tests prove no database coupling and only non-sensitive
    references cross the boundary.
11. Audit tests prove append-only behavior, correlation, complete decision
    evidence, and secret/policy redaction.
12. Format, lint, typecheck, API tests/coverage/build, Prisma validation, web
    typecheck/tests/build, Playwright, Flutter validation, dependency/security
    checks, and configured secret scanning pass in the approved toolchain.
13. The working tree contains no unrelated changes and `tmp/` is untouched.

## 16. Approval register

No entry below is approved merely by being listed.

| Decision                                                  | Status                                          |
| --------------------------------------------------------- | ----------------------------------------------- |
| Permission vocabulary in Section 4                        | REQUIRES OWNER APPROVAL                         |
| Role-to-permission matrix in Section 5                    | REQUIRES OWNER APPROVAL                         |
| Administrative scope and revoke symmetry                  | REQUIRES OWNER APPROVAL                         |
| M01-ID-004 AAL requirement                                | REQUIRES SECURITY/OWNER APPROVAL                |
| Recovery approver eligibility by classification/operation | REQUIRES SECURITY/OWNER APPROVAL                |
| Classification coordination protocol                      | MISSING — REQUIRES APPROVAL                     |
| Privileged provisioning protocol                          | MISSING — REQUIRES APPROVAL                     |
| Controlled bootstrap authority protocol                   | MISSING — REQUIRES SECURITY/OPERATIONS APPROVAL |
| Resource ownership policy limits                          | REQUIRES OWNER APPROVAL                         |
| Audit failure/retention/integrity details                 | REQUIRES SECURITY/COMPLIANCE APPROVAL           |
| Milestone 4 scope and acceptance criteria                 | REQUIRES OWNER APPROVAL                         |

**Approval statement:** Not yet recorded.

## 17. Implemented security corrections

The following corrections are implemented in local commit `5e7eaca`. They fix
security mechanics without approving the proposed business policy or starting
Milestone 4:

1. **Revocation scope is fail-closed.** Revocation now requires an active actor
   assignment whose existing hierarchy entry explicitly manages the target
   role. Same-role revocation, including Super Admin-to-Super Admin, is denied
   until a same-role rule is approved.
2. **Role mutation and audit are atomic.** Assignment/revocation and mandatory
   audit insertion execute in one Prisma transaction; an audit failure rolls
   back the state mutation.
3. **Decision instances are independently auditable.** A server-generated UUIDv7
   decision-instance input makes repeated equivalent evaluations produce
   distinct audit references while evaluation outcome remains deterministic.
   Assignment identifiers are sorted before hashing so input ordering does not
   alter the reference for the same complete decision instance.
4. **Actor and target are distinct.** `actor_identity_id` is a nullable,
   backward-compatible audit column; administrative events store the actor
   separately while `subject_identity_id` identifies the target.
5. Optimistic concurrency, deny-by-default behavior, and the absence of a Super
   Admin bypass are preserved and covered by tests.

These corrections do not ratify the hierarchy, permissions, or same-role
policy. They apply the narrowest safe behavior while owner approval is pending.

## 18. Owner decision catalogue

Every row below is **REQUIRES OWNER APPROVAL**. The recommendation is a review
proposal, not current authority.

| Decision                        | Proposed option                                                                                                                                         | Security rationale                                                                                             | Alternatives                                                                             | Recommended choice                                                                                                        | Consequence of approval                                                                                                  |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Final role-to-permission matrix | Adopt Section 5 unchanged for Limited Phase 1                                                                                                           | Matches current catalogs; no Customer/Seller administrative grants                                             | Reduce Admin grants; defer individual permissions; introduce additional roles            | Adopt Section 5 only for the listed authorization operations                                                              | Catalog grants become authoritative; M4 may map only approved permissions                                                |
| Permission identifiers          | Adopt the eight identifiers in Section 4 as immutable `resource.action` contracts                                                                       | Prevents arbitrary strings and policy drift                                                                    | Rename/version identifiers before approval; approve a smaller set                        | Adopt Section 4, with bootstrap identifier explicitly non-authoritative for initial bootstrap                             | Identifiers become stable API/audit contracts; later renames require versioning                                          |
| Administrative hierarchy        | Adopt `SUPER_ADMIN → ADMIN → SELLER → CUSTOMER` for target scope only, never inheritance                                                                | Constrains privilege administration without implicit grants                                                    | Flat model; Super Admin-only administration; organization-scoped hierarchy later         | Adopt hierarchy for Limited Phase 1 with permission-plus-scope checks                                                     | Super Admin manages lower roles; Admin manages Seller/Customer; Seller has no effective admin capability without a grant |
| Same-role administration        | Preserve the current proposed exception allowing an active Super Admin to assign Super Admin; deny every same-role revocation                           | Prevents lower-role peer administration while retaining current post-bootstrap Super Admin onboarding behavior | Deny all peers; require dual approval; permit Super Admin peer assignment and revocation | Approve Super Admin peer assignment only for Limited Phase 1; keep peer revocation denied pending dual-control governance | Current assignment exception becomes authoritative; all same-role revocation remains unavailable                         |
| Recovery approver eligibility   | Admin/Super Admin may approve ordinary recovery; privileged/Super Admin recovery uses a separately approved eligibility table                           | Prevents a broad permission from authorizing high-risk recovery                                                | Super Admin-only; dedicated Recovery Approver role; Security/Operations quorum           | Introduce a dedicated eligibility table before M4; do not infer it from the general matrix                                | Recovery adapter can authorize only exact classification/operation pairs and enforce dual control                        |
| M01-ID-004 AAL                  | Require current authoritative AAL2 for administrative identity-state changes                                                                            | State changes can disable/enable identities and are high impact                                                | Preserve approved minimum ordinary Session; risk-selected step-up                        | Require AAL2 as an explicitly approved stronger control                                                                   | M01-ID-004 callers without current AAL2 are denied before authorization                                                  |
| Internal-service authentication | Use mutually authenticated workload identity with allowlisted service principal, audience, contract version, and replay protection                      | Actor IDs in request bodies are insufficient trust                                                             | Signed internal JWT; service mesh mTLS; cloud IAM request signing                        | Workload identity plus mTLS and audience-bound short-lived assertion                                                      | M01-CLS-001/M01-ADM-001 can validate a server-bound service authority                                                    |
| Classification escalation       | Require approved source-contract version, allowlisted transition, authorized human actor where applicable, and Module 01 domain validation              | Classification controls authentication strength and must not become authorization                              | Service-only contract; human-only AAL2 workflow; defer all transitions                   | Approve a versioned transition matrix and service/human actor rules before integration                                    | Classification adapter may validate only catalogued transitions; Module 01 remains mutation owner                        |
| Privileged provisioning         | Super Admin permission plus authenticated service contract, single-use provisioning reference, idempotency, and durable orchestration                   | Prevents public or replayed privileged creation and partial access                                             | Security/Operations dual approval; invitation-only workflow; defer provisioning          | Require Super Admin plus independently authenticated provisioning service; add dual control later if mandated             | M01-ADM-001 can proceed only for bound, current, single-use requests                                                     |
| Controlled bootstrap            | One-time deployment/operations authority, separate from RBAC, with Security/Operations quorum, expiring evidence, permanent closure, and reconciliation | Avoids circular existing-Super-Admin dependency and reusable backdoor                                          | Manual database seed (rejected); single operator; pre-provisioned external identity      | Two-party Security/Operations approval with KMS-backed single-use evidence                                                | Initial Super Admin can be created exactly once without an RBAC bypass; ordinary permission cannot reopen bootstrap      |
| Resource ownership/override     | No implicit owner grant and no administrative override in Limited Phase 1                                                                               | Missing ownership context must deny; broad override risks cross-tenant access                                  | Owner-equals-subject shortcut; Super Admin override; owner-resolver service              | Keep both deferred; approve versioned owner-resolver contracts per business module                                        | M4 evaluates only context in the five narrow ports; general resource access remains blocked/deferred                     |
| Audit retention/integrity       | Keep append-only operational records; require mandatory-audit transaction; defer duration/archive until Security/Compliance values are approved         | Avoids invented retention while preventing unaudited mutation                                                  | Fixed application retention; external SIEM only; full integrity chain now                | Approve atomic audit now; separately approve retention, KMS integrity, archive, legal hold, and SIEM                      | M3 atomicity remains authoritative; no retention/archive claim is implied                                                |

Approval must record each choice or an explicit replacement. Silence does not
approve the recommended choice.

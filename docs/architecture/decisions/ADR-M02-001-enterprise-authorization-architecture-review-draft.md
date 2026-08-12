# ADR-M02-001 — Enterprise Authorization Architecture

**Status:** REVIEW ONLY — PROPOSED / REQUIRES OWNER APPROVAL  
**Date:** 2026-08-11  
**Owners:** Product/Architecture, Security, Operations  
**Supersedes:** the missing/removed Enterprise Authorization Architecture
reference formerly described as ADR-M01-004; it does not supersede any accepted
Module 00 decision or any approved Module 01 authentication contract.

> This ADR is non-binding until explicitly approved. It authorizes no code,
> migration, commit, or deployment.

## Context

Module 01 proves who an identity is, validates authoritative Session state, and
produces an authentication-only context. Module 02 must decide what that
identity may do. Module 01 explicitly transfers roles, permissions,
assignments, policy evaluation, decisions, and authorization audit ownership to
Module 02 while retaining Identity, authentication-security classification,
Authentication Assurance, Recovery execution, and authentication audit.

The preserved Module 02 Part 6 material describes a centralized RBAC
architecture but is unapproved. The repository contains Module 02 Milestones
1–3 with a deny-by-default engine, catalogs, persistence, guard, and admin API.
Its permission vocabulary and role matrix are explicitly proposed. Five Module
01 ports remain intentionally fail-closed pending an approved Module 02
contract.

The old authorization ADR reference is absent and Module 01 states that the
former Enterprise Authorization Architecture was removed from Module 01
ownership. A Module 02-owned decision is therefore required before boundary
integration.

## Decision proposed for approval

### 1. Centralized ownership and Clean Architecture

Module 02 is the single authorization authority. Presentation and adapters call
application services; application depends on domain ports; infrastructure
implements those ports. Business and authentication modules do not duplicate
the engine or read Module 02 storage.

Module 01 remains the authentication authority. Authentication completes before
authorization. Roles and permissions never enter Module 01 JWTs, Sessions,
Identity aggregates, or authentication-security classifications.

### 2. Explicit RBAC, deny by default

Limited Phase 1 uses roles `CUSTOMER`, `SELLER`, `ADMIN`, and `SUPER_ADMIN`.
Permissions are immutable identifiers assigned to roles only. Identities receive
roles through independently stored, auditable assignments. A grant requires an
active permission, active role, active assignment, and explicit permission
membership. Unknown, missing, retired, suspended, revoked, stale, or failed
evaluation denies. Explicit denial wins.

The role hierarchy defines administrative scope only and never permission
inheritance. There is no wildcard grant or hidden Super Admin bypass.

**REQUIRES APPROVAL:** the exact matrix and administrative scope are normative
only after approval of WEMP-M02-SPEC-001 Sections 4–6.

### 3. Request-bound decisions

Authorization evaluates a current server-trusted subject, exact permission,
resource/target context, Session or service authority, and approved policy or
contract version. A returned reference is non-sensitive audit correlation, not
a transferable capability. Decisions are not accepted from clients and are not
reused outside their bound request.

### 4. Cross-module boundaries

Module boundaries use narrow versioned ports. No module reads another module's
database. Module 01 executes its owned operation only after the current Module
02 or coordination decision succeeds. Module 02 never executes Module 01
Recovery, Identity, classification, provisioning, or bootstrap mutations.

The five existing Module 01 ports remain fail-closed until WEMP-M02-SPEC-001,
this ADR, and the missing boundary protocols are approved. Their proposed exact
mapping is WEMP-M02-SPEC-001 Section 8.

### 5. Authentication Assurance

Module 01 calculates and validates Authentication Assurance. Module 02 may
require an approved AAL but never derives it from a role. M01-REC-005 requires a
current ordinary AAL2 Session. Internal-service and bootstrap operations use
separately approved authorities rather than pretending to be ordinary user
Sessions.

### 6. Recovery separation of duties

Module 01 owns Recovery policy and enforces requester exclusion, distinct
approvers, dual-control count, decision binding, expiration, and execution.
Module 02 owns current approver eligibility. One approver never satisfies two
required approvals. Recovery approval never authenticates the recovered
identity and Recovery Assurance never becomes AAL.

**REQUIRES APPROVAL:** exact role eligibility by authentication-security
classification and operation class.

### 7. Controlled initial bootstrap

The first Super Admin bootstrap is a one-time deployment/operations control-plane
authority, not ordinary RBAC: requiring an existing Super Admin would be
circular. It must be explicitly enabled, independently authenticated,
single-use, expiring, environment/identity-bound, idempotent, audited, and
permanently closed after completion. Module 01 provisions authentication state;
Module 02 assigns authorization state through their respective boundaries.

The `identity.superadmin.bootstrap` permission cannot by itself make initial
bootstrap available or reopen it.

**REQUIRES SECURITY/OPERATIONS APPROVAL:** evidence, quorum, state ownership,
KMS/storage, atomic orchestration, reconciliation, and break-glass protocols.

### 8. Resource ownership

The owning module remains authoritative for resource and business state.
Module 02 receives only approved policy context through a versioned contract.
Ownership is not an implicit permission and there is no default administrative
override. General owner-policy resolution is deferred.

### 9. Audit and secure failure

Module 02 records append-only authorization decisions and role changes with
available subject/actor, Session/service, resource, action, outcome, timestamp,
correlation, and decision-reference context. Secrets and internal policy are
never logged or returned. Module 01 stores only the non-sensitive decision
reference needed to explain its operation.

Mandatory audit, repository, authentication, authorization, coordination, or
dependency failure denies the protected operation. Mutations use idempotency,
replay protection, and optimistic concurrency where applicable.

## Alternatives rejected

### Put roles and permissions in JWTs

Rejected because Module 01 explicitly prohibits authorization claims and stale
tokens would delay revocation.

### Let each module implement authorization

Rejected because it fragments policy, creates inconsistent decisions, and
violates Module 02 ownership.

### Treat Super Admin as an implicit bypass

Rejected because it defeats explicit permissions, least privilege, auditability,
and the approved prohibition on hidden bypasses.

### Authorize initial bootstrap through an existing Super Admin permission

Rejected because it is circular and cannot authorize the first assignment.

### Share databases across modules

Rejected because approved ownership requires narrow contracts and prohibits
direct coupling.

### Implement the five ports before policy approval

Rejected because their positive cases depend on unapproved matrix, eligibility,
service, coordination, and bootstrap decisions. Fail-closed behavior is safer
and contract-correct.

## Consequences

### Positive

- Immediate revocation and current policy evaluation remain possible.
- Authentication and authorization ownership stay separable.
- Deny-by-default and explicit grants reduce accidental privilege.
- Boundaries can later become service calls without domain redesign.
- Decisions and administrative changes have a single audit owner.

### Costs and constraints

- Protected operations depend on Module 02 availability and approved
  fail-closed behavior.
- Boundary contract/version governance is mandatory.
- Bootstrap and internal-service authentication need separate control-plane
  design and operational ownership.
- Resource ownership cannot be generalized without future owner-resolver
  contracts.

### Risks requiring resolution before Milestone 4

1. The role/permission matrix is not yet approved.
2. Recovery approver eligibility for privileged and Super Admin recovery is
   incomplete.
3. Internal-service authentication and contract registries are unspecified.
4. Bootstrap evidence, quorum, lifecycle, atomicity, and recovery are
   unspecified.
5. M01-ID-004 AAL2 policy is unresolved.
6. The implemented fail-closed revocation scope still requires policy approval;
   same-role administration remains denied.
7. Longer-term audit integrity/retention
   policy are incomplete.

## Implemented security corrections (not policy approval)

Local commit `5e7eaca` implements the following mechanics:

- explicit subordinate-scope enforcement for revocation with deny-by-default
  same-role behavior;
- one transaction for role assignment/revocation and mandatory audit insertion;
- unique per-decision audit references using a server-generated UUIDv7 instance
  while preserving deterministic evaluation for complete inputs;
- order-independent assignment hashing;
- separate, backward-compatible `actor_identity_id` and target/subject identity
  audit fields;
- tests for scope denial, valid revocation, rollback behavior, repeated checks,
  actor/target mapping, concurrency, and no same-role Super Admin bypass.

These changes correct security defects but do not approve the hierarchy,
permission matrix, or any M4 boundary policy. The owner decision catalogue in
WEMP-M02-SPEC-001 Section 18 remains normative for review.

## Implementation gate

This ADR does not authorize implementation while its status is Proposed. M02
Milestone 4 may begin only after:

1. this ADR and WEMP-M02-SPEC-001 are explicitly approved;
2. every boundary-specific decision identified as missing in the specification
   is recorded by its owner;
3. the Milestone 4 scope and acceptance criteria are approved; and
4. no approval changes Modules 00, 01, or Module 02 Milestones 1–3 implicitly;
   any required correction is separately reviewed and committed.

## Validation and compliance

Conformance requires tests for deny-by-default, exact grants, escalation,
assignment/revocation scope, Session/AAL ordering, separation of duties,
contract versioning, replay, concurrency, bootstrap closure, dependency
failure, append-only audit, redaction, and cross-module storage isolation. The
full repository validation and configured security/secret-scanning gates must
pass in the approved toolchain.

## Approval record

**Decision:** Not approved.  
**Approver:** Not recorded.  
**Approval date:** Not recorded.  
**Approved specification version:** Not recorded.

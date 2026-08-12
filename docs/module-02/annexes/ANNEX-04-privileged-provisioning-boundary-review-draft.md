# WEMP-M02-ANNEX-004 — Privileged Provisioning Authorization

**Version:** Review Draft 1.0  
**Status:** REVIEW ONLY — REQUIRES OWNER APPROVAL  
**Boundary:** Module 01 `PrivilegedProvisioningAuthorizationPort` → Module 02  
**Operation:** M01-ADM-001

## 1. Exact current port

```ts
interface PrivilegedProvisioningAuthorizationCommand {
  readonly provisioningReference: string;
  readonly actorIdentityId: UuidV7;
}

interface PrivilegedProvisioningAuthorizationDecision {
  readonly authorized: boolean;
  readonly authorizationReference?: string;
}

interface PrivilegedProvisioningAuthorizationPort {
  authorizeProvisioning(
    command: PrivilegedProvisioningAuthorizationCommand,
  ): Promise<PrivilegedProvisioningAuthorizationDecision>;
}
```

## 2. Caller and authoritative actor

- Caller: Module 01 internal privileged-provisioning application flow.
- Endpoint: authenticated `INTERNAL_SERVICE`, never public registration.
- Actor: human authorizer bound through a trusted workload/delegation context;
  `actorIdentityId` alone is not authentication.
- Proposed initiating workload: approved provisioning orchestrator —
  **REQUIRES OWNER APPROVAL**.

## 3. Permission, role, and scope

- Proposed permission: `identity.privileged.provision`.
- Proposed role: active Super Admin only.
- Both are **REQUIRES OWNER APPROVAL**.
- Resource: a recognized, active, single-purpose provisioning reference bound to
  intended identity identifiers, required Module 01 authentication-security
  classification, requested Module 02 role, environment, initiator, and expiry.
- No client selects privileged classification or role.

## 4. Session/AAL and service assurance

Binding minimum is authenticated internal service. Proposed: authenticated
workload identity plus a separate current AAL2 human Super Admin authorization —
**REQUIRES SECURITY/OWNER APPROVAL**. The human identity, assurance, and
provisioning reference must be cryptographically/request-context bound.

## 5. Separation of duties

No approved source mandates dual approval. Proposed options:

- Limited Phase 1: one Super Admin plus independent provisioning service; or
- stronger: two-party Security/Super Admin approval.

Recommendation: one Super Admin plus independently authenticated service for
Admin provisioning; require separate controlled workflow for any Super Admin
provisioning. **REQUIRES OWNER/SECURITY APPROVAL**.

## 6. State/version preconditions

- Provisioning reference exists, active, unexpired, unused, correct environment,
  and matches request intent.
- Actor permission/assignment and AAL are current.
- Module 01 validates Identity uniqueness/state, allowed classification,
  invitation/verification/MFA workflow, and its resource conflicts.
- Module 02 role assignment occurs only after Module 01 privileged
  authentication requirements are satisfied.
- Failure on either side leaves privileged access unavailable.

## 7. Idempotency, concurrency, and orchestration

- M01-ADM-001 requires Idempotency Key.
- The reference is single-purpose and replay protected.
- Exact retries return the durable orchestration state; mismatched reuse denies.
- A versioned orchestration state machine prevents duplicate Identity/role
  creation and reconciles partial failure.
- Role assignment plus its Module 02 audit remains atomic.

## 8. Audit

Module 02 records workload/human actor, target reference/identity when safely
known, permission, role intent, decision/reference, policy/contract version,
correlation, and timestamp. Module 01 records provisioning state and only the
Module 02 reference. Identifiers are minimized; invitations, tokens, evidence,
credentials, MFA values, and policy internals are excluded.

## 9. Failure and deny-by-default

Unknown/expired/used reference, actor/context mismatch, missing AAL/permission,
non-Super-Admin actor, invalid workload identity, replay, wrong environment,
unapproved target role/classification, dependency/audit failure, or incomplete
context returns `{ authorized: false }`. No Module 01 provisioning or Module 02
assignment proceeds.

## 10. Required tests

- Public/unauthenticated caller, invalid workload, AAL1, missing permission
- Admin actor, inactive/revoked Super Admin, actor-context mismatch
- Unknown, expired, reused, wrong-environment, and intent-mismatched reference
- Admin target versus prohibited ordinary/Super Admin target paths
- Idempotent replay, conflicting reuse, concurrent provisioning
- Failure after either module step and reconciliation without privileged access
- Atomic assignment/audit, actor/target audit, and redaction
- No direct database coupling or client-selected privilege

## 11. Acceptance criteria

1. Workload/human authentication, permission, role, target classes, and SOD are
   approved.
2. A versioned provisioning-reference contract and registry exist.
3. Orchestration cannot expose partial privileged access.
4. Replay/concurrency/audit failures deny safely.
5. Public provisioning and Super Admin shortcuts remain impossible.

## 12. Explicit unresolved decisions

- **REQUIRES OWNER APPROVAL:** Super Admin-only permission/matrix entry.
- **REQUIRES SECURITY/OWNER APPROVAL:** workload identity and human AAL2
  delegation mechanism.
- **REQUIRES OWNER APPROVAL:** Admin versus Super Admin target workflows and
  separation of duties.
- **REQUIRES OWNER APPROVAL:** provisioning registry owner, issuer, fields,
  expiry, single-use state, and environment binding.
- **REQUIRES OWNER APPROVAL:** orchestration state machine, completion order,
  compensation, and reconciliation.
- **CONTRACT GAP — REQUIRES OWNER APPROVAL:** current port lacks workload
  identity, target identity/classification/role, AAL, contract version, expiry,
  and replay nonce. Approve a versioned context contract.

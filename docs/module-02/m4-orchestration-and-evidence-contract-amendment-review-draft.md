# Module 02 — M4 Orchestration and Evidence Contract Amendment

**Document ID:** WEMP-M02-AMENDMENT-002  
**Version:** Review Draft 1.0  
**Status:** REVIEW ONLY — NOT IMPLEMENTATION AUTHORITY  
**Amends:** WEMP-M02-DECISION-PACK-001 and WEMP-M02-AMENDMENT-001  
**Required approval:** Product/Architecture Owner, Security Owner, Operations Owner

Every decision in this amendment is **PROPOSED — REQUIRES OWNER APPROVAL**.
The amendment preserves all V1 fail-closed adapters and M1–M3 behavior.

# A. Final Decision Register

| ID     | Proposed binding decision                                                                          | Security consequence                                                                    |
| ------ | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| AM2-01 | WI-1 uses the signed schema and validation rules in §B1                                            | Operation, request, certificate, policy, and environment are cryptographically bound    |
| AM2-02 | Certificate confirmation is SHA-256 DER thumbprint using base64url without padding                 | A stolen JWT cannot be used from a different workload certificate                       |
| AM2-03 | Module 02 Provisioning Authority issues and owns PRV1 through an internal port                     | No caller can manufacture provisioning authority                                        |
| AM2-04 | Platform Bootstrap Control Plane issues and owns BSV1 and bootstrap lifecycle                      | Bootstrap does not depend on an existing Super Admin or application configuration       |
| AM2-05 | Module 02 owns authorization-human approvals; the control plane owns Security/Operations approvals | Approval authenticity is verified through ports, never cross-module table reads         |
| AM2-06 | Privileged Provisioning Orchestrator owns the provisioning saga                                    | Partial identity/role state never grants privileged access                              |
| AM2-07 | Bootstrap Control Plane owns the bootstrap saga                                                    | Completion is environment-unique, durable, and permanently closed                       |
| AM2-08 | Quorum audit uses ordered participant records, not an overloaded actor field                       | Every authority and assurance event remains independently attributable                  |
| AM2-09 | Module 02 owns the fail-closed privileged-access eligibility projection                            | Access requires all authentication, authorization, evidence, audit, and saga conditions |
| AM2-10 | Use dependency-inverted core/session/integration modules without `forwardRef`                      | V2 consumers migrate atomically while V1 remains available for rollback                 |
| AM2-11 | Use only the additive schema plan in §E                                                            | Migration history and M1–M3 data remain intact                                          |
| AM2-12 | M4 completion requires all criteria in §F                                                          | No partial boundary rollout may be declared complete                                    |

## Final unresolved decision register

AM2-01 through AM2-12 are the complete unresolved register. Each is
`REQUIRES OWNER APPROVAL`. No additional unresolved policy, architecture, or
security choice is known from the current repository review. Production trust
material and deployment bindings remain configuration, not owner-policy
decisions.

# B. Final Envelopes and Verification Contracts

## B1. Signed WI-1 assertion

The compact ES256 JWT payload is exactly:

```ts
interface SignedWorkloadAssertionV1 {
  readonly version: 'walrus.workload.v1';
  readonly iss: `urn:walrus:workload-identity:${EnvironmentName}`;
  readonly sub: string; // exact allowlisted immutable service subject
  readonly aud: 'urn:walrus:module-02:authorization';
  readonly environment: EnvironmentName;
  readonly boundary:
    'classification-transition' | 'privileged-provisioning' | 'controlled-bootstrap';
  readonly iat: number;
  readonly nbf: number;
  readonly exp: number;
  readonly jti: string; // UUIDv7
  readonly nonce: string; // 256-bit base64url, distinct from jti
  readonly cnf: { readonly 'x5t#S256': string };
  readonly requestBindingDigest: string;
  readonly policyVersion: 'wemp.m02.m4.v1';
  readonly contractVersion: 'wemp.m01-m02.authorization.v2';
  readonly operationId: string;
  readonly humanInitiator?: {
    readonly identityId: string;
    readonly approvalReference: string;
  };
}
```

The protected header is exactly `{ alg: 'ES256', typ: 'JWT', kid }`. Unknown
header parameters or payload claims deny. `crit`, `jku`, `x5u`, embedded `jwk`,
and algorithm substitution deny. Maximum lifetime is 300 seconds; clock skew is
60 seconds; `nbf <= iat <= exp`; `jti` and nonce are mandatory and single-use.
The subject must match the exact boundary allowlist in AM-01. `humanInitiator`
is correlation only; the referenced approval is independently revalidated and
the claim grants no authority.

## B2. Certificate binding

- Fingerprint: SHA-256 over the complete leaf certificate DER bytes.
- Encoding: unpadded base64url, placed in JWT `cnf["x5t#S256"]`.
- SAN: exactly one approved URI SAN; it maps one-to-one to JWT `sub`. CN is
  ignored. Wildcard/prefix matching is forbidden.
- Trust: validate chain, EKU `clientAuth`, name constraints, environment trust
  domain, validity, and revocation through configured OCSP/CRL policy.
- Source: native authenticated TLS socket or authenticated mesh metadata API;
  ordinary HTTP headers are never accepted as certificate identity.
- Rotation: old and new certificates may overlap only while both are valid and
  non-revoked, for at most 24 hours. Each JWT binds one exact leaf thumbprint.
- Expired, not-yet-valid, revoked, unverifiable, or mismatched certificates
  deny. Revocation overrides overlap immediately.

## B3. Trusted ingress interface

```ts
interface TrustedWorkloadIngressPortV1 {
  verify(command: {
    readonly compactAssertion: string;
    readonly peerCertificateDer: Uint8Array;
    readonly canonicalRequestBinding: Uint8Array;
    readonly expectedBoundary: SignedWorkloadAssertionV1['boundary'];
    readonly expectedSubjects: readonly string[];
    readonly environment: EnvironmentName;
    readonly now: Date;
  }): Promise<
    | {
        readonly verified: true;
        readonly claims: SignedWorkloadAssertionV1;
        readonly reference: string;
      }
    | { readonly verified: false; readonly reference: string }
  >;
}
```

Verification, replay-marker insertion, and mandatory audit are atomic. Raw
assertions and certificate bytes never leave infrastructure.

## B4. PRV1 issuance and lifecycle

Module 02's Provisioning Authority owns PRV1 persistence and requests signing
through a KMS signing port; application code cannot access private key material.

```ts
interface ProvisioningAuthorityPortV1 {
  issue(command: {
    readonly operationId: string;
    readonly targetIdentityId: string;
    readonly targetIdentifierDigest: string;
    readonly requestedClassification:
      'PRIVILEGED_ADMIN_AUTHENTICATION' | 'SUPER_ADMIN_AUTHENTICATION';
    readonly requestedRole: 'ADMIN' | 'SUPER_ADMIN';
    readonly operation: 'PROVISION' | 'REPLACE_PRIVILEGED_ROLE' | 'REPROVISION';
    readonly environment: EnvironmentName;
    readonly approvalReferences: readonly string[];
    readonly securityApprovalReference?: string;
    readonly policyVersion: 'wemp.m02.m4.v1';
    readonly expiresAt: Date;
  }): Promise<{ readonly lookupReference: string; readonly compactAssertion: string }>;
  reserve(command: {
    readonly lookupReference: string;
    readonly jwtId: string;
    readonly operationId: string;
    readonly expectedVersion: number;
  }): Promise<void>;
  complete(command: {
    readonly lookupReference: string;
    readonly expectedVersion: number;
  }): Promise<void>;
  markReconciliationRequired(command: {
    readonly lookupReference: string;
    readonly reasonCode: string;
    readonly expectedVersion: number;
  }): Promise<void>;
  invalidate(command: {
    readonly lookupReference: string;
    readonly reasonCode: string;
    readonly expectedVersion: number;
  }): Promise<void>;
}
```

Issuance verifies all current approvals first, then atomically inserts the
`ISSUED` row, unique `(environment,jti)`, lookup digest, assertion digest, and
audit record. The signed assertion is returned once and never persisted.
Lifecycle is `ISSUED → RESERVED → CONSUMED`; terminal alternatives are
`INVALIDATED`, `EXPIRED`, and `RECONCILIATION_REQUIRED`. Lifetime is at most five
minutes. Target, classification, role, environment, operation, policy, and
approvals are immutable. Signing or audit failure rolls back issuance.

## B5. BSV1 durable evidence

```ts
interface BootstrapEvidenceV1 {
  readonly version: 'walrus.bootstrap.v1';
  readonly bootstrapReference: string;
  readonly environment: EnvironmentName;
  readonly securityPrincipalId: string;
  readonly securityApprovalReference: string;
  readonly operationsPrincipalId: string;
  readonly operationsApprovalReference: string;
  readonly evidenceDigest: string;
  readonly intendedIdentityId: string;
  readonly intendedIdentifierDigest: string;
  readonly requestedClassification: 'SUPER_ADMIN_AUTHENTICATION';
  readonly requestedRole: 'SUPER_ADMIN';
  readonly operationId: string;
  readonly policyVersion: 'wemp.m02.m4.v1';
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly jti: string;
  readonly lifecycleVersion: number;
}
```

Security and Operations principals must be distinct and neither may be the
target. Both approval references are verified through the control-plane port.
BSV1 expires within ten minutes. Lifecycle is `AVAILABLE → IN_PROGRESS →
COMPLETED`, with `RECONCILIATION_REQUIRED` for partial failure. `(environment)`
and `(environment,jti)` are unique. `COMPLETED` is database-enforced terminal.

## B6. Approval ownership and verification

```ts
interface ApprovalVerificationPortV1 {
  verify(command: {
    readonly reference: string;
    readonly expectedAuthority: 'SUPER_ADMIN' | 'SECURITY' | 'OPERATIONS';
    readonly targetIdentityId: string;
    readonly operationId: string;
    readonly environment: EnvironmentName;
    readonly policyVersion: string;
    readonly now: Date;
  }): Promise<{
    readonly valid: boolean;
    readonly actorIdentityId: string;
    readonly assurance: 'AAL2';
    readonly decision: 'APPROVE';
    readonly reasonCode: string;
    readonly expiresAt: Date;
    readonly auditReference: string;
  }>;
}
```

Module 02 owns Super Admin approval records. The Platform Control Plane owns
Security and Operations records. Consumers use the port/service contract only;
direct table reads are forbidden. Records immutably bind actor, target,
operation, decision, reason, authoritative AAL2 evidence, policy, environment,
expiry, and audit reference. Missing, revoked, expired, mismatched, duplicated,
or unavailable approval denies.

# C. Multi-Authority Audit and Eligibility

AUD-1 is extended with one event plus ordered participant rows:

```ts
interface AuthorizationAuditParticipantV2 {
  readonly ordinal: number;
  readonly participantType: 'INITIATOR' | 'APPROVER' | 'WORKLOAD';
  readonly authorityType: 'HUMAN' | 'SECURITY' | 'OPERATIONS' | 'SERVICE';
  readonly principalReference: string;
  readonly assurance?: 'AAL2';
  readonly evidenceReference?: string;
  readonly decision: 'INITIATED' | 'APPROVED' | 'REJECTED' | 'VERIFIED';
  readonly occurredAt: string;
}
```

Ordering is initiator first, then human approvals sorted by authority type and
principal reference, then workload. The parent records target, action, final
decision, correlation ID, policy/contract versions, environment, and timestamp.
Rows are append-only and unique by `(auditReference, ordinal)`. The existing
actor field remains backward compatible but is never used to represent quorum.

Module 02 owns `PrivilegedAccessEligibility`. Eligibility is true only when all
are current and mutually consistent:

1. Module 01 reports Identity `ACTIVE` and `VERIFIED`.
2. Required MFA is enrolled and the latest privileged authentication reached
   AAL2.
3. Approved authentication classification matches the requested role.
4. Module 02 has the required ACTIVE role assignment.
5. PRV1 or BSV1 is valid and `CONSUMED`.
6. Saga is `COMPLETED` with no reconciliation flag.
7. Mandatory mutation and audit records committed.
8. For bootstrap, the environment closure marker is `COMPLETED`.

Missing/stale/unavailable evidence produces `INELIGIBLE`, never optimistic
eligibility. A partial workflow is quarantined, sessions remain unavailable for
privileged access, and the saga becomes `RECONCILIATION_REQUIRED`.

# D. Exact Orchestration Sequences

## D1. Privileged provisioning

```text
Caller -> Ingress: WI-1 + mTLS + canonical request
Ingress -> Replay/Audit: atomically verify and consume jti
Orchestrator -> Approval owners: verify current AAL2 human quorum
Orchestrator -> Module 02 Provisioning Authority: atomically issue PRV1 + audit
Orchestrator -> Module 02: reserve PRV1 (compare-and-set)
Orchestrator -> Module 01: idempotently create/prepare Identity controls
Module 01 -> Orchestrator: identity version + non-eligible prepared state
Orchestrator -> Module 02: assign approved role + atomic audit
Orchestrator -> Module 01: activate approved classification/controls
Orchestrator -> Module 02: consume PRV1 and complete saga
Orchestrator -> Eligibility: recompute all predicates
Eligibility -> Caller: eligible only if every predicate passes
```

The platform Privileged Provisioning Orchestrator owns the saga; modules own
their local transactions. Any failure after reservation records the completed
steps and enters `RECONCILIATION_REQUIRED`. Retry uses the same operation and
idempotency keys. Compensation revokes/quarantines access; it never silently
deletes audit or reuses PRV1.

## D2. Controlled bootstrap

```text
Security + Operations -> Control Plane: distinct durable approvals
Control Plane -> BSV1 store: atomically issue evidence for open environment
Bootstrap Orchestrator -> Ingress: bootstrap WI-1 + mTLS + BSV1 binding
Ingress -> Replay/Audit: verify and atomically consume workload jti
Control Plane -> Approval store: revalidate quorum and BSV1
Control Plane -> Bootstrap state: AVAILABLE -> IN_PROGRESS (compare-and-set)
Control Plane -> Module 01: idempotently create prepared Super Admin Identity
Control Plane -> Module 02: idempotently assign Super Admin role + audit
Control Plane -> Module 01: activate required controls/classification
Control Plane -> Eligibility: verify all bootstrap predicates
Control Plane -> Bootstrap state: atomically mark COMPLETED + closure audit
```

The Platform Bootstrap Control Plane owns the saga. Partial completion enters
`RECONCILIATION_REQUIRED`; access stays ineligible. Retries use the same
operation ID and expected versions. Once `COMPLETED`, every issuance,
reservation, retry, configuration change, or new evidence request denies.

# E. Additive Migration Plan

No existing migration is rewritten. One reviewed forward migration adds:

| Table/change                                               | Purpose                                                                                                                |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `trusted_workload_replay_records`                          | Unique environment/JTI, subject, boundary, assertion/request/certificate digests, expiry, consumption, audit reference |
| `authorization_approval_records`                           | Module 02-owned immutable human approvals and AAL/audit references                                                     |
| `provisioning_authority_records`                           | PRV1 digests, immutable claims, lifecycle/version, expiry, reconciliation fields                                       |
| `bootstrap_control_records`                                | Environment-unique BSV1 lifecycle, authority/evidence digests, step states, permanent closure                          |
| `authorization_orchestration_records`                      | Saga type, operation, target, state/version, completed steps, failure/reconciliation data                              |
| `authorization_audit_participants`                         | Ordered multi-authority participants linked to existing decision/audit reference                                       |
| `privileged_access_eligibility_records`                    | Target/role/classification/saga evidence versions, eligibility state and reason                                        |
| nullable requester columns on `recovery_requests`          | Typed immutable requester provenance; legacy null rows deny approval paths                                             |
| optional AUD-1 columns on `authorization_decision_records` | Workload, target, action, reason, policy/contract/environment fields while retaining M1–M3 compatibility               |

Every mutable lifecycle table has optimistic `aggregate_version`, timestamps,
and indexes for expiry/reconciliation. Tokens, certificates, secrets, and raw
evidence are never stored. Database constraints enforce unique replay keys,
participant order, one environment bootstrap row, valid state vocabulary, and
terminal bootstrap closure.

# F. Exact M4 Acceptance Criteria

M4 is complete only when:

1. All Decision Pack, Amendment 001, and Amendment 002 criteria pass.
2. WI-1 signature, strict claims, certificate chain/SAN/thumbprint, request
   digest, boundary, service, environment, time, policy, and replay checks pass
   before policy evaluation.
3. Invalid certificate, mismatch, revoked/expired certificate, invalid JWT,
   replay, wrong audience/environment/service/boundary, expired assertion, and
   altered request all deny and audit safely.
4. PRV1 issuance requires valid quorum and is atomic with persistence/audit;
   invalid, expired, revoked, mismatched, consumed, or concurrently reused PRV1
   denies.
5. BSV1 requires distinct Security and Operations evidence; invalid quorum,
   wrong target/environment, expiry, replay, stale lifecycle, or prior closure
   denies.
6. Role assignment failure, Module 01 failure, audit failure, eligibility
   failure, and reconciliation failure never yield privileged access.
7. Provisioning/bootstrap retries are idempotent and concurrency-tested;
   partial state enters reconciliation and remains ineligible.
8. Bootstrap cannot execute after permanent closure under any API, evidence,
   permission, restart, redeploy, or configuration path.
9. Quorum audit represents every participant separately with stable ordering,
   correct assurance/evidence, target, workload, correlation, and timestamps.
10. No raw token, certificate, nonce, secret, or reusable evidence appears in
    logs, audit, persistence, errors, or API responses.
11. Module ownership is enforced through ports; no cross-module table read,
    distributed transaction, circular module dependency, or `forwardRef`
    exists.
12. Each V2 consumer migrates atomically; its V1 adapter remains fail-closed and
    available for rollback until separate retirement approval.
13. Positive tests cover standard/privileged recovery, lower-scope identity
    administration, Admin provisioning, controlled Super Admin provisioning,
    deprovisioning, and first bootstrap.
14. Negative tests cover every Decision Pack matrix denial plus all failures in
    criteria 2–8, including audit and reconciliation injection.
15. Optimistic concurrency, append-only audit, mandatory-audit rollback,
    deny-by-default, no implicit ownership, and no Super Admin bypass remain
    proven.
16. Full repository format, lint, typecheck, API tests/coverage/build, Prisma
    validation, web tests/build, E2E, dependency audit, secret scanning,
    container/security scans, and required mobile validation pass in the
    approved environment.

# G. Exact Owner Approval Statement

> I approve WEMP-M02-AMENDMENT-002 Review Draft 1.0 as a binding final amendment to WEMP-M02-DECISION-PACK-001 and WEMP-M02-AMENDMENT-001. I approve AM2-01 through AM2-12; the exact signed WI-1 schema and strict validation rules; SHA-256 DER certificate thumbprint binding through `cnf.x5t#S256`; Module 02 ownership and KMS-backed issuance of PRV1; Platform Bootstrap Control Plane ownership and issuance of BSV1; the approval-record ownership and verification ports; the Privileged Provisioning Orchestrator and Bootstrap Control Plane saga sequences; ordered multi-authority audit participants; fail-closed Module 02 privileged-access eligibility; dependency-inverted V2 integration without `forwardRef`; the additive migration plan; and all Amendment 002 acceptance criteria. I authorize implementation and local testing of M02-M4 strictly under the Decision Pack as amended by Amendments 001 and 002, preserving every V1 adapter fail-closed until its V2 consumer is atomically migrated, using additive forward migrations only, and stopping if any further uncovered policy or security decision is required. This approval does not authorize production credentials, live infrastructure changes, documentation commits, code commits unless separately requested, history rewriting, or any push.

# H. M4 Readiness

**READY FOR OWNER APPROVAL**

No known policy, architecture, or security-design blocker remains if the exact
approval statement in §G is accepted. Deployment trust material and complete
environment validation remain later release concerns, not coding decisions.

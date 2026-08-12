# Module 02 — Post-Provisioning Activation and Readiness Contract

**Document ID:** WEMP-M02-AMENDMENT-003  
**Version:** Review Draft 1.0  
**Status:** REVIEW ONLY — NOT IMPLEMENTATION AUTHORITY  
**Amends:** WEMP-M02-DECISION-PACK-001 and WEMP-M02-AMENDMENT-001/002  
**Required approval:** Product/Architecture Owner, Security Owner, Operations Owner

Every substantive decision in this document is **PROPOSED — REQUIRES OWNER
APPROVAL**. This amendment does not alter M1–M3 or authorize a V1 adapter to
open before its complete V2 consumer migration.

# A. Contract Objective and Binding Principles

Privileged provisioning and first-Super-Admin bootstrap are multi-session,
resumable invitation workflows. Creation of a pending Identity is not creation
of privilege. Module 01 exclusively establishes authentication readiness;
Module 02 exclusively establishes role authority. The saga owner coordinates
through versioned ports and immutable evidence without reading either module's
tables.

Binding rules:

1. A prepared Identity has no privileged permission.
2. No Module 02 role-assignment row is created before authoritative readiness.
3. Module 01 readiness is represented by a signed, request-bound attestation.
4. Role assignment and its mandatory audit commit atomically.
5. Eligibility is a separate fail-closed decision made only after all local and
   cross-module predicates are revalidated.
6. Authentication cannot issue privileged authority and authorization cannot
   grant a privileged permission unless current eligibility is `ELIGIBLE`.
7. Partial failure, unavailable evidence, stale state, or reconciliation always
   means `NOT_ELIGIBLE`.

# B. Final Saga State Machine

## B1. Owners

- The **Platform Privileged Provisioning Orchestrator** owns Admin and
  non-initial Super Admin sagas.
- The **Platform Bootstrap Control Plane** owns the first-Super-Admin saga.
- Module 01 owns its Identity/authentication aggregate transactions.
- Module 02 owns role assignment, authorization audit, and eligibility
  transactions.
- No distributed database transaction is introduced.

## B2. Durable states

| State                          | Meaning                                                                             | Privileged eligibility                     |
| ------------------------------ | ----------------------------------------------------------------------------------- | ------------------------------------------ |
| `REQUESTED`                    | Approved request accepted; target and policy fixed                                  | `NOT_ELIGIBLE`                             |
| `IDENTITY_PREPARED`            | Module 01 created pending invitation Identity                                       | `NOT_ELIGIBLE`                             |
| `AWAITING_IDENTITY_ACTIVATION` | User must verify, establish credential, enroll MFA, and activate                    | `NOT_ELIGIBLE`                             |
| `IDENTITY_READY`               | Valid Module 01 readiness attestation accepted                                      | `NOT_ELIGIBLE`                             |
| `ROLE_ASSIGNMENT_PENDING`      | Module 02 role mutation requested                                                   | `NOT_ELIGIBLE`                             |
| `ROLE_ASSIGNED`                | Role and mandatory role audit committed                                             | `NOT_ELIGIBLE`                             |
| `ELIGIBILITY_PENDING`          | Final predicates are being independently revalidated                                | `NOT_ELIGIBLE`                             |
| `COMPLETED`                    | Eligibility committed `ELIGIBLE`; bootstrap closure also committed where applicable | `ELIGIBLE` while predicates remain current |
| `EXPIRED`                      | Invitation/saga lifetime ended                                                      | `NOT_ELIGIBLE`                             |
| `CANCELLED`                    | Authorized cancellation reached a terminal state                                    | `NOT_ELIGIBLE`                             |
| `FAILED_RECONCILIATION`        | Partial state requires controlled repair/compensation                               | `NOT_ELIGIBLE`                             |

## B3. Allowed transitions

```text
REQUESTED
  -> IDENTITY_PREPARED
  -> AWAITING_IDENTITY_ACTIVATION
  -> IDENTITY_READY
  -> ROLE_ASSIGNMENT_PENDING
  -> ROLE_ASSIGNED
  -> ELIGIBILITY_PENDING
  -> COMPLETED

Any non-terminal state -> EXPIRED | CANCELLED | FAILED_RECONCILIATION
FAILED_RECONCILIATION -> the last proven safe non-terminal state
FAILED_RECONCILIATION -> CANCELLED
```

Recovery from reconciliation requires an explicit reason, expected saga
version, idempotency key, and append-only audit. `COMPLETED`, `EXPIRED`, and
`CANCELLED` are terminal. Completed bootstrap is permanently closed.

Each transition uses compare-and-set on `aggregateVersion`. A transition and
its mandatory local audit commit in one owner-local transaction. A successful
remote response is recorded as a completed saga step before the next command.

# C. Module Ownership Matrix

| Responsibility                                    | Owner                                                | Consumer/verification                                       |
| ------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------- |
| Invitation Identity and identifier                | Module 01                                            | Orchestrator via preparation result port                    |
| Identifier verification                           | Module 01                                            | Readiness attestation                                       |
| Initial credential establishment and policy       | Module 01                                            | Readiness attestation                                       |
| TOTP/MFA enrollment                               | Module 01                                            | Readiness attestation                                       |
| Recovery-code issuance policy                     | Module 01                                            | Readiness attestation; no raw codes cross boundary          |
| Identity `ACTIVE`/`VERIFIED` state                | Module 01                                            | Readiness attestation and eligibility verification port     |
| Authentication classification and control version | Module 01                                            | Attestation/eligibility verification port                   |
| AAL2 capability and privileged Session issuance   | Module 01                                            | Module 02 never computes authentication readiness           |
| Human provisioning approvals                      | Module 02 and approved control-plane owners          | Orchestrator through approval verification ports            |
| Saga state                                        | Provisioning Orchestrator or Bootstrap Control Plane | Both modules receive scoped commands only                   |
| Role assignment                                   | Module 02                                            | Eligibility evaluator                                       |
| Role-assignment audit                             | Module 02                                            | Eligibility evaluator and security audit                    |
| Cross-module privileged eligibility               | Module 02, computed from current owner attestations  | Module 01 authentication and Module 02 authorization guards |
| Bootstrap permanent closure                       | Bootstrap Control Plane                              | All bootstrap entry points verify closure before work       |

Direct cross-module table reads and duplicated authentication facts in Module
02 policy are prohibited. Module 02 may persist evidence references, versions,
digests, and the last verified eligibility snapshot, not credentials or MFA
secrets.

# D. Admin Readiness Requirements

An Admin readiness attestation may be issued only when all are true:

| Requirement                 | Required value                                                                                                 |
| --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Identity state              | `ACTIVE`                                                                                                       |
| Identity verification state | `VERIFIED`                                                                                                     |
| Invited identifier          | `VERIFIED`, active, and bound to the provisioning request                                                      |
| Credential                  | Active initial credential established under current credential policy                                          |
| MFA enrollment              | Active TOTP authenticator confirmed                                                                            |
| Recovery codes              | Initial active recovery-code set issued where Module 01 policy requires it                                     |
| AAL capability              | `AAL2_CAPABLE`; a current AAL2 Session is not required merely to emit readiness                                |
| Classification              | `PRIVILEGED_ADMIN_AUTHENTICATION` effective with the approved source reference                                 |
| Authentication controls     | Current control version; no pending replacement or recovery weakening                                          |
| Sessions                    | No privileged Session has been issued; any pre-activation Session is revoked or restricted to activation scope |
| Saga/request                | Active, unexpired, non-cancelled, and exact identity/request/environment match                                 |

The initial activation Session is purpose-scoped and cannot call marketplace or
administrative APIs. After M4 completion, the user must perform a fresh normal
login and reach AAL2 before receiving a privileged Session.

# E. Super Admin Readiness Requirements

Super Admin requires every Admin condition plus:

- classification exactly `SUPER_ADMIN_AUTHENTICATION`;
- current Super Admin authentication-control policy version;
- confirmed TOTP enrollment with no bypass or deferred enrollment;
- active recovery-code set required;
- no trusted-device shortcut during initial activation;
- no password-only or recovery Session can satisfy readiness;
- bootstrap or provisioning target matches the pre-declared universal Identity;
- Security/Operations or Super Admin/Security quorum evidence remains valid for
  the same saga;
- the target is distinct from all approving authorities;
- for first bootstrap, the environment closure record remains open and
  `IN_PROGRESS` for this exact operation.

The first Super Admin does not need an existing privileged operator. The
Bootstrap Control Plane supplies authority, while the invited user completes
verification, credential establishment, and MFA through Module 01's
purpose-scoped activation flow.

# F. Versioned Readiness Attestation Contract

## F1. Signed claims

```ts
interface IdentityReadinessAttestationV1 {
  readonly version: 'walrus.identity-readiness.v1';
  readonly issuer: `urn:walrus:module-01:identity-readiness:${EnvironmentName}`;
  readonly audience:
    'urn:walrus:orchestrator:privileged-provisioning' | 'urn:walrus:control-plane:bootstrap';
  readonly subject: 'urn:walrus:service:module-01-identity-readiness';
  readonly identityId: string;
  readonly requestType: 'PRIVILEGED_PROVISIONING' | 'CONTROLLED_BOOTSTRAP';
  readonly provisioningRequestId?: string;
  readonly bootstrapRequestId?: string;
  readonly identityState: 'ACTIVE';
  readonly identityVerificationState: 'VERIFIED';
  readonly identifierVerificationState: 'VERIFIED';
  readonly credentialReady: true;
  readonly mfaEnrollmentState: 'ACTIVE';
  readonly recoveryCodeSetState: 'ACTIVE' | 'NOT_REQUIRED';
  readonly aalCapability: 'AAL2_CAPABLE';
  readonly classification: 'PRIVILEGED_ADMIN_AUTHENTICATION' | 'SUPER_ADMIN_AUTHENTICATION';
  readonly authenticationControlVersion: number;
  readonly identityAggregateVersion: number;
  readonly classificationAggregateVersion: number;
  readonly issuedAt: string;
  readonly notBefore: string;
  readonly expiresAt: string;
  readonly jwtId: string;
  readonly nonce: string;
  readonly environment: EnvironmentName;
  readonly policyVersion: 'wemp.m02.m4.v1';
  readonly correlationId: string;
  readonly operationId: string;
  readonly keyId: string;
  readonly requestBindingDigest: string;
}
```

Exactly one request ID is present according to `requestType`. The attestation
is a compact ES256 JWT signed by Module 01's dedicated readiness KMS key and
sent over mTLS using the Module 01 readiness workload identity. The protected
header is exactly `{ alg: 'ES256', typ: 'JWT', kid }`; unknown or remote key
references deny.

Lifetime is at most five minutes with 60 seconds clock skew. `jwtId` is UUIDv7;
nonce is 256-bit unpadded base64url. The digest binds request type/ID, identity,
operation, environment, policy, and aggregate versions using the approved RFC
8785/SHA-256 contract. No credential, password, OTP, recovery code, token, MFA
secret, device secret, or personal identifier value is included.

## F2. Verification and persistence

The consumer verifies signature, pinned issuer/JWKS, exact audience, workload
mTLS identity, environment, request binding, time, `kid`, algorithm, policy,
classification, state vocabulary, and aggregate versions. `(environment,
jwtId)` is atomically single-use. It stores claims needed for evidence, the
assertion digest, verification reference, receipt time, and expiry—not the raw
JWT.

Duplicate delivery of the same attestation for the same already-completed inbox
operation returns the recorded result without consuming authority twice.
Reuse for another operation, target, or saga denies and audits replay.

# G. Readiness Notification Port

```ts
interface IdentityReadinessNotificationV1 {
  readonly version: 'walrus.identity-readiness-notification.v1';
  readonly messageId: string;
  readonly operationId: string;
  readonly sagaId: string;
  readonly sagaVersionObserved: number;
  readonly attestationDigest: string;
  readonly compactAttestation: string;
  readonly emittedAt: string;
  readonly environment: EnvironmentName;
  readonly correlationId: string;
}

interface IdentityReadinessNotificationPortV1 {
  notifyIdentityReady(message: IdentityReadinessNotificationV1): Promise<{
    readonly accepted: boolean;
    readonly receiptReference: string;
    readonly resultingSagaVersion?: number;
  }>;
}
```

- Producer: Module 01 transactional outbox after its readiness state and audit
  commit.
- Consumer: Provisioning Orchestrator or Bootstrap Control Plane inbox.
- Authentication: approved WI-1 mTLS + signed workload assertion; readiness JWT
  is independently verified.
- Authorization: exact Module 01 readiness service subject and audience only.
- Delivery: at-least-once, resumable; producer retries with exponential backoff
  and jitter until acknowledged or saga expiry.
- Idempotency: unique `(environment,messageId)` and
  `(environment,sagaId,attestationDigest)` inbox keys.
- Ordering: `sagaVersionObserved` must equal the expected state version;
  otherwise duplicate-known returns prior result and stale/future-unknown
  messages are quarantined for reconciliation.
- Expiry: an expired attestation is never accepted even if the message arrived
  earlier but was not processed. Module 01 may issue a fresh attestation only
  after re-reading all authoritative readiness facts.
- Failure: no role mutation occurs; saga remains
  `AWAITING_IDENTITY_ACTIVATION` or enters reconciliation after its retry
  threshold. Queue availability never implies readiness.

The port communicates readiness only. It exposes no Module 02 role,
permission, or persistence internals to Module 01.

# H. Role, Classification, and Eligibility Rules

## H1. Role assignment timing

**Selected model: A — create the role-assignment row only after readiness.**

No pending role row is created because existing Phase-1 assignment states are
`ACTIVE`/`REVOKED`; introducing a pending row near the authorization engine
increases the chance of accidental permission contribution. After readiness,
the orchestrator advances to `ROLE_ASSIGNMENT_PENDING`; Module 02 atomically
creates the ACTIVE assignment and role audit. Eligibility remains
`NOT_ELIGIBLE` until final completion.

## H2. Classification timing

```text
REQUESTED: requested classification stored in PRV1/BSV1 and saga only
PREPARED: Module 01 creates the classification assignment for the pending Identity;
          it selects mandatory activation controls but grants no authorization
EFFECTIVE: Module 01 marks it effective only with ACTIVE/VERIFIED readiness
ROLE: Module 02 creates the matching role only after effective classification attestation
ELIGIBILITY: becomes ELIGIBLE only after both are revalidated and saga completes
```

Classification is authentication-control policy, not permission. A prepared or
effective classification without a Module 02 role grants no permission. A role
without matching current classification is ineligible and denied.

## H3. Eligibility algorithm

```ts
function computePrivilegedEligibility(
  facts: PrivilegedEligibilityFacts,
): 'ELIGIBLE' | 'NOT_ELIGIBLE' {
  if (facts.identityState !== 'ACTIVE') return 'NOT_ELIGIBLE';
  if (facts.identityVerificationState !== 'VERIFIED') return 'NOT_ELIGIBLE';
  if (facts.identifierVerificationState !== 'VERIFIED') return 'NOT_ELIGIBLE';
  if (!facts.credentialReady) return 'NOT_ELIGIBLE';
  if (facts.mfaEnrollmentState !== 'ACTIVE') return 'NOT_ELIGIBLE';
  if (facts.aalCapability !== 'AAL2_CAPABLE') return 'NOT_ELIGIBLE';
  if (!facts.classificationMatchesRole) return 'NOT_ELIGIBLE';
  if (!facts.activeRoleAssignment) return 'NOT_ELIGIBLE';
  if (facts.sagaState !== 'ELIGIBILITY_PENDING') return 'NOT_ELIGIBLE';
  if (!facts.roleMutationAuditCommitted) return 'NOT_ELIGIBLE';
  if (!facts.attestationValidAndUnexpired) return 'NOT_ELIGIBLE';
  if (facts.reconciliationRequired) return 'NOT_ELIGIBLE';
  if (facts.bootstrap && !facts.bootstrapClosureReady) return 'NOT_ELIGIBLE';
  return 'ELIGIBLE';
}
```

The transition from `ELIGIBILITY_PENDING` to `COMPLETED` and persistence of
`ELIGIBLE` occur in the saga owner's durable completion operation after Module
02 records its local eligibility evidence. Bootstrap additionally commits the
permanent closure marker.

# I. Authentication and Authorization Enforcement

Module 02 exposes a narrow current-state port:

```ts
interface PrivilegedEligibilityVerificationPortV1 {
  verify(command: {
    readonly identityId: string;
    readonly classification: string;
    readonly identityAggregateVersion: number;
    readonly authenticationControlVersion: number;
    readonly environment: EnvironmentName;
    readonly checkedAt: string;
  }): Promise<{
    readonly eligible: boolean;
    readonly eligibilityVersion?: number;
    readonly sagaId?: string;
    readonly roleName?: 'ADMIN' | 'SUPER_ADMIN';
  }>;
}
```

Module 01 calls it before privileged Session/token issuance and again on
privileged refresh/step-up. Unavailable, stale, version-mismatched, or negative
results deny privileged authentication. Module 02 authorization requires both
an ACTIVE matching assignment and current `ELIGIBLE` evidence before evaluating
a privileged permission.

Identity deactivation, identifier/credential/MFA invalidation, classification
change, role revocation, saga reopening attempt, or reconciliation immediately
invalidates eligibility through owner-local transaction plus outbox event.
Until the invalidation is consumed, every privileged request revalidates owner
versions; mismatches fail closed. Existing privileged Sessions are revoked by
Module 01 when its authentication state changes.

# J. Bootstrap Activation Flow

```text
Security + Operations -> Bootstrap Control Plane: approve exact target/environment
Control Plane: verify quorum, open one environment saga, issue BSV1
Control Plane -> Module 01: prepare pre-declared pending Super Admin invitation
Module 01: PENDING_VERIFICATION + activation-only access
Invited user -> Module 01: verify identifier
Invited user -> Module 01: establish policy-compliant credential
Invited user -> Module 01: enroll and confirm TOTP; issue recovery codes
Module 01: set SUPER_ADMIN_AUTHENTICATION controls, VERIFIED and ACTIVE
Module 01 outbox -> Control Plane inbox: signed readiness attestation
Control Plane: verify WI-1, attestation, quorum, BSV1, versions and open state
Control Plane -> Module 02: atomically assign SUPER_ADMIN + audit
Control Plane/Module 02: compute fail-closed eligibility
Control Plane: atomically mark COMPLETED and permanent environment closure
Invited user: perform fresh AAL2 login; privileged Session allowed only now
```

No existing Super Admin is required. Before permanent closure, only the exact
BSV1 operation may resume. After closure, all bootstrap evidence, permissions,
configuration, restarts, retries, and new targets deny.

# K. Retry, Expiry, Cancellation, and Reconciliation

## K1. Idempotency and concurrency

- Every command uses immutable `operationId`, step idempotency key, expected
  saga/aggregate version, and owner-local unique constraints.
- Duplicate readiness messages return the previously stored receipt/result.
- Duplicate role-assignment requests return the existing matching assignment
  only when saga, target, role, evidence, and audit references all match;
  otherwise they deny as conflict.
- Restarts recover from saga/outbox/inbox tables; memory is never authoritative.
- Concurrent reconcilers acquire the saga by optimistic compare-and-set; one
  succeeds and stale workers stop.
- Repeated activation callbacks cause Module 01 to re-evaluate readiness and
  reuse the existing completed outbox event or issue a fresh short-lived
  attestation for the same operation; they do not create another Identity.
- Delayed or expired messages cannot mutate role or eligibility.

## K2. Lifetimes

- Admin invitation/saga: maximum 72 hours.
- Non-initial Super Admin invitation/saga: maximum 24 hours.
- First-Super-Admin bootstrap activation saga: maximum 24 hours after BSV1 is
  consumed to open the saga. The original ten-minute BSV1 remains the start
  authorization window; it is not reused throughout user activation.
- Readiness attestation: maximum five minutes.
- Owner may select shorter deployment values, never longer, without new policy.

## K3. Expiry, abandonment, and cancellation

On expiry or authorized cancellation:

- saga becomes terminal `EXPIRED` or `CANCELLED`;
- PRV1/BSV1 and unused attestations are invalidated;
- no role row is created; an already-created role during partial failure is
  immediately revoked through reconciliation with atomic audit;
- Module 01 disables or expires the invitation and activation-only Sessions;
- a prepared Identity is retained in non-privileged state for approved identity
  retention/re-invitation handling, not silently deleted;
- all saga, evidence-digest, transition, denial, and audit history is retained
  under the approved audit policy.

## K4. Partial-failure outcomes

| Failure                                    | Required safe outcome                                                                              |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| Identity activated, role assignment failed | `FAILED_RECONCILIATION`; no privileged Session; retry exact role step or cancel                    |
| Role transaction failed                    | No role/audit commit; retry idempotently; `NOT_ELIGIBLE`                                           |
| Mandatory role audit failed                | Transaction rolls back role assignment                                                             |
| Readiness notification lost                | Module 01 outbox retries; no role while absent                                                     |
| Orchestrator unavailable                   | Durable outbox/saga wait; no privilege                                                             |
| Role assigned, eligibility failed          | Reconciliation; authorization rejects role because eligibility is absent                           |
| Bootstrap closure commit failed            | `FAILED_RECONCILIATION`; no privileged Session; retry closure; bootstrap cannot start another saga |
| Readiness later becomes stale              | Eligibility invalidated; Sessions/authorization fail closed                                        |

# L. Additive Storage Plan

No migration is created by this document. A future reviewed forward migration
adds only:

| Storage                                             | Required fields/constraints                                                                                                                                                                                            |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `privileged_activation_sagas`                       | saga/operation/request IDs, type, target, requested role/classification, environment, state, completed-step bitmap, expiry, aggregate version, failure/reconciliation reason, timestamps; unique environment+operation |
| `identity_readiness_outbox`                         | message/operation/saga IDs, attestation digest and protected ciphertext/reference if transport requires, owner versions, state, retry count/next attempt, expiry, timestamps; unique message and saga+digest           |
| `identity_readiness_inbox`                          | environment/message/saga/digest, verification reference, observed/ resulting saga versions, result, received/processed timestamps; unique message and saga+digest                                                      |
| `identity_readiness_attestations`                   | assertion digest, identity/request binding, control/aggregate versions, classification, issue/expiry, JTI, verification reference; unique environment+JTI; no raw JWT                                                  |
| `privileged_access_eligibility_records`             | identity, role, classification, saga, attestation/audit references, owner versions, `ELIGIBLE`/`NOT_ELIGIBLE`, reason, aggregate version, evaluated/invalidated timestamps                                             |
| `privileged_eligibility_invalidation_outbox`        | owner event ID, identity, changed fact/version, environment, delivery/retry state and timestamps                                                                                                                       |
| Existing provisioning/bootstrap lifecycle additions | `AWAITING_IDENTITY_ACTIVATION`, readiness/role/eligibility step references, invitation and activation expiry, reconciliation version                                                                                   |

All mutable tables use optimistic concurrency. Database constraints enforce
one open bootstrap saga per environment, permanent closure, unique replay keys,
and idempotent message processing. Raw credentials, OTPs, MFA secrets, recovery
codes, WI-1/PRV1/BSV1/readiness JWTs, and certificate material are prohibited.

# M. Mandatory Security Test Matrix

| Test                                                 | Required result                                                             |
| ---------------------------------------------------- | --------------------------------------------------------------------------- |
| Attempt role creation before readiness               | Denied; no assignment/audit mutation                                        |
| Unverified Identity/identifier                       | No attestation; `NOT_ELIGIBLE`                                              |
| Missing/incomplete MFA                               | No attestation; `NOT_ELIGIBLE`                                              |
| Credential absent/disabled                           | No attestation; `NOT_ELIGIBLE`                                              |
| Wrong classification/control version                 | Attestation or eligibility denied                                           |
| Stale/expired readiness attestation                  | Denied and audited; no role mutation                                        |
| Replayed attestation/JTI                             | One consumption only; replay denied                                         |
| Wrong environment/request/identity/operation         | Denied uniformly                                                            |
| Forged signature, wrong issuer/audience/service      | Denied before saga mutation                                                 |
| Duplicate readiness callback/message                 | Same recorded result; no duplicate role/audit                               |
| Concurrent role assignment                           | One assignment/audit transaction succeeds                                   |
| Stale saga version                                   | Conflict; no state advancement                                              |
| Service restart with pending outbox                  | Resumes safely and idempotently                                             |
| Delayed message after expiry/cancellation            | Denied; saga remains terminal                                               |
| Abandoned invitation                                 | Expires non-privileged; activation Sessions invalidated                     |
| Identity active but role failure                     | No privileged Session/permission                                            |
| Role assigned but eligibility incomplete             | Authorization and authentication deny                                       |
| Mandatory audit failure                              | Role/eligibility/completion transaction rolls back                          |
| Reconciliation worker failure/concurrency            | Remains `NOT_ELIGIBLE`; one versioned worker owns retry                     |
| Identity/MFA/credential invalidated after completion | Eligibility invalidated; privileged Session/authorization denied            |
| Admin positive activation                            | Role only after valid readiness; fresh AAL2 login succeeds after completion |
| Super Admin positive activation                      | All stricter controls and quorum pass before role/eligibility               |
| Bootstrap without Security/Operations quorum         | Denied                                                                      |
| Bootstrap before MFA/verification                    | Cannot complete or grant access                                             |
| Bootstrap closure failure                            | No access; same saga reconciles; no second bootstrap                        |
| Bootstrap after permanent closure                    | Always denied across restart/redeploy/new evidence                          |

Full M4 tests must also preserve deny-by-default, no hidden Super Admin bypass,
no cross-module storage read, V1 fail-closed behavior, optimistic concurrency,
append-only audit, replay protection, and secret/log redaction.

# N. Remaining Architecture Decisions

The following concrete proposals require approval as part of this amendment:

1. Saga ownership and states in §B.
2. Role timing Model A in §H1.
3. Purpose-scoped activation Sessions and mandatory fresh AAL2 login.
4. Readiness attestation schema, five-minute lifetime, signing identity, and
   asynchronous outbox/inbox delivery.
5. Admin 72-hour and Super Admin/bootstrap 24-hour activation limits.
6. Module 02-owned fail-closed eligibility and the verification port used by
   Module 01 authentication.
7. Classification preparation/effectiveness ordering.
8. Bootstrap completion and closure ordering.
9. Additive storage and reconciliation rules.

All are **REQUIRES OWNER APPROVAL**. If approved exactly as written, no known
post-provisioning activation policy, architecture, or security blocker remains.
Concrete KMS keys, CA/JWKS endpoints, queue technology, service identities, and
deployment retry tuning remain environment configuration and do not block
coding.

# O. Exact Owner Approval Statement

> I approve WEMP-M02-AMENDMENT-003 Review Draft 1.0 as a binding final post-provisioning activation amendment to WEMP-M02-DECISION-PACK-001 and WEMP-M02-AMENDMENT-001/002. I approve the Provisioning Orchestrator and Bootstrap Control Plane saga ownership; the complete state machine in Section B; Module 01's exclusive ownership of identifier verification, credential establishment, MFA/recovery controls, authentication classification, activation, and readiness; the Admin and Super Admin readiness requirements; the signed five-minute `walrus.identity-readiness.v1` attestation; asynchronous WI-1-authenticated outbox/inbox readiness notification; role timing Model A with no role row before readiness; classification and eligibility ordering; Module 02's fail-closed privileged-access eligibility and Module 01 eligibility-verification dependency before privileged Session issuance; the 72-hour Admin and 24-hour Super Admin/bootstrap activation limits; the bootstrap activation and permanent-closure sequence; the retry, cancellation, expiry, reconciliation, additive storage, and mandatory security-test requirements. I authorize implementation and local testing of M02-M4 strictly under the Decision Pack and Amendments 001–003, using additive forward migrations only, preserving every V1 adapter fail-closed until its V2 consumer is atomically migrated, introducing no production credentials or live infrastructure changes, and stopping if a further genuinely uncovered policy or security decision is required. This approval does not authorize documentation commits, code commits unless separately requested, history rewriting, or any push.

# P. Readiness

**READY FOR OWNER APPROVAL**

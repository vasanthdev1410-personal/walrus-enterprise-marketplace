# Module 02 — Final M4 Owner/Security/Operations Decision Package

**Document ID:** WEMP-M02-DECISION-PACK-001  
**Version:** Review Draft 1.0  
**Status:** REVIEW ONLY — NOT IMPLEMENTATION AUTHORITY  
**Baseline:** WEMP-M02-ANNEX-001 through WEMP-M02-ANNEX-005 approved for review  
**Required approval:** Product/Architecture Owner, Security Owner, Operations Owner

Every substantive choice in this document is **PROPOSED — REQUIRES OWNER
APPROVAL** unless identified as a binding Module 00/01 requirement. No
credential, key, secret, account, or live infrastructure value is defined here.

# A. Final Owner Decision Register

| ID    | Proposed choice                                                                                                                                                     | Rationale                                                      | Alternatives                                      | Security impact                                                            | Exact approval wording                                                                                |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| OD-01 | Adopt the eight permission identifiers and role matrix in WEMP-M02-SPEC-001                                                                                         | Matches M1–M3 and prevents arbitrary permission strings        | Rename/reduce before M4                           | Makes positive policy explicit; unknown permissions deny                   | “I approve OD-01 and the WEMP-M02-SPEC-001 Limited Phase 1 permission matrix.”                        |
| OD-02 | Administrative hierarchy is scope-only: Super Admin→Admin/Seller/Customer; Admin→Seller/Customer; no inheritance                                                    | Least privilege and existing implementation alignment          | Super Admin-only administration; flat roles       | Prevents privilege acquisition through hierarchy                           | “I approve OD-02; hierarchy grants scope only, never permissions.”                                    |
| OD-03 | Super Admin peer assignment is allowed; every same-role revocation and other peer management denies                                                                 | Narrow current behavior; prevents peer removal                 | Deny peer assignment; dual-control peers          | Peer revocation remains unavailable; peer assignment is auditable          | “I approve OD-03 and deny all same-role revocation.”                                                  |
| OD-04 | Recovery eligibility and 15-minute approval lifetime follow Table R-1                                                                                               | Short-lived, request-bound decisions and strict privileged SOD | 5/30 minutes; Admin+Super Admin privileged quorum | Reduces replay and takeover window; may require two available Super Admins | “I approve OD-04 and Table R-1, including the 15-minute maximum.”                                     |
| OD-05 | M01-ID-004 requires current authoritative AAL2 and Table I-1                                                                                                        | Identity disable/reactivation is privileged                    | Preserve ordinary Session; risk-selected AAL      | Stronger than approved minimum; blocks AAL1 administration                 | “I approve OD-05, AAL2, and Table I-1.”                                                               |
| OD-06 | Classification transitions follow Table C-1; Super Admin classification changes are control-plane-only                                                              | Prevents classification from becoming role escalation          | Allow ordinary Super Admin transitions            | Forces privileged provisioning/deprovisioning workflows                    | “I approve OD-06 and Table C-1.”                                                                      |
| OD-07 | Workload identity uses mTLS plus internal ES256 JWT, five-minute lifetime, 60-second skew, single-use `jti`                                                         | Defense in depth and bounded replay                            | mTLS only; cloud IAM signing                      | Requires key/replay operations but strongly binds service calls            | “I approve OD-07 and workload contract WI-1.”                                                         |
| OD-08 | Admin provisioning needs one AAL2 Super Admin plus approved service; non-initial Super Admin provisioning needs two Super Admins plus Security approval             | Separates ordinary privileged creation from highest privilege  | One Super Admin for all; Operations-only          | Raises availability cost for Super Admin provisioning                      | “I approve OD-08 and Table P-1.”                                                                      |
| OD-09 | Provisioning references use signed PRV1 envelopes, five-minute issue lifetime, single use, and durable lifecycle                                                    | Prevents opaque/replayable authority                           | Database lookup token; longer lifetime            | Creates explicit, auditable authorization intent                           | “I approve OD-09 and PRV1.”                                                                           |
| OD-10 | Initial bootstrap needs one Security and one Operations principal, KMS-signed BSV1 evidence, ten-minute lifetime, and permanent closure                             | Avoids circular Super Admin dependency and reusable backdoor   | Single operator; manual DB seed                   | Strong SOD; requires operational quorum                                    | “I approve OD-10, BSV1, and Table B-1.”                                                               |
| OD-11 | Introduce parallel V2 ports with typed envelopes; leave V1 fail-closed until atomic consumer migration                                                              | Avoids hidden request context and breaking V1 contracts        | Add optional V1 fields; ambient context           | Explicit versioning, compile-time completeness, safe rollback              | “I approve OD-11 and the V2 interfaces in Section C.”                                                 |
| OD-12 | No implicit owner grant or administrative override in M4                                                                                                            | No approved cross-module ownership resolver exists             | Owner shortcut; Super Admin override              | Missing ownership always denies; reduces cross-tenant risk                 | “I approve OD-12; M4 has no implicit owner grant or override.”                                        |
| OD-13 | Audit is mandatory/atomic; 400 days online; privileged/bootstrap events additionally proposed for seven-year immutable archive subject to Legal/Compliance approval | Investigation window plus privileged accountability            | Shorter online; uniform archive; SIEM-only        | Strong evidence but greater privacy/storage burden                         | “I approve OD-13 operationally; seven-year archive remains conditional on Legal/Compliance approval.” |
| OD-14 | Implement exactly the dependency plan and acceptance criteria in Sections D/E                                                                                       | Controls scope and sequencing                                  | Partial boundary rollout without all policy       | Prevents permissive partial integration                                    | “I approve OD-14 and authorize M02-M4 only under this package.”                                       |

Legal/Compliance approval of archive duration is a release gate for archive
implementation, not for keeping the existing operational append-only records.

# B. Final Decision Tables

## B1. Recovery — Table R-1

All approvals use a current authoritative ordinary AAL2 Session. Approval
reason code is required from a server-controlled catalogue. Each approval
expires no later than 15 minutes after issuance and no later than the Recovery
Request. Module 01 remains policy/state/execution owner.

| Recovered identity category | Operation/risk                                          | Human approval                                                  | Eligible approvers                                                                                                                                                 | Requester/self rule                                                                         | Dual control | Failure                                       |
| --------------------------- | ------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ------------ | --------------------------------------------- |
| Standard                    | `PASSWORD_RESET`, `IDENTITY_UNLOCK`; no risk escalation | None; M01-REC-005 not invoked                                   | None                                                                                                                                                               | N/A                                                                                         | No           | Module 01 evidence policy decides             |
| Standard                    | Other standard operations without risk escalation       | None                                                            | None                                                                                                                                                               | N/A                                                                                         | No           | Module 01 evidence policy decides             |
| Standard                    | Approved elevated-risk escalation                       | Two                                                             | One Admin or Super Admin per slot                                                                                                                                  | Requester cannot approve; approvers cannot be recovered identity; distinct Session/identity | Yes          | Any missing/expired/duplicate decision denies |
| Privileged Admin            | Approved strong self-service evidence complete          | None                                                            | None                                                                                                                                                               | N/A                                                                                         | No           | Module 01 evidence policy decides             |
| Privileged Admin            | Strong self-service evidence incomplete                 | Two                                                             | Two distinct Super Admins                                                                                                                                          | Requester/recovered identity excluded                                                       | Yes          | Fail closed; no Admin approver                |
| Super Admin                 | Every Recovery operation                                | Two human authorities plus controlled evidence where applicable | Two distinct active Super Admins not equal to recovered identity; if fewer than two exist, use separately approved break-glass Security/Operations recovery—not M4 | Requester/recovered identity excluded                                                       | Mandatory    | Fail closed; no role/AAL bypass               |

**PROPOSED — REQUIRES OWNER APPROVAL:** reason codes are immutable identifiers
from catalog version `recovery-approval-reasons/v1`; free text is optional
supplementary audit context and never authority.

The V2 recovery envelope supplies recovered classification, requester identity,
decision, expiry, policy version, and server-validated AAL context. Module 01
still validates distinct stored approvals before execution.

## B2. Identity state changes — Table I-1

Binding Module 01 transitions are:

- `PENDING_VERIFICATION → ACTIVE`
- `ACTIVE → LOCKED | SUSPENDED | DISABLED`
- `LOCKED | SUSPENDED | DISABLED → ACTIVE`
- every transition to/from `DELETED` is forbidden in M01-ID-004.

Required permission: `identity.state.change`; required actor AAL: AAL2. Effective
target privilege is the greater of current Module 02 role scope and Module 01
authentication-security classification. Missing/inconsistent scope denies.

| Actor                               | Target effective scope                                              | Allowed transitions                                                                           | Self/same/higher rule                                    | SOD/audit                                            |
| ----------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------- |
| Admin                               | Customer/Seller role and `STANDARD_AUTHENTICATION`                  | `ACTIVE↔LOCKED`, `ACTIVE↔SUSPENDED`                                                           | Self denied; peer/higher denied                          | One actor; mandatory actor/target/reason audit       |
| Admin                               | Any privileged classification or Admin/Super Admin role             | None                                                                                          | Denied                                                   | Denial audited                                       |
| Super Admin                         | Customer/Seller/Admin below actor; not `SUPER_ADMIN_AUTHENTICATION` | All binding non-DELETED transitions, including disable/reactivate and provisioning activation | Self denied; same-role target denied                     | One actor; mandatory audit; source contract required |
| Super Admin                         | Super Admin role or `SUPER_ADMIN_AUTHENTICATION`                    | None through M01-ID-004                                                                       | Peer/self denied; use controlled deprovisioning/recovery | Denial audited                                       |
| Any other role/no active assignment | Any                                                                 | None                                                                                          | Denied                                                   | Denial audited                                       |

`PENDING_VERIFICATION → ACTIVE` is allowed only under an approved provisioning or
registration source contract; arbitrary administrative activation denies.
Authorization never replaces Module 01 transition/version validation.

## B3. Classification transitions — Table C-1

All calls require workload contract WI-1, a versioned source contract, reason
code, If-Match, idempotency, replay protection, and audit. Human actor entries
require current AAL2 and the stated permission.

| Source           | Target              | Authority                                                                                           | Permission/human approval                                 | Rule                                                                                 |
| ---------------- | ------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Standard         | Privileged Admin    | Provisioning service + one Super Admin                                                              | `identity.classification.change`, one AAL2 Super Admin    | Allowed only with active PRV1 Admin-provisioning envelope                            |
| Privileged Admin | Standard            | Deprovisioning service + one Super Admin                                                            | Same permission/AAL2                                      | Role revocation/deprovisioning must be committed or durably ordered before downgrade |
| Standard         | Super Admin         | Initial bootstrap authority only for first identity; controlled Super Admin provisioning thereafter | No ordinary M4 permission can authorize initial bootstrap | Forbidden through ordinary classification adapter                                    |
| Privileged Admin | Super Admin         | Controlled Super Admin provisioning                                                                 | Two AAL2 Super Admins plus Security approval              | Forbidden through ordinary M4 adapter until dedicated orchestration is active        |
| Super Admin      | Privileged Admin    | Controlled deprovisioning                                                                           | Two AAL2 Super Admins plus Security approval              | Forbidden through ordinary M4 adapter                                                |
| Super Admin      | Standard            | Controlled deprovisioning                                                                           | Two AAL2 Super Admins plus Security approval              | Forbidden through ordinary M4 adapter                                                |
| Any              | Same classification | None                                                                                                | None                                                      | Forbidden no-op                                                                      |

Contract lifetime is five minutes; maximum clock skew 60 seconds; every `jti`
is single-use. Downgrade never silently preserves a privileged role. Escalation
never assigns a role merely because classification changed.

## B4. Privileged provisioning — Table P-1

| Operation                   | Initiator/authority                                             | Permission/AAL                          | Workload/SOD                                     | Target restrictions                                                              | Idempotency/failure                                                    |
| --------------------------- | --------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| New Admin                   | One active Super Admin                                          | `identity.privileged.provision`, AAL2   | WI-1 provisioning service + one human            | Target not currently privileged; PRV1 requests Admin + privileged classification | Single-use PRV1; partial state never yields access                     |
| Non-initial Super Admin     | Two distinct active Super Admins plus Security principal        | Same permission, separate AAL2 Sessions | WI-1 + three-party approval                      | Target verified; cannot be either approver; initial bootstrap already closed     | Durable orchestration; fail closed on quorum/dependency                |
| Privileged role replacement | Same authority as requested target role                         | Same as new target                      | WI-1; prior assignment/classification reconciled | No privilege overlap beyond explicitly staged transaction                        | New PRV1; old reference invalidated                                    |
| Revocation/deprovisioning   | Module 02 approved revoke flow plus classification coordination | `authorization.role.revoke`; AAL2       | WI-1 for cross-module classification change      | Target scope rules apply; same-role revoke remains denied                        | Versioned, atomic owned mutations; durable cross-module reconciliation |
| Reprovision Admin           | One active Super Admin                                          | Provision permission, AAL2              | WI-1                                             | Prior operation terminal; target eligible; new reference required                | Never reuse consumed PRV1                                              |
| Reprovision Super Admin     | Same as non-initial Super Admin                                 | Same                                    | WI-1 + quorum                                    | Prior operation terminal; target/approvers distinct                              | New PRV1; fail closed                                                  |

PRV1 expires five minutes after issue. Approval/session evidence must also be
current at consumption. A committed Module 01 identity without required Module
02 role is not privileged-access eligible; a role without Module 01 controls is
also ineligible.

## B5. Controlled bootstrap — Table B-1

| Decision                | Proposed policy                                                                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Initiator               | Deployment orchestrator using WI-1 bootstrap-specific service subject                                                                       |
| Independent authorities | Exactly two: one Security principal and one Operations principal                                                                            |
| Intended identity       | Pre-declared universal identity reference; cannot equal either approving principal; verified identifiers; no default credential             |
| Environments            | Explicit allowlist; production evidence cannot validate in non-production or vice versa                                                     |
| Lifecycle               | `DISABLED → AVAILABLE → IN_PROGRESS → COMPLETED`; failure enters `RECONCILIATION_REQUIRED`; never returns to `AVAILABLE` after consumption  |
| Completion marker       | Durable, unique environment-scoped record owned by bootstrap orchestrator/control plane                                                     |
| Evidence                | BSV1 KMS-signed envelope plus WI-1 transport assertion                                                                                      |
| Key                     | Dedicated asymmetric KMS signing key; public verification key by `kid`; no application access to private material                           |
| Lifetime/replay         | Ten-minute maximum; 60-second skew; single-use `jti`; compare-and-set consumption                                                           |
| Break glass             | Separate incident procedure requiring Security + Operations + executive/incident authority; cannot call ordinary bootstrap after completion |
| Reconciliation          | Durable state records Module 01 and Module 02 completion independently; access remains unavailable until both succeed                       |
| Audit                   | Both modules plus control plane record hashed evidence reference, authorities, environment, target, states, correlation, and timestamps     |
| Closure                 | `COMPLETED` is permanent; evidence, RBAC permission, config flag, restart, or redeploy cannot reopen it                                     |

# C. Versioned Contract Proposal

## C1. Integration strategy

**PROPOSED — REQUIRES OWNER APPROVAL:** add parallel V2 port interfaces and typed
envelopes. Keep V1 ports and fail-closed adapters unchanged until each Module 01
consumer atomically migrates to its V2 port. Do not use ambient request context
or optional V1 fields: both can silently omit security attributes. After all
consumers and contract tests migrate, retire V1 through a separate approved
deprecation.

## C2. Common types

```ts
type AuthorizationContractVersion = 'wemp.m01-m02.authorization.v2';
type EnvironmentName = 'local' | 'development' | 'staging' | 'production';
type AuthenticationAssurance = 'AAL0' | 'AAL1' | 'AAL2';

interface WorkloadIdentityEnvelopeV1 {
  readonly version: 'walrus.workload.v1';
  readonly issuer: string; // urn:walrus:workload-identity:<environment>
  readonly audience: 'urn:walrus:module-02:authorization';
  readonly subject: string; // allowlisted immutable service identity
  readonly environment: EnvironmentName;
  readonly issuedAt: string;
  readonly expiresAt: string; // <= issuedAt + 5 minutes
  readonly jwtId: string; // UUIDv7, single use
  readonly keyId: string;
}

interface HumanActorContextV1 {
  readonly identityId: string;
  readonly sessionId: string;
  readonly sessionVersion: number;
  readonly assurance: AuthenticationAssurance;
  readonly authenticatedAt: string;
}

interface TrustedBoundaryContextV2 {
  readonly contractVersion: AuthorizationContractVersion;
  readonly environment: EnvironmentName;
  readonly correlationId: string;
  readonly operationId: string;
  readonly policyVersion: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly nonce: string;
  readonly workload?: WorkloadIdentityEnvelopeV1;
  readonly humanActor?: HumanActorContextV1;
}
```

Serialized envelopes are signed as compact ES256 JWTs by an internal KMS-backed
issuer and transported over mTLS. Interfaces represent verified claims, not raw
tokens. Raw JWTs never enter domain/application commands.

## C3. Recovery V2

```ts
interface RecoveryApprovalAuthorizationCommandV2 {
  readonly context: TrustedBoundaryContextV2;
  readonly approverIdentityId: string;
  readonly requesterIdentityId: string;
  readonly recoveryRequestId: string;
  readonly recoveredIdentityId: string;
  readonly recoveredClassification:
    'STANDARD_AUTHENTICATION' | 'PRIVILEGED_ADMIN_AUTHENTICATION' | 'SUPER_ADMIN_AUTHENTICATION';
  readonly operationClass: RecoveryOperationClass;
  readonly decision: 'APPROVE' | 'REJECT';
  readonly reasonCode: string;
  readonly approvalExpiresAt: string;
  readonly expectedRecoveryVersion: number;
}

interface RecoveryApprovalAuthorizationDecisionV2 {
  readonly authorized: boolean;
  readonly authorizationReference?: string;
  readonly policyVersion: string;
}

interface ApprovalAuthorizationPortV2 {
  authorizeApprover(
    command: RecoveryApprovalAuthorizationCommandV2,
  ): Promise<RecoveryApprovalAuthorizationDecisionV2>;
}
```

## C4. Identity state V2

```ts
interface IdentityStateChangeAuthorizationCommandV2 {
  readonly context: TrustedBoundaryContextV2;
  readonly actorIdentityId: string;
  readonly targetIdentityId: string;
  readonly targetClassification: AuthenticationSecurityClassification;
  readonly currentIdentityState: IdentityState;
  readonly targetIdentityState: IdentityState;
  readonly reasonCode: string;
  readonly sourceContractReference: string;
  readonly expectedIdentityVersion: number;
}

interface IdentityStateChangeAuthorizationPortV2 {
  authorizeStateChange(
    command: IdentityStateChangeAuthorizationCommandV2,
  ): Promise<IdentityStateChangeAuthorizationDecision>;
}
```

Module 02 resolves target roles from its own store; Module 01 supplies its owned
classification/state through the signed context.

## C5. Classification V2

```ts
interface ClassificationTransitionCoordinationCommandV2 {
  readonly context: TrustedBoundaryContextV2 & {
    readonly workload: WorkloadIdentityEnvelopeV1;
  };
  readonly actorIdentityId: string;
  readonly targetIdentityId: string;
  readonly currentClassification: AuthenticationSecurityClassification;
  readonly targetClassification: AuthenticationSecurityClassification;
  readonly reasonCode: string;
  readonly sourceContractReference: string;
  readonly expectedIdentityVersion: number;
  readonly provisioningReference?: string;
}

interface ClassificationTransitionCoordinationPortV2 {
  validateContract(
    command: ClassificationTransitionCoordinationCommandV2,
  ): Promise<ClassificationTransitionCoordinationDecision>;
}
```

## C6. Provisioning reference PRV1 and port V2

```ts
interface ProvisioningReferenceEnvelopeV1 {
  readonly version: 'walrus.provisioning.v1';
  readonly issuer: 'urn:walrus:module-02:provisioning-authority';
  readonly audience: 'urn:walrus:module-01:privileged-provisioning';
  readonly subjectIdentityId: string;
  readonly requestedClassification:
    'PRIVILEGED_ADMIN_AUTHENTICATION' | 'SUPER_ADMIN_AUTHENTICATION';
  readonly requestedRole: 'ADMIN' | 'SUPER_ADMIN';
  readonly environment: EnvironmentName;
  readonly operation: 'PROVISION' | 'REPLACE_PRIVILEGED_ROLE' | 'REPROVISION';
  readonly operationId: string;
  readonly policyVersion: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly jwtId: string;
  readonly approverIdentityIds: readonly string[];
  readonly keyId: string;
}

type ProvisioningReferenceState =
  'ISSUED' | 'RESERVED' | 'CONSUMED' | 'INVALIDATED' | 'EXPIRED' | 'RECONCILIATION_REQUIRED';

interface PrivilegedProvisioningAuthorizationCommandV2 {
  readonly context: TrustedBoundaryContextV2 & {
    readonly workload: WorkloadIdentityEnvelopeV1;
  };
  readonly provisioning: ProvisioningReferenceEnvelopeV1;
}

interface PrivilegedProvisioningAuthorizationPortV2 {
  authorizeProvisioning(
    command: PrivilegedProvisioningAuthorizationCommandV2,
  ): Promise<PrivilegedProvisioningAuthorizationDecision>;
}
```

PRV1 is an ES256 signed envelope. Its `jwtId` is atomically reserved, then
consumed exactly once. Expired, invalidated, consumed, mismatched, or unknown
references deny. A new operation always receives a new `jwtId`.

## C7. Bootstrap evidence BSV1 and port V2

```ts
interface BootstrapEvidenceEnvelopeV1 {
  readonly version: 'walrus.bootstrap.v1';
  readonly issuer: 'urn:walrus:bootstrap-control-plane';
  readonly audience: 'urn:walrus:module-01:bootstrap';
  readonly environment: EnvironmentName;
  readonly intendedIdentityId: string;
  readonly intendedIdentifierReferences: readonly string[];
  readonly requestedClassification: 'SUPER_ADMIN_AUTHENTICATION';
  readonly requestedRole: 'SUPER_ADMIN';
  readonly securityAuthorityId: string;
  readonly operationsAuthorityId: string;
  readonly operationId: string;
  readonly policyVersion: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly jwtId: string;
  readonly keyId: string;
}

interface BootstrapAuthorizationCommandV2 {
  readonly context: TrustedBoundaryContextV2 & {
    readonly workload: WorkloadIdentityEnvelopeV1;
  };
  readonly evidence: BootstrapEvidenceEnvelopeV1;
}

interface BootstrapAuthorizationDecisionV2 {
  readonly available: boolean;
  readonly bootstrapReference?: string;
  readonly policyVersion: string;
}

interface BootstrapAuthorizationPortV2 {
  authorizeBootstrap(
    command: BootstrapAuthorizationCommandV2,
  ): Promise<BootstrapAuthorizationDecisionV2>;
}
```

## C8. Workload identity contract WI-1

- Issuer: `urn:walrus:workload-identity:<environment>`.
- Audience: exact consuming service; M4 uses
  `urn:walrus:module-02:authorization`.
- Subject: immutable allowlisted service identity, never a human UUID.
- Trust: mTLS workload certificate plus ES256 JWT from a dedicated asymmetric
  KMS key; verification through pinned internal issuer/JWKS and `kid`.
- Lifetime: maximum five minutes; allowed clock skew 60 seconds.
- Replay: UUIDv7 `jti` required and atomically single-use for mutating calls;
  retain replay marker for at least token expiry plus skew.
- Binding: environment, issuer, audience, subject, operation ID, contract
  version, and request payload digest.
- Rotation: publish new verification key before use; overlap old verification
  key only for maximum token lifetime plus skew; emergency revoke denies all
  tokens for revoked `kid`.
- Failure: signature, mTLS, issuer, audience, subject, environment, expiry,
  not-before, `jti`, payload digest, or key failure denies and creates a
  non-sensitive security audit event.

## C9. Authorization audit contract AUD-1

```ts
interface AuthorizationAuditRecordV1 {
  readonly schemaVersion: 'walrus.authorization-audit.v1';
  readonly authorizationReference: string;
  readonly actorIdentityId?: string;
  readonly targetIdentityId?: string;
  readonly workloadIdentity: string;
  readonly action: string;
  readonly permission?: string;
  readonly evaluatedRoleNames: readonly string[];
  readonly resourceType: string;
  readonly resourceReference: string;
  readonly decision: 'GRANTED' | 'DENIED' | 'CONTRACT_VALID' | 'CONTRACT_INVALID';
  readonly reasonCode: string;
  readonly policyVersion: string;
  readonly contractVersion: string;
  readonly correlationId: string;
  readonly sessionId?: string;
  readonly assurance?: AuthenticationAssurance;
  readonly environment: EnvironmentName;
  readonly occurredAt: string;
}
```

Records are append-only. Owned mutation and mandatory audit commit in one local
transaction. Cross-module actions use durable orchestration and correlation;
neither database transaction spans modules. Audit failure denies before the
protected action or leaves orchestration non-eligible pending reconciliation.

Audit excludes raw JWTs, mTLS credentials, nonces capable of replay, passwords,
MFA/recovery/bootstrap evidence, provisioning envelopes, keys, full policies,
and unnecessary personal data. Store references/digests only.

**PROPOSED — REQUIRES OWNER APPROVAL:** retain all operational authorization
records online for 400 days. Privileged provisioning, classification, Super
Admin, bootstrap, and administrative role events are additionally retained in
an immutable archive for seven years only after Legal/Compliance approval.
Integrity uses KMS-backed chained checkpoints and immutable archive; exact key,
checkpoint, legal-hold, region, and archive configuration require a separate
Security/Compliance operational approval before deployment.

# D. M4 Implementation Plan

1. Record approval of OD-01 through OD-14 and Legal/Compliance disposition for
   retention.
2. Add review-approved V2 TypeScript contracts and validation schemas without
   changing V1 behavior.
3. Implement WI-1 verifier, issuer/audience/service allowlists, replay store,
   payload binding, and failure audit behind Module 02 application ports.
4. Add PRV1/BSV1 domain validation and durable lifecycle repositories through
   additive forward migrations reviewed before creation.
5. Extend AUD-1 persistence only for approved fields; preserve commit `5e7eaca`
   atomic mutation/audit behavior.
6. Implement recovery V2 adapter and Table R-1 tests; migrate only M01-REC-005;
   retain V1 fail-closed fallback.
7. Implement identity-state V2 adapter and Table I-1 tests; migrate only
   M01-ID-004.
8. Implement classification V2 coordination and Table C-1 tests; ordinary M4
   adapter keeps all Super Admin classification transitions forbidden.
9. Implement provisioning V2 authorization, PRV1 lifecycle, and Table P-1
   orchestration tests.
10. Implement bootstrap V2 evidence validation and Table B-1 one-time lifecycle
    last, after Security/Operations test fixtures and reconciliation are ready.
11. Run cross-module negative, concurrency, replay, transaction, audit,
    redaction, and failure-injection tests for every boundary.
12. Run full repository validation under Node 26.6.x, including API/web/mobile,
    Playwright, Prisma, Docker, dependency audit, Gitleaks, and Trivy.
13. Review files/migrations/security evidence; commit locally only under the
    then-current Git authorization. Never push without explicit approval.

# E. M02-M4 Acceptance Criteria

M4 is complete only when:

1. All five V2 boundaries are integrated and V1 remains fail-closed until its
   consumer migration is complete.
2. Tables R-1, I-1, C-1, P-1, and B-1 are enforced exactly.
3. Authentication/Session/AAL validation precedes authorization; workload
   validation precedes internal authorization/coordination.
4. Missing, malformed, stale, conflicting, replayed, unavailable, or unknown
   context denies.
5. Requester exclusion, distinct approvals, quorum, self/same/higher scope, and
   controlled paths are enforced.
6. Module ownership is preserved; no cross-module database access or distributed
   database transaction is introduced.
7. If-Match, optimistic concurrency, idempotency, `jti` replay protection, and
   durable reconciliation pass concurrent tests.
8. Owned mutations and mandatory audit are atomic; cross-module partial state
   never becomes privileged-access eligible.
9. AUD-1 actor, target, workload, policy, assurance, environment, correlation,
   and decision data are correct and secret-free.
10. Bootstrap cannot depend on existing Super Admin authority, cannot be public,
    succeeds once, and closes permanently.
11. Negative tests cover unauthenticated/invalid workload, AAL1, unknown
    permission/role, revoked assignment, scope violations, self/peer actions,
    invalid transition, stale version, replay, audit failure, dependency
    failure, and unauthorized bootstrap.
12. No hidden Super Admin bypass, wildcard permission, implicit ownership grant,
    client-selected privilege, or policy disclosure exists.
13. Full regression, coverage, production builds, schema validation, E2E,
    secret scanning, dependency audit, container/security scans, and required
    mobile validation pass in the approved environment.

# F. Remaining Blockers and Final Approval

## F1. Remaining blockers before approval

This package intentionally proposes values that were previously missing. Before
M4 implementation, the Owner, Security, and Operations approvers must accept or
replace OD-01 through OD-14. Legal/Compliance must decide the proposed
seven-year archive before that archive is implemented. Live issuer names,
service identities, KMS keys, environment allowlists, certificates, and secrets
remain deployment configuration and must never be committed.

If OD-01 through OD-14 are approved exactly as written, no policy-design blocker
remains for beginning M4. Environment validation blockers may still prevent M4
from being declared complete.

## F2. One precise approval statement

> I approve WEMP-M02-DECISION-PACK-001 Review Draft 1.0, including Owner Decisions OD-01 through OD-14; decision tables R-1, I-1, C-1, P-1, and B-1; workload contract WI-1; provisioning envelope PRV1; bootstrap envelope BSV1; audit contract AUD-1; the parallel V2 port strategy; the dependency-ordered implementation plan; and the M02-M4 acceptance criteria. I approve the proposed permission identifiers, role matrix, administrative scope, Super Admin peer-assignment-only rule, deny-all same-role revocation, recovery eligibility and 15-minute approval lifetime, AAL2 requirements, classification restrictions, privileged-provisioning quorum, controlled-bootstrap quorum and permanent closure, no implicit ownership grant, no administrative override, and mandatory fail-closed audit behavior. I authorize implementation and local testing of M02-M4 strictly within this package, using additive forward migrations only and preserving all V1 adapters fail-closed until each V2 consumer migration is complete. This approval does not authorize production credentials, live infrastructure changes, documentation commits, code commits unless separately requested, history rewriting, or any push. The proposed seven-year immutable archive remains subject to separate Legal/Compliance approval.

# WEMP-M02-ANNEX-005 — Controlled Super Admin Bootstrap

**Version:** Review Draft 1.0  
**Status:** REVIEW ONLY — REQUIRES SECURITY/OPERATIONS/OWNER APPROVAL  
**Boundary:** Module 01 `BootstrapAuthorizationPort` → controlled authority  
**Operation:** M01-ADM-002

## 1. Exact current port

```ts
interface BootstrapAuthorizationCommand {
  readonly bootstrapEvidence: string;
}

interface BootstrapAuthorizationDecision {
  readonly available: boolean;
}

interface BootstrapAuthorizationPort {
  authorizeBootstrap(
    command: BootstrapAuthorizationCommand,
  ): Promise<BootstrapAuthorizationDecision>;
}
```

## 2. Caller and authoritative authority

- Caller: Module 01 controlled bootstrap application flow.
- Exposure: `BOOTSTRAP_CONTROLLED`, not public and unavailable after approved
  completion.
- Authority source: proposed two-party Security and Operations control-plane
  identities authenticated outside ordinary application RBAC —
  **REQUIRES APPROVAL**.
- No request body, existing Super Admin, default credential, or deployment flag
  alone establishes authority.

## 3. Permission, role, and scope

Initial bootstrap has no ordinary required role or permission because requiring
an existing Super Admin is circular. `identity.superadmin.bootstrap` is audit and
post-bootstrap governance vocabulary only; it cannot open/reopen bootstrap.

Scope is exactly one approved environment and intended universal identity, one
Module 01 `SUPER_ADMIN_AUTHENTICATION` classification, and one Module 02
`SUPER_ADMIN` assignment.

## 4. Session/AAL or control-plane assurance

No ordinary user Session applies. Proposed authority requires independently
authenticated Security and Operations principals, protected control-plane
channel, KMS-backed signed single-use evidence, explicit environment/audience,
short expiry, and replay nonce — **REQUIRES APPROVAL**.

## 5. Separation of duties

Proposed: two distinct principals from Security and Operations; neither may
alone generate and consume valid evidence. The intended bootstrap identity
cannot approve its own bootstrap. Emergency/break-glass authority is separate,
time-bound, audited, and cannot reopen a completed bootstrap without a new
formally approved recovery procedure. All details **REQUIRE APPROVAL**.

## 6. State/version preconditions

- Environment is explicitly bootstrap-eligible.
- Durable state is `AVAILABLE`, not `IN_PROGRESS`, `COMPLETED`, or disabled.
- No completed initial Super Admin assignment exists.
- Evidence matches environment, intended identity, command version, nonce,
  issuance/expiry, and approved principals.
- Module 01 identity/classification and Module 02 assignment prerequisites are
  validated by their owners.
- Completion permanently closes the initial bootstrap path.

## 7. Idempotency, concurrency, and orchestration

- M01-ADM-002 requires Idempotency Key.
- Evidence is single-use; concurrent consumption permits one winner.
- Exact retry returns durable state; mismatched reuse denies.
- Proposed durable orchestrator records requested, Module 01 prepared,
  Module 02 assigned, completed/reconciled, or failed-closed states.
- Partial completion never yields usable privileged access: eligibility requires
  both Module 01 controls and Module 02 assignment.
- No rollback deletes audit history or reopens used evidence.

## 8. Audit

Both modules record correlation, environment, minimized principal references,
intended identity reference, command/evidence reference hash—not raw evidence—,
state transition, outcome, timestamp, and reconciliation. Secrets, KMS material,
tokens, credentials, MFA material, and raw evidence are prohibited. Audit
failure is fail-closed.

## 9. Failure and deny-by-default

Any missing/invalid principal, signature, environment, audience, nonce, expiry,
state, identity binding, quorum, dependency, or mandatory audit returns
`{ available: false }`. Completed, disabled, ambiguous, concurrent, replayed, or
partially reconciled bootstrap also returns unavailable. No default/fallback
path exists.

## 10. Required tests

- Public caller and ordinary authenticated user/Super Admin cannot bootstrap
- One-principal attempt, wrong principal classes, intended-identity self-approval
- Invalid signature, wrong KMS key/version, audience/environment mismatch,
  expired/future evidence, nonce replay
- First success, exact idempotent retry, conflicting retry, concurrent attempts
- Already completed/disabled state remains permanently unavailable
- Module 01 failure, Module 02 failure, audit failure, and reconciliation
- No partial privileged access and no direct database seed
- Raw evidence/secrets absent from logs, errors, database, and responses

## 11. Acceptance criteria

1. Authority principals/quorum, evidence schema, KMS policy, environment policy,
   expiry, and state owner are approved.
2. Durable orchestration/reconciliation and break-glass procedures are approved.
3. One-time concurrency and permanent closure are demonstrated.
4. Neither RBAC nor an ordinary API can authorize initial bootstrap.
5. Both owning modules audit without copying secrets.
6. Every failure is unavailable and leaves no usable privileged access.

## 12. Explicit unresolved decisions

- **REQUIRES SECURITY/OPERATIONS/OWNER APPROVAL:** principal identities,
  two-party quorum, issuer, audience, KMS key/policy, evidence schema, lifetime,
  nonce store, and environment allowlist.
- **REQUIRES OWNER APPROVAL:** bootstrap state owner and durable state machine.
- **REQUIRES OWNER APPROVAL:** Module 01/02 orchestration order,
  reconciliation, and operational completion criteria.
- **REQUIRES SECURITY/OPERATIONS APPROVAL:** break-glass and disaster-recovery
  procedure that cannot become a reusable backdoor.
- **CONTRACT GAP — REQUIRES OWNER APPROVAL:** current port exposes one opaque
  string and boolean only. Approve a versioned evidence envelope and trusted
  control-plane context while preserving the public port's minimal response.

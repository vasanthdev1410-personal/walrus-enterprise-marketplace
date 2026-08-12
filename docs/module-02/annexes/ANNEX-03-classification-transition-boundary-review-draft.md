# WEMP-M02-ANNEX-003 — Authentication-Classification Coordination

**Version:** Review Draft 1.0  
**Status:** REVIEW ONLY — REQUIRES OWNER APPROVAL  
**Boundary:** Module 01 `ClassificationTransitionCoordinationPort`  
**Operation:** M01-CLS-001

## 1. Exact current port

```ts
interface ClassificationTransitionCoordinationCommand {
  readonly actorIdentityId: UuidV7;
  readonly targetIdentityId: UuidV7;
  readonly targetAuthenticationSecurityClassification: AuthenticationSecurityClassification;
  readonly sourceContractReference: string;
}

interface ClassificationTransitionCoordinationDecision {
  readonly contractValid: boolean;
  readonly contractReference?: string;
}

interface ClassificationTransitionCoordinationPort {
  validateContract(
    command: ClassificationTransitionCoordinationCommand,
  ): Promise<ClassificationTransitionCoordinationDecision>;
}
```

This is a coordination-contract boundary, not an ordinary permission check.

## 2. Caller and authoritative actor

- Caller: Module 01 internal classification-transition application flow.
- Endpoint class: authenticated `INTERNAL_SERVICE`, not internet-public.
- Actor source: authenticated workload/service identity bound by the approved
  coordination contract. A body UUID alone is not authority.
- If a human initiator governs the service request, their identity and AAL must
  be carried in a separately trusted delegation context.

## 3. Permission, role, and scope

- Required authority: recognized active coordination contract.
- Proposed human permission where human-governed:
  `identity.classification.change` — **REQUIRES OWNER APPROVAL**.
- Proposed roles: Admin for approved standard transitions; Super Admin for
  privileged/Super Admin classifications — **REQUIRES OWNER APPROVAL**.
- Resource: exact target identity, target classification, source contract,
  initiator/service, reason, and contract version.

## 4. Session/AAL or service assurance

Workload authentication is mandatory. Proposed mechanism: mutually
authenticated workload identity plus an audience-bound, short-lived signed
service assertion with replay protection — **REQUIRES SECURITY/OWNER APPROVAL**.
Human-governed privileged escalation additionally requires authoritative AAL2 —
**REQUIRES OWNER APPROVAL**.

## 5. Separation of duties and transition policy

- Classification does not grant permissions or roles.
- Module 02/coordination validates authority; Module 01 validates and performs
  the classification transition.
- Proposed: escalation to `SUPER_ADMIN_AUTHENTICATION` requires a Super Admin
  human authority plus approved provisioning/bootstrap workflow; self-escalation
  is denied — **REQUIRES OWNER APPROVAL**.
- Proposed: downgrade from privileged classifications requires an approved
  deprovisioning/source contract and reconciliation with Module 02 assignments —
  **REQUIRES OWNER APPROVAL**.
- The exact current→target transition matrix is not approved.

## 6. State/version, idempotency, and concurrency

- M01-CLS-001 requires Idempotency Key and If-Match.
- Module 01 checks current classification, allowed domain transition, Identity
  state, expected version, and concurrent change.
- Coordination validates active contract ID/version, actor/service binding,
  target and transition scope, expiry, nonce/replay state, and policy version.
- Replays cannot repeat classification mutation or role coordination.

## 7. Audit

Module 02/coordination records service actor, human initiator where approved,
target, source/contract version, target classification, outcome/reference,
correlation, and timestamp. Module 01 records its classification mutation and
contract reference. Assertions, tokens, contract secrets, and policy internals
are excluded.

## 8. Failure and deny-by-default

Unknown/expired/revoked contract, invalid workload identity, audience mismatch,
replay, unapproved transition, missing human permission/AAL, self-escalation,
target mismatch, stale version, dependency/audit failure, or incomplete context
returns `{ contractValid: false }` with no contract reference. Module 01 makes no
classification change.

## 9. Required tests

- Missing/invalid workload identity, audience, signature, expiry, nonce/replay
- Unknown, stale, revoked, or wrong-scope contract version
- Allowed and denied transition-matrix entries
- Standard, privileged, and Super Admin target cases
- Missing human permission, AAL1, self-escalation, and cross-scope actor
- Authorization grant cannot bypass Module 01 transition validation
- Stale If-Match, idempotent replay, and concurrent requests
- Audit service/human/target accuracy and secret redaction
- Dependency/audit failure leaves state unchanged

## 10. Acceptance criteria

1. Workload authentication and contract registry are approved.
2. Current→target transition, initiator, role/scope, AAL, and deprovisioning
   rules are approved.
3. Contract validation precedes Module 01 mutation.
4. Classification never creates a permission or role.
5. Negative, replay, concurrency, audit, and isolation tests pass.

## 11. Explicit unresolved decisions

- **REQUIRES SECURITY/OWNER APPROVAL:** workload identity protocol, issuer,
  audience, trust roots, lifetime, and replay store.
- **REQUIRES OWNER APPROVAL:** classification transition matrix and human actor
  rules.
- **REQUIRES OWNER APPROVAL:** Admin/Super Admin scope, AAL2, self-escalation,
  downgrade, and role/classification reconciliation.
- **REQUIRES OWNER APPROVAL:** contract registry ownership/version lifecycle.
- **CONTRACT GAP — REQUIRES OWNER APPROVAL:** current port does not carry
  workload assertion, human initiator/AAL, current classification, reason code,
  contract version, expiry, or nonce. Approve a versioned envelope/context.

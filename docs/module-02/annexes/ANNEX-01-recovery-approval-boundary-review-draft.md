# WEMP-M02-ANNEX-001 — Recovery Approver Authorization

**Version:** Review Draft 1.0  
**Status:** REVIEW ONLY — REQUIRES OWNER APPROVAL  
**Boundary:** Module 01 `ApprovalAuthorizationPort` → Module 02  
**Operation:** M01-REC-005

This annex does not authorize an adapter. The existing fail-closed adapter
remains required until this annex and its unresolved contract amendment are
approved.

## 1. Recovery eligibility table — REQUIRES OWNER APPROVAL

The Module 01 recovery policy below is binding. Role eligibility is not defined
by an approved source and is therefore proposed.

| Recovery category                                                             | Module 01 approval requirement                                         | Proposed minimum Module 02 eligibility                                                                                                          | Approver Session                                                                                                         | Separation of duties                                                                           | Status                                                          |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Normal user: standard password reset or identity unlock                       | No human approval                                                      | No Module 02 approver; M01-REC-005 must not be used unless an approved risk escalation requires approval                                        | N/A                                                                                                                      | Module 01 evidence policy applies                                                              | Binding minimum; escalation eligibility REQUIRES OWNER APPROVAL |
| Normal user: other standard recovery operations                               | None unless approved risk policy escalates                             | When escalated: active Admin or Super Admin with `recovery.approval.decide`                                                                     | Current authoritative ordinary AAL2 Session                                                                              | Requester cannot approve; if escalation requires dual control, two distinct eligible approvers | REQUIRES OWNER APPROVAL                                         |
| Privileged/Admin recovery with complete approved strong self-service evidence | No human approval                                                      | No approver decision; Module 01 continues without M01-REC-005                                                                                   | N/A                                                                                                                      | Strong evidence rules remain Module 01-owned                                                   | Binding                                                         |
| Privileged/Admin recovery without the complete strong self-service set        | Dual control by two distinct Module 02-authorized approvers            | Proposed: two distinct Super Admins with `recovery.approval.decide`                                                                             | Each uses a separate current authoritative AAL2 Session                                                                  | Requester excluded; approvers distinct; decisions request/identity/operation/expiry-bound      | REQUIRES OWNER APPROVAL; alternative is Admin + Super Admin     |
| Super Admin recovery                                                          | Dual control mandatory; controlled bootstrap evidence where applicable | Proposed: two distinct eligible authorities selected by an approved Security/Operations policy; ordinary role eligibility alone is insufficient | Each human approver uses separate current AAL2; Operations authority uses approved workload/control-plane authentication | Requester excluded; two distinct authorities; no single identity satisfies both                | REQUIRES SECURITY/OPERATIONS/OWNER APPROVAL                     |

No approval authenticates the recovered identity, establishes AAL, or replaces
Module 01 evidence and state validation.

## 2. Exact current port

```ts
interface ApproverAuthorizationCommand {
  readonly approverIdentityId: UuidV7;
  readonly recoveryRequestId: UuidV7;
  readonly recoveredIdentityId: UuidV7;
  readonly operationClass: RecoveryOperationClass;
}

interface ApprovalAuthorizationDecision {
  readonly authorized: boolean;
  readonly authorizationReference?: string;
}

interface ApprovalAuthorizationPort {
  authorizeApprover(command: ApproverAuthorizationCommand): Promise<ApprovalAuthorizationDecision>;
}
```

The interface remains authoritative unless a separately approved version is
introduced.

## 3. Caller and actor identity

- Caller: Module 01 recovery approval-decision application flow for
  M01-REC-005.
- Authoritative actor: the identity bound to the verified current ordinary AAL2
  Session. Module 01 supplies `approverIdentityId`; the adapter must reject any
  mismatch with authenticated context.
- The request body must never select or override the approver identity.

## 4. Permission, role, and scope — REQUIRES OWNER APPROVAL

- Required permission: `recovery.approval.decide`.
- Proposed roles: Admin and Super Admin for risk-escalated standard recovery;
  Super Admin-only or mixed Admin/Super Admin for privileged recovery.
- Super Admin recovery eligibility requires a separately approved
  Security/Operations model; no hidden Super Admin bypass exists.
- Resource scope: the exact recovery request, recovered identity, and operation
  class in the command.

## 5. Session/AAL

Binding requirement: a current authoritative ordinary AAL2 Session. Token,
Session state, Session Version, identity state, expiry, and MFA-backed AAL2 are
validated by Module 01 before the boundary call. Module 02 must fail closed if
the trusted context is absent or inconsistent.

## 6. Separation of duties

Binding Module 01 rules:

- requester never approves their own recovery;
- two distinct approvers are required wherever dual control applies;
- one identity cannot fill both slots;
- each is authorized by Module 02 at decision time;
- decisions bind request, recovered identity, operation class, decision,
  approver, and expiration;
- approvals expire and are not reusable;
- Module 01 validates both records before execution.

Module 01 owns aggregation and Recovery execution. Module 02 returns individual
eligibility only.

## 7. State and version preconditions

- Module 01 validates the Recovery Request state, policy row, operation class,
  expected version/ETag, approval requirement, prior decisions, expiration, and
  requester relationship.
- Module 02 validates current role/permission assignment and the approved
  eligibility policy version.
- Neither module treats authorization as proof that the domain transition is
  valid.

## 8. Idempotency and concurrency

- M01-REC-005 requires an Idempotency Key and If-Match.
- Replays return the previously committed Module 01 result only for an exact
  request match.
- Module 02 records each actual decision evaluation independently.
- Stale Session, role assignment, recovery version, expired approval, or
  concurrent conflicting decision denies/fails closed.

## 9. Audit

Module 02 records actor, recovered subject, permission, request/resource
reference, operation class when the approved audit schema supports it, decision,
Session/correlation references, timestamp, and denial category. Module 01 stores
its approval record and only the non-sensitive Module 02 authorization
reference. No evidence value, token, Recovery code, MFA secret, internal role
matrix, or policy reasoning is logged.

## 10. Failure and deny-by-default

Missing AAL2, unknown operation, missing/retired permission, inactive/revoked
assignment, self-approval, insufficient approver class, stale context, unknown
policy version, dependency/audit failure, or malformed identifier returns
`{ authorized: false }` without an authorization reference. Module 01 returns
its stable non-disclosing authorization/recovery error and performs no Recovery
mutation.

## 11. Required tests

- No token, invalid Session, stale Session Version, AAL1, and inactive identity
- Unknown/missing/retired permission and inactive/revoked assignment
- Standard recovery with no approval requirement does not invoke the port
- Requester self-approval
- Duplicate approver attempting both dual-control slots
- Allowed and denied eligibility for each approved table row
- Request/identity/operation mismatch and expired approval
- Idempotent replay, concurrent decision, and stale If-Match
- Audit actor/subject/context accuracy and secret redaction
- Module 02/audit failure leaves Module 01 state unchanged

## 12. Acceptance criteria

1. The eligibility table and permission matrix are approved.
2. The port provides or is paired with sufficient trusted context to select the
   correct classification/policy row and enforce requester exclusion.
3. Module 01 remains Recovery state/execution owner.
4. Every negative case denies and is audited without policy disclosure.
5. Cross-module tests prove distinct approvers and no database coupling.
6. The fail-closed adapter is replaced only after all tests pass.

## 13. Explicit unresolved decisions

- **REQUIRES OWNER APPROVAL:** exact Admin/Super Admin eligibility per recovery
  classification and operation.
- **REQUIRES OWNER APPROVAL:** risk-escalation policy for standard recovery.
- **REQUIRES OWNER APPROVAL:** privileged recovery—two Super Admins versus one
  Admin plus one Super Admin.
- **REQUIRES SECURITY/OPERATIONS/OWNER APPROVAL:** Super Admin emergency
  approver authority and controlled-bootstrap evidence relationship.
- **REQUIRES OWNER APPROVAL:** approval expiry and reason-code catalogues.
- **CONTRACT GAP — REQUIRES OWNER APPROVAL:** the current port lacks requester
  identity, authentication-security classification, approval decision,
  expiration, and policy version. Approve a versioned command extension or an
  equally authoritative, non-database-coupled context contract before M4.

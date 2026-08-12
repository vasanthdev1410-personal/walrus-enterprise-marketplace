# WEMP-M02-ANNEX-002 — Identity State-Change Authorization

**Version:** Review Draft 1.0  
**Status:** REVIEW ONLY — REQUIRES OWNER APPROVAL  
**Boundary:** Module 01 `IdentityStateChangeAuthorizationPort` → Module 02  
**Operation:** M01-ID-004

## 1. Exact current port

```ts
interface IdentityStateChangeAuthorizationCommand {
  readonly actorIdentityId: UuidV7;
  readonly targetIdentityId: UuidV7;
  readonly targetIdentityState: IdentityState;
  readonly sourceContractReference: string;
}

interface IdentityStateChangeAuthorizationDecision {
  readonly authorized: boolean;
  readonly authorizationReference?: string;
}

interface IdentityStateChangeAuthorizationPort {
  authorizeStateChange(
    command: IdentityStateChangeAuthorizationCommand,
  ): Promise<IdentityStateChangeAuthorizationDecision>;
}
```

## 2. Caller and authoritative actor

- Caller: Module 01 identity-lifecycle application flow for M01-ID-004.
- Actor: the identity bound to the verified authoritative ordinary Session;
  never the request body alone.
- Module 01 supplies actor and target IDs after authentication and ensures the
  path target matches `targetIdentityId`.

## 3. Permission, role, and administrative scope

- Proposed permission: `identity.state.change` — **REQUIRES OWNER APPROVAL**.
- Proposed roles: Admin and Super Admin — **REQUIRES OWNER APPROVAL**.
- Proposed target scope: Admin may manage standard Customer/Seller identities;
  Super Admin may manage standard and privileged Admin targets. Super Admin
  targets and actor-equals-target administrative changes deny until an explicit
  same-role/self-service rule is approved.
- Authentication-security classification never grants authority.

The current port lacks target role/classification and requested source operation
metadata sufficient to enforce the proposed target scope. This is a contract
gap.

## 4. Session/AAL

Approved Module 01 minimum: current ordinary Session plus current Module 02
decision. Proposed stronger requirement: authoritative AAL2 for every M01-ID-004
state change — **REQUIRES OWNER APPROVAL**. Module 01 validates token, Session,
Session Version, identity state, expiry, and AAL before calling Module 02.

## 5. Resource and domain scope

Authorization binds actor, target identity, requested target state, source
contract reference, Session, correlation ID, and policy version. Module 01 alone
validates the transition from current state, reason code, If-Match, legal/domain
constraints, and performs the mutation. An authorization grant cannot make an
invalid state transition valid.

## 6. Separation of duties

- Proposed: actor cannot change their own administrative authentication state
  through M01-ID-004 — **REQUIRES OWNER APPROVAL**.
- Proposed: no Admin may change a target with Admin/Super Admin authorization
  standing — **REQUIRES OWNER APPROVAL**.
- No approved source currently mandates dual approval for this operation.
  Adding it requires a versioned workflow and is not implied.

## 7. State/version, idempotency, and concurrency

- M01-ID-004 requires Idempotency Key and If-Match.
- Module 01 checks current identity state, allowed transition, expected version,
  source contract, and concurrent change.
- Module 02 checks current active assignments/permissions at decision time.
- Exact replay returns the committed result; mismatched reuse, stale version,
  or changed authorization state fails closed.

## 8. Audit

Module 02 records actor, target subject, `identity.state.change`, requested state
as approved resource context, Session/correlation, decision/reference, and
timestamp. Module 01 records the state transition, reason/source references,
version, and Module 02 reference. Neither copies policies, roles, tokens, or
secrets.

## 9. Failure and deny-by-default

Missing/invalid Session, insufficient approved AAL, unknown contract, actor or
target mismatch, self/cross-scope attempt, missing permission, inactive role or
assignment, unknown target state, stale version, dependency/audit failure, or
ambiguous context returns `{ authorized: false }`. Module 01 does not mutate the
Identity and returns its stable non-disclosing error.

## 10. Required tests

- Unauthenticated, expired/revoked/stale Session, and insufficient AAL
- Missing/retired permission and inactive/revoked assignment
- Admin against standard target, Admin against privileged target, Super Admin
  against allowed target, same-role and self-target denial
- Invalid target state, source contract mismatch, path/body mismatch
- Invalid domain transition despite authorization grant
- Stale If-Match, idempotent replay, and concurrent state change
- Audit actor/target accuracy, denial audit, and redaction
- Module 02 unavailable/audit failure leaves Module 01 unchanged

## 11. Acceptance criteria

1. Permission, roles, target-scope matrix, self/same-role rule, and AAL are
   approved.
2. A versioned context supplies every attribute needed for target scope.
3. Authorization and Module 01 domain validation both pass before mutation.
4. Every uncertain or stale case denies.
5. Tests prove no database coupling and no authorization-derived state change.

## 12. Explicit unresolved decisions

- **REQUIRES OWNER APPROVAL:** AAL2 versus approved ordinary-Session minimum.
- **REQUIRES OWNER APPROVAL:** exact target role/classification scope.
- **REQUIRES OWNER APPROVAL:** actor-equals-target and same-role rules.
- **REQUIRES OWNER APPROVAL:** source-contract registry and allowed initiators.
- **CONTRACT GAP — REQUIRES OWNER APPROVAL:** current command lacks target
  authorization role/scope and current authentication-security classification.
  Approve a versioned extension or authoritative context resolver contract.

# Module 02 — Manual Approval Pack

**Status:** REVIEW ONLY — every unresolved item is **REQUIRES OWNER APPROVAL**  
**Companion documents:** WEMP-M02-SPEC-001 Review Draft 1.0 and ADR-M02-001  
**Implementation authority:** None until an approval record is signed

**Boundary annexes:** WEMP-M02-ANNEX-001 through WEMP-M02-ANNEX-005 in
`docs/module-02/annexes/`. Each annex remains review-only and identifies any
required versioned context amendment.

**Annex baseline approval:** Recorded 2026-08-11 for requirements review only.
See WEMP-M02-DECISION-PACK-001 for the final proposed owner/security/operations
choices that would authorize M4.

## 1. Implemented security corrections

Local commit `5e7eaca` fixes M3 security mechanics: subordinate-only fail-closed
revocation scope, atomic role mutation/audit persistence, unique decision
instances, order-independent reference hashing, and separate audit actor/target
fields. It does not implement M4 or approve policy.

## 2. Proposed role-permission matrix — REQUIRES OWNER APPROVAL

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

¹ Never authorizes initial bootstrap or reopens a completed bootstrap.

## 3. Administrative scope — REQUIRES OWNER APPROVAL

- Super Admin: Admin, Seller, Customer
- Admin: Seller, Customer
- Seller: Customer only if a future explicit administrative permission is
  approved; none exists in this matrix
- Customer: none
- Hierarchy never grants permission inheritance
- Permission and target scope must both pass
- Same-role assignment: proposed Super Admin-to-Super Admin exception only;
  **REQUIRES OWNER APPROVAL**
- Same-role revocation: deny until separately approved
- Initial Super Admin assignment: controlled bootstrap only

## 4. Module 01 boundary mapping — REQUIRES OWNER APPROVAL

| Boundary                  | Permission/authority                                                                      | Session/authority                                          | Resource scope                                      | SOD/audit                                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Recovery approval         | `recovery.approval.decide`                                                                | Current ordinary AAL2 Session                              | Request + recovered identity + operation class      | Requester excluded; distinct approvers; dual control where Module 01 policy requires; decision audited |
| Identity state change     | `identity.state.change`                                                                   | Proposed current AAL2 Session                              | Target identity + target state + source contract    | Domain transition and version must also pass; actor/target audited                                     |
| Classification transition | Approved coordination contract plus `identity.classification.change` where human-governed | Authenticated workload identity                            | Target identity + classification + contract version | Allowlisted transition; Module 01 mutates; contract decision audited                                   |
| Privileged provisioning   | `identity.privileged.provision`                                                           | Authenticated provisioning service plus active Super Admin | Bound single-use provisioning reference             | No public path; idempotent orchestration; actor/target audited                                         |
| Controlled bootstrap      | One-time Security/Operations control-plane authority, not RBAC                            | Environment-bound, expiring, single-use evidence           | Intended universal identity and environment         | Two-party approval recommended; permanent closure; both modules audit                                  |

## 5. Separation of duties — REQUIRES OWNER APPROVAL

Binding Module 01 rules remain: requester never self-approves; one approver never
satisfies two approvals; privileged recovery uses dual control when strong
self-service evidence is insufficient; Super Admin recovery always uses dual
control. Exact role eligibility for each classification/operation remains
**REQUIRES OWNER APPROVAL** and must be recorded before M4.

## 6. AAL and Session policy — REQUIRES OWNER APPROVAL

- Authentication and authoritative Session validation precede authorization.
- M01-REC-005: AAL2 is binding.
- M01-ID-004: approve AAL2 as a stronger control or retain ordinary Session.
  Recommendation: approve AAL2.
- Module 02 administration: approve current AAL2-before-permission behavior.
- M01-CLS-001/M01-ADM-001: workload identity, not user Session.
- M01-ADM-002: deployment/operations authority, not user Session.
- Roles, permissions, classifications, or AAL are never trusted from clients.

## 7. Controlled bootstrap design — REQUIRES OWNER APPROVAL

Recommended design: explicitly enabled environment; two-party Security and
Operations authorization; KMS-backed expiring single-use evidence bound to the
environment and intended identity; idempotent durable orchestration across
Module 01 classification and Module 02 assignment; reconciliation of partial
failure; immutable audit in both modules; permanent closure after success; no
default credential, database seed, reusable endpoint, or RBAC-based reopening.

Evidence format, state owner, quorum identities, expiry, KMS policy, and
break-glass recovery remain **REQUIRES OWNER APPROVAL**.

## 8. Audit contract — REQUIRES OWNER APPROVAL

Implemented operational contract: append-only decision records; separate actor
and target/subject; timestamp, permission, outcome, decision reference,
correlation and available Session/resource context; role mutation and audit in
one transaction; no credentials, tokens, MFA/recovery/bootstrap evidence, full
policy, or unnecessary personal data.

Retention duration, integrity chain, KMS key, immutable archive, legal hold,
SIEM export, proxy/source-IP trust, and clock tolerance remain
**REQUIRES OWNER APPROVAL**.

## 9. M02-M4 acceptance criteria — REQUIRES OWNER APPROVAL

1. Specification, ADR, matrix, hierarchy, recovery eligibility, AAL decisions,
   service authentication, coordination, provisioning, bootstrap, ownership,
   and audit policy are explicitly approved.
2. Exactly the five existing Module 01 ports are integrated without direct
   database coupling or JWT authorization claims.
3. Every positive result requires its exact permission/authority and resource
   context; every missing, stale, malformed, conflicting, or unavailable input
   denies.
4. Recovery requester exclusion, distinct approvers, dual control, operation
   binding, and expiration are tested.
5. Classification and provisioning preserve Module 01 mutation ownership,
   contract versioning, replay protection, idempotency, and audit.
6. Bootstrap tests prove one-time authority, permanent closure, no circular
   Super Admin dependency, no default secret, and recovery/reconciliation.
7. Assignment and revocation enforce permission plus approved target scope.
8. Audit tests prove atomicity, append-only storage, actor/target accuracy,
   independent repeated decisions, correlation, and redaction.
9. Full repository, API, web, Flutter, Playwright, security, secret, Prisma, and
   production-build gates pass under the required toolchain.
10. No M00/M01 regression, unrelated refactor, speculative schema, or `tmp/`
    change is included.

## 10. Approval checklist

Each item is **REQUIRES OWNER APPROVAL**:

- [ ] Permission identifiers and matrix
- [ ] Administrative hierarchy and same-role rules
- [ ] Recovery approver eligibility table
- [ ] M01-ID-004 AAL2 and Module 02 admin AAL2 policy
- [ ] Internal-service authentication
- [ ] Classification transition matrix/contract
- [ ] Privileged provisioning protocol
- [ ] Controlled bootstrap protocol
- [ ] Resource ownership and no-override rule
- [ ] Audit contract and deferred retention/integrity ownership
- [ ] M4 scope and acceptance criteria
- [ ] ADR-M02-001

Until all applicable boxes are approved, M02-M4 remains blocked.

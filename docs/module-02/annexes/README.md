# Module 02 Boundary-Contract Annex Register

**Status:** APPROVED REVIEW BASELINE — NOT IMPLEMENTATION AUTHORITY  
**Baseline approval recorded:** 2026-08-11 by Product/Architecture Owner  
**Approval scope:** binding requirements, deny-by-default behavior, ownership,
separation-of-duties minimums, audit/test requirements, and identified gaps

| Annex              | Boundary                                   | Current integration status | Principal blocker                                                                               |
| ------------------ | ------------------------------------------ | -------------------------- | ----------------------------------------------------------------------------------------------- |
| WEMP-M02-ANNEX-001 | `ApprovalAuthorizationPort`                | Fail-closed                | Recovery classification/requester/policy context and approver eligibility require approval      |
| WEMP-M02-ANNEX-002 | `IdentityStateChangeAuthorizationPort`     | Fail-closed                | Target scope, AAL2, self/same-role policy, and trusted scope context require approval           |
| WEMP-M02-ANNEX-003 | `ClassificationTransitionCoordinationPort` | Fail-closed                | Workload identity, contract registry/envelope, and transition matrix require approval           |
| WEMP-M02-ANNEX-004 | `PrivilegedProvisioningAuthorizationPort`  | Fail-closed                | Workload/human authority, reference registry, target intent, and orchestration require approval |
| WEMP-M02-ANNEX-005 | `BootstrapAuthorizationPort`               | Fail-closed                | Control-plane quorum/evidence, KMS, durable state, and reconciliation require approval          |

The exact current ports are preserved. Where their narrow commands cannot carry
the trusted context required by an approved policy, each annex calls for a
versioned context/envelope decision rather than silently widening or bypassing
the boundary.

M02-M4 remains blocked until all annex-specific unresolved decisions are closed
and an approval record explicitly authorizes implementation.

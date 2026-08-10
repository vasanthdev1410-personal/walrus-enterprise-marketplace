import { Injectable } from '@nestjs/common';
import type {
  ApprovalAuthorizationDecision,
  ApprovalAuthorizationPort,
  ApproverAuthorizationCommand,
} from '../../application/ports/approval-authorization.port';

/**
 * Fail-closed Module 02 authorization boundary for recovery approval
 * decisions (M01-REC-005). Module 02 (roles, permissions, authorization
 * decisions) is not implemented yet, so no approver can currently obtain a
 * current authorization decision and every decision is denied with
 * AUTHORIZATION_DENIED. The full approval-decision flow is exercised against a
 * mocked authorized decision in unit and integration tests; once Module 02
 * lands, this adapter is replaced by the approved contract without touching
 * the recovery milestone. An always-permissive adapter is never acceptable:
 * the approver's ordinary AAL2 session alone must not authorize an approval.
 */
@Injectable()
export class NonProductionApprovalAuthorizationAdapter implements ApprovalAuthorizationPort {
  public authorizeApprover(
    command: ApproverAuthorizationCommand,
  ): Promise<ApprovalAuthorizationDecision> {
    // Module 02 cannot currently produce a decision; the command carries the
    // approval context that the future approved contract will evaluate. Every
    // approver is denied until then.
    void command;
    return Promise.resolve({ authorized: false });
  }
}

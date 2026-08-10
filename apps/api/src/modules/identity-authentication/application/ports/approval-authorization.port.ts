import type { RecoveryOperationClass } from '../../domain/recovery/value-objects/recovery-operation-class';
import type { UuidV7 } from '../../domain/shared/value-objects/uuid-v7';

/**
 * M01-REC-005. The Module 02 authorization boundary. The approval-decision
 * endpoint is MODULE_02_AUTHORIZED: a current Module 02 authorization decision
 * is obtained through this approved contract at decision time and Module 02
 * storage is never read directly. The port is intentionally narrow so Module
 * 02 can be integrated later without touching the recovery milestone.
 */
export interface ApproverAuthorizationCommand {
  readonly approverIdentityId: UuidV7;
  readonly recoveryRequestId: UuidV7;
  readonly recoveredIdentityId: UuidV7;
  readonly operationClass: RecoveryOperationClass;
}

export interface ApprovalAuthorizationDecision {
  readonly authorized: boolean;
  /** Non-sensitive reference to the current Module 02 authorization decision. */
  readonly authorizationReference?: string;
}

export interface ApprovalAuthorizationPort {
  authorizeApprover(
    command: ApproverAuthorizationCommand,
  ): Promise<ApprovalAuthorizationDecision>;
}

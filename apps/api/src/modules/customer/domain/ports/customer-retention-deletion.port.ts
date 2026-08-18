import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

/**
 * WEMP-M06-SPEC-001 §19 / decision D-15. Scoped deletion surface used ONLY
 * by the M06-M3 retention processor to delete records whose configured
 * retention window has expired. This is the sole deletion path for the
 * otherwise append-only CustomerStateTransition and CustomerAuditRecord
 * records (D-02/D-08): the aggregate repository never exposes generic
 * update/delete operations. Deletion happens only after the processor has
 * resolved every category rule (fail closed — no deletion without a valid
 * configured duration).
 */
export interface CustomerRetentionDeletionPort {
  deleteTransitions(transitionIds: readonly UuidV7[]): Promise<void>;
  deleteAuditRecords(auditEventIds: readonly UuidV7[]): Promise<void>;
}

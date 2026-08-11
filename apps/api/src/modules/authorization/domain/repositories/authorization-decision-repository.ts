import type { AuthorizationDecisionRecord } from '../entities/authorization-decision-record';

/**
 * Part 6.5 §22 (Module 02 source material). Append-only persistence port for
 * authorization decision audit records. Records are immutable and are never
 * updated or deleted.
 */
export interface AuthorizationDecisionRepository {
  insert(record: AuthorizationDecisionRecord): Promise<void>;
}

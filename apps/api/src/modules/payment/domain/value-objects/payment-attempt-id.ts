import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

/**
 * WEMP-M09-SPEC-001 (M09-M1). Identifier for an append-only payment
 * attempt record. Each attempt captures a single interaction with the
 * payment provider (initiated, succeeded, failed, timed out).
 */
export class PaymentAttemptId extends UuidV7 {}

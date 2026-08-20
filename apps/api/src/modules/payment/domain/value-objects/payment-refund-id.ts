import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

/**
 * WEMP-M09-SPEC-001 (M09-M1). Identifier for a payment refund entity.
 * Refunds are associated with a single payment and may be full or partial
 * (configurable per D-04 scope decision).
 */
export class PaymentRefundId extends UuidV7 {}

import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

/**
 * WEMP-M09-SPEC-001 (M09-M1). The Module 09-owned payment aggregate
 * identifier: a stable UUIDv7 value. Each payment is associated with
 * exactly one order (orderId) — the payment does not duplicate any
 * order-level data (A-03 storage isolation).
 */
export class PaymentId extends UuidV7 {}

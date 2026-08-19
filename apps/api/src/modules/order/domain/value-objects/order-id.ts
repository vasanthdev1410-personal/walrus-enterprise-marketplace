import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

/**
 * WEMP-M08-SPEC-001 (decision D-02). The Module 08-owned order aggregate
 * identifier: a stable UUIDv7 value. Each order is owned by exactly one
 * customer profile (customerProfileId) — identical to M07 D-02.
 */
export class OrderId extends UuidV7 {}

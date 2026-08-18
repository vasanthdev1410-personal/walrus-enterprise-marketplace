import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

/**
 * WEMP-M07-SPEC-001 (decision D-02). The Module 07-owned cart aggregate
 * identifier: a stable UUIDv7 value. One cart per customer profile
 * (customerProfileId) in Phase 1 (D-01: no guest carts).
 */
export class CartId extends UuidV7 {}

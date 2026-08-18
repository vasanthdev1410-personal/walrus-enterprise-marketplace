import type { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import type { CartId } from '../value-objects/cart-id';
import type { CartState } from '../value-objects/cart-state';

/**
 * WEMP-M07-SPEC-001 (decisions D-01/D-02/D-04/D-07/D-18). The Module
 * 07-owned shopping cart aggregate root: one active cart per customer
 * profile (D-02). Cart is the aggregate root keyed by customerProfileId.
 * Lifecycle states: ACTIVE, CHECKED_OUT, ARCHIVED, AUTO_EXPIRED (D-07).
 * Maximum lines and total items are configurable (D-18). The only identity
 * linkage is the logical customerProfileId reference to the Module 06
 * Customer profile — no PII is duplicated (A-03/A-05).
 */
export interface CartProperties {
  readonly cartId: CartId;
  /** Logical reference to the Module 06 CustomerProfile (D-02). */
  readonly customerProfileId: UuidV7;
  readonly state: CartState;
  readonly totalLines: number;
  readonly totalItems: number;
  readonly aggregateVersion: AggregateVersion;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly expiresAt?: Date;
  readonly correlationId?: CorrelationIdentifier;
}

export class Cart {
  public readonly properties: Readonly<CartProperties>;

  public constructor(properties: CartProperties) {
    if (!Number.isSafeInteger(properties.totalLines) || properties.totalLines < 0) {
      throw new Error('Cart totalLines must be a non-negative safe integer');
    }
    if (!Number.isSafeInteger(properties.totalItems) || properties.totalItems < 0) {
      throw new Error('Cart totalItems must be a non-negative safe integer');
    }
    if (properties.totalItems < properties.totalLines) {
      throw new Error('Cart totalItems cannot be less than totalLines');
    }
    if (properties.updatedAt < properties.createdAt) {
      throw new Error('Cart updatedAt cannot precede createdAt');
    }
    if (properties.expiresAt !== undefined && properties.expiresAt < properties.createdAt) {
      throw new Error('Cart expiresAt cannot precede createdAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}

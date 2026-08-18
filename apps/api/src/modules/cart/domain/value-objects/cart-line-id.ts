import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

/**
 * WEMP-M07-SPEC-001 (decision D-03). The identity of a single cart line
 * item. Each line is uniquely identified within a cart by its skuId; the
 * CartLineId is a stable surrogate key for the line record itself.
 */
export class CartLineId extends UuidV7 {}

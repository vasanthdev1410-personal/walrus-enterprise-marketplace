import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

/**
 * WEMP-M08-SPEC-001 (decision D-01). The identity of a single order line
 * item. Each line is uniquely identified within an order; the OrderLineId
 * is a stable surrogate key for the line record itself.
 */
export class OrderLineId extends UuidV7 {}

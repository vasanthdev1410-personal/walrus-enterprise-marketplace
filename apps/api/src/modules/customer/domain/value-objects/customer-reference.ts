import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';

/**
 * WEMP-M06-SPEC-001 §11 (decision D-13). A stable, logical customer
 * reference: the Module 06-owned customerProfileId. Consumed by future M07
 * (cart) and M08 (orders) modules to associate work with a customer without
 * ever reading Module 06 storage directly. Port-only in M06-M1; the shape
 * becomes normative at each consuming module's spec approval.
 */
export class CustomerReference extends UuidV7 {}

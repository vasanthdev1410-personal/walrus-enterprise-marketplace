import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { CustomerAuditRecord } from '../entities/customer-audit-record';
import type { CustomerProfile } from '../entities/customer-profile';
import type { CustomerStateTransition } from '../entities/customer-state-transition';

/**
 * WEMP-M06-SPEC-001 §14 (M06-M5, decision D-07). Admin customer read
 * repository — a SEPARATE port from `CustomerProfileRepository` so the
 * aggregate repository keeps its A-06 isolation guarantee (no wildcard
 * cross-customer shortcuts on the mutation/aggregate path). Only the admin
 * read application service consumes this port, gated on the Module 02 admin
 * grants (`customer.read` / `customer.audit.view`) before any query runs.
 * All reads are read-only and return summary facts — never raw PII beyond
 * logical identity references (D-08).
 */
export interface CustomerAdminReadRepository {
  /** Non-enumerating admin list of all customer profiles (summary rows). */
  findAllProfiles(): Promise<readonly CustomerProfile[]>;
  findProfile(customerProfileId: UuidV7): Promise<CustomerProfile | null>;
  findAuditRecords(customerProfileId: UuidV7): Promise<readonly CustomerAuditRecord[]>;
  findTransitions(customerProfileId: UuidV7): Promise<readonly CustomerStateTransition[]>;
}

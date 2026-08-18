import { Injectable } from '@nestjs/common';
import type { CustomerRetentionConfigurationPort } from '../../application/ports/customer-retention-configuration.port';
import type { CustomerRetentionRule } from '../../domain/policy/customer-retention.policy';

/**
 * WEMP-M06-SPEC-001 §19 (decision D-15; durations RECORDED 2026-08-17).
 * The D-15 retention configuration for Module 06, sourced from a single
 * configuration point (here: the recorded owner-approved values, read from
 * environment configuration with the recorded values as the approved
 * defaults). Business logic never hard-codes durations; this adapter is
 * the configuration source. Fail closed: any category without a resolvable
 * rule returns undefined so the processor aborts rather than delete.
 *
 * Recorded values (owner-approved 2026-08-17):
 *   - CustomerStateTransition: 2555 days
 *   - CustomerAuditRecord: 2555 days
 *
 * These apply ONLY to the M06 records the approved architecture explicitly
 * requires to be retained for audit/business/legal history (D-15) — never
 * to credentials, tokens, sessions, unnecessary personal data, deleted
 * address data beyond approved retention, or Module 01 identity/security
 * data (A-04). Enforcement is by the application-layer retention processor
 * (M06-M3); this adapter only supplies the configuration.
 */
@Injectable()
export class RecordedCustomerRetentionConfigurationAdapter implements CustomerRetentionConfigurationPort {
  private readonly rules: ReadonlyMap<string, CustomerRetentionRule>;

  public constructor() {
    const retentionDays = Number(process.env.CUSTOMER_RECORD_RETENTION_DAYS ?? '2555');
    this.rules = new Map([
      ['CustomerStateTransition', { category: 'CustomerStateTransition', retentionDays }],
      ['CustomerAuditRecord', { category: 'CustomerAuditRecord', retentionDays }],
    ]);
  }

  public findRule(category: string): Promise<CustomerRetentionRule | undefined> {
    return Promise.resolve(this.rules.get(category));
  }
}

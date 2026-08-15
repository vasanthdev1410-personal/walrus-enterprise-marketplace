import { Injectable } from '@nestjs/common';
import type { InventoryRetentionConfigurationPort } from '../../application/ports/inventory-retention-configuration.port';
import type { InventoryRetentionRule } from '../../domain/policy/inventory-retention.policy';

/**
 * WEMP-M05-SPEC-001 §21 (decision D-12; durations RECORDED 2026-08-15).
 * The D-12 retention configuration for Module 05, sourced from a single
 * configuration point (here: the recorded owner-approved values, read from
 * environment configuration with the recorded values as the approved
 * defaults). Business logic never hard-codes durations; this adapter is
 * the configuration source. Fail closed: any category without a resolvable
 * rule returns undefined so the processor aborts rather than delete.
 *
 * Recorded values (owner-approved 2026-08-15):
 *   - InventoryMovementRecord: 2555 days
 *   - InventoryAuditRecord: 2555 days
 */
@Injectable()
export class RecordedRetentionConfigurationAdapter implements InventoryRetentionConfigurationPort {
  private readonly rules: ReadonlyMap<string, InventoryRetentionRule>;

  public constructor() {
    const movement = Number(process.env.INVENTORY_MOVEMENT_RETENTION_DAYS ?? '2555');
    const audit = Number(process.env.INVENTORY_AUDIT_RETENTION_DAYS ?? '2555');
    this.rules = new Map([
      ['InventoryMovementRecord', { category: 'InventoryMovementRecord', retentionDays: movement }],
      ['InventoryAuditRecord', { category: 'InventoryAuditRecord', retentionDays: audit }],
    ]);
  }

  public findRule(category: string): Promise<InventoryRetentionRule | undefined> {
    return Promise.resolve(this.rules.get(category));
  }
}

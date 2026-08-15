import { Injectable } from '@nestjs/common';
import type { InventoryThresholdConfigurationPort } from '../../application/ports/inventory-threshold-configuration.port';
import { InventoryThresholdConfig } from '../../domain/value-objects/inventory-threshold-config';

/**
 * WEMP-M05-SPEC-001 §22 (decision D-14; values RECORDED 2026-08-15). The
 * D-14 low/out-of-stock threshold configuration for Module 05, sourced from
 * a single configuration point (here: the recorded owner-approved values,
 * read from environment configuration with the recorded values as the
 * approved defaults). Business logic never hard-codes thresholds; this
 * adapter is the configuration source. Fail closed: any invalid or missing
 * value resolves to undefined so label enforcement is disabled (no label
 * without valid configured thresholds — D-14).
 *
 * Recorded values (owner-approved 2026-08-15, WEMP-M05-APPROVAL-001 §3):
 *   - LOW_STOCK_THRESHOLD = 1
 *   - OUT_OF_STOCK_THRESHOLD = 0
 */
@Injectable()
export class RecordedThresholdConfigurationAdapter implements InventoryThresholdConfigurationPort {
  private readonly config: InventoryThresholdConfig | undefined;

  public constructor() {
    const lowStock = Number(process.env.LOW_STOCK_THRESHOLD ?? '1');
    const outOfStock = Number(process.env.OUT_OF_STOCK_THRESHOLD ?? '0');
    try {
      this.config = new InventoryThresholdConfig({
        lowStockThreshold: lowStock,
        outOfStockThreshold: outOfStock,
      });
    } catch {
      // Fail closed (D-14): an invalid or unparseable configuration disables
      // label enforcement rather than deriving labels from bad values.
      this.config = undefined;
    }
  }

  public findThresholdConfig(): Promise<InventoryThresholdConfig | undefined> {
    return Promise.resolve(this.config);
  }
}

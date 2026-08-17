import { Inject, Injectable } from '@nestjs/common';
import type { UuidV7GenerationPort } from '../../../../../identity-authentication/application/ports/application-runtime.port';
import { UUID_V7_GENERATOR } from '../../../../../identity-authentication/identity-authentication.tokens';
import { PrismaService } from '../../../../../identity-authentication/infrastructure/persistence/prisma/prisma.service';
import { InventoryApplicationError } from '../../../../application/errors/inventory-application.error';
import type {
  InventoryConfigRepository,
  InventoryThresholdConfigSnapshot,
  SaveInventoryThresholdConfigCommand,
} from '../../../../application/ports/inventory-config-repository.port';
import { RecordedThresholdConfigurationAdapter } from '../../../../infrastructure/configuration/recorded-threshold-configuration.adapter';
import { InventoryThresholdConfig } from '../../../../domain/value-objects/inventory-threshold-config';

const LOW_STOCK_KEY = 'LOW_STOCK_THRESHOLD';
const OUT_OF_STOCK_KEY = 'OUT_OF_STOCK_THRESHOLD';

/**
 * WEMP-M05-SPEC-001 §22 (decision D-14; values RECORDED 2026-08-15,
 * M05-M5). Prisma-backed implementation of the writable D-14 threshold
 * configuration over `inventory_config_records`. The two platform-defined
 * keys (LOW_STOCK_THRESHOLD / OUT_OF_STOCK_THRESHOLD) are stored as ACTIVE
 * rows and read together; both must be present and valid for the
 * configuration to resolve. Fail closed: a missing row set, a partial set,
 * or an invalid value resolves to undefined — never a fabricated
 * configuration (D-14).
 *
 * Before an admin has written the surface, the repository falls back to the
 * recorded owner-approved defaults (D-14, RECORDED 2026-08-15 — read from
 * environment configuration with the recorded values as the approved
 * defaults, WEMP-M05-M3 wiring) so label enforcement is not disabled on a
 * fresh deployment. Once a PATCH persists rows, the stored values are the
 * single source of truth for both label derivation and the admin surface.
 *
 * The optimistic version is the maximum row `aggregateVersion` across the
 * two keys (0 when no rows exist). `saveThresholdConfig` verifies the
 * caller's expectedVersion against that snapshot inside a transaction and
 * bumps both rows together, so a concurrent admin update fails closed
 * (INVENTORY_STATE_CONFLICT) instead of silently overwriting.
 */
@Injectable()
export class PrismaInventoryConfigRepository implements InventoryConfigRepository {
  public constructor(
    private readonly prisma: PrismaService,
    @Inject(UUID_V7_GENERATOR) private readonly identifiers: UuidV7GenerationPort,
    private readonly recordedDefaults: RecordedThresholdConfigurationAdapter,
  ) {}

  public async findThresholdConfig(): Promise<InventoryThresholdConfig | undefined> {
    const snapshot = await this.findThresholdConfigSnapshot();
    return snapshot?.config;
  }

  public async findThresholdConfigSnapshot(): Promise<
    InventoryThresholdConfigSnapshot | undefined
  > {
    const rows = await this.prisma.inventoryConfigRecord.findMany({
      where: { state: 'ACTIVE', configKey: { in: [LOW_STOCK_KEY, OUT_OF_STOCK_KEY] } },
    });
    if (rows.length === 0) {
      // No admin-managed rows yet: fall back to the recorded owner-approved
      // defaults (D-14, RECORDED 2026-08-15) at version 0. Fail closed on
      // invalid environment values — never a fabricated configuration.
      const config = await this.recordedDefaults.findThresholdConfig();
      return config === undefined ? undefined : { config, version: 0 };
    }
    const low = rows.find((row) => row.configKey === LOW_STOCK_KEY);
    const out = rows.find((row) => row.configKey === OUT_OF_STOCK_KEY);
    if (low === undefined || out === undefined) {
      // Fail closed (D-14): a partial configuration is never treated as
      // valid.
      return undefined;
    }
    const lowValue = Number(low.configValue);
    const outValue = Number(out.configValue);
    let config: InventoryThresholdConfig;
    try {
      config = new InventoryThresholdConfig({
        lowStockThreshold: lowValue,
        outOfStockThreshold: outValue,
      });
    } catch {
      // Fail closed (D-14): an invalid stored value disables the config.
      return undefined;
    }
    const version = Math.max(low.aggregateVersion, out.aggregateVersion);
    return { config, version };
  }

  public async saveThresholdConfig(
    command: SaveInventoryThresholdConfigCommand,
  ): Promise<InventoryThresholdConfigSnapshot> {
    // Validate before touching storage (D-14): an invalid pair must never
    // be persisted.
    let config: InventoryThresholdConfig;
    try {
      config = new InventoryThresholdConfig({
        lowStockThreshold: command.lowStockThreshold,
        outOfStockThreshold: command.outOfStockThreshold,
      });
    } catch {
      throw new InventoryApplicationError('INVENTORY_VALIDATION_FAILED');
    }

    await this.prisma.$transaction(async (tx) => {
      const rows = await tx.inventoryConfigRecord.findMany({
        where: { state: 'ACTIVE', configKey: { in: [LOW_STOCK_KEY, OUT_OF_STOCK_KEY] } },
      });
      const currentVersion =
        rows.length === 0 ? 0 : Math.max(...rows.map((row) => row.aggregateVersion));
      if (currentVersion !== command.expectedVersion) {
        throw new InventoryApplicationError('INVENTORY_STATE_CONFLICT');
      }
      const nextVersion = currentVersion + 1;
      const now = command.now;
      for (const [key, value] of [
        [LOW_STOCK_KEY, String(command.lowStockThreshold)],
        [OUT_OF_STOCK_KEY, String(command.outOfStockThreshold)],
      ] as const) {
        await tx.inventoryConfigRecord.upsert({
          where: { configKey_state: { configKey: key, state: 'ACTIVE' } },
          create: {
            configId: this.identifiers.next().value,
            configKey: key,
            configValue: value,
            state: 'ACTIVE',
            aggregateVersion: nextVersion,
            changedByIdentityId: command.changedByIdentityId.value,
            createdAt: now,
            updatedAt: now,
          },
          update: {
            configValue: value,
            aggregateVersion: nextVersion,
            changedByIdentityId: command.changedByIdentityId.value,
            updatedAt: now,
          },
        });
      }
    });

    return { config, version: command.expectedVersion + 1 };
  }
}

import { Inject, Injectable } from '@nestjs/common';
import type { NonProductionRateLimiterPort } from '../../../identity-authentication/application/ports/non-production-rate-limiter.port';
import type { ApiIdempotencyService } from '../../../identity-authentication/application/services/api-idempotency.service';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { API_IDEMPOTENCY } from '../../../identity-authentication/identity-authentication.tokens';
import { RATE_LIMITER } from '../../../identity-authentication/presentation/authentication.tokens';
import { INVENTORY_ADMIN_AUTHORIZATION } from '../../inventory.tokens';
import type { InventoryAdminAuthorizationPort } from '../ports/inventory-admin-authorization.port';
import type {
  InventoryConfigRepository,
  InventoryThresholdConfigSnapshot,
} from '../ports/inventory-config-repository.port';
import { InventoryApplicationError } from '../errors/inventory-application.error';
import { INVENTORY_CONFIG_REPOSITORY } from '../../inventory.tokens';

/**
 * WEMP-M05-SPEC-001 §22/§15 (M05-M5, decision D-14). Administrative
 * low/out-of-stock threshold configuration. The D-14 thresholds are
 * platform-defined and admin-managed — never seller-configurable, never
 * hard-coded, fail closed when missing/invalid. Reads require the approved
 * `inventory.audit.view` grant; writes require `inventory.adjust.admin`
 * (D-05, no hidden override). Both are rate-limited under the recorded D-11
 * admin class (50/hour) and the PATCH is idempotent (A-11, reusing
 * ApiIdempotencyRecord). The version guard (D-14 version-aware) rejects
 * concurrent admin updates with INVENTORY_STATE_CONFLICT.
 */
@Injectable()
export class InventoryConfigApplicationService {
  public constructor(
    @Inject(INVENTORY_CONFIG_REPOSITORY)
    private readonly config: InventoryConfigRepository,
    @Inject(INVENTORY_ADMIN_AUTHORIZATION)
    private readonly adminAuthorization: InventoryAdminAuthorizationPort,
    @Inject(RATE_LIMITER)
    private readonly rateLimiter: NonProductionRateLimiterPort,
    @Inject(API_IDEMPOTENCY)
    private readonly idempotency: ApiIdempotencyService,
  ) {}

  /** WEMP-M05-SPEC-001 §15. Admin reads the current D-14 threshold configuration. */
  public async getThresholdConfig(
    adminIdentityId: UuidV7,
  ): Promise<InventoryThresholdConfigSnapshot> {
    const rateLimit = await this.rateLimiter.consume({
      key: `inventory-config-admin:${adminIdentityId.value}`,
      limit: 50,
      windowSeconds: 3600,
    });
    if (!rateLimit.allowed) {
      throw new InventoryApplicationError('INVENTORY_RATE_LIMITED');
    }
    const granted = await this.adminAuthorization.isGranted(
      adminIdentityId,
      'inventory.audit.view',
    );
    if (!granted) {
      throw new InventoryApplicationError('INVENTORY_ADMIN_AUTHORIZATION_DENIED');
    }
    const snapshot = await this.config.findThresholdConfigSnapshot();
    if (snapshot === undefined) {
      // Fail closed (D-14): no valid configuration to report.
      throw new InventoryApplicationError('INVENTORY_THRESHOLD_CONFIG_UNAVAILABLE');
    }
    return snapshot;
  }

  /** WEMP-M05-SPEC-001 §15. Admin updates the D-14 thresholds (version-checked, idempotent). */
  public async updateThresholdConfig(
    command: UpdateInventoryThresholdConfigCommand,
  ): Promise<InventoryThresholdConfigSnapshot> {
    const rateLimit = await this.rateLimiter.consume({
      key: `inventory-config-admin:${command.actorIdentityId.value}`,
      limit: 50,
      windowSeconds: 3600,
    });
    if (!rateLimit.allowed) {
      throw new InventoryApplicationError('INVENTORY_RATE_LIMITED');
    }
    const granted = await this.adminAuthorization.isGranted(
      command.actorIdentityId,
      'inventory.adjust.admin',
    );
    if (!granted) {
      throw new InventoryApplicationError('INVENTORY_ADMIN_AUTHORIZATION_DENIED');
    }
    return this.idempotency.execute<InventoryThresholdConfigSnapshot>({
      scope: 'inventory-config',
      operationType: 'inventory.config.update',
      idempotencyKey: command.idempotencyKey,
      request: command,
      execute: async () => {
        const now = new Date();
        return this.config.saveThresholdConfig({
          lowStockThreshold: command.lowStockThreshold,
          outOfStockThreshold: command.outOfStockThreshold,
          expectedVersion: command.expectedVersion,
          changedByIdentityId: command.actorIdentityId,
          now,
        });
      },
    });
  }
}

export interface UpdateInventoryThresholdConfigCommand {
  readonly actorIdentityId: UuidV7;
  readonly lowStockThreshold: number;
  readonly outOfStockThreshold: number;
  /** Optimistic concurrency guard (D-14); 0 = initial configuration. */
  readonly expectedVersion: number;
  /** Caller-supplied idempotency key — mandatory (A-11). */
  readonly idempotencyKey: string;
}

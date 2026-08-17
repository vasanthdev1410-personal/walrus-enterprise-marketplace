import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Patch,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { UuidV7 } from '../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { AuthenticatedRequest } from '../../identity-authentication/presentation/authentication-context';
import { Aal2SessionGuard } from '../../identity-authentication/presentation/guards/aal2-session.guard';
import { NonProductionRateLimiterGuard } from '../../identity-authentication/presentation/guards/non-production-rate-limiter.guard';
import { RateLimit } from '../../identity-authentication/presentation/decorators/rate-limit.decorator';
import {
  assertIdempotencyKey,
  noStore,
  success,
} from '../../identity-authentication/presentation/http-contract';
import {
  AuthorizationPermissionGuard,
  RequiresPermission,
} from '../../authorization/presentation/guards/authorization-permission.guard';
import { INVENTORY_CONFIG_APPLICATION_SERVICE } from '../inventory.tokens';
import type { InventoryConfigApplicationService } from '../application/services/inventory-config-application.service';
import { ThresholdConfigPatchDto } from './dto/inventory.dto';
import { mapInventoryError } from './inventory-error-mapping';

/**
 * WEMP-M05-SPEC-001 §15/§22 (M05-M5, decision D-14). Admin-managed
 * inventory configuration (low/out-of-stock thresholds). GET requires
 * `inventory.audit.view`; PATCH requires `inventory.adjust.admin` — both
 * through the Module 02 permission guard, no role-only bypass, and the
 * application service re-checks the grant (defense in depth). The
 * configuration is platform-defined and never seller-configurable; PATCH is
 * version-checked (D-14), idempotent (A-11), and rate-limited under the
 * recorded D-11 admin class (50/hour). Errors are non-disclosing.
 */
@ApiTags('Admin Inventory Config')
@Controller('admin/inventory-config')
@UseGuards(Aal2SessionGuard, NonProductionRateLimiterGuard)
export class InventoryConfigController {
  public constructor(
    @Inject(INVENTORY_CONFIG_APPLICATION_SERVICE)
    private readonly config: InventoryConfigApplicationService,
  ) {}

  @Get()
  @UseGuards(AuthorizationPermissionGuard)
  @RequiresPermission('inventory.audit.view')
  @ApiOperation({
    operationId: 'M05-ADMIN-INVENTORY-CONFIG-GET',
    summary: 'Read the D-14 low/out-of-stock threshold configuration',
  })
  public async getConfig(
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const snapshot = await this.config.getThresholdConfig(
        new UuidV7(request.authentication.subject),
      );
      noStore(response);
      response.status(HttpStatus.OK).json(
        success({
          config: {
            lowStockThreshold: snapshot.config.properties.lowStockThreshold,
            outOfStockThreshold: snapshot.config.properties.outOfStockThreshold,
            version: snapshot.version,
          },
        }),
      );
    } catch (error) {
      mapInventoryError(error);
    }
  }

  @Patch()
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 50, windowSeconds: 3600 })
  @UseGuards(AuthorizationPermissionGuard)
  @RequiresPermission('inventory.adjust.admin')
  @ApiOperation({
    operationId: 'M05-ADMIN-INVENTORY-CONFIG-UPDATE',
    summary: 'Update the D-14 thresholds (version-checked, idempotent)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async updateConfig(
    @Body() body: ThresholdConfigPatchDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    try {
      const snapshot = await this.config.updateThresholdConfig({
        actorIdentityId: new UuidV7(request.authentication.subject),
        lowStockThreshold: body.lowStockThreshold,
        outOfStockThreshold: body.outOfStockThreshold,
        expectedVersion: body.expectedVersion,
        idempotencyKey,
      });
      noStore(response);
      response.status(HttpStatus.OK).json(
        success({
          config: {
            lowStockThreshold: snapshot.config.properties.lowStockThreshold,
            outOfStockThreshold: snapshot.config.properties.outOfStockThreshold,
            version: snapshot.version,
          },
        }),
      );
    } catch (error) {
      mapInventoryError(error);
    }
  }
}

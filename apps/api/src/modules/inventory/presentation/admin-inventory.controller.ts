import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
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
import { InventoryQuantity } from '../domain/value-objects/inventory-quantity';
import {
  INVENTORY_APPLICATION_SERVICE,
  INVENTORY_READ_APPLICATION_SERVICE,
} from '../inventory.tokens';
import type { InventoryApplicationService } from '../application/services/inventory-application.service';
import type { InventoryReadApplicationService } from '../application/services/inventory-read-application.service';
import { correlationField } from './correlation';
import { AdminCorrectionDto } from './dto/inventory.dto';
import { mapInventoryError } from './inventory-error-mapping';

/**
 * WEMP-M05-SPEC-001 §15 (M05-M5). Admin inventory API.
 *
 * Authorization model (WEMP-M05-AUTHZ-001, decision D-05): every route
 * requires an ordinary AAL2 session AND the exact approved Module 02
 * administrative permission via AuthorizationPermissionGuard —
 * inventory.audit.view for reads, inventory.adjust.admin for corrections.
 * There is no role-only bypass and no SUPER_ADMIN implicit grant: access is
 * decided by the Module 02 engine against the approved role catalog, and the
 * application services re-check the grant (defense in depth). A correction
 * requires a mandatory reason reference (D-08) and an Idempotency-Key (A-11);
 * rate limits follow the recorded D-11 admin class (50/hour). Errors are
 * non-enumerating and never disclose inventory, ledger, policy, or ownership
 * internals.
 */
@ApiTags('Admin Inventory')
@Controller('admin/inventory')
@UseGuards(Aal2SessionGuard, NonProductionRateLimiterGuard)
export class AdminInventoryController {
  public constructor(
    @Inject(INVENTORY_APPLICATION_SERVICE)
    private readonly inventory: InventoryApplicationService,
    @Inject(INVENTORY_READ_APPLICATION_SERVICE)
    private readonly read: InventoryReadApplicationService,
  ) {}

  @Get()
  @UseGuards(AuthorizationPermissionGuard)
  @RequiresPermission('inventory.audit.view')
  @ApiOperation({
    operationId: 'M05-ADMIN-INVENTORY-LIST',
    summary: 'List stock pools with derived labels (non-enumerating admin filter)',
  })
  public async listInventory(
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const inventory = await this.read.listAdminInventory(
        new UuidV7(request.authentication.subject),
      );
      noStore(response);
      response.status(HttpStatus.OK).json(success({ inventory }));
    } catch (error) {
      mapInventoryError(error);
    }
  }

  @Get(':skuId')
  @UseGuards(AuthorizationPermissionGuard)
  @RequiresPermission('inventory.audit.view')
  @ApiOperation({
    operationId: 'M05-ADMIN-INVENTORY-DETAIL',
    summary: 'Read stock detail + audit records for a SKU',
  })
  public async inventoryDetail(
    @Param('skuId') skuId: string,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const detail = await this.read.getAdminSkuDetail(
        new UuidV7(request.authentication.subject),
        parseSkuParam(skuId),
      );
      noStore(response);
      response.status(HttpStatus.OK).json(success({ inventory: detail }));
    } catch (error) {
      mapInventoryError(error);
    }
  }

  @Get(':skuId/movements')
  @UseGuards(AuthorizationPermissionGuard)
  @RequiresPermission('inventory.audit.view')
  @ApiOperation({
    operationId: 'M05-ADMIN-INVENTORY-MOVEMENTS',
    summary: 'Read the movement ledger for a SKU',
  })
  public async inventoryMovements(
    @Param('skuId') skuId: string,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const movements = await this.read.getAdminMovementLedger(
        new UuidV7(request.authentication.subject),
        parseSkuParam(skuId),
      );
      noStore(response);
      response.status(HttpStatus.OK).json(success({ movements }));
    } catch (error) {
      mapInventoryError(error);
    }
  }

  @Post(':skuId/corrections')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 50, windowSeconds: 3600 })
  @UseGuards(AuthorizationPermissionGuard)
  @RequiresPermission('inventory.adjust.admin')
  @ApiOperation({
    operationId: 'M05-ADMIN-INVENTORY-CORRECT',
    summary: 'Apply an administrative stock correction (COUNT_CORRECTION, mandatory reason)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async correct(
    @Param('skuId') skuId: string,
    @Body() body: AdminCorrectionDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    try {
      const result = await this.inventory.adminCorrectStock({
        actorIdentityId: new UuidV7(request.authentication.subject),
        skuId: parseSkuParam(skuId),
        targetOnHand: new InventoryQuantity(body.targetOnHand),
        expectedVersion: body.expectedVersion,
        reasonReference: body.reasonReference,
        idempotencyKey,
        ...correlationField(),
      });
      noStore(response);
      response.status(HttpStatus.OK).json(success({ inventory: result }));
    } catch (error) {
      mapInventoryError(error);
    }
  }
}

/** Validates the `:skuId` path parameter is a well-formed UUIDv7 (404 otherwise). */
function parseSkuParam(value: string): UuidV7 {
  try {
    return new UuidV7(value);
  } catch {
    throw new NotFoundException('INVENTORY_NOT_FOUND');
  }
}

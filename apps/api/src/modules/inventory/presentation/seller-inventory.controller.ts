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
import { ApiHeader, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
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
import { RequiresPermission } from '../../authorization/presentation/guards/authorization-permission.guard';
import { InventoryDelta } from '../domain/value-objects/inventory-delta';
import {
  INVENTORY_APPLICATION_SERVICE,
  INVENTORY_READ_APPLICATION_SERVICE,
} from '../inventory.tokens';
import type { InventoryApplicationService } from '../application/services/inventory-application.service';
import type { InventoryReadApplicationService } from '../application/services/inventory-read-application.service';
import { correlationField } from './correlation';
import { SellerMovementDto } from './dto/inventory.dto';
import { mapInventoryError } from './inventory-error-mapping';
import {
  InventorySellerPermissionGuard,
  type InventorySellerScopedRequest,
} from './guards/inventory-seller-permission.guard';

/**
 * WEMP-M05-SPEC-001 §15 (M05-M5). Seller inventory self-service API.
 *
 * Authorization model (derived from the approved WEMP-M05-AUTHZ-001 matrix,
 * decision D-05): every route requires an ordinary AAL2 session AND the
 * exact approved Module 02 self-service permission (inventory.read /
 * inventory.adjust.self) via InventorySellerPermissionGuard, which resolves
 * the seller organization owning the target SKU through the Module 04 facts
 * (D-10) and validates the caller's ACTIVE association through the Module 02
 * engine's organization-scoped path (third ownership resolver). The
 * application services additionally re-check ownership and the PUBLISHED
 * gate — defense in depth. Cross-seller access and unknown/non-PUBLISHED
 * SKUs fail closed and are indistinguishable (anti-enumeration, D-08/D-15).
 *
 * Every mutation requires an Idempotency-Key header (reusing Module 01
 * ApiIdempotencyRecord). Rate limits follow the recorded D-11 policy
 * (adjustments 30/hour; the guard's class-level limiter provides the coarse
 * per-route net). Errors are non-enumerating and never disclose inventory,
 * ledger, policy, or ownership internals.
 */
@ApiTags('Seller Inventory')
@Controller('seller/inventory')
@UseGuards(Aal2SessionGuard, NonProductionRateLimiterGuard)
export class SellerInventoryController {
  public constructor(
    @Inject(INVENTORY_APPLICATION_SERVICE)
    private readonly inventory: InventoryApplicationService,
    @Inject(INVENTORY_READ_APPLICATION_SERVICE)
    private readonly read: InventoryReadApplicationService,
  ) {}

  @Get()
  @UseGuards(InventorySellerPermissionGuard)
  @RequiresPermission('inventory.read')
  @ApiQuery({
    name: 'sellerProfileId',
    required: true,
    example: '0191310f-789a-7123-8123-000000000003',
  })
  @ApiOperation({
    operationId: 'M05-SELLER-INVENTORY-LIST',
    summary: 'List own-SKU stock with derived labels (non-enumerating)',
  })
  public async listInventory(
    @Req() request: InventorySellerScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const inventory = await this.read.listOwnInventory(
        request.inventorySellerContext.sellerProfileId,
        new UuidV7(request.authentication.subject),
      );
      noStore(response);
      response.status(HttpStatus.OK).json(success({ inventory }));
    } catch (error) {
      mapInventoryError(error);
    }
  }

  @Get(':skuId')
  @UseGuards(InventorySellerPermissionGuard)
  @RequiresPermission('inventory.read')
  @ApiQuery({
    name: 'sellerProfileId',
    required: true,
    example: '0191310f-789a-7123-8123-000000000003',
  })
  @ApiOperation({
    operationId: 'M05-SELLER-INVENTORY-DETAIL',
    summary: 'Read own-SKU stock detail (onHand/reserved/available)',
  })
  public async inventoryDetail(
    @Param('skuId') skuId: string,
    @Req() request: InventorySellerScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const detail = await this.read.getOwnSkuDetail(
        parseSkuParam(skuId),
        request.inventorySellerContext.sellerProfileId,
        new UuidV7(request.authentication.subject),
      );
      noStore(response);
      response.status(HttpStatus.OK).json(success({ inventory: detail }));
    } catch (error) {
      mapInventoryError(error);
    }
  }

  @Get(':skuId/movements')
  @UseGuards(InventorySellerPermissionGuard)
  @RequiresPermission('inventory.read')
  @ApiQuery({
    name: 'sellerProfileId',
    required: true,
    example: '0191310f-789a-7123-8123-000000000003',
  })
  @ApiOperation({
    operationId: 'M05-SELLER-INVENTORY-MOVEMENTS',
    summary: 'Read own movement ledger (non-disclosing)',
  })
  public async inventoryMovements(
    @Param('skuId') skuId: string,
    @Req() request: InventorySellerScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const movements = await this.read.getOwnMovementLedger(
        parseSkuParam(skuId),
        request.inventorySellerContext.sellerProfileId,
        new UuidV7(request.authentication.subject),
      );
      noStore(response);
      response.status(HttpStatus.OK).json(success({ movements }));
    } catch (error) {
      mapInventoryError(error);
    }
  }

  @Post(':skuId/movements')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 30, windowSeconds: 3600 })
  @UseGuards(InventorySellerPermissionGuard)
  @RequiresPermission('inventory.adjust.self')
  @ApiOperation({
    operationId: 'M05-SELLER-INVENTORY-ADJUST',
    summary: 'Apply a seller stock adjustment (STOCK_IN/STOCK_OUT/ADJUSTMENT, owner-only)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async adjust(
    @Param('skuId') skuId: string,
    @Body() body: SellerMovementDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: InventorySellerScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    try {
      const result = await this.inventory.adjustStock({
        sellerProfileId: request.inventorySellerContext.sellerProfileId,
        actorIdentityId: new UuidV7(request.authentication.subject),
        skuId: parseSkuParam(skuId),
        movementType: body.movementType,
        delta: new InventoryDelta(body.delta),
        ...(body.direction === undefined ? {} : { direction: body.direction }),
        expectedVersion: body.expectedVersion,
        ...(body.reasonReference === undefined ? {} : { reasonReference: body.reasonReference }),
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

/** Validates the `:skuId` path parameter is a well-formed UUIDv7 (400 otherwise). */
function parseSkuParam(value: string): UuidV7 {
  try {
    return new UuidV7(value);
  } catch {
    throw new NotFoundException('INVENTORY_NOT_FOUND');
  }
}

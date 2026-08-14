import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Patch,
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
import {
  AuthorizationPermissionGuard,
  RequiresPermission,
} from '../../authorization/presentation/guards/authorization-permission.guard';
import type { ProductApplicationService } from '../application/services/product-application.service';
import type { ProductMediaApplicationService } from '../application/services/product-media-application.service';
import type { ProductReadApplicationService } from '../application/services/product-read-application.service';
import type { ProductVariantSkuApplicationService } from '../application/services/product-variant-sku-application.service';
import { Price } from '../domain/value-objects/price';
import { SkuCode } from '../domain/value-objects/sku-code';
import {
  PRODUCT_APPLICATION_SERVICE,
  PRODUCT_CATEGORY_READ_SERVICE,
  PRODUCT_MEDIA_APPLICATION_SERVICE,
  PRODUCT_READ_APPLICATION_SERVICE,
  PRODUCT_VARIANT_SKU_APPLICATION_SERVICE,
} from '../product-catalog.tokens';
import type { ProductCategoryReadService } from '../application/services/product-media-application.service';
import { correlationField } from './correlation';
import {
  AddSkuDto,
  AddVariantDto,
  CloseProductDto,
  CreateProductDto,
  ProductVersionedDto,
  RecordMediaDto,
  UpdateProductDto,
} from './dto/product.dto';
import { mapProductError } from './product-error-mapping';
import {
  ProductSellerPermissionGuard,
  type ProductSellerScopedRequest,
} from './guards/product-seller-permission.guard';

/**
 * WEMP-M04-SPEC-001 §18 (M04-M5). Seller product self-service API.
 *
 * Authorization model (derived from the approved WEMP-M04-AUTHZ-001 matrix
 * and decision D-11): every route requires an ordinary AAL2 session AND the
 * exact approved Module 02 self-service permission (product.create /
 * product.read / product.update / product.submit / product.close /
 * product.media.manage / product.media.read / product.sku.manage /
 * catalog.category.read) via ProductSellerPermissionGuard, which validates
 * the target seller through the Module 02 engine's organization-scoped path
 * (second ownership resolver). The application services additionally
 * re-check the OWNER association (D-01) and the listing gate (§26) — defense
 * in depth. MEMBER associations are read-only (D-01).
 *
 * Every mutation requires an Idempotency-Key header (Module 01
 * ApiIdempotencyRecord is reused; no second system). Rate limits follow the
 * approved D-15 policy: create/submit 10/hour; update/media/variant/SKU
 * 30/hour. Errors are non-enumerating and never disclose catalog, policy,
 * moderation, or media internals.
 */
@ApiTags('Seller Product Catalog')
@Controller('seller/products')
@UseGuards(Aal2SessionGuard, NonProductionRateLimiterGuard)
export class SellerProductController {
  public constructor(
    @Inject(PRODUCT_APPLICATION_SERVICE)
    private readonly products: ProductApplicationService,
    @Inject(PRODUCT_VARIANT_SKU_APPLICATION_SERVICE)
    private readonly variants: ProductVariantSkuApplicationService,
    @Inject(PRODUCT_MEDIA_APPLICATION_SERVICE)
    private readonly media: ProductMediaApplicationService,
    @Inject(PRODUCT_READ_APPLICATION_SERVICE)
    private readonly read: ProductReadApplicationService,
    @Inject(PRODUCT_CATEGORY_READ_SERVICE)
    private readonly categories: ProductCategoryReadService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ limit: 10, windowSeconds: 3600 })
  @UseGuards(ProductSellerPermissionGuard)
  @RequiresPermission('product.create')
  @ApiOperation({
    operationId: 'M04-SELLER-PRODUCT-CREATE',
    summary: 'Create a DRAFT product (listing gate + owner association required)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async createProduct(
    @Body() body: CreateProductDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: ProductSellerScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    try {
      const result = await this.products.createProduct({
        sellerProfileId: new UuidV7(body.sellerProfileId),
        actorIdentityId: new UuidV7(request.authentication.subject),
        name: body.name,
        categoryId: new UuidV7(body.categoryId),
        sellingPrice: toPrice(body.sellingPrice),
        ...(body.compareAtPrice === undefined
          ? {}
          : { compareAtPrice: toPrice(body.compareAtPrice) }),
        skus: body.skus.map((sku) => ({
          skuCode: new SkuCode(sku.skuCode),
          ...(sku.variantId === undefined ? {} : { variantId: new UuidV7(sku.variantId) }),
        })),
        requestKey: idempotencyKey,
        ...correlationField(),
      });
      noStore(response);
      response.status(HttpStatus.CREATED).json(success({ product: result }));
    } catch (error) {
      mapProductError(error);
    }
  }

  @Get()
  @UseGuards(ProductSellerPermissionGuard)
  @RequiresPermission('product.read')
  @ApiQuery({
    name: 'sellerProfileId',
    required: true,
    example: '0191310f-789a-7123-8123-000000000003',
  })
  @ApiOperation({
    operationId: 'M04-SELLER-PRODUCTS-LIST',
    summary: 'List own products (non-enumerating; never another seller)',
  })
  public async listProducts(
    @Req() request: ProductSellerScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const products = await this.read.listOwnProducts(
        request.productSellerContext.sellerProfileId,
        new UuidV7(request.authentication.subject),
      );
      noStore(response);
      response.status(HttpStatus.OK).json(success({ products }));
    } catch (error) {
      mapProductError(error);
    }
  }

  @Get(':productId')
  @UseGuards(ProductSellerPermissionGuard)
  @RequiresPermission('product.read')
  @ApiQuery({
    name: 'sellerProfileId',
    required: true,
    example: '0191310f-789a-7123-8123-000000000003',
  })
  @ApiOperation({
    operationId: 'M04-SELLER-PRODUCT-DETAIL',
    summary: 'Read own product detail (variants, SKUs, media metadata)',
  })
  public async productDetail(
    @Param('productId') productId: string,
    @Req() request: ProductSellerScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const product = await this.read.getOwnProductDetail(
        parseUuidParam(productId),
        request.productSellerContext.sellerProfileId,
        new UuidV7(request.authentication.subject),
      );
      noStore(response);
      response.status(HttpStatus.OK).json(success({ product }));
    } catch (error) {
      mapProductError(error);
    }
  }

  @Patch(':productId')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 30, windowSeconds: 3600 })
  @UseGuards(ProductSellerPermissionGuard)
  @RequiresPermission('product.update')
  @ApiOperation({
    operationId: 'M04-SELLER-PRODUCT-UPDATE',
    summary: 'Update own product definition (version-checked)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async updateProduct(
    @Param('productId') productId: string,
    @Body() body: UpdateProductDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: ProductSellerScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    try {
      const result = await this.products.updateProduct({
        productId: parseUuidParam(productId),
        actorIdentityId: new UuidV7(request.authentication.subject),
        expectedVersion: body.expectedVersion,
        ...(body.name === undefined ? {} : { name: body.name }),
        ...(body.categoryId === undefined ? {} : { categoryId: new UuidV7(body.categoryId) }),
        ...(body.sellingPrice === undefined ? {} : { sellingPrice: toPrice(body.sellingPrice) }),
        ...(body.compareAtPrice === undefined
          ? {}
          : { compareAtPrice: toPrice(body.compareAtPrice) }),
        ...(body.skusToUpsert === undefined
          ? {}
          : {
              skusToUpsert: body.skusToUpsert.map((sku) => ({
                skuCode: new SkuCode(sku.skuCode),
                ...(sku.variantId === undefined ? {} : { variantId: new UuidV7(sku.variantId) }),
              })),
            }),
        ...correlationField(),
      });
      noStore(response);
      response.status(HttpStatus.OK).json(success({ product: result }));
    } catch (error) {
      mapProductError(error);
    }
  }

  @Post(':productId/submit')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 10, windowSeconds: 3600 })
  @UseGuards(ProductSellerPermissionGuard)
  @RequiresPermission('product.submit')
  @ApiOperation({
    operationId: 'M04-SELLER-PRODUCT-SUBMIT',
    summary: 'Submit product for moderation (idempotent; supports corrections resubmission)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async submitProduct(
    @Param('productId') productId: string,
    @Body() body: ProductVersionedDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: ProductSellerScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    try {
      const result = await this.products.submitProduct({
        productId: parseUuidParam(productId),
        actorIdentityId: new UuidV7(request.authentication.subject),
        expectedVersion: body.expectedVersion,
        ...correlationField(),
      });
      noStore(response);
      response.status(HttpStatus.OK).json(success({ product: result }));
    } catch (error) {
      mapProductError(error);
    }
  }

  @Post(':productId/close')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 30, windowSeconds: 3600 })
  @UseGuards(ProductSellerPermissionGuard)
  @RequiresPermission('product.close')
  @ApiOperation({
    operationId: 'M04-SELLER-PRODUCT-CLOSE',
    summary: 'Withdraw/close own product (mandatory reason, version-checked)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async closeProduct(
    @Param('productId') productId: string,
    @Body() body: CloseProductDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: ProductSellerScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    try {
      const result = await this.products.closeProduct({
        productId: parseUuidParam(productId),
        actorIdentityId: new UuidV7(request.authentication.subject),
        expectedVersion: body.expectedVersion,
        reasonReference: body.reasonReference,
        ...correlationField(),
      });
      noStore(response);
      response.status(HttpStatus.OK).json(success({ product: result }));
    } catch (error) {
      mapProductError(error);
    }
  }

  @Get(':productId/variants')
  @UseGuards(ProductSellerPermissionGuard)
  @RequiresPermission('product.read')
  @ApiQuery({
    name: 'sellerProfileId',
    required: true,
    example: '0191310f-789a-7123-8123-000000000003',
  })
  @ApiOperation({
    operationId: 'M04-SELLER-PRODUCT-VARIANTS-LIST',
    summary: 'List variants and SKUs of own product',
  })
  public async listVariants(
    @Param('productId') productId: string,
    @Req() request: ProductSellerScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const product = await this.read.getOwnProductDetail(
        parseUuidParam(productId),
        request.productSellerContext.sellerProfileId,
        new UuidV7(request.authentication.subject),
      );
      noStore(response);
      response
        .status(HttpStatus.OK)
        .json(success({ variants: product.variants, skus: product.skus }));
    } catch (error) {
      mapProductError(error);
    }
  }

  @Post(':productId/variants')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ limit: 30, windowSeconds: 3600 })
  @UseGuards(ProductSellerPermissionGuard)
  @RequiresPermission('product.update')
  @ApiOperation({
    operationId: 'M04-SELLER-PRODUCT-VARIANT-ADD',
    summary: 'Add a single-level variant with its own SKU (version-checked)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async addVariant(
    @Param('productId') productId: string,
    @Body() body: AddVariantDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: ProductSellerScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    try {
      const result = await this.variants.addVariant({
        productId: parseUuidParam(productId),
        actorIdentityId: new UuidV7(request.authentication.subject),
        expectedVersion: body.expectedVersion,
        name: body.name,
        sellingPrice: toPrice(body.sellingPrice),
        ...(body.compareAtPrice === undefined
          ? {}
          : { compareAtPrice: toPrice(body.compareAtPrice) }),
        skuCode: new SkuCode(body.skuCode),
        ...correlationField(),
      });
      noStore(response);
      response.status(HttpStatus.CREATED).json(success({ variant: result }));
    } catch (error) {
      mapProductError(error);
    }
  }

  @Post(':productId/variants/:variantId/skus')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ limit: 30, windowSeconds: 3600 })
  @UseGuards(ProductSellerPermissionGuard)
  @RequiresPermission('product.sku.manage')
  @ApiOperation({
    operationId: 'M04-SELLER-PRODUCT-SKU-ADD',
    summary: 'Add an ACTIVE SKU to an existing variant (version-checked)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async addSku(
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
    @Body() body: AddSkuDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: ProductSellerScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    try {
      const result = await this.variants.addSku({
        productId: parseUuidParam(productId),
        actorIdentityId: new UuidV7(request.authentication.subject),
        expectedVersion: body.expectedVersion,
        variantId: parseUuidParam(variantId),
        skuCode: new SkuCode(body.skuCode),
        ...correlationField(),
      });
      noStore(response);
      response.status(HttpStatus.CREATED).json(success({ sku: result }));
    } catch (error) {
      mapProductError(error);
    }
  }

  @Post(':productId/skus/:skuId/close')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 30, windowSeconds: 3600 })
  @UseGuards(ProductSellerPermissionGuard)
  @RequiresPermission('product.sku.manage')
  @ApiOperation({
    operationId: 'M04-SELLER-PRODUCT-SKU-CLOSE',
    summary: 'Close an ACTIVE SKU (append-only, version-checked)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async closeSku(
    @Param('productId') productId: string,
    @Param('skuId') skuId: string,
    @Body() body: ProductVersionedDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: ProductSellerScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    try {
      const result = await this.variants.closeSku({
        productId: parseUuidParam(productId),
        actorIdentityId: new UuidV7(request.authentication.subject),
        expectedVersion: body.expectedVersion,
        skuId: parseUuidParam(skuId),
        ...correlationField(),
      });
      noStore(response);
      response.status(HttpStatus.OK).json(success({ sku: result }));
    } catch (error) {
      mapProductError(error);
    }
  }

  @Get(':productId/media')
  @UseGuards(ProductSellerPermissionGuard)
  @RequiresPermission('product.media.read')
  @ApiQuery({
    name: 'sellerProfileId',
    required: true,
    example: '0191310f-789a-7123-8123-000000000003',
  })
  @ApiOperation({
    operationId: 'M04-SELLER-PRODUCT-MEDIA-LIST',
    summary: 'List own product media metadata (references + digests only, never content)',
  })
  public async listMedia(
    @Param('productId') productId: string,
    @Req() request: ProductSellerScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const media = await this.read.listOwnMediaMetadata(
        parseUuidParam(productId),
        request.productSellerContext.sellerProfileId,
        new UuidV7(request.authentication.subject),
      );
      noStore(response);
      response.status(HttpStatus.OK).json(success({ media }));
    } catch (error) {
      mapProductError(error);
    }
  }

  @Post(':productId/media')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ limit: 30, windowSeconds: 3600 })
  @UseGuards(ProductSellerPermissionGuard)
  @RequiresPermission('product.media.manage')
  @ApiOperation({
    operationId: 'M04-SELLER-PRODUCT-MEDIA-RECORD',
    summary: 'Record a media reference + digest after integrity verification',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async recordMedia(
    @Param('productId') productId: string,
    @Body() body: RecordMediaDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: ProductSellerScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    try {
      const result = await this.media.recordMediaReference({
        productId: parseUuidParam(productId),
        actorIdentityId: new UuidV7(request.authentication.subject),
        expectedVersion: body.expectedVersion,
        mediaReference: body.mediaReference,
        mediaDigest: body.mediaDigest,
        mimeType: body.mimeType,
        sizeBytes: body.sizeBytes,
        ...correlationField(),
      });
      noStore(response);
      response.status(HttpStatus.CREATED).json(success({ media: result }));
    } catch (error) {
      mapProductError(error);
    }
  }
}

/**
 * WEMP-M04-SPEC-001 §6 (decision D-03). Platform category read for sellers
 * (catalog.category.read); sellers read the platform-defined taxonomy only —
 * no seller category management in Phase 1. The identifier is shared with
 * the admin surface and is NOT organization-scoped (owner decision,
 * 2026-08-14), so the plain Module 02 permission guard applies.
 */
@ApiTags('Seller Product Catalog')
@Controller('seller/categories')
@UseGuards(Aal2SessionGuard, NonProductionRateLimiterGuard)
export class SellerCategoryController {
  public constructor(
    @Inject(PRODUCT_CATEGORY_READ_SERVICE)
    private readonly categories: ProductCategoryReadService,
  ) {}

  @Get()
  @UseGuards(AuthorizationPermissionGuard)
  @RequiresPermission('catalog.category.read')
  @ApiOperation({
    operationId: 'M04-SELLER-CATEGORIES-LIST',
    summary: 'Read active platform categories (catalog.category.read)',
  })
  public async listCategories(@Res() response: Response): Promise<void> {
    try {
      const categories = await this.categories.findActiveCategories();
      noStore(response);
      response.status(HttpStatus.OK).json(success({ categories }));
    } catch (error) {
      mapProductError(error);
    }
  }
}

function parseUuidParam(value: string): UuidV7 {
  try {
    return new UuidV7(value);
  } catch {
    throw new NotFoundException('PRODUCT_NOT_FOUND');
  }
}

function toPrice(value: number): Price {
  try {
    return new Price(value);
  } catch {
    throw new BadRequestException('PRODUCT_PRECONDITION_FAILED');
  }
}

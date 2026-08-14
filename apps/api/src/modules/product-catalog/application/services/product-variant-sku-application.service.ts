import type {
  ClockPort,
  UuidV7GenerationPort,
} from '../../../identity-authentication/application/ports/application-runtime.port';
import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { ProductAuditRecord } from '../../domain/entities/product-audit-record';
import { ProductSku } from '../../domain/entities/product-sku';
import { ProductVariant } from '../../domain/entities/product-variant';
import type { ProductLifecycle } from '../../domain/lifecycle/product-lifecycle';
import type { ProductCatalogPolicy } from '../../domain/policy/product-catalog.policy';
import type { ProductCatalogRepository } from '../../domain/ports/product-catalog-repository.port';
import type { Module02SellerAuthorizationContractPort } from '../../domain/ports/module-02-03-contract.port';
import type { Price } from '../../domain/value-objects/price';
import type { SkuCode } from '../../domain/value-objects/sku-code';
import { ProductApplicationError } from '../errors/product-application.error';

/**
 * WEMP-M04-PLAN-001 M04-M3 (decisions D-05, D-06). Variant and SKU
 * management application service. Structured single-level variants with
 * per-variant SKU/pricing (no variant-of-variant nesting); SKU codes are
 * unique per seller organization and immutable once PUBLISHED. Every
 * mutation is version-guarded, owner-scoped (D-01) and audited.
 */
export class ProductVariantSkuApplicationService {
  public constructor(
    private readonly repository: ProductCatalogRepository,
    private readonly module02: Module02SellerAuthorizationContractPort,
    private readonly lifecycle: ProductLifecycle,
    private readonly policy: ProductCatalogPolicy,
    private readonly clock: ClockPort,
    private readonly identifiers: UuidV7GenerationPort,
  ) {}

  /**
   * Creates a single-level variant on a product with its own SKU (D-05).
   * Publication of the variant is gated on the parent product's approval
   * state; SKU uniqueness is enforced per seller (D-06).
   */
  public async addVariant(command: AddVariantCommand): Promise<VariantResult> {
    const product = await this.repository.findById(command.productId);
    if (product === null) throw new ProductApplicationError('PRODUCT_NOT_FOUND');
    if (product.properties.aggregateVersion.value !== command.expectedVersion) {
      throw new ProductApplicationError('PRODUCT_STATE_CONFLICT');
    }
    this.lifecycle.assertCanUpdate(product.properties.state);
    this.policy.assertSkuMutable(product);
    await this.assertOwner(command.actorIdentityId, product.properties.sellerProfileId);

    const now = this.clock.now();
    const variant = new ProductVariant({
      variantId: this.identifiers.next(),
      productId: command.productId,
      name: command.name,
      state: product.properties.state,
      sellingPrice: command.sellingPrice,
      ...(command.compareAtPrice !== undefined ? { compareAtPrice: command.compareAtPrice } : {}),
      aggregateVersion: new AggregateVersion(1),
      createdAt: now,
      updatedAt: now,
    });
    const sku = new ProductSku({
      skuId: this.identifiers.next(),
      sellerProfileId: product.properties.sellerProfileId,
      productId: command.productId,
      variantId: variant.properties.variantId,
      skuCode: command.skuCode,
      state: 'ACTIVE',
      aggregateVersion: new AggregateVersion(1),
      createdAt: now,
      updatedAt: now,
    });
    const existingSkus = await this.repository.findSkus(command.productId);
    this.policy.assertUniqueSkuWithinSeller(
      [...existingSkus, sku],
      product.properties.sellerProfileId.value,
      [],
    );
    await this.repository.save(
      {
        product,
        variantsToAppend: [variant],
        skusToAppend: [sku],
        mediaToAppend: [],
        attributeValuesToAppend: [],
        transitionsToAppend: [],
        auditRecordsToAppend: [
          new ProductAuditRecord({
            auditEventId: this.identifiers.next(),
            productId: command.productId,
            eventType: 'PRODUCT_VARIANT_ADDED',
            actorIdentityId: command.actorIdentityId,
            occurredAt: now,
            createdAt: now,
            ...(command.correlationId !== undefined
              ? { correlationId: command.correlationId }
              : {}),
          }),
        ],
        priceHistoryToAppend: [],
      },
      product.properties.aggregateVersion,
    );
    return {
      variantId: variant.properties.variantId.value,
      skuCode: sku.properties.skuCode.value,
      version: product.properties.aggregateVersion.value,
    };
  }

  /**
   * Adds an ACTIVE SKU to a product (or to an existing variant). SKU
   * uniqueness per seller (D-06); immutability once PUBLISHED (fail closed).
   */
  public async addSku(command: AddSkuCommand): Promise<AddSkuResult> {
    const product = await this.repository.findById(command.productId);
    if (product === null) throw new ProductApplicationError('PRODUCT_NOT_FOUND');
    if (product.properties.aggregateVersion.value !== command.expectedVersion) {
      throw new ProductApplicationError('PRODUCT_STATE_CONFLICT');
    }
    this.lifecycle.assertCanUpdate(product.properties.state);
    this.policy.assertSkuMutable(product);
    await this.assertOwner(command.actorIdentityId, product.properties.sellerProfileId);

    const now = this.clock.now();
    const sku = new ProductSku({
      skuId: this.identifiers.next(),
      sellerProfileId: product.properties.sellerProfileId,
      productId: command.productId,
      ...(command.variantId !== undefined ? { variantId: command.variantId } : {}),
      skuCode: command.skuCode,
      state: 'ACTIVE',
      aggregateVersion: new AggregateVersion(1),
      createdAt: now,
      updatedAt: now,
    });
    const existingSkus = await this.repository.findSkus(command.productId);
    this.policy.assertUniqueSkuWithinSeller(
      [...existingSkus, sku],
      product.properties.sellerProfileId.value,
      [],
    );
    await this.repository.save(
      {
        product,
        variantsToAppend: [],
        skusToAppend: [sku],
        mediaToAppend: [],
        attributeValuesToAppend: [],
        transitionsToAppend: [],
        auditRecordsToAppend: [
          new ProductAuditRecord({
            auditEventId: this.identifiers.next(),
            productId: command.productId,
            eventType: 'PRODUCT_SKU_ADDED',
            actorIdentityId: command.actorIdentityId,
            occurredAt: now,
            createdAt: now,
            ...(command.correlationId !== undefined
              ? { correlationId: command.correlationId }
              : {}),
          }),
        ],
        priceHistoryToAppend: [],
      },
      product.properties.aggregateVersion,
    );
    return {
      skuId: sku.properties.skuId.value,
      skuCode: sku.properties.skuCode.value,
      version: product.properties.aggregateVersion.value,
    };
  }

  /**
   * Closes an ACTIVE SKU (state → CLOSED). SKU records remain append-only;
   * closure is version-guarded and audited. Denied once PUBLISHED (D-06).
   */
  public async closeSku(command: CloseSkuCommand): Promise<AddSkuResult> {
    const product = await this.repository.findById(command.productId);
    if (product === null) throw new ProductApplicationError('PRODUCT_NOT_FOUND');
    if (product.properties.aggregateVersion.value !== command.expectedVersion) {
      throw new ProductApplicationError('PRODUCT_STATE_CONFLICT');
    }
    this.policy.assertSkuMutable(product);
    await this.assertOwner(command.actorIdentityId, product.properties.sellerProfileId);

    const skus = await this.repository.findSkus(command.productId);
    const sku = skus.find((item) => item.properties.skuId.value === command.skuId.value);
    if (sku?.properties.state !== 'ACTIVE') {
      throw new ProductApplicationError('PRODUCT_NOT_FOUND');
    }
    const now = this.clock.now();
    const closed = new ProductSku({
      ...sku.properties,
      state: 'CLOSED',
      closedAt: now,
      updatedAt: now,
      aggregateVersion: new AggregateVersion(sku.properties.aggregateVersion.value + 1),
    });
    await this.repository.save(
      {
        product,
        variantsToAppend: [],
        skusToAppend: [closed],
        mediaToAppend: [],
        attributeValuesToAppend: [],
        transitionsToAppend: [],
        auditRecordsToAppend: [
          new ProductAuditRecord({
            auditEventId: this.identifiers.next(),
            productId: command.productId,
            eventType: 'PRODUCT_SKU_CLOSED',
            actorIdentityId: command.actorIdentityId,
            occurredAt: now,
            createdAt: now,
            ...(command.correlationId !== undefined
              ? { correlationId: command.correlationId }
              : {}),
          }),
        ],
        priceHistoryToAppend: [],
      },
      product.properties.aggregateVersion,
    );
    return {
      skuId: closed.properties.skuId.value,
      skuCode: closed.properties.skuCode.value,
      version: product.properties.aggregateVersion.value,
    };
  }

  private async assertOwner(actorIdentityId: UuidV7, sellerProfileId: UuidV7): Promise<void> {
    const association = await this.module02.resolveActiveAssociation(
      actorIdentityId,
      sellerProfileId,
    );
    if (association?.associationState !== 'ACTIVE' || association.associationRole !== 'OWNER') {
      throw new ProductApplicationError('PRODUCT_OWNERSHIP_DENIED');
    }
  }
}

export interface AddVariantCommand {
  readonly productId: UuidV7;
  readonly actorIdentityId: UuidV7;
  readonly expectedVersion: number;
  readonly name: string;
  readonly sellingPrice: Price;
  readonly compareAtPrice?: Price;
  readonly skuCode: SkuCode;
  readonly correlationId?: CorrelationIdentifier;
}

export interface AddSkuCommand {
  readonly productId: UuidV7;
  readonly actorIdentityId: UuidV7;
  readonly expectedVersion: number;
  readonly variantId?: UuidV7;
  readonly skuCode: SkuCode;
  readonly correlationId?: CorrelationIdentifier;
}

export interface CloseSkuCommand {
  readonly productId: UuidV7;
  readonly actorIdentityId: UuidV7;
  readonly expectedVersion: number;
  readonly skuId: UuidV7;
  readonly correlationId?: CorrelationIdentifier;
}

export interface VariantResult {
  readonly variantId: string;
  readonly skuCode: string;
  readonly version: number;
}

export interface AddSkuResult {
  readonly skuId: string;
  readonly skuCode: string;
  readonly version: number;
}

import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { ProductAdminAuthorizationPort } from '../ports/product-admin-authorization.port';
import type { ProductCatalogRepository } from '../../domain/ports/product-catalog-repository.port';
import type { Module02SellerAuthorizationContractPort } from '../../domain/ports/module-02-03-contract.port';
import type { ProductState } from '../../domain/value-objects/product-state';
import { ProductApplicationError } from '../errors/product-application.error';

export interface ProductListEntry {
  readonly productId: string;
  readonly sellerProfileId: string;
  readonly categoryId: string;
  readonly name: string;
  readonly state: ProductState;
  readonly sellingPrice: number;
  readonly compareAtPrice?: number;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProductDetailResult extends ProductListEntry {
  readonly variants: readonly {
    readonly variantId: string;
    readonly name: string;
    readonly state: ProductState;
    readonly sellingPrice: number;
    readonly compareAtPrice?: number;
  }[];
  readonly skus: readonly {
    readonly skuId: string;
    readonly variantId?: string;
    readonly skuCode: string;
    readonly state: 'ACTIVE' | 'CLOSED';
  }[];
  readonly media: readonly MediaMetadataEntry[];
}

export interface MediaMetadataEntry {
  readonly mediaId: string;
  readonly productId: string;
  readonly mediaType: string;
  readonly mediaReference: string;
  readonly mediaDigest: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly uploadedByIdentityId: string;
  readonly state: 'ACTIVE' | 'REMOVED';
  readonly uploadedAt: string;
}

export interface AdminProductDetailResult extends ProductDetailResult {
  readonly transitions: readonly {
    readonly fromState?: ProductState;
    readonly toState: ProductState;
    readonly stateVersion: number;
    readonly actorKind: string;
    readonly transitionedAt: string;
    readonly reasonReference?: string;
  }[];
  readonly audit: readonly {
    readonly eventType: string;
    readonly actorIdentityId: string;
    readonly occurredAt: string;
  }[];
}

/**
 * WEMP-M04-PLAN-001 M04-M5 (WEMP-M04-SPEC-001 §18). Read-only product
 * queries for the presentation layer, mirroring the Module 03
 * SellerReadApplicationService pattern:
 *  - Seller self-service reads resolve the caller's ACTIVE association to
 *    the target seller through the Module 02 ownership contract (never from
 *    a client claim) and never enumerate another seller's products
 *    (WEMP-M04-SPEC-001 §16).
 *  - Admin reads re-check the approved Module 02 administrative grant
 *    (`product.audit.view` / `product.media.read`) through the admin port
 *    (defense in depth, decision D-11) and return non-enumerating summary
 *    rows only — never evidence, policy, or moderation internals.
 * Fail closed on every missing seller, missing association, or denied grant.
 */
export class ProductReadApplicationService {
  public constructor(
    private readonly repository: ProductCatalogRepository,
    private readonly module02: Module02SellerAuthorizationContractPort,
    private readonly adminAuthorization: ProductAdminAuthorizationPort,
  ) {}

  /** WEMP-M04-SPEC-001 §18. Lists the caller's own seller-scoped products. */
  public async listOwnProducts(
    sellerProfileId: UuidV7,
    callerIdentityId: UuidV7,
  ): Promise<readonly ProductListEntry[]> {
    await this.requireAssociated(sellerProfileId, callerIdentityId);
    const products = await this.repository.findBySeller(sellerProfileId);
    return products.map(toListEntry);
  }

  /** WEMP-M04-SPEC-001 §18. Reads the caller's own product detail. */
  public async getOwnProductDetail(
    productId: UuidV7,
    sellerProfileId: UuidV7,
    callerIdentityId: UuidV7,
  ): Promise<ProductDetailResult> {
    await this.requireAssociated(sellerProfileId, callerIdentityId);
    const product = await this.repository.findById(productId);
    if (product?.properties.sellerProfileId.value !== sellerProfileId.value) {
      // Non-enumerating: another seller's product (or a missing product) is
      // indistinguishable from an unknown product.
      throw new ProductApplicationError('PRODUCT_NOT_FOUND');
    }
    return this.buildDetail(productId);
  }

  /** WEMP-M04-SPEC-001 §18. Reads the caller's own product media metadata. */
  public async listOwnMediaMetadata(
    productId: UuidV7,
    sellerProfileId: UuidV7,
    callerIdentityId: UuidV7,
  ): Promise<readonly MediaMetadataEntry[]> {
    await this.requireAssociated(sellerProfileId, callerIdentityId);
    const product = await this.repository.findById(productId);
    if (product?.properties.sellerProfileId.value !== sellerProfileId.value) {
      throw new ProductApplicationError('PRODUCT_NOT_FOUND');
    }
    return this.buildMedia(productId);
  }

  /** WEMP-M04-SPEC-001 §18. Admin non-enumerating product list/filter. */
  public async listAllProducts(
    adminIdentityId: UuidV7,
    state?: ProductState,
  ): Promise<readonly ProductListEntry[]> {
    await this.requireAdminGrant(adminIdentityId, 'product.audit.view');
    const products = await this.repository.findAll(state);
    return products.map(toListEntry);
  }

  /** WEMP-M04-SPEC-001 §18. Admin product detail + append-only audit. */
  public async getAdminProductDetail(
    adminIdentityId: UuidV7,
    productId: UuidV7,
  ): Promise<AdminProductDetailResult> {
    await this.requireAdminGrant(adminIdentityId, 'product.audit.view');
    const product = await this.repository.findById(productId);
    if (product === null) throw new ProductApplicationError('PRODUCT_NOT_FOUND');
    const [detail, transitions, audit] = await Promise.all([
      this.buildDetail(productId),
      this.repository.findTransitions(productId),
      this.repository.findAuditRecords(productId),
    ]);
    return {
      ...detail,
      transitions: transitions.map((transition) => ({
        ...(transition.properties.fromState === undefined
          ? {}
          : { fromState: transition.properties.fromState }),
        toState: transition.properties.toState,
        stateVersion: transition.properties.stateVersion,
        actorKind: transition.properties.actorKind,
        transitionedAt: transition.properties.transitionedAt.toISOString(),
        ...(transition.properties.reasonReference === undefined
          ? {}
          : { reasonReference: transition.properties.reasonReference }),
      })),
      audit: audit.map((record) => ({
        eventType: record.properties.eventType,
        actorIdentityId: record.properties.actorIdentityId.value,
        occurredAt: record.properties.occurredAt.toISOString(),
      })),
    };
  }

  /** WEMP-M04-SPEC-001 §18. Admin media metadata inspection (sensitive). */
  public async listAdminMediaMetadata(
    adminIdentityId: UuidV7,
    productId: UuidV7,
  ): Promise<readonly MediaMetadataEntry[]> {
    await this.requireAdminGrant(adminIdentityId, 'product.media.read');
    const product = await this.repository.findById(productId);
    if (product === null) throw new ProductApplicationError('PRODUCT_NOT_FOUND');
    return this.buildMedia(productId);
  }

  private async buildDetail(productId: UuidV7): Promise<ProductDetailResult> {
    const product = await this.repository.findById(productId);
    if (product === null) throw new ProductApplicationError('PRODUCT_NOT_FOUND');
    const [variants, skus, media] = await Promise.all([
      this.repository.findVariants(productId),
      this.repository.findSkus(productId),
      this.repository.findMedia(productId),
    ]);
    return {
      ...toListEntry(product),
      variants: variants.map((variant) => ({
        variantId: variant.properties.variantId.value,
        name: variant.properties.name,
        state: variant.properties.state,
        sellingPrice: variant.properties.sellingPrice.value,
        ...(variant.properties.compareAtPrice === undefined
          ? {}
          : { compareAtPrice: variant.properties.compareAtPrice.value }),
      })),
      skus: skus.map((sku) => ({
        skuId: sku.properties.skuId.value,
        ...(sku.properties.variantId === undefined
          ? {}
          : { variantId: sku.properties.variantId.value }),
        skuCode: sku.properties.skuCode.value,
        state: sku.properties.state,
      })),
      media: media.map(toMediaEntry),
    };
  }

  private async buildMedia(productId: UuidV7): Promise<readonly MediaMetadataEntry[]> {
    const media = await this.repository.findMedia(productId);
    return media.map(toMediaEntry);
  }

  private async requireAssociated(
    sellerProfileId: UuidV7,
    callerIdentityId: UuidV7,
  ): Promise<void> {
    const association = await this.module02.resolveActiveAssociation(
      callerIdentityId,
      sellerProfileId,
    );
    if (association?.associationState !== 'ACTIVE') {
      throw new ProductApplicationError('PRODUCT_OWNERSHIP_DENIED');
    }
  }

  private async requireAdminGrant(
    adminIdentityId: UuidV7,
    action: 'product.audit.view' | 'product.media.read',
  ): Promise<void> {
    const granted = await this.adminAuthorization.isGranted(adminIdentityId, action);
    if (!granted) {
      throw new ProductApplicationError('PRODUCT_ADMIN_AUTHORIZATION_DENIED');
    }
  }
}

function toListEntry(product: {
  properties: {
    productId: { value: string };
    sellerProfileId: { value: string };
    categoryId: { value: string };
    name: string;
    state: ProductState;
    sellingPrice: { value: number };
    compareAtPrice?: { value: number };
    aggregateVersion: { value: number };
    createdAt: Date;
    updatedAt: Date;
  };
}): ProductListEntry {
  const properties = product.properties;
  return {
    productId: properties.productId.value,
    sellerProfileId: properties.sellerProfileId.value,
    categoryId: properties.categoryId.value,
    name: properties.name,
    state: properties.state,
    sellingPrice: properties.sellingPrice.value,
    ...(properties.compareAtPrice === undefined
      ? {}
      : { compareAtPrice: properties.compareAtPrice.value }),
    version: properties.aggregateVersion.value,
    createdAt: properties.createdAt.toISOString(),
    updatedAt: properties.updatedAt.toISOString(),
  };
}

function toMediaEntry(media: {
  properties: {
    mediaId: { value: string };
    productId: { value: string };
    mediaType: string;
    mediaReference: string;
    mediaDigest: string;
    mimeType: string;
    sizeBytes: number;
    uploadedByIdentityId: { value: string };
    state: 'ACTIVE' | 'REMOVED';
    createdAt: Date;
  };
}): MediaMetadataEntry {
  const properties = media.properties;
  return {
    mediaId: properties.mediaId.value,
    productId: properties.productId.value,
    mediaType: properties.mediaType,
    mediaReference: properties.mediaReference,
    mediaDigest: properties.mediaDigest,
    mimeType: properties.mimeType,
    sizeBytes: properties.sizeBytes,
    uploadedByIdentityId: properties.uploadedByIdentityId.value,
    state: properties.state,
    uploadedAt: properties.createdAt.toISOString(),
  };
}

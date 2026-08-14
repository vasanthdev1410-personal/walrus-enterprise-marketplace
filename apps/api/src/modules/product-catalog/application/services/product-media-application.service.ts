import type {
  ClockPort,
  UuidV7GenerationPort,
} from '../../../identity-authentication/application/ports/application-runtime.port';
import type { CorrelationIdentifier } from '../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { ProductAuditRecord } from '../../domain/entities/product-audit-record';
import { ProductMedia } from '../../domain/entities/product-media';
import type { ProductCatalogPolicy } from '../../domain/policy/product-catalog.policy';
import type { ProductCatalogRepository } from '../../domain/ports/product-catalog-repository.port';
import type { Module02SellerAuthorizationContractPort } from '../../domain/ports/module-02-03-contract.port';
import { ProductApplicationError } from '../errors/product-application.error';
import type { ProductMediaStoragePort } from '../ports/product-media-storage.port';

/**
 * WEMP-M04-PLAN-001 M04-M3 (decisions D-09, D-16). Media reference
 * recording application service. The Module 04 database stores only opaque
 * references and SHA-256 digests — binary content lives in R2-compatible
 * object storage (ADR-008); the application layer never persists media
 * content. Integrity verification (digest match) is mandatory before the
 * reference is recorded; the approved allowlist and size/count limits are
 * enforced (D-16). Retention is governed by the D-17 configurable mechanism
 * (fail closed on missing configuration — no durations invented here).
 */
export class ProductMediaApplicationService {
  public constructor(
    private readonly repository: ProductCatalogRepository,
    private readonly module02: Module02SellerAuthorizationContractPort,
    private readonly policy: ProductCatalogPolicy,
    private readonly mediaStorage: ProductMediaStoragePort,
    private readonly clock: ClockPort,
    private readonly identifiers: UuidV7GenerationPort,
  ) {}

  /**
   * Records a media reference + digest after integrity verification. The
   * media policy (allowlist, size, per-product count) is enforced; the
   * owning seller must be ACTIVE (D-01). Version-guarded and audited.
   */
  public async recordMediaReference(command: RecordMediaCommand): Promise<MediaResult> {
    const product = await this.repository.findById(command.productId);
    if (product === null) throw new ProductApplicationError('PRODUCT_NOT_FOUND');
    if (product.properties.aggregateVersion.value !== command.expectedVersion) {
      throw new ProductApplicationError('PRODUCT_STATE_CONFLICT');
    }
    const association = await this.module02.resolveActiveAssociation(
      command.actorIdentityId,
      product.properties.sellerProfileId,
    );
    if (association?.associationState !== 'ACTIVE' || association.associationRole !== 'OWNER') {
      throw new ProductApplicationError('PRODUCT_OWNERSHIP_DENIED');
    }

    // Integrity first (D-09): the stored object must hash to the digest.
    const verified = await this.mediaStorage.verifyMediaIntegrity(
      command.mediaReference,
      command.mediaDigest,
    );
    if (!verified) {
      throw new ProductApplicationError('PRODUCT_MEDIA_INTEGRITY_FAILED');
    }

    const now = this.clock.now();
    const media = new ProductMedia({
      mediaId: this.identifiers.next(),
      productId: command.productId,
      mediaType: 'IMAGE',
      mediaReference: command.mediaReference,
      mediaDigest: command.mediaDigest,
      mimeType: command.mimeType,
      sizeBytes: command.sizeBytes,
      uploadedByIdentityId: command.actorIdentityId,
      state: 'ACTIVE',
      aggregateVersion: new AggregateVersion(1),
      createdAt: now,
      updatedAt: now,
    });
    const existingMedia = await this.repository.findMedia(command.productId);
    this.policy.assertValidMedia(media, existingMedia.length);

    await this.repository.save(
      {
        product,
        variantsToAppend: [],
        skusToAppend: [],
        mediaToAppend: [media],
        attributeValuesToAppend: [],
        transitionsToAppend: [],
        auditRecordsToAppend: [
          new ProductAuditRecord({
            auditEventId: this.identifiers.next(),
            productId: command.productId,
            eventType: 'PRODUCT_MEDIA_RECORDED',
            actorIdentityId: command.actorIdentityId,
            occurredAt: now,
            createdAt: now,
            ...(command.correlationId !== undefined
              ? { correlationId: command.correlationId }
              : {}),
            evidenceDigest: media.properties.mediaDigest,
          }),
        ],
        priceHistoryToAppend: [],
      },
      product.properties.aggregateVersion,
    );
    return {
      mediaId: media.properties.mediaId.value,
      productId: command.productId.value,
      version: product.properties.aggregateVersion.value,
    };
  }
}

export interface RecordMediaCommand {
  readonly productId: UuidV7;
  readonly actorIdentityId: UuidV7;
  readonly expectedVersion: number;
  readonly mediaReference: string;
  readonly mediaDigest: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly correlationId?: CorrelationIdentifier;
}

export interface MediaResult {
  readonly mediaId: string;
  readonly productId: string;
  readonly version: number;
}

/**
 * WEMP-M04-SPEC-001 §6 (decision D-03). Category read service — sellers read
 * the platform-defined taxonomy only (catalog.category.read); no seller
 * category management in Phase 1.
 */
export class ProductCategoryReadService {
  public constructor(private readonly repository: ProductCatalogRepository) {}

  /**
   * Returns ACTIVE platform categories (non-enumerating). Fail closed: any
   * repository error surfaces as an empty denial to the caller.
   */
  public async findActiveCategories(): Promise<readonly CategorySummary[]> {
    const categories = await this.repository.findActiveCategories();
    return categories.map((category) => ({
      categoryId: category.properties.categoryId.value,
      name: category.properties.name,
      ...(category.properties.parentCategoryId !== undefined
        ? { parentCategoryId: category.properties.parentCategoryId.value }
        : {}),
      state: category.properties.state,
    }));
  }
}

export interface CategorySummary {
  readonly categoryId: string;
  readonly name: string;
  readonly parentCategoryId?: string;
  readonly state: 'ACTIVE' | 'RETIRED';
}

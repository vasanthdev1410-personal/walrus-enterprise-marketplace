import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ProductApplicationError } from '../application/errors/product-application.error';
import { ProductDomainError } from '../domain/errors/product-domain.error';

/**
 * WEMP-M04-SPEC-001 §23/§25 (M04-M5). Stable, non-disclosing mapping from
 * internal product error codes (application and domain) to HTTP errors. A
 * missing or forbidden product/seller is indistinguishable (404
 * PRODUCT_NOT_FOUND); authorization and ownership denials are generic (403
 * AUTHORIZATION_DENIED); lifecycle conflicts are generic (409
 * PRODUCT_STATE_CONFLICT); validation/precondition failures are generic
 * (400 PRODUCT_PRECONDITION_FAILED). No catalog, policy, moderation, media,
 * or database internals are ever exposed.
 */
export function mapProductError(error: unknown): never {
  if (error instanceof ProductApplicationError) {
    switch (error.code) {
      case 'PRODUCT_NOT_FOUND':
      case 'PRODUCT_OWNERSHIP_DENIED':
        throw new NotFoundException('PRODUCT_NOT_FOUND');
      case 'PRODUCT_STATE_CONFLICT':
      case 'PRODUCT_TRANSITION_FORBIDDEN':
      case 'PRODUCT_DUPLICATE_DETECTED':
      case 'PRODUCT_SKU_IMMUTABLE':
      case 'PRODUCT_CATEGORY_CONFLICT':
      case 'PRODUCT_IDEMPOTENCY_CONFLICT':
        throw new ConflictException('PRODUCT_STATE_CONFLICT');
      case 'PRODUCT_SOD_VIOLATION':
      case 'PRODUCT_ADMIN_AUTHORIZATION_DENIED':
        throw new ForbiddenException('AUTHORIZATION_DENIED');
      case 'PRODUCT_PRECONDITION_FAILED':
      case 'PRODUCT_INVALID_ATTRIBUTE_VALUE':
      case 'PRODUCT_INVALID_MEDIA':
      case 'PRODUCT_MEDIA_INTEGRITY_FAILED':
      case 'PRODUCT_REVIEWER_UNRESOLVED':
      default:
        throw new BadRequestException('PRODUCT_PRECONDITION_FAILED');
    }
  }
  if (error instanceof ProductDomainError) {
    switch (error.code) {
      case 'PRODUCT_OWNER_CONFLICT':
      case 'PRODUCT_CATEGORY_CONFLICT':
      case 'PRODUCT_ATTRIBUTE_CONFLICT':
      case 'PRODUCT_SKU_CONFLICT':
      case 'PRODUCT_PRICE_CONFLICT':
      case 'PRODUCT_MEDIA_CONFLICT':
      case 'PRODUCT_UPDATE_FORBIDDEN':
        throw new ConflictException('PRODUCT_STATE_CONFLICT');
      case 'PRODUCT_SOD_VIOLATION':
        throw new ForbiddenException('AUTHORIZATION_DENIED');
      case 'PRODUCT_STATE_CONFLICT':
      case 'PRODUCT_TRANSITION_FORBIDDEN':
      case 'PRODUCT_ACTOR_REQUIRED':
      case 'PRODUCT_REASON_REQUIRED':
      case 'PRODUCT_PRECONDITION_FAILED':
      case 'PRODUCT_INVALID_ATTRIBUTE_VALUE':
      case 'PRODUCT_INVALID_MEDIA':
      case 'PRODUCT_NOT_SELLABLE':
      case 'PRODUCT_RETENTION_CONFIG_MISSING':
      case 'PRODUCT_RETENTION_CONFIG_INVALID':
      case 'PRODUCT_SKU_IMMUTABLE':
      default:
        throw new BadRequestException('PRODUCT_PRECONDITION_FAILED');
    }
  }
  throw error;
}

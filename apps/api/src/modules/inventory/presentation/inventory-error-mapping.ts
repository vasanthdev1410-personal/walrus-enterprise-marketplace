import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InventoryApplicationError } from '../application/errors/inventory-application.error';
import { InventoryDomainError } from '../domain/errors/inventory-domain.error';

/**
 * WEMP-M05-SPEC-001 §19/§23 (M05-M5). Stable, non-disclosing mapping from
 * internal inventory error codes (application and domain) to HTTP errors. A
 * missing, unknown, or non-PUBLISHED SKU and another seller's inventory are
 * indistinguishable (404 INVENTORY_NOT_FOUND — anti-enumeration, D-08/D-15);
 * authorization and ownership denials are generic (403 AUTHORIZATION_DENIED);
 * lifecycle/version conflicts are generic (409 INVENTORY_STATE_CONFLICT);
 * validation/precondition failures are generic (400
 * INVENTORY_PRECONDITION_FAILED); rate limiting is 429 RATE_LIMIT_EXCEEDED
 * (D-11). No inventory, ledger, policy, ownership, or database internals are
 * ever exposed.
 */
export function mapInventoryError(error: unknown): never {
  if (error instanceof InventoryApplicationError) {
    switch (error.code) {
      case 'INVENTORY_NOT_FOUND':
      case 'INVENTORY_SKU_UNAVAILABLE':
        throw new NotFoundException('INVENTORY_NOT_FOUND');
      case 'INVENTORY_OWNERSHIP_DENIED':
        // Anti-enumeration (D-08/D-15): another seller's pool is
        // indistinguishable from an unknown pool.
        throw new NotFoundException('INVENTORY_NOT_FOUND');
      case 'INVENTORY_ADMIN_AUTHORIZATION_DENIED':
        throw new ForbiddenException('AUTHORIZATION_DENIED');
      case 'INVENTORY_STATE_CONFLICT':
      case 'INVENTORY_IDEMPOTENCY_CONFLICT':
        throw new ConflictException('INVENTORY_STATE_CONFLICT');
      case 'INVENTORY_VALIDATION_FAILED':
      case 'INVENTORY_THRESHOLD_CONFIG_UNAVAILABLE':
        throw new BadRequestException('INVENTORY_PRECONDITION_FAILED');
      case 'INVENTORY_RATE_LIMITED':
        throw new ForbiddenException('RATE_LIMIT_EXCEEDED');
      default:
        throw new BadRequestException('INVENTORY_PRECONDITION_FAILED');
    }
  }
  if (error instanceof InventoryDomainError) {
    switch (error.code) {
      case 'INVENTORY_NEGATIVE_AVAILABLE':
      case 'INVENTORY_VERSION_CONFLICT':
      case 'INVENTORY_RESERVE_EXCEEDS_AVAILABLE':
      case 'INVENTORY_RELEASE_EXCEEDS_RESERVED':
      case 'INVENTORY_MOVEMENT_FORBIDDEN':
      case 'INVENTORY_LIFECYCLE_FORBIDDEN':
        throw new ConflictException('INVENTORY_STATE_CONFLICT');
      case 'INVENTORY_DELTA_BOUND_EXCEEDED':
      case 'INVENTORY_QUANTITY_INVALID':
      case 'INVENTORY_REASON_REQUIRED':
      case 'INVENTORY_THRESHOLD_CONFIG_MISSING':
      case 'INVENTORY_THRESHOLD_CONFIG_INVALID':
      case 'INVENTORY_RETENTION_CONFIG_MISSING':
      case 'INVENTORY_RETENTION_CONFIG_INVALID':
        throw new BadRequestException('INVENTORY_PRECONDITION_FAILED');
      case 'INVENTORY_SKU_UNKNOWN_OR_NON_PUBLISHED':
        throw new NotFoundException('INVENTORY_NOT_FOUND');
      default:
        throw new BadRequestException('INVENTORY_PRECONDITION_FAILED');
    }
  }
  throw error;
}

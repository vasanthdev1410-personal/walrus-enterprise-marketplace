import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { OrderApplicationError } from '../application/errors/order-application.error';

/**
 * WEMP-M08-SPEC-001 §14/§19 (M08-M5, decisions D-01…D-13). Maps
 * OrderApplicationError codes to non-disclosing HTTP exceptions. Every
 * code resolves to a generic status; no policy, ownership, inventory,
 * or pricing internals are ever exposed to clients.
 */
export function mapOrderError(error: unknown): never {
  if (!(error instanceof OrderApplicationError)) {
    throw new BadRequestException('ORDER_ERROR');
  }
  switch (error.code) {
    case 'ORDER_NOT_FOUND':
    case 'ORDER_LINE_NOT_FOUND':
      throw new NotFoundException(error.code);
    case 'ORDER_CUSTOMER_NOT_FOUND':
    case 'ORDER_SNAPSHOT_NOT_FOUND':
      throw new NotFoundException('ORDER_NOT_FOUND');
    case 'ORDER_STALE_VERSION':
    case 'ORDER_STATE_CONFLICT':
    case 'ORDER_LINE_CONFLICT':
    case 'ORDER_CHECKOUT_BLOCKED':
      throw new ConflictException(error.code);
    case 'ORDER_OWNERSHIP_DENIED':
    case 'ORDER_TRANSITION_FORBIDDEN':
    case 'ORDER_UPDATE_FORBIDDEN':
    case 'ORDER_READ_FORBIDDEN':
    case 'ORDER_REASON_REQUIRED':
      throw new BadRequestException(error.code);
    case 'ORDER_VALIDATION_FAILED':
    case 'ORDER_MAX_LINES_EXCEEDED':
    case 'ORDER_MAX_TOTAL_ITEMS_EXCEEDED':
      throw new BadRequestException(error.code);
    case 'ORDER_PRODUCT_UNAVAILABLE':
    case 'ORDER_SKU_UNAVAILABLE':
    case 'ORDER_INVENTORY_INSUFFICIENT':
    case 'ORDER_PRICE_MISMATCH':
      throw new ConflictException(error.code);
    case 'ORDER_IDEMPOTENCY_CONFLICT':
      throw new ConflictException(error.code);
    case 'ORDER_RATE_LIMITED':
      throw new BadRequestException(error.code);
    case 'ORDER_SNAPSHOT_INVALID':
    case 'ORDER_RETENTION_PROCESSING_FAILED':
      throw new BadRequestException(error.code);
    default:
      throw new BadRequestException('ORDER_ERROR');
  }
}

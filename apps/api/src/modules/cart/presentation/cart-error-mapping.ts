import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CartApplicationError } from '../application/errors/cart-application.error';

/**
 * WEMP-M07-SPEC-001 §19/§23. Maps CartApplicationError codes to non-disclosing
 * HTTP exceptions. Every code resolves to a generic status; no policy,
 * ownership, inventory, or pricing internals are ever exposed to clients.
 */
export function mapCartError(error: unknown): never {
  if (!(error instanceof CartApplicationError)) {
    throw new BadRequestException('CART_ERROR');
  }
  switch (error.code) {
    case 'CART_NOT_FOUND':
    case 'CART_LINE_NOT_FOUND':
      throw new NotFoundException(error.code);
    case 'CART_CUSTOMER_NOT_FOUND':
      throw new NotFoundException('CART_NOT_FOUND');
    case 'CART_STALE_VERSION':
    case 'CART_STATE_CONFLICT':
    case 'CART_LINE_CONFLICT':
    case 'CART_CHECKOUT_BLOCKED':
      throw new ConflictException(error.code);
    case 'CART_OWNERSHIP_DENIED':
    case 'CART_TRANSITION_FORBIDDEN':
    case 'CART_UPDATE_FORBIDDEN':
    case 'CART_READ_FORBIDDEN':
    case 'CART_REASON_REQUIRED':
      throw new BadRequestException(error.code);
    case 'CART_VALIDATION_FAILED':
    case 'CART_MAX_LINES_EXCEEDED':
    case 'CART_MAX_TOTAL_ITEMS_EXCEEDED':
      throw new BadRequestException(error.code);
    case 'CART_PRODUCT_UNAVAILABLE':
    case 'CART_SKU_UNAVAILABLE':
    case 'CART_INVENTORY_INSUFFICIENT':
    case 'CART_PRICE_MISMATCH':
      throw new ConflictException(error.code);
    case 'CART_IDEMPOTENCY_CONFLICT':
      throw new ConflictException(error.code);
    case 'CART_RATE_LIMITED':
      throw new BadRequestException(error.code);
    default:
      throw new BadRequestException('CART_ERROR');
  }
}

import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { CartApplicationError } from '../application/errors/cart-application.error';
import { mapCartError } from './cart-error-mapping';

describe('mapCartError', () => {
  it('throws BadRequestException for non-CartApplicationError', () => {
    expect(() => mapCartError(new Error('generic'))).toThrow(BadRequestException);
  });

  it('throws NotFoundException for CART_NOT_FOUND', () => {
    expect(() => mapCartError(new CartApplicationError('CART_NOT_FOUND'))).toThrow(
      NotFoundException,
    );
  });

  it('throws NotFoundException for CART_LINE_NOT_FOUND', () => {
    expect(() => mapCartError(new CartApplicationError('CART_LINE_NOT_FOUND'))).toThrow(
      NotFoundException,
    );
  });

  it('throws NotFoundException for CART_CUSTOMER_NOT_FOUND', () => {
    expect(() => mapCartError(new CartApplicationError('CART_CUSTOMER_NOT_FOUND'))).toThrow(
      NotFoundException,
    );
  });

  it('throws ConflictException for CART_STALE_VERSION', () => {
    expect(() => mapCartError(new CartApplicationError('CART_STALE_VERSION'))).toThrow(
      ConflictException,
    );
  });

  it('throws ConflictException for CART_STATE_CONFLICT', () => {
    expect(() => mapCartError(new CartApplicationError('CART_STATE_CONFLICT'))).toThrow(
      ConflictException,
    );
  });

  it('throws ConflictException for CART_LINE_CONFLICT', () => {
    expect(() => mapCartError(new CartApplicationError('CART_LINE_CONFLICT'))).toThrow(
      ConflictException,
    );
  });

  it('throws ConflictException for CART_CHECKOUT_BLOCKED', () => {
    expect(() => mapCartError(new CartApplicationError('CART_CHECKOUT_BLOCKED'))).toThrow(
      ConflictException,
    );
  });

  it('throws BadRequestException for CART_OWNERSHIP_DENIED', () => {
    expect(() => mapCartError(new CartApplicationError('CART_OWNERSHIP_DENIED'))).toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException for CART_TRANSITION_FORBIDDEN', () => {
    expect(() => mapCartError(new CartApplicationError('CART_TRANSITION_FORBIDDEN'))).toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException for CART_UPDATE_FORBIDDEN', () => {
    expect(() => mapCartError(new CartApplicationError('CART_UPDATE_FORBIDDEN'))).toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException for CART_READ_FORBIDDEN', () => {
    expect(() => mapCartError(new CartApplicationError('CART_READ_FORBIDDEN'))).toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException for CART_REASON_REQUIRED', () => {
    expect(() => mapCartError(new CartApplicationError('CART_REASON_REQUIRED'))).toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException for CART_VALIDATION_FAILED', () => {
    expect(() => mapCartError(new CartApplicationError('CART_VALIDATION_FAILED'))).toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException for CART_MAX_LINES_EXCEEDED', () => {
    expect(() => mapCartError(new CartApplicationError('CART_MAX_LINES_EXCEEDED'))).toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException for CART_MAX_TOTAL_ITEMS_EXCEEDED', () => {
    expect(() => mapCartError(new CartApplicationError('CART_MAX_TOTAL_ITEMS_EXCEEDED'))).toThrow(
      BadRequestException,
    );
  });

  it('throws ConflictException for CART_PRODUCT_UNAVAILABLE', () => {
    expect(() => mapCartError(new CartApplicationError('CART_PRODUCT_UNAVAILABLE'))).toThrow(
      ConflictException,
    );
  });

  it('throws ConflictException for CART_SKU_UNAVAILABLE', () => {
    expect(() => mapCartError(new CartApplicationError('CART_SKU_UNAVAILABLE'))).toThrow(
      ConflictException,
    );
  });

  it('throws ConflictException for CART_INVENTORY_INSUFFICIENT', () => {
    expect(() => mapCartError(new CartApplicationError('CART_INVENTORY_INSUFFICIENT'))).toThrow(
      ConflictException,
    );
  });

  it('throws ConflictException for CART_PRICE_MISMATCH', () => {
    expect(() => mapCartError(new CartApplicationError('CART_PRICE_MISMATCH'))).toThrow(
      ConflictException,
    );
  });

  it('throws ConflictException for CART_IDEMPOTENCY_CONFLICT', () => {
    expect(() => mapCartError(new CartApplicationError('CART_IDEMPOTENCY_CONFLICT'))).toThrow(
      ConflictException,
    );
  });

  it('throws BadRequestException for CART_RATE_LIMITED', () => {
    expect(() => mapCartError(new CartApplicationError('CART_RATE_LIMITED'))).toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException for CART_RETENTION_PROCESSING_FAILED (default)', () => {
    expect(() =>
      mapCartError(new CartApplicationError('CART_RETENTION_PROCESSING_FAILED')),
    ).toThrow(BadRequestException);
  });
});

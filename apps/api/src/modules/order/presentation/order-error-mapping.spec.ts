import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { OrderApplicationError } from '../application/errors/order-application.error';
import { mapOrderError } from './order-error-mapping';

describe('mapOrderError', () => {
  it('maps ORDER_NOT_FOUND to 404', () => {
    expect(() => mapOrderError(new OrderApplicationError('ORDER_NOT_FOUND'))).toThrow(
      NotFoundException,
    );
  });

  it('maps ORDER_LINE_NOT_FOUND to 404', () => {
    expect(() => mapOrderError(new OrderApplicationError('ORDER_LINE_NOT_FOUND'))).toThrow(
      NotFoundException,
    );
  });

  it('maps ORDER_CUSTOMER_NOT_FOUND to 404 (non-enumerating)', () => {
    expect(() => mapOrderError(new OrderApplicationError('ORDER_CUSTOMER_NOT_FOUND'))).toThrow(
      NotFoundException,
    );
  });

  it('maps ORDER_SNAPSHOT_NOT_FOUND to 404 (non-enumerating)', () => {
    expect(() => mapOrderError(new OrderApplicationError('ORDER_SNAPSHOT_NOT_FOUND'))).toThrow(
      NotFoundException,
    );
  });

  it('maps ORDER_STALE_VERSION to 409', () => {
    expect(() => mapOrderError(new OrderApplicationError('ORDER_STALE_VERSION'))).toThrow(
      ConflictException,
    );
  });

  it('maps ORDER_STATE_CONFLICT to 409', () => {
    expect(() => mapOrderError(new OrderApplicationError('ORDER_STATE_CONFLICT'))).toThrow(
      ConflictException,
    );
  });

  it('maps ORDER_OWNERSHIP_DENIED to 400', () => {
    expect(() => mapOrderError(new OrderApplicationError('ORDER_OWNERSHIP_DENIED'))).toThrow(
      BadRequestException,
    );
  });

  it('maps ORDER_TRANSITION_FORBIDDEN to 400', () => {
    expect(() => mapOrderError(new OrderApplicationError('ORDER_TRANSITION_FORBIDDEN'))).toThrow(
      BadRequestException,
    );
  });

  it('maps ORDER_INVENTORY_INSUFFICIENT to 409', () => {
    expect(() => mapOrderError(new OrderApplicationError('ORDER_INVENTORY_INSUFFICIENT'))).toThrow(
      ConflictException,
    );
  });

  it('maps ORDER_PRICE_MISMATCH to 409', () => {
    expect(() => mapOrderError(new OrderApplicationError('ORDER_PRICE_MISMATCH'))).toThrow(
      ConflictException,
    );
  });

  it('maps ORDER_IDEMPOTENCY_CONFLICT to 409', () => {
    expect(() => mapOrderError(new OrderApplicationError('ORDER_IDEMPOTENCY_CONFLICT'))).toThrow(
      ConflictException,
    );
  });

  it('maps ORDER_RATE_LIMITED to 400', () => {
    expect(() => mapOrderError(new OrderApplicationError('ORDER_RATE_LIMITED'))).toThrow(
      BadRequestException,
    );
  });

  it('maps unknown errors to generic 400 ORDER_ERROR', () => {
    expect(() => mapOrderError(new Error('unexpected'))).toThrow(BadRequestException);
  });

  it('maps non-OrderApplicationError to 400 ORDER_ERROR', () => {
    expect(() => mapOrderError('string error')).toThrow(BadRequestException);
  });
});

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { InventoryApplicationError } from '../application/errors/inventory-application.error';
import { InventoryDomainError } from '../domain/errors/inventory-domain.error';
import { mapInventoryError } from './inventory-error-mapping';

describe('mapInventoryError', () => {
  describe('InventoryApplicationError', () => {
    it('throws NotFoundException for INVENTORY_NOT_FOUND', () => {
      expect(() => mapInventoryError(new InventoryApplicationError('INVENTORY_NOT_FOUND'))).toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException for INVENTORY_SKU_UNAVAILABLE', () => {
      expect(() =>
        mapInventoryError(new InventoryApplicationError('INVENTORY_SKU_UNAVAILABLE')),
      ).toThrow(NotFoundException);
    });

    it('throws NotFoundException for INVENTORY_OWNERSHIP_DENIED (anti-enumeration)', () => {
      expect(() =>
        mapInventoryError(new InventoryApplicationError('INVENTORY_OWNERSHIP_DENIED')),
      ).toThrow(NotFoundException);
    });

    it('throws ForbiddenException for INVENTORY_ADMIN_AUTHORIZATION_DENIED', () => {
      expect(() =>
        mapInventoryError(new InventoryApplicationError('INVENTORY_ADMIN_AUTHORIZATION_DENIED')),
      ).toThrow(ForbiddenException);
    });

    it('throws ConflictException for INVENTORY_STATE_CONFLICT', () => {
      expect(() =>
        mapInventoryError(new InventoryApplicationError('INVENTORY_STATE_CONFLICT')),
      ).toThrow(ConflictException);
    });

    it('throws ConflictException for INVENTORY_IDEMPOTENCY_CONFLICT', () => {
      expect(() =>
        mapInventoryError(new InventoryApplicationError('INVENTORY_IDEMPOTENCY_CONFLICT')),
      ).toThrow(ConflictException);
    });

    it('throws BadRequestException for INVENTORY_VALIDATION_FAILED', () => {
      expect(() =>
        mapInventoryError(new InventoryApplicationError('INVENTORY_VALIDATION_FAILED')),
      ).toThrow(BadRequestException);
    });

    it('throws BadRequestException for INVENTORY_THRESHOLD_CONFIG_UNAVAILABLE', () => {
      expect(() =>
        mapInventoryError(new InventoryApplicationError('INVENTORY_THRESHOLD_CONFIG_UNAVAILABLE')),
      ).toThrow(BadRequestException);
    });

    it('throws ForbiddenException for INVENTORY_RATE_LIMITED', () => {
      expect(() =>
        mapInventoryError(new InventoryApplicationError('INVENTORY_RATE_LIMITED')),
      ).toThrow(ForbiddenException);
    });
  });

  describe('InventoryDomainError', () => {
    it('throws ConflictException for INVENTORY_NEGATIVE_AVAILABLE', () => {
      expect(() =>
        mapInventoryError(new InventoryDomainError('INVENTORY_NEGATIVE_AVAILABLE')),
      ).toThrow(ConflictException);
    });

    it('throws ConflictException for INVENTORY_VERSION_CONFLICT', () => {
      expect(() =>
        mapInventoryError(new InventoryDomainError('INVENTORY_VERSION_CONFLICT')),
      ).toThrow(ConflictException);
    });

    it('throws ConflictException for INVENTORY_RESERVE_EXCEEDS_AVAILABLE', () => {
      expect(() =>
        mapInventoryError(new InventoryDomainError('INVENTORY_RESERVE_EXCEEDS_AVAILABLE')),
      ).toThrow(ConflictException);
    });

    it('throws ConflictException for INVENTORY_RELEASE_EXCEEDS_RESERVED', () => {
      expect(() =>
        mapInventoryError(new InventoryDomainError('INVENTORY_RELEASE_EXCEEDS_RESERVED')),
      ).toThrow(ConflictException);
    });

    it('throws ConflictException for INVENTORY_MOVEMENT_FORBIDDEN', () => {
      expect(() =>
        mapInventoryError(new InventoryDomainError('INVENTORY_MOVEMENT_FORBIDDEN')),
      ).toThrow(ConflictException);
    });

    it('throws ConflictException for INVENTORY_LIFECYCLE_FORBIDDEN', () => {
      expect(() =>
        mapInventoryError(new InventoryDomainError('INVENTORY_LIFECYCLE_FORBIDDEN')),
      ).toThrow(ConflictException);
    });

    it('throws BadRequestException for INVENTORY_DELTA_BOUND_EXCEEDED', () => {
      expect(() =>
        mapInventoryError(new InventoryDomainError('INVENTORY_DELTA_BOUND_EXCEEDED')),
      ).toThrow(BadRequestException);
    });

    it('throws BadRequestException for INVENTORY_QUANTITY_INVALID', () => {
      expect(() =>
        mapInventoryError(new InventoryDomainError('INVENTORY_QUANTITY_INVALID')),
      ).toThrow(BadRequestException);
    });

    it('throws BadRequestException for INVENTORY_REASON_REQUIRED', () => {
      expect(() =>
        mapInventoryError(new InventoryDomainError('INVENTORY_REASON_REQUIRED')),
      ).toThrow(BadRequestException);
    });

    it('throws BadRequestException for INVENTORY_THRESHOLD_CONFIG_MISSING', () => {
      expect(() =>
        mapInventoryError(new InventoryDomainError('INVENTORY_THRESHOLD_CONFIG_MISSING')),
      ).toThrow(BadRequestException);
    });

    it('throws BadRequestException for INVENTORY_THRESHOLD_CONFIG_INVALID', () => {
      expect(() =>
        mapInventoryError(new InventoryDomainError('INVENTORY_THRESHOLD_CONFIG_INVALID')),
      ).toThrow(BadRequestException);
    });

    it('throws BadRequestException for INVENTORY_RETENTION_CONFIG_MISSING', () => {
      expect(() =>
        mapInventoryError(new InventoryDomainError('INVENTORY_RETENTION_CONFIG_MISSING')),
      ).toThrow(BadRequestException);
    });

    it('throws BadRequestException for INVENTORY_RETENTION_CONFIG_INVALID', () => {
      expect(() =>
        mapInventoryError(new InventoryDomainError('INVENTORY_RETENTION_CONFIG_INVALID')),
      ).toThrow(BadRequestException);
    });

    it('throws NotFoundException for INVENTORY_SKU_UNKNOWN_OR_NON_PUBLISHED', () => {
      expect(() =>
        mapInventoryError(new InventoryDomainError('INVENTORY_SKU_UNKNOWN_OR_NON_PUBLISHED')),
      ).toThrow(NotFoundException);
    });
  });

  it('re-throws non-inventory errors', () => {
    const error = new Error('other');
    expect(() => mapInventoryError(error)).toThrow(error);
  });
});

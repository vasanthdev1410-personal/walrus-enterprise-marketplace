import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ProductApplicationError } from '../application/errors/product-application.error';
import { ProductDomainError } from '../domain/errors/product-domain.error';
import { mapProductError } from './product-error-mapping';

describe('mapProductError (M04-M5, non-disclosing error model)', () => {
  it('maps missing/forbidden product and ownership denials to 404 PRODUCT_NOT_FOUND', () => {
    expect(() => mapProductError(new ProductApplicationError('PRODUCT_NOT_FOUND'))).toThrow(
      NotFoundException,
    );
    expect(() => mapProductError(new ProductApplicationError('PRODUCT_OWNERSHIP_DENIED'))).toThrow(
      NotFoundException,
    );
  });

  it('maps lifecycle conflicts to 409 PRODUCT_STATE_CONFLICT', () => {
    expect(() => mapProductError(new ProductApplicationError('PRODUCT_STATE_CONFLICT'))).toThrow(
      ConflictException,
    );
    expect(() =>
      mapProductError(new ProductApplicationError('PRODUCT_TRANSITION_FORBIDDEN')),
    ).toThrow(ConflictException);
    expect(() => mapProductError(new ProductApplicationError('PRODUCT_SKU_IMMUTABLE'))).toThrow(
      ConflictException,
    );
    expect(() =>
      mapProductError(new ProductApplicationError('PRODUCT_DUPLICATE_DETECTED')),
    ).toThrow(ConflictException);
    expect(() => mapProductError(new ProductDomainError('PRODUCT_SKU_CONFLICT'))).toThrow(
      ConflictException,
    );
    expect(() => mapProductError(new ProductDomainError('PRODUCT_UPDATE_FORBIDDEN'))).toThrow(
      ConflictException,
    );
  });

  it('maps SoD and admin authorization denials to 403 AUTHORIZATION_DENIED', () => {
    expect(() => mapProductError(new ProductApplicationError('PRODUCT_SOD_VIOLATION'))).toThrow(
      ForbiddenException,
    );
    expect(() =>
      mapProductError(new ProductApplicationError('PRODUCT_ADMIN_AUTHORIZATION_DENIED')),
    ).toThrow(ForbiddenException);
    expect(() => mapProductError(new ProductDomainError('PRODUCT_SOD_VIOLATION'))).toThrow(
      ForbiddenException,
    );
  });

  it('maps validation/precondition failures to 400 PRODUCT_PRECONDITION_FAILED', () => {
    expect(() =>
      mapProductError(new ProductApplicationError('PRODUCT_PRECONDITION_FAILED')),
    ).toThrow(BadRequestException);
    expect(() =>
      mapProductError(new ProductApplicationError('PRODUCT_MEDIA_INTEGRITY_FAILED')),
    ).toThrow(BadRequestException);
    expect(() =>
      mapProductError(new ProductApplicationError('PRODUCT_REVIEWER_UNRESOLVED')),
    ).toThrow(BadRequestException);
    expect(() => mapProductError(new ProductDomainError('PRODUCT_REASON_REQUIRED'))).toThrow(
      BadRequestException,
    );
    expect(() =>
      mapProductError(new ProductDomainError('PRODUCT_RETENTION_CONFIG_MISSING')),
    ).toThrow(BadRequestException);
    expect(() => mapProductError(new ProductDomainError('PRODUCT_NOT_SELLABLE'))).toThrow(
      BadRequestException,
    );
  });

  it('rethrows unknown errors without disclosure', () => {
    const error = new Error('database exploded');
    expect(() => mapProductError(error)).toThrow(error);
  });
});

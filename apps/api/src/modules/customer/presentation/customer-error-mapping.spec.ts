import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CustomerApplicationError } from '../application/errors/customer-application.error';
import { CustomerDomainError } from '../domain/errors/customer-domain.error';
import { mapCustomerError } from './customer-error-mapping';

describe('mapCustomerError', () => {
  it('re-throws non-customer errors', () => {
    const error = new Error('other');
    expect(() => mapCustomerError(error)).toThrow(error);
  });

  describe('CustomerApplicationError', () => {
    it('NOT_FOUND -> NotFoundException', () => {
      expect(() => mapCustomerError(new CustomerApplicationError('CUSTOMER_NOT_FOUND'))).toThrow(
        NotFoundException,
      );
    });
    it('OWNERSHIP_DENIED -> NotFoundException', () => {
      expect(() =>
        mapCustomerError(new CustomerApplicationError('CUSTOMER_OWNERSHIP_DENIED')),
      ).toThrow(NotFoundException);
    });
    it('ADMIN_AUTHORIZATION_DENIED -> ForbiddenException', () => {
      expect(() =>
        mapCustomerError(new CustomerApplicationError('CUSTOMER_ADMIN_AUTHORIZATION_DENIED')),
      ).toThrow(ForbiddenException);
    });
    it('STATE_CONFLICT -> ConflictException', () => {
      expect(() =>
        mapCustomerError(new CustomerApplicationError('CUSTOMER_STATE_CONFLICT')),
      ).toThrow(ConflictException);
    });
    it('TRANSITION_FORBIDDEN -> ConflictException', () => {
      expect(() =>
        mapCustomerError(new CustomerApplicationError('CUSTOMER_TRANSITION_FORBIDDEN')),
      ).toThrow(ConflictException);
    });
    it('DUPLICATE_DETECTED -> ConflictException', () => {
      expect(() =>
        mapCustomerError(new CustomerApplicationError('CUSTOMER_DUPLICATE_DETECTED')),
      ).toThrow(ConflictException);
    });
    it('ADDRESS_CONFLICT -> ConflictException', () => {
      expect(() =>
        mapCustomerError(new CustomerApplicationError('CUSTOMER_ADDRESS_CONFLICT')),
      ).toThrow(ConflictException);
    });
    it('BUSINESS_PROFILE_CONFLICT -> ConflictException', () => {
      expect(() =>
        mapCustomerError(new CustomerApplicationError('CUSTOMER_BUSINESS_PROFILE_CONFLICT')),
      ).toThrow(ConflictException);
    });
    it('IDEMPOTENCY_CONFLICT -> ConflictException', () => {
      expect(() =>
        mapCustomerError(new CustomerApplicationError('CUSTOMER_IDEMPOTENCY_CONFLICT')),
      ).toThrow(ConflictException);
    });
    it('UPDATE_FORBIDDEN -> BadRequestException', () => {
      expect(() =>
        mapCustomerError(new CustomerApplicationError('CUSTOMER_UPDATE_FORBIDDEN')),
      ).toThrow(BadRequestException);
    });
    it('READ_FORBIDDEN -> BadRequestException', () => {
      expect(() =>
        mapCustomerError(new CustomerApplicationError('CUSTOMER_READ_FORBIDDEN')),
      ).toThrow(BadRequestException);
    });
    it('PREFERENCE_FORBIDDEN -> BadRequestException', () => {
      expect(() =>
        mapCustomerError(new CustomerApplicationError('CUSTOMER_PREFERENCE_FORBIDDEN')),
      ).toThrow(BadRequestException);
    });
    it('REASON_REQUIRED -> BadRequestException', () => {
      expect(() =>
        mapCustomerError(new CustomerApplicationError('CUSTOMER_REASON_REQUIRED')),
      ).toThrow(BadRequestException);
    });
    it('VALIDATION_FAILED -> BadRequestException', () => {
      expect(() =>
        mapCustomerError(new CustomerApplicationError('CUSTOMER_VALIDATION_FAILED')),
      ).toThrow(BadRequestException);
    });
    it('RATE_LIMITED -> ForbiddenException', () => {
      expect(() => mapCustomerError(new CustomerApplicationError('CUSTOMER_RATE_LIMITED'))).toThrow(
        ForbiddenException,
      );
    });
    it('RETENTION_CONFIG_MISSING -> ServiceUnavailableException', () => {
      expect(() =>
        mapCustomerError(new CustomerApplicationError('CUSTOMER_RETENTION_CONFIG_MISSING')),
      ).toThrow(ServiceUnavailableException);
    });
    it('RETENTION_CONFIG_INVALID -> ServiceUnavailableException', () => {
      expect(() =>
        mapCustomerError(new CustomerApplicationError('CUSTOMER_RETENTION_CONFIG_INVALID')),
      ).toThrow(ServiceUnavailableException);
    });
    it('RETENTION_PROCESSING_FAILED -> ServiceUnavailableException', () => {
      expect(() =>
        mapCustomerError(new CustomerApplicationError('CUSTOMER_RETENTION_PROCESSING_FAILED')),
      ).toThrow(ServiceUnavailableException);
    });
  });

  describe('CustomerDomainError', () => {
    it('STATE_CONFLICT -> ConflictException', () => {
      expect(() => mapCustomerError(new CustomerDomainError('CUSTOMER_STATE_CONFLICT'))).toThrow(
        ConflictException,
      );
    });
    it('TRANSITION_FORBIDDEN -> ConflictException', () => {
      expect(() =>
        mapCustomerError(new CustomerDomainError('CUSTOMER_TRANSITION_FORBIDDEN')),
      ).toThrow(ConflictException);
    });
    it('OWNERSHIP_CONFLICT -> ConflictException', () => {
      expect(() =>
        mapCustomerError(new CustomerDomainError('CUSTOMER_OWNERSHIP_CONFLICT')),
      ).toThrow(ConflictException);
    });
    it('ADDRESS_CONFLICT -> ConflictException', () => {
      expect(() => mapCustomerError(new CustomerDomainError('CUSTOMER_ADDRESS_CONFLICT'))).toThrow(
        ConflictException,
      );
    });
    it('DEFAULT_ADDRESS_CONFLICT -> ConflictException', () => {
      expect(() =>
        mapCustomerError(new CustomerDomainError('CUSTOMER_DEFAULT_ADDRESS_CONFLICT')),
      ).toThrow(ConflictException);
    });
    it('BUSINESS_PROFILE_CONFLICT -> ConflictException', () => {
      expect(() =>
        mapCustomerError(new CustomerDomainError('CUSTOMER_BUSINESS_PROFILE_CONFLICT')),
      ).toThrow(ConflictException);
    });
    it('UPDATE_FORBIDDEN -> BadRequestException', () => {
      expect(() => mapCustomerError(new CustomerDomainError('CUSTOMER_UPDATE_FORBIDDEN'))).toThrow(
        BadRequestException,
      );
    });
    it('READ_FORBIDDEN -> BadRequestException', () => {
      expect(() => mapCustomerError(new CustomerDomainError('CUSTOMER_READ_FORBIDDEN'))).toThrow(
        BadRequestException,
      );
    });
    it('PREFERENCE_KEY_FORBIDDEN -> BadRequestException', () => {
      expect(() =>
        mapCustomerError(new CustomerDomainError('CUSTOMER_PREFERENCE_KEY_FORBIDDEN')),
      ).toThrow(BadRequestException);
    });
    it('REASON_REQUIRED -> BadRequestException', () => {
      expect(() => mapCustomerError(new CustomerDomainError('CUSTOMER_REASON_REQUIRED'))).toThrow(
        BadRequestException,
      );
    });
    it('ACTOR_REQUIRED -> BadRequestException', () => {
      expect(() => mapCustomerError(new CustomerDomainError('CUSTOMER_ACTOR_REQUIRED'))).toThrow(
        BadRequestException,
      );
    });
    it('PRECONDITION_FAILED -> BadRequestException', () => {
      expect(() =>
        mapCustomerError(new CustomerDomainError('CUSTOMER_PRECONDITION_FAILED')),
      ).toThrow(BadRequestException);
    });
    it('RETENTION_CONFIG_MISSING -> ServiceUnavailableException', () => {
      expect(() =>
        mapCustomerError(new CustomerDomainError('CUSTOMER_RETENTION_CONFIG_MISSING')),
      ).toThrow(ServiceUnavailableException);
    });
    it('RETENTION_CONFIG_INVALID -> ServiceUnavailableException', () => {
      expect(() =>
        mapCustomerError(new CustomerDomainError('CUSTOMER_RETENTION_CONFIG_INVALID')),
      ).toThrow(ServiceUnavailableException);
    });
  });
});

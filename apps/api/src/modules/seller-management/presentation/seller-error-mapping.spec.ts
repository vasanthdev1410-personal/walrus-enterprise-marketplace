import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { SellerApplicationErrorCode } from '../application/errors/seller-application.error';
import { SellerApplicationError } from '../application/errors/seller-application.error';
import type { SellerDomainErrorCode } from '../domain/errors/seller-domain.error';
import { SellerDomainError } from '../domain/errors/seller-domain.error';
import { mapSellerError } from './seller-error-mapping';

/**
 * WEMP-M03-SPEC-001 §12.5/§12.7 (M03-M5). Unit coverage of the non-disclosing
 * presentation error mapping: every application and domain error code resolves
 * to its generic HTTP error, and unknown errors propagate unchanged. The map
 * never leaks evidence, policy, reviewer or database internals.
 */
describe('mapSellerError (M03-M5 presentation error mapping)', () => {
  function expectMappedTo(
    error: unknown,
    httpError: new (message?: string) => Error,
    message: string,
  ): void {
    expect(() => mapSellerError(error)).toThrow(httpError);
    try {
      mapSellerError(error);
    } catch (caught) {
      if (caught instanceof BadRequestException) {
        expect(caught.getResponse()).toMatchObject({ message });
      }
    }
  }

  describe('application errors', () => {
    it.each([['SELLER_NOT_FOUND'], ['SELLER_OWNERSHIP_DENIED']] as const)(
      'maps %s to a non-enumerating 404',
      (code: SellerApplicationErrorCode) => {
        expectMappedTo(new SellerApplicationError(code), NotFoundException, 'SELLER_NOT_FOUND');
      },
    );

    it.each([
      ['SELLER_STATE_CONFLICT'],
      ['SELLER_TRANSITION_FORBIDDEN'],
      ['SELLER_DUPLICATE_DETECTED'],
      ['SELLER_ROLE_ASSIGNMENT_DENIED'],
      ['SELLER_ROLE_REVOCATION_FAILED'],
    ] as const)('maps %s to a generic 409', (code: SellerApplicationErrorCode) => {
      expectMappedTo(new SellerApplicationError(code), ConflictException, 'SELLER_STATE_CONFLICT');
    });

    it.each([
      ['SELLER_IDENTITY_INELIGIBLE'],
      ['SELLER_SOD_VIOLATION'],
      ['SELLER_ADMIN_AUTHORIZATION_DENIED'],
    ] as const)('maps %s to a generic 403', (code: SellerApplicationErrorCode) => {
      expectMappedTo(new SellerApplicationError(code), ForbiddenException, 'AUTHORIZATION_DENIED');
    });

    it.each([
      ['SELLER_PRECONDITION_FAILED'],
      ['SELLER_VERIFICATION_INVALID'],
      ['SELLER_EVIDENCE_INTEGRITY_FAILED'],
      ['SELLER_RETENTION_CONFIG_MISSING'],
      ['SELLER_RETENTION_CONFIG_INVALID'],
      ['SELLER_RETENTION_PROCESSING_FAILED'],
      ['SELLER_LEGAL_HOLD_CONFLICT'],
      ['SELLER_IDEMPOTENCY_CONFLICT'],
    ] as const)('maps %s to a generic 400', (code: SellerApplicationErrorCode) => {
      expectMappedTo(
        new SellerApplicationError(code),
        BadRequestException,
        'SELLER_PRECONDITION_FAILED',
      );
    });
  });

  describe('domain errors', () => {
    it.each([
      ['SELLER_OWNER_CONFLICT'],
      ['SELLER_ASSOCIATION_CONFLICT'],
      ['SELLER_VERIFICATION_CONFLICT'],
      ['SELLER_AGREEMENT_CONFLICT'],
      ['SELLER_UPDATE_FORBIDDEN'],
    ] as const)('maps %s to a generic 409', (code: SellerDomainErrorCode) => {
      expectMappedTo(new SellerDomainError(code), ConflictException, 'SELLER_STATE_CONFLICT');
    });

    it.each([['SELLER_SOD_VIOLATION']] as const)(
      'maps %s to a generic 403',
      (code: SellerDomainErrorCode) => {
        expectMappedTo(new SellerDomainError(code), ForbiddenException, 'AUTHORIZATION_DENIED');
      },
    );

    it.each([
      ['SELLER_STATE_CONFLICT'],
      ['SELLER_TRANSITION_FORBIDDEN'],
      ['SELLER_ACTOR_REQUIRED'],
      ['SELLER_REASON_REQUIRED'],
      ['SELLER_PRECONDITION_FAILED'],
      ['SELLER_INVALID_EVIDENCE'],
      ['SELLER_RETENTION_CONFIG_MISSING'],
      ['SELLER_RETENTION_CONFIG_INVALID'],
    ] as const)('maps %s to a generic 400', (code: SellerDomainErrorCode) => {
      expectMappedTo(
        new SellerDomainError(code),
        BadRequestException,
        'SELLER_PRECONDITION_FAILED',
      );
    });
  });

  describe('unknown errors', () => {
    it('propagates non-seller errors unchanged (never swallowed)', () => {
      const unknown = new Error('database outage');
      expect(() => mapSellerError(unknown)).toThrow(unknown);
    });
  });
});

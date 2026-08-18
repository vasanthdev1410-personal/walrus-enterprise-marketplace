import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CustomerApplicationError } from '../application/errors/customer-application.error';
import { CustomerDomainError } from '../domain/errors/customer-domain.error';

/**
 * WEMP-M06-SPEC-001 §17/§19 (M06-M5). Stable, non-disclosing mapping from
 * internal customer error codes (application and domain) to HTTP errors. A
 * missing, another identity's, or CLOSED profile is indistinguishable (404
 * CUSTOMER_NOT_FOUND — anti-enumeration, M06-R03); authorization and
 * ownership denials are generic (403 AUTHORIZATION_DENIED); lifecycle/version
 * conflicts are generic (409 CUSTOMER_STATE_CONFLICT); validation/precondition
 * failures are generic (400 CUSTOMER_PRECONDITION_FAILED); rate limiting is
 * 429 RATE_LIMIT_EXCEEDED (D-10); a retention-processing failure is 503
 * (fail closed — never a silent partial deletion). No customer, address,
 * preference, policy, ownership, or database internals are ever exposed.
 */
export function mapCustomerError(error: unknown): never {
  if (error instanceof CustomerApplicationError) {
    switch (error.code) {
      case 'CUSTOMER_NOT_FOUND':
      case 'CUSTOMER_OWNERSHIP_DENIED':
        // Anti-enumeration: another identity's profile and a CLOSED profile
        // are indistinguishable from an unknown profile.
        throw new NotFoundException('CUSTOMER_NOT_FOUND');
      case 'CUSTOMER_ADMIN_AUTHORIZATION_DENIED':
        throw new ForbiddenException('AUTHORIZATION_DENIED');
      case 'CUSTOMER_STATE_CONFLICT':
      case 'CUSTOMER_TRANSITION_FORBIDDEN':
      case 'CUSTOMER_DUPLICATE_DETECTED':
      case 'CUSTOMER_ADDRESS_CONFLICT':
      case 'CUSTOMER_BUSINESS_PROFILE_CONFLICT':
      case 'CUSTOMER_IDEMPOTENCY_CONFLICT':
        throw new ConflictException('CUSTOMER_STATE_CONFLICT');
      case 'CUSTOMER_UPDATE_FORBIDDEN':
      case 'CUSTOMER_READ_FORBIDDEN':
      case 'CUSTOMER_PREFERENCE_FORBIDDEN':
      case 'CUSTOMER_REASON_REQUIRED':
      case 'CUSTOMER_VALIDATION_FAILED':
        throw new BadRequestException('CUSTOMER_PRECONDITION_FAILED');
      case 'CUSTOMER_RATE_LIMITED':
        throw new ForbiddenException('RATE_LIMIT_EXCEEDED');
      case 'CUSTOMER_RETENTION_CONFIG_MISSING':
      case 'CUSTOMER_RETENTION_CONFIG_INVALID':
        throw new ServiceUnavailableException('CUSTOMER_RETENTION_UNAVAILABLE');
      case 'CUSTOMER_RETENTION_PROCESSING_FAILED':
        throw new ServiceUnavailableException('CUSTOMER_RETENTION_PROCESSING_FAILED');
      default:
        throw new BadRequestException('CUSTOMER_PRECONDITION_FAILED');
    }
  }
  if (error instanceof CustomerDomainError) {
    switch (error.code) {
      case 'CUSTOMER_STATE_CONFLICT':
      case 'CUSTOMER_TRANSITION_FORBIDDEN':
      case 'CUSTOMER_OWNERSHIP_CONFLICT':
      case 'CUSTOMER_ADDRESS_CONFLICT':
      case 'CUSTOMER_DEFAULT_ADDRESS_CONFLICT':
      case 'CUSTOMER_BUSINESS_PROFILE_CONFLICT':
        throw new ConflictException('CUSTOMER_STATE_CONFLICT');
      case 'CUSTOMER_UPDATE_FORBIDDEN':
      case 'CUSTOMER_READ_FORBIDDEN':
      case 'CUSTOMER_PREFERENCE_KEY_FORBIDDEN':
      case 'CUSTOMER_REASON_REQUIRED':
      case 'CUSTOMER_ACTOR_REQUIRED':
      case 'CUSTOMER_PRECONDITION_FAILED':
        throw new BadRequestException('CUSTOMER_PRECONDITION_FAILED');
      case 'CUSTOMER_RETENTION_CONFIG_MISSING':
      case 'CUSTOMER_RETENTION_CONFIG_INVALID':
        throw new ServiceUnavailableException('CUSTOMER_RETENTION_UNAVAILABLE');
      default:
        throw new BadRequestException('CUSTOMER_PRECONDITION_FAILED');
    }
  }
  throw error;
}

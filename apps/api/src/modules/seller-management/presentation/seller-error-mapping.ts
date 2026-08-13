import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { SellerApplicationError } from '../application/errors/seller-application.error';
import { SellerDomainError } from '../domain/errors/seller-domain.error';

/**
 * WEMP-M03-SPEC-001 §12.5/§12.7 (M03-M5). Stable, non-disclosing mapping from
 * internal seller error codes (application and domain) to HTTP errors. A
 * missing or forbidden seller is indistinguishable (404 SELLER_NOT_FOUND);
 * authorization and eligibility denials are generic (403 AUTHORIZATION_DENIED);
 * lifecycle conflicts are generic (409 SELLER_STATE_CONFLICT); precondition
 * failures are generic (400 SELLER_PRECONDITION_FAILED). No evidence, policy,
 * reviewer, or database internals are ever exposed.
 */
export function mapSellerError(error: unknown): never {
  if (error instanceof SellerApplicationError) {
    switch (error.code) {
      case 'SELLER_NOT_FOUND':
      case 'SELLER_OWNERSHIP_DENIED':
        throw new NotFoundException('SELLER_NOT_FOUND');
      case 'SELLER_STATE_CONFLICT':
      case 'SELLER_TRANSITION_FORBIDDEN':
      case 'SELLER_DUPLICATE_DETECTED':
      case 'SELLER_ROLE_ASSIGNMENT_DENIED':
      case 'SELLER_ROLE_REVOCATION_FAILED':
        throw new ConflictException('SELLER_STATE_CONFLICT');
      case 'SELLER_IDENTITY_INELIGIBLE':
      case 'SELLER_SOD_VIOLATION':
      case 'SELLER_ADMIN_AUTHORIZATION_DENIED':
        throw new ForbiddenException('AUTHORIZATION_DENIED');
      case 'SELLER_PRECONDITION_FAILED':
      case 'SELLER_VERIFICATION_INVALID':
      case 'SELLER_EVIDENCE_INTEGRITY_FAILED':
      default:
        throw new BadRequestException('SELLER_PRECONDITION_FAILED');
    }
  }
  if (error instanceof SellerDomainError) {
    switch (error.code) {
      case 'SELLER_OWNER_CONFLICT':
      case 'SELLER_ASSOCIATION_CONFLICT':
      case 'SELLER_VERIFICATION_CONFLICT':
      case 'SELLER_AGREEMENT_CONFLICT':
        throw new ConflictException('SELLER_STATE_CONFLICT');
      case 'SELLER_UPDATE_FORBIDDEN':
        throw new ConflictException('SELLER_STATE_CONFLICT');
      case 'SELLER_SOD_VIOLATION':
        throw new ForbiddenException('AUTHORIZATION_DENIED');
      case 'SELLER_STATE_CONFLICT':
      case 'SELLER_TRANSITION_FORBIDDEN':
      case 'SELLER_ACTOR_REQUIRED':
      case 'SELLER_REASON_REQUIRED':
      case 'SELLER_PRECONDITION_FAILED':
      case 'SELLER_INVALID_EVIDENCE':
      case 'SELLER_RETENTION_CONFIG_MISSING':
      case 'SELLER_RETENTION_CONFIG_INVALID':
      default:
        throw new BadRequestException('SELLER_PRECONDITION_FAILED');
    }
  }
  throw error;
}

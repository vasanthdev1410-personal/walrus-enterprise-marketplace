import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { PrismaIdentityRepository } from './repositories/prisma-identity.repository';
import { PrismaRecoveryRequestRepository } from './repositories/prisma-recovery-request.repository';
import { PrismaSessionRepository } from './repositories/prisma-session.repository';
import { PrismaVerificationChallengeRepository } from './repositories/prisma-verification-challenge.repository';
import { PrismaApiIdempotencyRepository } from './repositories/prisma-api-idempotency.repository';

export const IDENTITY_REPOSITORY = Symbol('IDENTITY_REPOSITORY');
export const SESSION_REPOSITORY = Symbol('SESSION_REPOSITORY');
export const VERIFICATION_CHALLENGE_REPOSITORY = Symbol('VERIFICATION_CHALLENGE_REPOSITORY');
export const RECOVERY_REQUEST_REPOSITORY = Symbol('RECOVERY_REQUEST_REPOSITORY');
export const API_IDEMPOTENCY_REPOSITORY = Symbol('API_IDEMPOTENCY_REPOSITORY');

@Global()
@Module({
  providers: [
    PrismaService,
    PrismaIdentityRepository,
    PrismaSessionRepository,
    PrismaVerificationChallengeRepository,
    PrismaRecoveryRequestRepository,
    PrismaApiIdempotencyRepository,
    { provide: IDENTITY_REPOSITORY, useExisting: PrismaIdentityRepository },
    { provide: SESSION_REPOSITORY, useExisting: PrismaSessionRepository },
    {
      provide: VERIFICATION_CHALLENGE_REPOSITORY,
      useExisting: PrismaVerificationChallengeRepository,
    },
    { provide: RECOVERY_REQUEST_REPOSITORY, useExisting: PrismaRecoveryRequestRepository },
    { provide: API_IDEMPOTENCY_REPOSITORY, useExisting: PrismaApiIdempotencyRepository },
  ],
  exports: [
    PrismaService,
    IDENTITY_REPOSITORY,
    SESSION_REPOSITORY,
    VERIFICATION_CHALLENGE_REPOSITORY,
    RECOVERY_REQUEST_REPOSITORY,
    API_IDEMPOTENCY_REPOSITORY,
  ],
})
// NestJS modules are declarative metadata containers and intentionally have no members.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class PrismaModule {}

import { Global, Module } from '@nestjs/common';
import type {
  ClockPort,
  UuidV7GenerationPort,
} from '../identity-authentication/application/ports/application-runtime.port';
import {
  APPROVAL_AUTHORIZATION,
  CLOCK,
  UUID_V7_GENERATOR,
} from '../identity-authentication/identity-authentication.tokens';
import {
  SystemClockAdapter,
  SystemUuidV7Generator,
} from '../identity-authentication/infrastructure/runtime/system-runtime.adapter';
import type { AuthorizationMutationPort } from './application/ports/authorization-mutation.port';
import type { PrivilegedEligibilityPort } from './application/ports/privileged-eligibility.port';
import type { SellerOwnershipResolverPort } from './application/ports/seller-ownership-resolver.port';
import { AuthorizationApplicationService } from './application/services/authorization-application.service';
import { PrivilegedActivationService } from './application/services/privileged-activation.service';
import { ReadinessInboxService } from './application/services/readiness-inbox.service';
import { TrustedWorkloadVerifierService } from './application/services/trusted-workload-verifier.service';
import type {
  TrustedPeerCertificatePort,
  TrustedWorkloadKeyResolverPort,
  TrustedWorkloadReplayPort,
} from './application/ports/trusted-workload.port';
import { ConfigurationService } from '../../platform/configuration/configuration.service';
import {
  AUTHORIZATION_APPLICATION_SERVICE,
  AUTHORIZATION_DECISION_REPOSITORY,
  AUTHORIZATION_MUTATION,
  IDENTITY_ROLE_ASSIGNMENT_REPOSITORY,
  PRIVILEGED_ELIGIBILITY,
  SELLER_OWNERSHIP_RESOLVER,
  TRUSTED_PEER_CERTIFICATE,
  TRUSTED_WORKLOAD_KEY_RESOLVER,
  TRUSTED_WORKLOAD_REPLAY,
  TRUSTED_WORKLOAD_VERIFIER,
} from './authorization.tokens';
import { AuthorizationDecisionEngine } from './domain/authorization-decision-engine';
import { PermissionCatalog } from './domain/permission-catalog';
import type { AuthorizationDecisionRepository } from './domain/repositories/authorization-decision-repository';
import type { IdentityRoleAssignmentRepository } from './domain/repositories/identity-role-assignment-repository';
import { RoleCatalog } from './domain/role-catalog';
import { PrismaAuthorizationDecisionRepository } from './infrastructure/persistence/prisma/repositories/prisma-authorization-decision.repository';
import { PrismaAuthorizationMutationRepository } from './infrastructure/persistence/prisma/repositories/prisma-authorization-mutation.repository';
import { PrismaIdentityRoleAssignmentRepository } from './infrastructure/persistence/prisma/repositories/prisma-identity-role-assignment.repository';
import { PrismaPrivilegedEligibilityRepository } from './infrastructure/persistence/prisma/repositories/prisma-privileged-eligibility.repository';
import { PrismaTrustedWorkloadReplayRepository } from './infrastructure/persistence/prisma/repositories/prisma-trusted-workload-replay.repository';
import { NativeTlsPeerCertificateAdapter } from './infrastructure/trusted-workload/native-tls-peer-certificate.adapter';
import { FileWorkloadKeyResolverAdapter } from './infrastructure/trusted-workload/file-workload-key-resolver.adapter';
import { DirectMtlsIngressService } from './infrastructure/trusted-workload/direct-mtls-ingress.service';
import { SignedBoundaryEvidenceService } from './infrastructure/trusted-workload/signed-boundary-evidence.service';
import { HumanAuthorizationBoundaryV2Adapter } from './infrastructure/boundaries/human-authorization-boundary-v2.adapter';
import {
  BOOTSTRAP_AUTHORIZATION,
  CLASSIFICATION_TRANSITION_COORDINATION,
  IDENTITY_STATE_CHANGE_AUTHORIZATION,
  PRIVILEGED_PROVISIONING_AUTHORIZATION,
} from '../identity-authentication/presentation/authentication.tokens';
import { WorkloadAuthorizationBoundaryV2Adapter } from './infrastructure/boundaries/workload-authorization-boundary-v2.adapter';

@Global()
@Module({
  providers: [
    { provide: CLOCK, useClass: SystemClockAdapter },
    { provide: UUID_V7_GENERATOR, useClass: SystemUuidV7Generator },
    PrismaIdentityRoleAssignmentRepository,
    PrismaAuthorizationDecisionRepository,
    PrismaAuthorizationMutationRepository,
    PrismaPrivilegedEligibilityRepository,
    PrismaTrustedWorkloadReplayRepository,
    DirectMtlsIngressService,
    SignedBoundaryEvidenceService,
    HumanAuthorizationBoundaryV2Adapter,
    WorkloadAuthorizationBoundaryV2Adapter,
    { provide: APPROVAL_AUTHORIZATION, useExisting: HumanAuthorizationBoundaryV2Adapter },
    {
      provide: IDENTITY_STATE_CHANGE_AUTHORIZATION,
      useExisting: HumanAuthorizationBoundaryV2Adapter,
    },
    {
      provide: CLASSIFICATION_TRANSITION_COORDINATION,
      useExisting: WorkloadAuthorizationBoundaryV2Adapter,
    },
    {
      provide: PRIVILEGED_PROVISIONING_AUTHORIZATION,
      useExisting: WorkloadAuthorizationBoundaryV2Adapter,
    },
    { provide: BOOTSTRAP_AUTHORIZATION, useExisting: WorkloadAuthorizationBoundaryV2Adapter },
    {
      provide: IDENTITY_ROLE_ASSIGNMENT_REPOSITORY,
      useExisting: PrismaIdentityRoleAssignmentRepository,
    },
    {
      provide: AUTHORIZATION_DECISION_REPOSITORY,
      useExisting: PrismaAuthorizationDecisionRepository,
    },
    { provide: AUTHORIZATION_MUTATION, useExisting: PrismaAuthorizationMutationRepository },
    { provide: PRIVILEGED_ELIGIBILITY, useExisting: PrismaPrivilegedEligibilityRepository },
    { provide: TRUSTED_WORKLOAD_REPLAY, useExisting: PrismaTrustedWorkloadReplayRepository },
    {
      provide: TRUSTED_WORKLOAD_KEY_RESOLVER,
      inject: [ConfigurationService],
      useFactory: (configuration: ConfigurationService) =>
        new FileWorkloadKeyResolverAdapter(
          configuration.values.WI1_VERIFICATION_KEYS_PATH,
          parseStringArray(configuration.values.WI1_REVOKED_KEY_IDS, 'WI1_REVOKED_KEY_IDS'),
        ),
    },
    {
      provide: TRUSTED_PEER_CERTIFICATE,
      inject: [ConfigurationService],
      useFactory: (configuration: ConfigurationService) =>
        new NativeTlsPeerCertificateAdapter(configuration.values.INTERNAL_MTLS_ALLOWED_SAN_SUFFIX),
    },
    {
      provide: TRUSTED_WORKLOAD_VERIFIER,
      inject: [TRUSTED_WORKLOAD_KEY_RESOLVER, TRUSTED_PEER_CERTIFICATE, TRUSTED_WORKLOAD_REPLAY],
      useFactory: (
        keys: TrustedWorkloadKeyResolverPort,
        certificates: TrustedPeerCertificatePort,
        replay: TrustedWorkloadReplayPort,
      ) => new TrustedWorkloadVerifierService(keys, certificates, replay),
    },
    {
      provide: AUTHORIZATION_APPLICATION_SERVICE,
      inject: [
        IDENTITY_ROLE_ASSIGNMENT_REPOSITORY,
        AUTHORIZATION_DECISION_REPOSITORY,
        AUTHORIZATION_MUTATION,
        CLOCK,
        UUID_V7_GENERATOR,
        PRIVILEGED_ELIGIBILITY,
        // D-11: the seller ownership resolver is provided by the Module 03
        // seller-management module. Optional — when absent, every
        // organization-scoped seller.* decision fails closed.
        { token: SELLER_OWNERSHIP_RESOLVER, optional: true },
      ],
      useFactory: (
        assignments: IdentityRoleAssignmentRepository,
        decisions: AuthorizationDecisionRepository,
        mutations: AuthorizationMutationPort,
        clock: ClockPort,
        identifiers: UuidV7GenerationPort,
        privilegedEligibility: PrivilegedEligibilityPort,
        sellerOwnershipResolver?: SellerOwnershipResolverPort,
      ) => {
        const permissions = new PermissionCatalog();
        const roles = new RoleCatalog();
        return new AuthorizationApplicationService(
          new AuthorizationDecisionEngine(permissions, roles),
          roles,
          assignments,
          decisions,
          mutations,
          clock,
          identifiers,
          privilegedEligibility,
          sellerOwnershipResolver,
        );
      },
    },
    PrivilegedActivationService,
    ReadinessInboxService,
  ],
  exports: [
    AUTHORIZATION_APPLICATION_SERVICE,
    IDENTITY_ROLE_ASSIGNMENT_REPOSITORY,
    AUTHORIZATION_DECISION_REPOSITORY,
    PRIVILEGED_ELIGIBILITY,
    PrivilegedActivationService,
    ReadinessInboxService,
    TRUSTED_WORKLOAD_VERIFIER,
    DirectMtlsIngressService,
    SignedBoundaryEvidenceService,
    APPROVAL_AUTHORIZATION,
    IDENTITY_STATE_CHANGE_AUTHORIZATION,
    CLASSIFICATION_TRANSITION_COORDINATION,
    PRIVILEGED_PROVISIONING_AUTHORIZATION,
    BOOTSTRAP_AUTHORIZATION,
  ],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class AuthorizationCoreModule {}

function parseStringArray(value: string, name: string): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== 'string'))
      throw new Error();
    return parsed as string[];
  } catch {
    throw new Error(`${name} must be a JSON array of strings`);
  }
}

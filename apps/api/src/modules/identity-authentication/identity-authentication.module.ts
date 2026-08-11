import { Module } from '@nestjs/common';
import { ConfigurationService } from '../../platform/configuration/configuration.service';
import { ApiIdempotencyService } from './application/services/api-idempotency.service';
import { AuthenticationApplicationService } from './application/services/authentication-application.service';
import { ClassificationTransitionApplicationService } from './application/services/classification-transition-application.service';
import { IdentityLifecycleApplicationService } from './application/services/identity-lifecycle-application.service';
import { IdentityManagementApplicationService } from './application/services/identity-management-application.service';
import { MfaEnrollmentApplicationService } from './application/services/mfa-enrollment-application.service';
import { MfaReplacementApplicationService } from './application/services/mfa-replacement-application.service';
import { PasswordResetApplicationService } from './application/services/password-reset-application.service';
import { RecoveryCodeSetApplicationService } from './application/services/recovery-code-set-application.service';
import { RecoveryRequestApplicationService } from './application/services/recovery-request-application.service';
import { RegistrationApplicationService } from './application/services/registration-application.service';
import { SessionManagementApplicationService } from './application/services/session-management-application.service';
import { TrustedDeviceManagementApplicationService } from './application/services/trusted-device-management-application.service';
import { TotpMfaAuthenticationAdapter } from './application/services/totp-mfa-authentication.adapter';
import { VerificationApplicationService } from './application/services/verification-application.service';
import { Argon2idPasswordHashingAdapter } from './infrastructure/cryptography/argon2id-password-hashing.adapter';
import { NonProductionCsrfAdapter } from './infrastructure/cryptography/non-production-csrf.adapter';
import { NonProductionEnvelopeEncryptionAdapter } from './infrastructure/cryptography/non-production-envelope-encryption.adapter';
import { NonProductionIdentifierLookupAdapter } from './infrastructure/cryptography/non-production-identifier-lookup.adapter';
import { NonProductionJwtAdapter } from './infrastructure/cryptography/non-production-jwt.adapter';
import { NonProductionOtpRecoveryCodeAdapter } from './infrastructure/cryptography/non-production-otp-recovery-code.adapter';
import { NonProductionRefreshTokenAdapter } from './infrastructure/cryptography/non-production-refresh-token.adapter';
import { NonProductionTotpAdapter } from './infrastructure/cryptography/non-production-totp.adapter';
import { NonProductionOtpDeliveryAdapter } from './infrastructure/delivery/non-production-otp-delivery.adapter';
import { NonProductionApprovalAuthorizationAdapter } from './infrastructure/authorization/non-production-approval-authorization.adapter';
import { NonProductionClassificationTransitionCoordinationAdapter } from './infrastructure/authorization/non-production-classification-transition-coordination.adapter';
import { NonProductionIdentityStateChangeAuthorizationAdapter } from './infrastructure/authorization/non-production-identity-state-change-authorization.adapter';
import { createIdentityAuthenticationConfiguration } from './infrastructure/configuration/identity-authentication.configuration';
import {
  API_IDEMPOTENCY_REPOSITORY,
  BASIC_AUDIT_REPOSITORY,
  IDENTITY_REPOSITORY,
  NON_PRODUCTION_RATE_LIMIT_REPOSITORY,
  PrismaModule,
  RECOVERY_REQUEST_REPOSITORY,
  SESSION_REPOSITORY,
  VERIFICATION_CHALLENGE_REPOSITORY,
} from './infrastructure/persistence/prisma/prisma.module';
import {
  SystemClockAdapter,
  SystemUuidV7Generator,
} from './infrastructure/runtime/system-runtime.adapter';
import { AuthenticationController } from './presentation/authentication.controller';
import { CredentialsController } from './presentation/credentials.controller';
import { IdentityController } from './presentation/identity.controller';
import { IdentityLifecycleController } from './presentation/identity-lifecycle.controller';
import { InternalIdentityController } from './presentation/internal-identity.controller';
import { MfaController } from './presentation/mfa.controller';
import { RecoveryController } from './presentation/recovery.controller';
import { RegistrationController } from './presentation/registration.controller';
import { SessionsController } from './presentation/sessions.controller';
import { TrustedDevicesController } from './presentation/trusted-devices.controller';
import { VerificationController } from './presentation/verification.controller';
import {
  AUTHENTICATION_APPLICATION_SERVICE,
  BASIC_AUDIT_LOGGER,
  CLASSIFICATION_TRANSITION_APPLICATION_SERVICE,
  CLASSIFICATION_TRANSITION_COORDINATION,
  CSRF_PROTECTION,
  IDENTITY_LIFECYCLE_APPLICATION_SERVICE,
  IDENTITY_MANAGEMENT_APPLICATION_SERVICE,
  IDENTITY_STATE_CHANGE_AUTHORIZATION,
  MFA_ENROLLMENT_APPLICATION_SERVICE,
  MFA_REPLACEMENT_APPLICATION_SERVICE,
  PASSWORD_RESET_APPLICATION_SERVICE,
  RATE_LIMITER,
  RECOVERY_CODE_SET_APPLICATION_SERVICE,
  RECOVERY_REQUEST_APPLICATION_SERVICE,
  REGISTRATION_APPLICATION_SERVICE,
  SESSION_MANAGEMENT_APPLICATION_SERVICE,
  TRUSTED_DEVICE_MANAGEMENT_APPLICATION_SERVICE,
  VERIFICATION_APPLICATION_SERVICE,
} from './presentation/authentication.tokens';
import { Aal2SessionGuard } from './presentation/guards/aal2-session.guard';
import { AuthoritativeSessionGuard } from './presentation/guards/authoritative-session.guard';
import { NonProductionRateLimiterGuard } from './presentation/guards/non-production-rate-limiter.guard';
import { BasicAuditInterceptor } from './presentation/interceptors/basic-audit.interceptor';
import {
  API_IDEMPOTENCY,
  APPROVAL_AUTHORIZATION,
  CLOCK,
  ENVELOPE_ENCRYPTION,
  JWT_CRYPTOGRAPHY,
  UUID_V7_GENERATOR,
} from './identity-authentication.tokens';

const MODULE_CONFIGURATION = Symbol('MODULE_CONFIGURATION');
const PASSWORD_HASHING = Symbol('PASSWORD_HASHING');
const IDENTIFIER_LOOKUP = Symbol('IDENTIFIER_LOOKUP');
const REFRESH_TOKENS = Symbol('REFRESH_TOKENS');
const TOTP = Symbol('TOTP');
const MFA = Symbol('MFA');
const OTP_CRYPTOGRAPHY = Symbol('OTP_CRYPTOGRAPHY');
const OTP_DELIVERY = Symbol('OTP_DELIVERY');

@Module({
  imports: [PrismaModule],
  controllers: [
    AuthenticationController,
    CredentialsController,
    IdentityController,
    IdentityLifecycleController,
    InternalIdentityController,
    MfaController,
    RecoveryController,
    RegistrationController,
    SessionsController,
    TrustedDevicesController,
    VerificationController,
  ],
  providers: [
    { provide: CLOCK, useClass: SystemClockAdapter },
    { provide: UUID_V7_GENERATOR, useClass: SystemUuidV7Generator },
    {
      provide: MODULE_CONFIGURATION,
      useFactory: () => createIdentityAuthenticationConfiguration(process.env),
    },
    {
      provide: ENVELOPE_ENCRYPTION,
      inject: [MODULE_CONFIGURATION, ConfigurationService],
      useFactory: (
        configuration: ReturnType<typeof createIdentityAuthenticationConfiguration>,
        application: ConfigurationService,
      ) =>
        NonProductionEnvelopeEncryptionAdapter.fromFileReferences(
          configuration,
          application.values.APP_ENV,
        ),
    },
    {
      provide: JWT_CRYPTOGRAPHY,
      inject: [MODULE_CONFIGURATION, ConfigurationService],
      useFactory: (
        configuration: ReturnType<typeof createIdentityAuthenticationConfiguration>,
        application: ConfigurationService,
      ) => NonProductionJwtAdapter.fromPemFileReferences(configuration, application.values.APP_ENV),
    },
    {
      provide: IDENTIFIER_LOOKUP,
      inject: [MODULE_CONFIGURATION, ConfigurationService],
      useFactory: (
        configuration: ReturnType<typeof createIdentityAuthenticationConfiguration>,
        application: ConfigurationService,
      ) =>
        NonProductionIdentifierLookupAdapter.fromFileReferences(
          configuration,
          application.values.APP_ENV,
        ),
    },
    {
      provide: REFRESH_TOKENS,
      inject: [MODULE_CONFIGURATION, ConfigurationService],
      useFactory: (
        configuration: ReturnType<typeof createIdentityAuthenticationConfiguration>,
        application: ConfigurationService,
      ) =>
        NonProductionRefreshTokenAdapter.fromFileReferences(
          configuration,
          application.values.APP_ENV,
        ),
    },
    {
      provide: PASSWORD_HASHING,
      inject: [MODULE_CONFIGURATION],
      useFactory: (configuration: ReturnType<typeof createIdentityAuthenticationConfiguration>) =>
        new Argon2idPasswordHashingAdapter(configuration),
    },
    {
      provide: TOTP,
      inject: [ENVELOPE_ENCRYPTION, MODULE_CONFIGURATION, ConfigurationService],
      useFactory: (
        encryption: NonProductionEnvelopeEncryptionAdapter,
        configuration: ReturnType<typeof createIdentityAuthenticationConfiguration>,
        application: ConfigurationService,
      ) => new NonProductionTotpAdapter(encryption, configuration, application.values.APP_ENV),
    },
    {
      provide: OTP_CRYPTOGRAPHY,
      inject: [MODULE_CONFIGURATION, ConfigurationService],
      useFactory: (
        configuration: ReturnType<typeof createIdentityAuthenticationConfiguration>,
        application: ConfigurationService,
      ) =>
        NonProductionOtpRecoveryCodeAdapter.fromFileReferences(
          configuration,
          application.values.APP_ENV,
        ),
    },
    {
      provide: OTP_DELIVERY,
      inject: [ConfigurationService],
      useFactory: (application: ConfigurationService) =>
        new NonProductionOtpDeliveryAdapter(application.values.APP_ENV),
    },
    {
      provide: MFA,
      inject: [
        IDENTITY_REPOSITORY,
        VERIFICATION_CHALLENGE_REPOSITORY,
        TOTP,
        CLOCK,
        UUID_V7_GENERATOR,
        MODULE_CONFIGURATION,
        ConfigurationService,
      ],
      useFactory: (
        identities: never,
        challenges: never,
        totp: NonProductionTotpAdapter,
        clock: SystemClockAdapter,
        identifiers: SystemUuidV7Generator,
        configuration: ReturnType<typeof createIdentityAuthenticationConfiguration>,
        application: ConfigurationService,
      ) =>
        new TotpMfaAuthenticationAdapter(identities, challenges, totp, clock, identifiers, {
          environment: application.values.APP_ENV,
          challengeLifetimeSeconds: configuration.totp.challengeLifetimeSeconds,
          maximumVerificationAttempts: configuration.totp.maximumVerificationAttempts,
        }),
    },
    {
      provide: CSRF_PROTECTION,
      inject: [MODULE_CONFIGURATION, ConfigurationService],
      useFactory: (
        configuration: ReturnType<typeof createIdentityAuthenticationConfiguration>,
        application: ConfigurationService,
      ) => NonProductionCsrfAdapter.fromFileReferences(configuration, application.values.APP_ENV),
    },
    {
      provide: API_IDEMPOTENCY,
      inject: [API_IDEMPOTENCY_REPOSITORY, ENVELOPE_ENCRYPTION, CLOCK, UUID_V7_GENERATOR],
      useFactory: (
        repository: never,
        encryption: NonProductionEnvelopeEncryptionAdapter,
        clock: SystemClockAdapter,
        identifiers: SystemUuidV7Generator,
      ) => new ApiIdempotencyService(repository, encryption, clock, identifiers),
    },
    { provide: RATE_LIMITER, useExisting: NON_PRODUCTION_RATE_LIMIT_REPOSITORY },
    { provide: BASIC_AUDIT_LOGGER, useExisting: BASIC_AUDIT_REPOSITORY },
    // M01-REC-005 Module 02 authorization boundary. Module 02 is not
    // implemented yet, so the adapter fails closed: every approval decision is
    // denied until the approved Module 02 contract is integrated.
    { provide: APPROVAL_AUTHORIZATION, useClass: NonProductionApprovalAuthorizationAdapter },
    // M01-ID-004 Module 02 authorization boundary. Module 02 is not
    // implemented yet, so the adapter fails closed: every identity state
    // transition is denied until the approved Module 02 contract is integrated.
    {
      provide: IDENTITY_STATE_CHANGE_AUTHORIZATION,
      useClass: NonProductionIdentityStateChangeAuthorizationAdapter,
    },
    {
      provide: IDENTITY_LIFECYCLE_APPLICATION_SERVICE,
      inject: [
        IDENTITY_REPOSITORY,
        SESSION_REPOSITORY,
        IDENTITY_STATE_CHANGE_AUTHORIZATION,
        CLOCK,
        UUID_V7_GENERATOR,
      ],
      useFactory: (
        identities: never,
        sessions: never,
        authorization: NonProductionIdentityStateChangeAuthorizationAdapter,
        clock: SystemClockAdapter,
        identifiers: SystemUuidV7Generator,
      ) =>
        new IdentityLifecycleApplicationService(
          identities,
          sessions,
          authorization,
          clock,
          identifiers,
        ),
    },
    // M01-CLS-001 approved coordination-contract boundary. No approved
    // internal coordination contract is integrated yet, so the adapter fails
    // closed: every classification transition is rejected with CONTRACT_INVALID
    // until the approved contract is integrated.
    {
      provide: CLASSIFICATION_TRANSITION_COORDINATION,
      useClass: NonProductionClassificationTransitionCoordinationAdapter,
    },
    {
      provide: CLASSIFICATION_TRANSITION_APPLICATION_SERVICE,
      inject: [
        IDENTITY_REPOSITORY,
        CLASSIFICATION_TRANSITION_COORDINATION,
        CLOCK,
        UUID_V7_GENERATOR,
      ],
      useFactory: (
        identities: never,
        coordination: NonProductionClassificationTransitionCoordinationAdapter,
        clock: SystemClockAdapter,
        identifiers: SystemUuidV7Generator,
      ) =>
        new ClassificationTransitionApplicationService(
          identities,
          coordination,
          clock,
          identifiers,
        ),
    },
    {
      provide: IDENTITY_MANAGEMENT_APPLICATION_SERVICE,
      inject: [
        IDENTITY_REPOSITORY,
        SESSION_REPOSITORY,
        PASSWORD_HASHING,
        IDENTIFIER_LOOKUP,
        CLOCK,
        UUID_V7_GENERATOR,
        MODULE_CONFIGURATION,
        ConfigurationService,
      ],
      useFactory: (
        identities: never,
        sessions: never,
        passwords: Argon2idPasswordHashingAdapter,
        lookups: NonProductionIdentifierLookupAdapter,
        clock: SystemClockAdapter,
        identifiers: SystemUuidV7Generator,
        configuration: ReturnType<typeof createIdentityAuthenticationConfiguration>,
        application: ConfigurationService,
      ) =>
        new IdentityManagementApplicationService(
          identities,
          sessions,
          passwords,
          lookups,
          clock,
          identifiers,
          {
            environment: application.values.APP_ENV,
            minimumPasswordLength: configuration.credentialPolicy.minimumPasswordLength,
            maximumPasswordLength: configuration.credentialPolicy.maximumPasswordLength,
            passwordHistoryDepth: configuration.credentialPolicy.passwordHistoryDepth,
          },
        ),
    },
    {
      provide: REGISTRATION_APPLICATION_SERVICE,
      inject: [
        IDENTITY_MANAGEMENT_APPLICATION_SERVICE,
        IDENTITY_REPOSITORY,
        VERIFICATION_CHALLENGE_REPOSITORY,
        OTP_CRYPTOGRAPHY,
        OTP_DELIVERY,
        CLOCK,
        UUID_V7_GENERATOR,
        MODULE_CONFIGURATION,
        ConfigurationService,
      ],
      useFactory: (
        identityManagement: IdentityManagementApplicationService,
        identities: never,
        challenges: never,
        otpCrypto: NonProductionOtpRecoveryCodeAdapter,
        otpDelivery: NonProductionOtpDeliveryAdapter,
        clock: SystemClockAdapter,
        identifiers: SystemUuidV7Generator,
        configuration: ReturnType<typeof createIdentityAuthenticationConfiguration>,
        application: ConfigurationService,
      ) =>
        new RegistrationApplicationService(
          identityManagement,
          identities,
          challenges,
          otpCrypto,
          otpDelivery,
          clock,
          identifiers,
          {
            environment: application.values.APP_ENV,
            otpLifetimeSeconds: configuration.otp.lifetimeSeconds,
            maximumVerificationAttempts: configuration.otp.maximumVerificationAttempts,
          },
        ),
    },
    {
      provide: VERIFICATION_APPLICATION_SERVICE,
      inject: [
        IDENTITY_REPOSITORY,
        VERIFICATION_CHALLENGE_REPOSITORY,
        OTP_CRYPTOGRAPHY,
        OTP_DELIVERY,
        IDENTIFIER_LOOKUP,
        CLOCK,
        UUID_V7_GENERATOR,
        MODULE_CONFIGURATION,
        ConfigurationService,
      ],
      useFactory: (
        identities: never,
        challenges: never,
        otpCrypto: NonProductionOtpRecoveryCodeAdapter,
        otpDelivery: NonProductionOtpDeliveryAdapter,
        lookups: NonProductionIdentifierLookupAdapter,
        clock: SystemClockAdapter,
        identifiers: SystemUuidV7Generator,
        configuration: ReturnType<typeof createIdentityAuthenticationConfiguration>,
        application: ConfigurationService,
      ) =>
        new VerificationApplicationService(
          identities,
          challenges,
          otpCrypto,
          otpDelivery,
          lookups,
          clock,
          identifiers,
          {
            environment: application.values.APP_ENV,
            otpLifetimeSeconds: configuration.otp.lifetimeSeconds,
            maximumVerificationAttempts: configuration.otp.maximumVerificationAttempts,
          },
        ),
    },
    {
      provide: MFA_ENROLLMENT_APPLICATION_SERVICE,
      inject: [
        IDENTITY_REPOSITORY,
        VERIFICATION_CHALLENGE_REPOSITORY,
        TOTP,
        CLOCK,
        UUID_V7_GENERATOR,
        MODULE_CONFIGURATION,
        ConfigurationService,
      ],
      useFactory: (
        identities: never,
        challenges: never,
        totp: NonProductionTotpAdapter,
        clock: SystemClockAdapter,
        identifiers: SystemUuidV7Generator,
        configuration: ReturnType<typeof createIdentityAuthenticationConfiguration>,
        application: ConfigurationService,
      ) =>
        new MfaEnrollmentApplicationService(identities, challenges, totp, clock, identifiers, {
          environment: application.values.APP_ENV,
          challengeLifetimeSeconds: configuration.totp.challengeLifetimeSeconds,
          maximumVerificationAttempts: configuration.totp.maximumVerificationAttempts,
        }),
    },
    {
      provide: MFA_REPLACEMENT_APPLICATION_SERVICE,
      inject: [
        IDENTITY_REPOSITORY,
        RECOVERY_REQUEST_REPOSITORY,
        CLOCK,
        UUID_V7_GENERATOR,
        MODULE_CONFIGURATION,
      ],
      useFactory: (
        identities: never,
        recoveryRequests: never,
        clock: SystemClockAdapter,
        identifiers: SystemUuidV7Generator,
        configuration: ReturnType<typeof createIdentityAuthenticationConfiguration>,
      ) =>
        new MfaReplacementApplicationService(identities, recoveryRequests, clock, identifiers, {
          recoveryPolicyVersion: configuration.recovery.policyVersion,
          requestLifetimeSeconds: configuration.recovery.requestLifetimeSeconds,
        }),
    },
    {
      provide: SESSION_MANAGEMENT_APPLICATION_SERVICE,
      inject: [SESSION_REPOSITORY, CLOCK],
      useFactory: (sessions: never, clock: SystemClockAdapter) =>
        new SessionManagementApplicationService(sessions, clock),
    },
    {
      provide: TRUSTED_DEVICE_MANAGEMENT_APPLICATION_SERVICE,
      inject: [IDENTITY_REPOSITORY, CLOCK],
      useFactory: (identities: never, clock: SystemClockAdapter) =>
        new TrustedDeviceManagementApplicationService(identities, clock),
    },
    {
      provide: RECOVERY_CODE_SET_APPLICATION_SERVICE,
      inject: [
        IDENTITY_REPOSITORY,
        OTP_CRYPTOGRAPHY,
        CLOCK,
        UUID_V7_GENERATOR,
        MODULE_CONFIGURATION,
        ConfigurationService,
      ],
      useFactory: (
        identities: never,
        otpCrypto: NonProductionOtpRecoveryCodeAdapter,
        clock: SystemClockAdapter,
        identifiers: SystemUuidV7Generator,
        configuration: ReturnType<typeof createIdentityAuthenticationConfiguration>,
        application: ConfigurationService,
      ) =>
        new RecoveryCodeSetApplicationService(identities, otpCrypto, clock, identifiers, {
          environment: application.values.APP_ENV,
        }),
    },
    {
      provide: RECOVERY_REQUEST_APPLICATION_SERVICE,
      inject: [
        IDENTITY_REPOSITORY,
        RECOVERY_REQUEST_REPOSITORY,
        SESSION_REPOSITORY,
        VERIFICATION_CHALLENGE_REPOSITORY,
        IDENTIFIER_LOOKUP,
        OTP_CRYPTOGRAPHY,
        APPROVAL_AUTHORIZATION,
        CLOCK,
        UUID_V7_GENERATOR,
        MODULE_CONFIGURATION,
        ConfigurationService,
      ],
      useFactory: (
        identities: never,
        recoveryRequests: never,
        sessions: never,
        challenges: never,
        lookups: NonProductionIdentifierLookupAdapter,
        otpCrypto: NonProductionOtpRecoveryCodeAdapter,
        approvalAuthorization: NonProductionApprovalAuthorizationAdapter,
        clock: SystemClockAdapter,
        identifiers: SystemUuidV7Generator,
        configuration: ReturnType<typeof createIdentityAuthenticationConfiguration>,
        application: ConfigurationService,
      ) =>
        new RecoveryRequestApplicationService(
          identities,
          recoveryRequests,
          sessions,
          challenges,
          lookups,
          otpCrypto,
          approvalAuthorization,
          clock,
          identifiers,
          {
            environment: application.values.APP_ENV,
            recoveryPolicyVersion: configuration.recovery.policyVersion,
            requestLifetimeSeconds: configuration.recovery.requestLifetimeSeconds,
            maximumEvidenceAttempts: configuration.recovery.maximumEvidenceAttempts,
          },
        ),
    },
    {
      provide: PASSWORD_RESET_APPLICATION_SERVICE,
      inject: [
        IDENTITY_REPOSITORY,
        SESSION_REPOSITORY,
        VERIFICATION_CHALLENGE_REPOSITORY,
        PASSWORD_HASHING,
        IDENTIFIER_LOOKUP,
        OTP_CRYPTOGRAPHY,
        OTP_DELIVERY,
        CLOCK,
        UUID_V7_GENERATOR,
        MODULE_CONFIGURATION,
        ConfigurationService,
      ],
      useFactory: (
        identities: never,
        sessions: never,
        challenges: never,
        passwords: Argon2idPasswordHashingAdapter,
        lookups: NonProductionIdentifierLookupAdapter,
        otpCrypto: NonProductionOtpRecoveryCodeAdapter,
        otpDelivery: NonProductionOtpDeliveryAdapter,
        clock: SystemClockAdapter,
        identifiers: SystemUuidV7Generator,
        configuration: ReturnType<typeof createIdentityAuthenticationConfiguration>,
        application: ConfigurationService,
      ) =>
        new PasswordResetApplicationService(
          identities,
          sessions,
          challenges,
          passwords,
          lookups,
          otpCrypto,
          otpDelivery,
          clock,
          identifiers,
          {
            environment: application.values.APP_ENV,
            otpLifetimeSeconds: configuration.otp.lifetimeSeconds,
            maximumVerificationAttempts: configuration.otp.maximumVerificationAttempts,
            minimumPasswordLength: configuration.credentialPolicy.minimumPasswordLength,
            maximumPasswordLength: configuration.credentialPolicy.maximumPasswordLength,
            passwordHistoryDepth: configuration.credentialPolicy.passwordHistoryDepth,
          },
        ),
    },
    {
      provide: AUTHENTICATION_APPLICATION_SERVICE,
      inject: [
        IDENTITY_REPOSITORY,
        SESSION_REPOSITORY,
        PASSWORD_HASHING,
        IDENTIFIER_LOOKUP,
        REFRESH_TOKENS,
        JWT_CRYPTOGRAPHY,
        MFA,
        CLOCK,
        UUID_V7_GENERATOR,
        MODULE_CONFIGURATION,
        ConfigurationService,
      ],
      useFactory: (
        identities: never,
        sessions: never,
        passwords: Argon2idPasswordHashingAdapter,
        lookups: NonProductionIdentifierLookupAdapter,
        refreshTokens: NonProductionRefreshTokenAdapter,
        jwt: NonProductionJwtAdapter,
        mfa: TotpMfaAuthenticationAdapter,
        clock: SystemClockAdapter,
        identifiers: SystemUuidV7Generator,
        configuration: ReturnType<typeof createIdentityAuthenticationConfiguration>,
        application: ConfigurationService,
      ) =>
        new AuthenticationApplicationService(
          identities,
          sessions,
          passwords,
          lookups,
          refreshTokens,
          jwt,
          mfa,
          clock,
          identifiers,
          {
            environment: application.values.APP_ENV,
            accessTokenLifetimeSeconds: configuration.jwt.accessTokenLifetimeSeconds,
            standardRefreshTokenLifetimeSeconds: configuration.refreshToken.standardLifetimeSeconds,
            privilegedRefreshTokenLifetimeSeconds:
              configuration.refreshToken.privilegedLifetimeSeconds,
            sessions: {
              STANDARD_AUTHENTICATION: configuration.session.standard,
              PRIVILEGED_ADMIN_AUTHENTICATION: configuration.session.privilegedAdmin,
              SUPER_ADMIN_AUTHENTICATION: configuration.session.superAdmin,
            },
          },
        ),
    },
    AuthoritativeSessionGuard,
    Aal2SessionGuard,
    NonProductionRateLimiterGuard,
    BasicAuditInterceptor,
  ],
})
// NestJS modules are declarative metadata containers and intentionally have no members.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class IdentityAuthenticationModule {}

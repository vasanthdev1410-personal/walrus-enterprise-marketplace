import { Module } from '@nestjs/common';
import { ConfigurationService } from '../../platform/configuration/configuration.service';
import { ApiIdempotencyService } from './application/services/api-idempotency.service';
import { AuthenticationApplicationService } from './application/services/authentication-application.service';
import { IdentityManagementApplicationService } from './application/services/identity-management-application.service';
import { MfaEnrollmentApplicationService } from './application/services/mfa-enrollment-application.service';
import { PasswordResetApplicationService } from './application/services/password-reset-application.service';
import { RegistrationApplicationService } from './application/services/registration-application.service';
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
import { createIdentityAuthenticationConfiguration } from './infrastructure/configuration/identity-authentication.configuration';
import {
  API_IDEMPOTENCY_REPOSITORY,
  BASIC_AUDIT_REPOSITORY,
  IDENTITY_REPOSITORY,
  NON_PRODUCTION_RATE_LIMIT_REPOSITORY,
  PrismaModule,
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
import { MfaController } from './presentation/mfa.controller';
import { RegistrationController } from './presentation/registration.controller';
import { VerificationController } from './presentation/verification.controller';
import {
  AUTHENTICATION_APPLICATION_SERVICE,
  BASIC_AUDIT_LOGGER,
  CSRF_PROTECTION,
  IDENTITY_MANAGEMENT_APPLICATION_SERVICE,
  MFA_ENROLLMENT_APPLICATION_SERVICE,
  PASSWORD_RESET_APPLICATION_SERVICE,
  RATE_LIMITER,
  REGISTRATION_APPLICATION_SERVICE,
  VERIFICATION_APPLICATION_SERVICE,
} from './presentation/authentication.tokens';
import { AuthoritativeSessionGuard } from './presentation/guards/authoritative-session.guard';
import { NonProductionRateLimiterGuard } from './presentation/guards/non-production-rate-limiter.guard';
import { BasicAuditInterceptor } from './presentation/interceptors/basic-audit.interceptor';
import {
  API_IDEMPOTENCY,
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
    MfaController,
    RegistrationController,
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
    NonProductionRateLimiterGuard,
    BasicAuditInterceptor,
  ],
})
// NestJS modules are declarative metadata containers and intentionally have no members.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class IdentityAuthenticationModule {}

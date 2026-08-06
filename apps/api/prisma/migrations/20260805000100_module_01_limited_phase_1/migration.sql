-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "IdentityState" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'LOCKED', 'SUSPENDED', 'DISABLED', 'DELETED');

-- CreateEnum
CREATE TYPE "IdentityVerificationState" AS ENUM ('PENDING_VERIFICATION', 'VERIFIED');

-- CreateEnum
CREATE TYPE "IdentifierType" AS ENUM ('EMAIL', 'MOBILE');

-- CreateEnum
CREATE TYPE "IdentifierVerificationState" AS ENUM ('UNVERIFIED', 'PENDING_VERIFICATION', 'VERIFIED', 'RETIRED', 'ANONYMIZED');

-- CreateEnum
CREATE TYPE "CredentialType" AS ENUM ('PASSWORD', 'EMAIL_VERIFICATION', 'MOBILE_VERIFICATION');

-- CreateEnum
CREATE TYPE "CredentialState" AS ENUM ('CREATED', 'VERIFIED', 'ACTIVE', 'REPLACED', 'COMPROMISED', 'REVOKED');

-- CreateEnum
CREATE TYPE "CredentialHistoryEventType" AS ENUM ('CREATED', 'VERIFIED', 'ACTIVATED', 'REPLACED', 'MARKED_COMPROMISED', 'REVOKED');

-- CreateEnum
CREATE TYPE "AuthenticationSecurityClassification" AS ENUM ('STANDARD_AUTHENTICATION', 'PRIVILEGED_ADMIN_AUTHENTICATION', 'SUPER_ADMIN_AUTHENTICATION');

-- CreateEnum
CREATE TYPE "ClassificationAssignmentState" AS ENUM ('EFFECTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "MfaEnrollmentState" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'REPLACEMENT_REQUIRED', 'DISABLED');

-- CreateEnum
CREATE TYPE "MfaFactorType" AS ENUM ('TOTP_AUTHENTICATOR');

-- CreateEnum
CREATE TYPE "MfaFactorState" AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'REPLACEMENT_REQUIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "RecoveryCodeSetState" AS ENUM ('ACTIVE', 'EXHAUSTED', 'SUPERSEDED', 'INVALIDATED');

-- CreateEnum
CREATE TYPE "RecoveryCodeState" AS ENUM ('ACTIVE', 'CONSUMED', 'INVALIDATED');

-- CreateEnum
CREATE TYPE "TrustedDeviceState" AS ENUM ('PENDING', 'TRUSTED', 'EXPIRED', 'REVOKED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "SessionClass" AS ENUM ('INTERACTIVE_WEB', 'INTERACTIVE_MOBILE', 'RECOVERY');

-- CreateEnum
CREATE TYPE "SessionState" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AuthenticationAssuranceLevel" AS ENUM ('AAL0', 'AAL1', 'AAL2');

-- CreateEnum
CREATE TYPE "AuthenticationMethod" AS ENUM ('PASSWORD', 'EMAIL_OTP', 'SMS_OTP', 'TOTP_AUTHENTICATOR');

-- CreateEnum
CREATE TYPE "RefreshTokenFamilyState" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RefreshTokenState" AS ENUM ('ACTIVE', 'USED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "VerificationPurpose" AS ENUM ('REGISTRATION_VERIFICATION', 'PRIVILEGED_INVITATION_VERIFICATION', 'CONTACT_CHANGE_VERIFICATION', 'PASSWORD_RECOVERY', 'ACCOUNT_RECOVERY', 'MFA_ENROLLMENT', 'MFA_AUTHENTICATION', 'STEP_UP_AUTHENTICATION', 'ADDITIONAL_SECURITY_VERIFICATION');

-- CreateEnum
CREATE TYPE "VerificationChannel" AS ENUM ('EMAIL', 'SMS', 'AUTHENTICATOR_APPLICATION');

-- CreateEnum
CREATE TYPE "VerificationChallengeState" AS ENUM ('CREATED', 'PENDING', 'CHALLENGE_ISSUED', 'VERIFIED', 'EXPIRED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VerificationAttemptOutcome" AS ENUM ('SUCCEEDED', 'REJECTED', 'EXPIRED', 'RATE_LIMITED', 'FAILED_SECURELY', 'TEMPORARILY_UNAVAILABLE');

-- CreateEnum
CREATE TYPE "OtpEvidenceState" AS ENUM ('ACTIVE', 'CONSUMED', 'EXPIRED', 'INVALIDATED');

-- CreateEnum
CREATE TYPE "RecoveryOperationClass" AS ENUM ('PASSWORD_RESET', 'MFA_FACTOR_REPLACEMENT', 'RECOVERY_CODE_REGENERATION', 'VERIFIED_EMAIL_CHANGE', 'VERIFIED_MOBILE_CHANGE', 'IDENTITY_UNLOCK', 'COMPROMISED_CREDENTIAL_RECOVERY', 'PRIVILEGED_ACCOUNT_RECOVERY', 'SUPER_ADMIN_EMERGENCY_RECOVERY');

-- CreateEnum
CREATE TYPE "RecoveryState" AS ENUM ('REQUESTED', 'EVIDENCE_PENDING', 'EVIDENCE_VERIFIED', 'APPROVAL_PENDING', 'APPROVED', 'EXECUTING', 'COMPLETED', 'REJECTED', 'CANCELLED', 'EXPIRED', 'FAILED_SECURELY');

-- CreateEnum
CREATE TYPE "RecoveryAssuranceLevel" AS ENUM ('RA0', 'RA1', 'RA2');

-- CreateEnum
CREATE TYPE "RecoveryEvidenceType" AS ENUM ('VERIFIED_EMAIL_CHANNEL', 'VERIFIED_MOBILE_CHANNEL', 'RECOVERY_CODE', 'AUTHENTICATED_SESSION', 'MFA_FACTOR', 'CONTROLLED_BOOTSTRAP_EVIDENCE');

-- CreateEnum
CREATE TYPE "RecoveryEvidenceState" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'CONSUMED', 'EXPIRED', 'INVALIDATED');

-- CreateEnum
CREATE TYPE "RecoveryEvidenceBoundary" AS ENUM ('EMAIL_CHANNEL', 'MOBILE_CHANNEL', 'RECOVERY_CODE_SET', 'AUTHENTICATED_SESSION', 'MFA_FACTOR', 'CONTROLLED_BOOTSTRAP');

-- CreateEnum
CREATE TYPE "RecoveryApprovalDecision" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RecoveryAttemptType" AS ENUM ('EVIDENCE_SUBMISSION', 'EVIDENCE_VALIDATION', 'APPROVAL_VALIDATION', 'EXECUTION');

-- CreateEnum
CREATE TYPE "RecoveryAttemptOutcome" AS ENUM ('SUCCEEDED', 'REJECTED', 'FAILED_SECURELY', 'TEMPORARILY_UNAVAILABLE');

-- CreateEnum
CREATE TYPE "RecoveryNotificationType" AS ENUM ('RECOVERY_REQUEST_INITIATED', 'RECOVERY_CHALLENGE_SENT', 'PASSWORD_RESET_COMPLETED', 'MFA_RESET_COMPLETED', 'TRUSTED_DEVICE_REMOVED', 'CONTACT_INFORMATION_UPDATED', 'RECOVERY_COMPLETED', 'SUSPICIOUS_RECOVERY_ATTEMPT');

-- CreateEnum
CREATE TYPE "RecoveryNotificationDeliveryState" AS ENUM ('PENDING', 'DISPATCHED', 'DELIVERED', 'FAILED');

-- CreateTable
CREATE TABLE "identities" (
    "identity_id" UUID NOT NULL,
    "identity_state" "IdentityState" NOT NULL,
    "verification_state" "IdentityVerificationState" NOT NULL,
    "aggregate_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "locked_until" TIMESTAMPTZ(6),
    "disabled_at" TIMESTAMPTZ(6),
    "anonymized_at" TIMESTAMPTZ(6),
    "deletion_requested_at" TIMESTAMPTZ(6),

    CONSTRAINT "identities_pkey" PRIMARY KEY ("identity_id")
);

-- CreateTable
CREATE TABLE "identity_identifiers" (
    "identifier_id" UUID NOT NULL,
    "identity_id" UUID NOT NULL,
    "identifier_type" "IdentifierType" NOT NULL,
    "normalized_value" TEXT NOT NULL,
    "verification_state" "IdentifierVerificationState" NOT NULL,
    "is_primary" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "verified_at" TIMESTAMPTZ(6),
    "retired_at" TIMESTAMPTZ(6),
    "anonymized_at" TIMESTAMPTZ(6),

    CONSTRAINT "identity_identifiers_pkey" PRIMARY KEY ("identifier_id")
);

-- CreateTable
CREATE TABLE "credentials" (
    "credential_id" UUID NOT NULL,
    "identity_id" UUID NOT NULL,
    "credential_type" "CredentialType" NOT NULL,
    "credential_version" INTEGER NOT NULL,
    "credential_state" "CredentialState" NOT NULL,
    "protected_secret" TEXT NOT NULL,
    "protection_key_version" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "last_used_at" TIMESTAMPTZ(6),
    "compromised_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "replaced_at" TIMESTAMPTZ(6),

    CONSTRAINT "credentials_pkey" PRIMARY KEY ("credential_id")
);

-- CreateTable
CREATE TABLE "credential_history_records" (
    "credential_history_id" UUID NOT NULL,
    "identity_id" UUID NOT NULL,
    "credential_type" "CredentialType" NOT NULL,
    "credential_version" INTEGER NOT NULL,
    "protected_historical_value" TEXT,
    "event_type" "CredentialHistoryEventType" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "source_credential_id" UUID,
    "correlation_id" UUID,

    CONSTRAINT "credential_history_records_pkey" PRIMARY KEY ("credential_history_id")
);

-- CreateTable
CREATE TABLE "password_history_records" (
    "password_history_id" UUID NOT NULL,
    "identity_id" UUID NOT NULL,
    "password_hash" TEXT NOT NULL,
    "hash_algorithm_reference" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "password_history_records_pkey" PRIMARY KEY ("password_history_id")
);

-- CreateTable
CREATE TABLE "authentication_security_classification_assignments" (
    "classification_assignment_id" UUID NOT NULL,
    "identity_id" UUID NOT NULL,
    "classification" "AuthenticationSecurityClassification" NOT NULL,
    "effective_at" TIMESTAMPTZ(6) NOT NULL,
    "assignment_state" "ClassificationAssignmentState" NOT NULL,
    "aggregate_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "ended_at" TIMESTAMPTZ(6),
    "source_contract_reference" TEXT,
    "reason_code" TEXT,

    CONSTRAINT "authentication_security_classification_assignments_pkey" PRIMARY KEY ("classification_assignment_id")
);

-- CreateTable
CREATE TABLE "mfa_enrollments" (
    "mfa_enrollment_id" UUID NOT NULL,
    "identity_id" UUID NOT NULL,
    "enrollment_state" "MfaEnrollmentState" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "activated_at" TIMESTAMPTZ(6),
    "disabled_at" TIMESTAMPTZ(6),
    "replacement_required_at" TIMESTAMPTZ(6),

    CONSTRAINT "mfa_enrollments_pkey" PRIMARY KEY ("mfa_enrollment_id")
);

-- CreateTable
CREATE TABLE "mfa_factors" (
    "mfa_factor_id" UUID NOT NULL,
    "mfa_enrollment_id" UUID NOT NULL,
    "factor_type" "MfaFactorType" NOT NULL,
    "factor_state" "MfaFactorState" NOT NULL,
    "encrypted_secret_or_reference" TEXT NOT NULL,
    "encryption_key_version" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "verified_at" TIMESTAMPTZ(6),
    "last_used_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "replacement_reason" TEXT,

    CONSTRAINT "mfa_factors_pkey" PRIMARY KEY ("mfa_factor_id")
);

-- CreateTable
CREATE TABLE "recovery_code_sets" (
    "recovery_code_set_id" UUID NOT NULL,
    "identity_id" UUID NOT NULL,
    "set_version" INTEGER NOT NULL,
    "set_state" "RecoveryCodeSetState" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "invalidated_at" TIMESTAMPTZ(6),
    "invalidation_reason" TEXT,

    CONSTRAINT "recovery_code_sets_pkey" PRIMARY KEY ("recovery_code_set_id")
);

-- CreateTable
CREATE TABLE "recovery_code_records" (
    "recovery_code_id" UUID NOT NULL,
    "recovery_code_set_id" UUID NOT NULL,
    "code_digest" TEXT NOT NULL,
    "code_state" "RecoveryCodeState" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "invalidated_at" TIMESTAMPTZ(6),

    CONSTRAINT "recovery_code_records_pkey" PRIMARY KEY ("recovery_code_id")
);

-- CreateTable
CREATE TABLE "trusted_devices" (
    "trusted_device_id" UUID NOT NULL,
    "identity_id" UUID NOT NULL,
    "protected_device_fingerprint" TEXT NOT NULL,
    "device_state" "TrustedDeviceState" NOT NULL,
    "trust_expires_at" TIMESTAMPTZ(6) NOT NULL,
    "aggregate_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "revocation_reason" TEXT,

    CONSTRAINT "trusted_devices_pkey" PRIMARY KEY ("trusted_device_id")
);

-- CreateTable
CREATE TABLE "identity_state_transitions" (
    "identity_state_transition_id" UUID NOT NULL,
    "identity_id" UUID NOT NULL,
    "from_state" "IdentityState",
    "to_state" "IdentityState" NOT NULL,
    "state_version" INTEGER NOT NULL,
    "transitioned_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "reason_code" TEXT,
    "correlation_id" UUID,
    "causation_id" UUID,
    "source_reference" TEXT,

    CONSTRAINT "identity_state_transitions_pkey" PRIMARY KEY ("identity_state_transition_id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "session_id" UUID NOT NULL,
    "identity_id" UUID NOT NULL,
    "session_class" "SessionClass" NOT NULL,
    "session_state" "SessionState" NOT NULL,
    "session_version" INTEGER NOT NULL,
    "authentication_assurance" "AuthenticationAssuranceLevel" NOT NULL,
    "authentication_security_classification_reference" "AuthenticationSecurityClassification" NOT NULL,
    "authentication_methods" "AuthenticationMethod"[],
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "last_activity_at" TIMESTAMPTZ(6) NOT NULL,
    "idle_expires_at" TIMESTAMPTZ(6) NOT NULL,
    "absolute_expires_at" TIMESTAMPTZ(6) NOT NULL,
    "aggregate_version" INTEGER NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "revocation_reason" TEXT,
    "device_session_id" UUID,
    "mfa_verified_at" TIMESTAMPTZ(6),
    "correlation_id" UUID,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "refresh_token_families" (
    "token_family_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "family_state" "RefreshTokenFamilyState" NOT NULL,
    "aggregate_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "revocation_reason" TEXT,
    "reuse_detected_at" TIMESTAMPTZ(6),

    CONSTRAINT "refresh_token_families_pkey" PRIMARY KEY ("token_family_id")
);

-- CreateTable
CREATE TABLE "refresh_token_records" (
    "refresh_token_id" UUID NOT NULL,
    "token_family_id" UUID NOT NULL,
    "token_digest" TEXT NOT NULL,
    "token_state" "RefreshTokenState" NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "successor_token_id" UUID,
    "parent_token_id" UUID,
    "reuse_detected_at" TIMESTAMPTZ(6),

    CONSTRAINT "refresh_token_records_pkey" PRIMARY KEY ("refresh_token_id")
);

-- CreateTable
CREATE TABLE "verification_challenges" (
    "challenge_id" UUID NOT NULL,
    "identity_id" UUID,
    "purpose" "VerificationPurpose" NOT NULL,
    "channel_type" "VerificationChannel" NOT NULL,
    "protected_destination_reference" TEXT NOT NULL,
    "challenge_digest" TEXT NOT NULL,
    "challenge_state" "VerificationChallengeState" NOT NULL,
    "attempt_count" INTEGER NOT NULL,
    "maximum_attempts" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "aggregate_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "correlation_id" UUID,

    CONSTRAINT "verification_challenges_pkey" PRIMARY KEY ("challenge_id")
);

-- CreateTable
CREATE TABLE "verification_attempts" (
    "verification_attempt_id" UUID NOT NULL,
    "challenge_id" UUID NOT NULL,
    "outcome" "VerificationAttemptOutcome" NOT NULL,
    "attempted_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "source_ip_reference" TEXT,
    "device_reference" TEXT,
    "failure_reason" TEXT,

    CONSTRAINT "verification_attempts_pkey" PRIMARY KEY ("verification_attempt_id")
);

-- CreateTable
CREATE TABLE "otp_evidence_records" (
    "otp_evidence_id" UUID NOT NULL,
    "challenge_id" UUID NOT NULL,
    "evidence_digest" TEXT NOT NULL,
    "evidence_state" "OtpEvidenceState" NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),

    CONSTRAINT "otp_evidence_records_pkey" PRIMARY KEY ("otp_evidence_id")
);

-- CreateTable
CREATE TABLE "recovery_requests" (
    "recovery_request_id" UUID NOT NULL,
    "identity_id" UUID NOT NULL,
    "operation_class" "RecoveryOperationClass" NOT NULL,
    "recovery_state" "RecoveryState" NOT NULL,
    "recovery_assurance" "RecoveryAssuranceLevel" NOT NULL,
    "recovery_policy_version" TEXT NOT NULL,
    "permitted_operation" "RecoveryOperationClass" NOT NULL,
    "state_version" INTEGER NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "aggregate_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "approved_at" TIMESTAMPTZ(6),
    "execution_started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "terminal_reason" TEXT,
    "idempotency_key" TEXT,
    "correlation_id" UUID,

    CONSTRAINT "recovery_requests_pkey" PRIMARY KEY ("recovery_request_id")
);

-- CreateTable
CREATE TABLE "recovery_evidence_records" (
    "recovery_evidence_id" UUID NOT NULL,
    "recovery_request_id" UUID NOT NULL,
    "evidence_type" "RecoveryEvidenceType" NOT NULL,
    "protected_evidence_or_reference" TEXT NOT NULL,
    "evidence_state" "RecoveryEvidenceState" NOT NULL,
    "evidence_boundary" "RecoveryEvidenceBoundary" NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "verified_at" TIMESTAMPTZ(6),
    "consumed_at" TIMESTAMPTZ(6),
    "failure_reason" TEXT,

    CONSTRAINT "recovery_evidence_records_pkey" PRIMARY KEY ("recovery_evidence_id")
);

-- CreateTable
CREATE TABLE "recovery_approval_records" (
    "recovery_approval_id" UUID NOT NULL,
    "recovery_request_id" UUID NOT NULL,
    "recovered_identity_id" UUID NOT NULL,
    "operation_class" "RecoveryOperationClass" NOT NULL,
    "approver_identity_id" UUID NOT NULL,
    "authorization_evidence_reference" TEXT NOT NULL,
    "decision" "RecoveryApprovalDecision" NOT NULL,
    "decided_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "recovery_approval_records_pkey" PRIMARY KEY ("recovery_approval_id")
);

-- CreateTable
CREATE TABLE "recovery_attempts" (
    "recovery_attempt_id" UUID NOT NULL,
    "recovery_request_id" UUID NOT NULL,
    "attempt_type" "RecoveryAttemptType" NOT NULL,
    "outcome" "RecoveryAttemptOutcome" NOT NULL,
    "attempted_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "failure_reason" TEXT,
    "source_ip_reference" TEXT,
    "device_reference" TEXT,

    CONSTRAINT "recovery_attempts_pkey" PRIMARY KEY ("recovery_attempt_id")
);

-- CreateTable
CREATE TABLE "recovery_state_transitions" (
    "recovery_transition_id" UUID NOT NULL,
    "recovery_request_id" UUID NOT NULL,
    "from_state" "RecoveryState" NOT NULL,
    "to_state" "RecoveryState" NOT NULL,
    "state_version" INTEGER NOT NULL,
    "transitioned_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "actor_identity_id" UUID,
    "reason_code" TEXT,
    "correlation_id" UUID,

    CONSTRAINT "recovery_state_transitions_pkey" PRIMARY KEY ("recovery_transition_id")
);

-- CreateTable
CREATE TABLE "recovery_notification_records" (
    "recovery_notification_id" UUID NOT NULL,
    "recovery_request_id" UUID NOT NULL,
    "notification_type" "RecoveryNotificationType" NOT NULL,
    "delivery_state" "RecoveryNotificationDeliveryState" NOT NULL,
    "destination_reference" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "delivered_at" TIMESTAMPTZ(6),
    "failed_at" TIMESTAMPTZ(6),
    "failure_reason" TEXT,

    CONSTRAINT "recovery_notification_records_pkey" PRIMARY KEY ("recovery_notification_id")
);

-- CreateIndex
CREATE INDEX "identities_identity_state_idx" ON "identities"("identity_state");

-- CreateIndex
CREATE INDEX "identities_locked_until_idx" ON "identities"("locked_until");

-- CreateIndex
CREATE INDEX "identity_identifiers_identity_id_identifier_type_verificati_idx" ON "identity_identifiers"("identity_id", "identifier_type", "verification_state");

-- CreateIndex
CREATE UNIQUE INDEX "identity_identifiers_identifier_type_normalized_value_key" ON "identity_identifiers"("identifier_type", "normalized_value");

-- CreateIndex
CREATE INDEX "credentials_identity_id_credential_type_credential_state_idx" ON "credentials"("identity_id", "credential_type", "credential_state");

-- CreateIndex
CREATE INDEX "credential_history_records_identity_id_created_at_idx" ON "credential_history_records"("identity_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "password_history_records_identity_id_created_at_idx" ON "password_history_records"("identity_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "authentication_security_classification_assignments_identity_idx" ON "authentication_security_classification_assignments"("identity_id", "assignment_state");

-- CreateIndex
CREATE INDEX "authentication_security_classification_assignments_classifi_idx" ON "authentication_security_classification_assignments"("classification", "assignment_state");

-- CreateIndex
CREATE INDEX "mfa_enrollments_identity_id_enrollment_state_idx" ON "mfa_enrollments"("identity_id", "enrollment_state");

-- CreateIndex
CREATE INDEX "mfa_factors_mfa_enrollment_id_factor_state_idx" ON "mfa_factors"("mfa_enrollment_id", "factor_state");

-- CreateIndex
CREATE INDEX "mfa_factors_factor_type_factor_state_idx" ON "mfa_factors"("factor_type", "factor_state");

-- CreateIndex
CREATE INDEX "recovery_code_sets_identity_id_set_state_idx" ON "recovery_code_sets"("identity_id", "set_state");

-- CreateIndex
CREATE UNIQUE INDEX "recovery_code_sets_identity_id_set_version_key" ON "recovery_code_sets"("identity_id", "set_version");

-- CreateIndex
CREATE UNIQUE INDEX "recovery_code_records_code_digest_key" ON "recovery_code_records"("code_digest");

-- CreateIndex
CREATE INDEX "recovery_code_records_recovery_code_set_id_code_state_idx" ON "recovery_code_records"("recovery_code_set_id", "code_state");

-- CreateIndex
CREATE INDEX "trusted_devices_identity_id_device_state_idx" ON "trusted_devices"("identity_id", "device_state");

-- CreateIndex
CREATE INDEX "trusted_devices_trust_expires_at_idx" ON "trusted_devices"("trust_expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "trusted_devices_identity_id_protected_device_fingerprint_key" ON "trusted_devices"("identity_id", "protected_device_fingerprint");

-- CreateIndex
CREATE INDEX "identity_state_transitions_identity_id_transitioned_at_idx" ON "identity_state_transitions"("identity_id", "transitioned_at" DESC);

-- CreateIndex
CREATE INDEX "identity_state_transitions_to_state_transitioned_at_idx" ON "identity_state_transitions"("to_state", "transitioned_at");

-- CreateIndex
CREATE INDEX "identity_state_transitions_correlation_id_idx" ON "identity_state_transitions"("correlation_id");

-- CreateIndex
CREATE UNIQUE INDEX "identity_state_transitions_identity_id_state_version_key" ON "identity_state_transitions"("identity_id", "state_version");

-- CreateIndex
CREATE INDEX "sessions_identity_id_session_state_idx" ON "sessions"("identity_id", "session_state");

-- CreateIndex
CREATE INDEX "sessions_session_id_session_version_session_state_idx" ON "sessions"("session_id", "session_version", "session_state");

-- CreateIndex
CREATE INDEX "sessions_idle_expires_at_session_state_idx" ON "sessions"("idle_expires_at", "session_state");

-- CreateIndex
CREATE INDEX "sessions_absolute_expires_at_session_state_idx" ON "sessions"("absolute_expires_at", "session_state");

-- CreateIndex
CREATE INDEX "sessions_device_session_id_idx" ON "sessions"("device_session_id");

-- CreateIndex
CREATE INDEX "refresh_token_families_session_id_idx" ON "refresh_token_families"("session_id");

-- CreateIndex
CREATE INDEX "refresh_token_families_family_state_idx" ON "refresh_token_families"("family_state");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_token_records_token_digest_key" ON "refresh_token_records"("token_digest");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_token_records_successor_token_id_key" ON "refresh_token_records"("successor_token_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_token_records_parent_token_id_key" ON "refresh_token_records"("parent_token_id");

-- CreateIndex
CREATE INDEX "refresh_token_records_token_family_id_token_state_idx" ON "refresh_token_records"("token_family_id", "token_state");

-- CreateIndex
CREATE INDEX "refresh_token_records_expires_at_idx" ON "refresh_token_records"("expires_at");

-- CreateIndex
CREATE INDEX "verification_challenges_identity_id_purpose_challenge_state_idx" ON "verification_challenges"("identity_id", "purpose", "challenge_state");

-- CreateIndex
CREATE INDEX "verification_challenges_protected_destination_reference_pur_idx" ON "verification_challenges"("protected_destination_reference", "purpose", "challenge_state");

-- CreateIndex
CREATE INDEX "verification_challenges_expires_at_challenge_state_idx" ON "verification_challenges"("expires_at", "challenge_state");

-- CreateIndex
CREATE INDEX "verification_attempts_challenge_id_attempted_at_idx" ON "verification_attempts"("challenge_id", "attempted_at");

-- CreateIndex
CREATE INDEX "otp_evidence_records_challenge_id_evidence_state_idx" ON "otp_evidence_records"("challenge_id", "evidence_state");

-- CreateIndex
CREATE INDEX "recovery_requests_identity_id_recovery_state_idx" ON "recovery_requests"("identity_id", "recovery_state");

-- CreateIndex
CREATE INDEX "recovery_requests_recovery_state_expires_at_idx" ON "recovery_requests"("recovery_state", "expires_at");

-- CreateIndex
CREATE INDEX "recovery_requests_operation_class_recovery_state_idx" ON "recovery_requests"("operation_class", "recovery_state");

-- CreateIndex
CREATE UNIQUE INDEX "recovery_requests_identity_id_operation_class_idempotency_k_key" ON "recovery_requests"("identity_id", "operation_class", "idempotency_key");

-- CreateIndex
CREATE INDEX "recovery_evidence_records_recovery_request_id_evidence_stat_idx" ON "recovery_evidence_records"("recovery_request_id", "evidence_state");

-- CreateIndex
CREATE INDEX "recovery_evidence_records_expires_at_idx" ON "recovery_evidence_records"("expires_at");

-- CreateIndex
CREATE INDEX "recovery_approval_records_recovery_request_id_decision_idx" ON "recovery_approval_records"("recovery_request_id", "decision");

-- CreateIndex
CREATE INDEX "recovery_approval_records_approver_identity_id_decided_at_idx" ON "recovery_approval_records"("approver_identity_id", "decided_at");

-- CreateIndex
CREATE INDEX "recovery_approval_records_expires_at_idx" ON "recovery_approval_records"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "recovery_approval_records_recovery_request_id_approver_iden_key" ON "recovery_approval_records"("recovery_request_id", "approver_identity_id");

-- CreateIndex
CREATE INDEX "recovery_attempts_recovery_request_id_attempted_at_idx" ON "recovery_attempts"("recovery_request_id", "attempted_at");

-- CreateIndex
CREATE INDEX "recovery_state_transitions_recovery_request_id_transitioned_idx" ON "recovery_state_transitions"("recovery_request_id", "transitioned_at");

-- CreateIndex
CREATE UNIQUE INDEX "recovery_state_transitions_recovery_request_id_state_versio_key" ON "recovery_state_transitions"("recovery_request_id", "state_version");

-- CreateIndex
CREATE INDEX "recovery_notification_records_recovery_request_id_delivery__idx" ON "recovery_notification_records"("recovery_request_id", "delivery_state");

-- AddForeignKey
ALTER TABLE "identity_identifiers" ADD CONSTRAINT "identity_identifiers_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "identities"("identity_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credentials" ADD CONSTRAINT "credentials_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "identities"("identity_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credential_history_records" ADD CONSTRAINT "credential_history_records_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "identities"("identity_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_history_records" ADD CONSTRAINT "password_history_records_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "identities"("identity_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "authentication_security_classification_assignments" ADD CONSTRAINT "authentication_security_classification_assignments_identit_fkey" FOREIGN KEY ("identity_id") REFERENCES "identities"("identity_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa_enrollments" ADD CONSTRAINT "mfa_enrollments_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "identities"("identity_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mfa_factors" ADD CONSTRAINT "mfa_factors_mfa_enrollment_id_fkey" FOREIGN KEY ("mfa_enrollment_id") REFERENCES "mfa_enrollments"("mfa_enrollment_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_code_sets" ADD CONSTRAINT "recovery_code_sets_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "identities"("identity_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_code_records" ADD CONSTRAINT "recovery_code_records_recovery_code_set_id_fkey" FOREIGN KEY ("recovery_code_set_id") REFERENCES "recovery_code_sets"("recovery_code_set_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "identities"("identity_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_state_transitions" ADD CONSTRAINT "identity_state_transitions_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "identities"("identity_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "identities"("identity_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_token_families" ADD CONSTRAINT "refresh_token_families_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("session_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_token_records" ADD CONSTRAINT "refresh_token_records_token_family_id_fkey" FOREIGN KEY ("token_family_id") REFERENCES "refresh_token_families"("token_family_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_token_records" ADD CONSTRAINT "refresh_token_records_successor_token_id_fkey" FOREIGN KEY ("successor_token_id") REFERENCES "refresh_token_records"("refresh_token_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_token_records" ADD CONSTRAINT "refresh_token_records_parent_token_id_fkey" FOREIGN KEY ("parent_token_id") REFERENCES "refresh_token_records"("refresh_token_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_challenges" ADD CONSTRAINT "verification_challenges_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "identities"("identity_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_attempts" ADD CONSTRAINT "verification_attempts_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "verification_challenges"("challenge_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otp_evidence_records" ADD CONSTRAINT "otp_evidence_records_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "verification_challenges"("challenge_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_requests" ADD CONSTRAINT "recovery_requests_identity_id_fkey" FOREIGN KEY ("identity_id") REFERENCES "identities"("identity_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_evidence_records" ADD CONSTRAINT "recovery_evidence_records_recovery_request_id_fkey" FOREIGN KEY ("recovery_request_id") REFERENCES "recovery_requests"("recovery_request_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_approval_records" ADD CONSTRAINT "recovery_approval_records_recovery_request_id_fkey" FOREIGN KEY ("recovery_request_id") REFERENCES "recovery_requests"("recovery_request_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_attempts" ADD CONSTRAINT "recovery_attempts_recovery_request_id_fkey" FOREIGN KEY ("recovery_request_id") REFERENCES "recovery_requests"("recovery_request_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_state_transitions" ADD CONSTRAINT "recovery_state_transitions_recovery_request_id_fkey" FOREIGN KEY ("recovery_request_id") REFERENCES "recovery_requests"("recovery_request_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recovery_notification_records" ADD CONSTRAINT "recovery_notification_records_recovery_request_id_fkey" FOREIGN KEY ("recovery_request_id") REFERENCES "recovery_requests"("recovery_request_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Approved logical-model integrity constraints not expressible in Prisma schema syntax.
ALTER TABLE "identities"
  ADD CONSTRAINT "identities_aggregate_version_positive" CHECK ("aggregate_version" > 0),
  ADD CONSTRAINT "identities_updated_at_valid" CHECK ("updated_at" >= "created_at");

ALTER TABLE "credentials"
  ADD CONSTRAINT "credentials_version_positive" CHECK ("credential_version" > 0),
  ADD CONSTRAINT "credentials_state_timestamps_valid" CHECK (
    ("credential_state" <> 'COMPROMISED' OR "compromised_at" IS NOT NULL) AND
    ("credential_state" <> 'REVOKED' OR "revoked_at" IS NOT NULL) AND
    ("credential_state" <> 'REPLACED' OR "replaced_at" IS NOT NULL)
  );

CREATE UNIQUE INDEX "credentials_one_active_per_identity_type"
  ON "credentials"("identity_id", "credential_type")
  WHERE "credential_state" = 'ACTIVE';

ALTER TABLE "authentication_security_classification_assignments"
  ADD CONSTRAINT "classification_assignment_version_positive" CHECK ("aggregate_version" > 0),
  ADD CONSTRAINT "classification_assignment_ended_at_valid" CHECK (
    "assignment_state" <> 'ENDED' OR "ended_at" IS NOT NULL
  );

CREATE UNIQUE INDEX "classification_one_effective_per_identity"
  ON "authentication_security_classification_assignments"("identity_id")
  WHERE "assignment_state" = 'EFFECTIVE';

ALTER TABLE "mfa_enrollments"
  ADD CONSTRAINT "mfa_enrollment_active_timestamp_valid" CHECK (
    "enrollment_state" <> 'ACTIVE' OR "activated_at" IS NOT NULL
  );

ALTER TABLE "mfa_factors"
  ADD CONSTRAINT "mfa_factor_state_timestamps_valid" CHECK (
    ("factor_state" <> 'ACTIVE' OR "verified_at" IS NOT NULL) AND
    ("factor_state" <> 'REVOKED' OR "revoked_at" IS NOT NULL)
  );

ALTER TABLE "recovery_code_sets"
  ADD CONSTRAINT "recovery_code_set_version_positive" CHECK ("set_version" > 0);

CREATE UNIQUE INDEX "recovery_code_sets_one_active_per_identity"
  ON "recovery_code_sets"("identity_id")
  WHERE "set_state" = 'ACTIVE';

ALTER TABLE "recovery_code_records"
  ADD CONSTRAINT "recovery_code_state_timestamps_valid" CHECK (
    ("code_state" <> 'CONSUMED' OR "consumed_at" IS NOT NULL) AND
    ("code_state" <> 'INVALIDATED' OR "invalidated_at" IS NOT NULL)
  );

ALTER TABLE "trusted_devices"
  ADD CONSTRAINT "trusted_device_version_positive" CHECK ("aggregate_version" > 0),
  ADD CONSTRAINT "trusted_device_expiry_valid" CHECK ("trust_expires_at" > "created_at"),
  ADD CONSTRAINT "trusted_device_revoked_at_valid" CHECK (
    "device_state" <> 'REVOKED' OR "revoked_at" IS NOT NULL
  );

ALTER TABLE "identity_state_transitions"
  ADD CONSTRAINT "identity_transition_version_positive" CHECK ("state_version" > 0),
  ADD CONSTRAINT "identity_transition_changes_state" CHECK ("from_state" IS NULL OR "from_state" <> "to_state"),
  ADD CONSTRAINT "identity_transition_initial_state_valid" CHECK (
    ("state_version" = 1 AND "from_state" IS NULL AND "to_state" = 'PENDING_VERIFICATION') OR
    ("state_version" > 1 AND "from_state" IS NOT NULL)
  ),
  ADD CONSTRAINT "identity_transition_created_at_valid" CHECK ("created_at" >= "transitioned_at");

ALTER TABLE "sessions"
  ADD CONSTRAINT "session_versions_positive" CHECK ("session_version" > 0 AND "aggregate_version" > 0),
  ADD CONSTRAINT "session_expiries_valid" CHECK ("idle_expires_at" <= "absolute_expires_at"),
  ADD CONSTRAINT "session_activity_valid" CHECK ("last_activity_at" >= "created_at"),
  ADD CONSTRAINT "session_revocation_valid" CHECK (
    "session_state" <> 'REVOKED' OR ("revoked_at" IS NOT NULL AND "revocation_reason" IS NOT NULL)
  ),
  ADD CONSTRAINT "ordinary_session_assurance_valid" CHECK (
    "session_class" = 'RECOVERY' OR "authentication_assurance" <> 'AAL0'
  );

ALTER TABLE "refresh_token_families"
  ADD CONSTRAINT "refresh_token_family_version_positive" CHECK ("aggregate_version" > 0),
  ADD CONSTRAINT "refresh_token_family_revocation_valid" CHECK (
    "family_state" <> 'REVOKED' OR "revoked_at" IS NOT NULL
  );

ALTER TABLE "refresh_token_records"
  ADD CONSTRAINT "refresh_token_expiry_valid" CHECK ("expires_at" > "issued_at"),
  ADD CONSTRAINT "refresh_token_state_timestamps_valid" CHECK (
    ("token_state" <> 'USED' OR "consumed_at" IS NOT NULL) AND
    ("token_state" <> 'REVOKED' OR "revoked_at" IS NOT NULL)
  ),
  ADD CONSTRAINT "refresh_token_successor_not_self" CHECK ("successor_token_id" IS NULL OR "successor_token_id" <> "refresh_token_id"),
  ADD CONSTRAINT "refresh_token_parent_not_self" CHECK ("parent_token_id" IS NULL OR "parent_token_id" <> "refresh_token_id");

ALTER TABLE "verification_challenges"
  ADD CONSTRAINT "verification_challenge_version_positive" CHECK ("aggregate_version" > 0),
  ADD CONSTRAINT "verification_attempt_counts_valid" CHECK (
    "attempt_count" >= 0 AND "maximum_attempts" > 0 AND "attempt_count" <= "maximum_attempts"
  ),
  ADD CONSTRAINT "verification_challenge_expiry_valid" CHECK ("expires_at" > "created_at");

ALTER TABLE "verification_attempts"
  ADD CONSTRAINT "verification_attempt_created_at_valid" CHECK ("created_at" >= "attempted_at");

ALTER TABLE "otp_evidence_records"
  ADD CONSTRAINT "otp_evidence_expiry_valid" CHECK ("expires_at" > "created_at"),
  ADD CONSTRAINT "otp_evidence_consumption_valid" CHECK (
    "evidence_state" <> 'CONSUMED' OR "consumed_at" IS NOT NULL
  );

ALTER TABLE "recovery_requests"
  ADD CONSTRAINT "recovery_request_versions_positive" CHECK ("state_version" > 0 AND "aggregate_version" > 0),
  ADD CONSTRAINT "recovery_request_expiry_valid" CHECK ("expires_at" > "created_at");

ALTER TABLE "recovery_evidence_records"
  ADD CONSTRAINT "recovery_evidence_expiry_valid" CHECK ("expires_at" > "created_at"),
  ADD CONSTRAINT "recovery_evidence_state_timestamps_valid" CHECK (
    ("evidence_state" <> 'VERIFIED' OR "verified_at" IS NOT NULL) AND
    ("evidence_state" <> 'CONSUMED' OR "consumed_at" IS NOT NULL)
  );

ALTER TABLE "recovery_approval_records"
  ADD CONSTRAINT "recovery_approver_independent" CHECK ("approver_identity_id" <> "recovered_identity_id"),
  ADD CONSTRAINT "recovery_approval_expiry_valid" CHECK ("expires_at" > "created_at");

ALTER TABLE "recovery_attempts"
  ADD CONSTRAINT "recovery_attempt_created_at_valid" CHECK ("created_at" >= "attempted_at");

ALTER TABLE "recovery_state_transitions"
  ADD CONSTRAINT "recovery_transition_version_positive" CHECK ("state_version" > 0),
  ADD CONSTRAINT "recovery_transition_changes_state" CHECK ("from_state" <> "to_state"),
  ADD CONSTRAINT "recovery_transition_created_at_valid" CHECK ("created_at" >= "transitioned_at");

ALTER TABLE "recovery_notification_records"
  ADD CONSTRAINT "recovery_notification_delivery_valid" CHECK (
    ("delivery_state" <> 'DELIVERED' OR "delivered_at" IS NOT NULL) AND
    ("delivery_state" <> 'FAILED' OR "failed_at" IS NOT NULL)
  );

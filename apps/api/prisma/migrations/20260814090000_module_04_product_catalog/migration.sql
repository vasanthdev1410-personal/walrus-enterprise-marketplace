-- Module 04 - Product Catalog persistence (WEMP-M04-SPEC-001 §17, decisions D-02..D-17).
-- Additive only: no Module 01/02/03 table is modified. seller_profile_id and
-- uploaded_by_identity_id are logical UUIDv7 references with NO cross-module
-- foreign keys (storage isolation).

CREATE TYPE "AttributeValueType" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'DATE');

-- CreateEnum
CREATE TYPE "CategoryState" AS ENUM ('ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "ProductState" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'PUBLISHED', 'CORRECTIONS_REQUESTED', 'UNPUBLISHED', 'REJECTED', 'CLOSED');
CREATE TYPE "ProductMediaType" AS ENUM ('IMAGE');
CREATE TYPE "ProductSkuState" AS ENUM ('ACTIVE', 'CLOSED');
CREATE TYPE "ProductAttributeValueState" AS ENUM ('ACTIVE', 'REMOVED');
CREATE TYPE "ProductMediaState" AS ENUM ('ACTIVE', 'REMOVED');
    "api_idempotency_id" UUID NOT NULL,
    "identity_or_client_scope" TEXT NOT NULL,
    "operation_type" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_fingerprint" TEXT NOT NULL,
    "processing_state" "ApiIdempotencyProcessingState" NOT NULL,
    "response_reference" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6),

    CONSTRAINT "api_idempotency_records_pkey" PRIMARY KEY ("api_idempotency_id")
);
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
    "identifier_id" UUID NOT NULL,
    "identity_id" UUID NOT NULL,
    "identifier_type" "IdentifierType" NOT NULL,
    "protected_normalized_value" TEXT NOT NULL,
    "lookup_digest" TEXT NOT NULL,
    "lookup_key_version" TEXT NOT NULL,
    "verification_state" "IdentifierVerificationState" NOT NULL,
    "is_primary" BOOLEAN NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "verified_at" TIMESTAMPTZ(6),
    "retired_at" TIMESTAMPTZ(6),
    "anonymized_at" TIMESTAMPTZ(6),

    CONSTRAINT "identity_identifiers_pkey" PRIMARY KEY ("identifier_id")
);
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
    "password_history_id" UUID NOT NULL,
    "identity_id" UUID NOT NULL,
    "password_hash" TEXT NOT NULL,
    "hash_algorithm_reference" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "password_history_records_pkey" PRIMARY KEY ("password_history_id")
);
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
    "last_accepted_time_step" BIGINT,

    CONSTRAINT "mfa_factors_pkey" PRIMARY KEY ("mfa_factor_id")
);
    "recovery_code_set_id" UUID NOT NULL,
    "identity_id" UUID NOT NULL,
    "set_version" INTEGER NOT NULL,
    "set_state" "RecoveryCodeSetState" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "invalidated_at" TIMESTAMPTZ(6),
    "invalidation_reason" TEXT,

    CONSTRAINT "recovery_code_sets_pkey" PRIMARY KEY ("recovery_code_set_id")
);
    "recovery_code_id" UUID NOT NULL,
    "recovery_code_set_id" UUID NOT NULL,
    "code_digest" TEXT NOT NULL,
    "code_state" "RecoveryCodeState" NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "invalidated_at" TIMESTAMPTZ(6),

    CONSTRAINT "recovery_code_records_pkey" PRIMARY KEY ("recovery_code_id")
);
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
    "otp_evidence_id" UUID NOT NULL,
    "challenge_id" UUID NOT NULL,
    "evidence_digest" TEXT NOT NULL,
    "evidence_state" "OtpEvidenceState" NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),

    CONSTRAINT "otp_evidence_records_pkey" PRIMARY KEY ("otp_evidence_id")
);
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
    "requester_kind" TEXT,
    "requester_reference" TEXT,
    "requester_identity_id" UUID,

    CONSTRAINT "recovery_requests_pkey" PRIMARY KEY ("recovery_request_id")
);
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
    "rate_limit_id" UUID NOT NULL,
    "rate_limit_key" TEXT NOT NULL,
    "request_count" INTEGER NOT NULL,
    "window_start_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "non_production_rate_limit_records_pkey" PRIMARY KEY ("rate_limit_id")
);
    "audit_event_id" UUID NOT NULL,
    "operation_type" TEXT NOT NULL,
    "subject_identity_id" UUID,
    "actor_identity_id" UUID,
    "action_outcome" TEXT NOT NULL,
    "source_ip_reference" TEXT,
    "user_agent_reference" TEXT,
    "correlation_id" UUID,
    "metadata_json" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "basic_audit_event_records_pkey" PRIMARY KEY ("audit_event_id")
);
    "assignment_id" UUID NOT NULL,
    "identity_id" UUID NOT NULL,
    "role_name" "RoleName" NOT NULL,
    "assignment_state" "IdentityRoleAssignmentState" NOT NULL,
    "assigned_by_identity_id" UUID,
    "assignment_origin_type" "RoleAssignmentOriginType" NOT NULL DEFAULT 'HUMAN_ADMINISTRATION',
    "assigned_by_workload_identity" TEXT,
    "authority_evidence_reference" TEXT,
    "operation_id" UUID,
    "audit_correlation_id" UUID,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL,
    "activated_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_by_identity_id" UUID,
    "revoked_at" TIMESTAMPTZ(6),
    "revocation_reason_reference" TEXT,
    "aggregate_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "identity_role_assignments_pkey" PRIMARY KEY ("assignment_id")
);
    "authorization_reference" TEXT NOT NULL,
    "actor_identity_id" UUID,
    "subject_identity_id" UUID NOT NULL,
    "permission_id" TEXT NOT NULL,
    "resource_classification" TEXT,
    "decision_outcome" "AuthorizationDecisionOutcome" NOT NULL,
    "denial_reason" TEXT,
    "session_identifier" TEXT,
    "correlation_id" UUID,
    "decided_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "schema_version" TEXT,
    "target_identity_id" UUID,
    "workload_identity" TEXT,
    "action" TEXT,
    "evaluated_role_names" "RoleName"[] DEFAULT ARRAY[]::"RoleName"[],
    "resource_type" TEXT,
    "resource_reference" TEXT,
    "reason_code" TEXT,
    "policy_version" TEXT,
    "contract_version" TEXT,
    "assurance" TEXT,
    "environment" TEXT,

    CONSTRAINT "authorization_decision_records_pkey" PRIMARY KEY ("authorization_reference")
);
    "replay_record_id" UUID NOT NULL,
    "environment" TEXT NOT NULL,
    "jwt_id" UUID NOT NULL,
    "workload_subject" TEXT NOT NULL,
    "boundary" TEXT NOT NULL,
    "assertion_digest" TEXT NOT NULL,
    "request_digest" TEXT NOT NULL,
    "certificate_thumbprint" TEXT NOT NULL,
    "operation_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6) NOT NULL,
    "audit_reference" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "trusted_workload_replay_records_pkey" PRIMARY KEY ("replay_record_id")
);
    "approval_record_id" UUID NOT NULL,
    "operation_id" UUID NOT NULL,
    "authority_type" TEXT NOT NULL,
    "authority_id" TEXT NOT NULL,
    "approver_identity_id" UUID,
    "session_id" TEXT,
    "assurance" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "evidence_digest" TEXT NOT NULL,
    "policy_version" TEXT NOT NULL,
    "approved_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "authorization_approval_records_pkey" PRIMARY KEY ("approval_record_id")
);
    "provisioning_record_id" UUID NOT NULL,
    "operation_id" UUID NOT NULL,
    "environment" TEXT NOT NULL,
    "target_identity_id" UUID NOT NULL,
    "requested_role" "RoleName" NOT NULL,
    "requested_classification" TEXT NOT NULL,
    "operation_type" TEXT NOT NULL,
    "jwt_id" UUID NOT NULL,
    "evidence_digest" TEXT NOT NULL,
    "lookup_reference_digest" TEXT NOT NULL,
    "policy_version" TEXT NOT NULL,
    "lifecycle_state" "M4AuthorityLifecycleState" NOT NULL,
    "reserved_by_operation_id" UUID,
    "issued_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "aggregate_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "provisioning_authority_records_pkey" PRIMARY KEY ("provisioning_record_id")
);
    "bootstrap_record_id" UUID NOT NULL,
    "environment" TEXT NOT NULL,
    "operation_id" UUID NOT NULL,
    "intended_identity_id" UUID NOT NULL,
    "jwt_id" UUID NOT NULL,
    "evidence_digest" TEXT NOT NULL,
    "security_authority_id" TEXT NOT NULL,
    "operations_authority_id" TEXT NOT NULL,
    "lifecycle_state" "M4AuthorityLifecycleState" NOT NULL,
    "permanently_closed" BOOLEAN NOT NULL DEFAULT false,
    "issued_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "completed_at" TIMESTAMPTZ(6),
    "aggregate_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bootstrap_control_records_pkey" PRIMARY KEY ("bootstrap_record_id")
);
    "saga_id" UUID NOT NULL,
    "operation_id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "saga_type" TEXT NOT NULL,
    "target_identity_id" UUID NOT NULL,
    "requested_role" "RoleName" NOT NULL,
    "requested_classification" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "saga_state" "M4SagaState" NOT NULL,
    "completed_steps" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "authority_reference" TEXT NOT NULL,
    "readiness_reference" TEXT,
    "role_assignment_id" UUID,
    "eligibility_reference" TEXT,
    "failure_reason" TEXT,
    "reconciliation_reason" TEXT,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "aggregate_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "privileged_activation_sagas_pkey" PRIMARY KEY ("saga_id")
);
    "attestation_id" UUID NOT NULL,
    "environment" TEXT NOT NULL,
    "jwt_id" UUID NOT NULL,
    "saga_id" UUID NOT NULL,
    "operation_id" UUID NOT NULL,
    "target_identity_id" UUID NOT NULL,
    "requested_role" "RoleName" NOT NULL,
    "effective_classification" TEXT NOT NULL,
    "identity_version" INTEGER NOT NULL,
    "readiness_control_version" INTEGER NOT NULL,
    "attestation_digest" TEXT NOT NULL,
    "verification_reference" TEXT NOT NULL,
    "issued_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "identity_readiness_attestations_pkey" PRIMARY KEY ("attestation_id")
);
    "inbox_id" UUID NOT NULL,
    "environment" TEXT NOT NULL,
    "message_id" UUID NOT NULL,
    "saga_id" UUID NOT NULL,
    "attestation_digest" TEXT NOT NULL,
    "verification_reference" TEXT NOT NULL,
    "observed_saga_version" INTEGER NOT NULL,
    "resulting_saga_version" INTEGER,
    "result" TEXT NOT NULL,
    "received_at" TIMESTAMPTZ(6) NOT NULL,
    "processed_at" TIMESTAMPTZ(6),

    CONSTRAINT "identity_readiness_inbox_pkey" PRIMARY KEY ("inbox_id")
);
    "outbox_id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "environment" TEXT NOT NULL,
    "operation_id" UUID NOT NULL,
    "saga_id" UUID NOT NULL,
    "attestation_digest" TEXT NOT NULL,
    "protected_reference" TEXT NOT NULL,
    "owner_version" INTEGER NOT NULL,
    "delivery_state" TEXT NOT NULL,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "identity_readiness_outbox_pkey" PRIMARY KEY ("outbox_id")
);
    "outbox_id" UUID NOT NULL,
    "owner_event_id" UUID NOT NULL,
    "environment" TEXT NOT NULL,
    "identity_id" UUID NOT NULL,
    "changed_fact" TEXT NOT NULL,
    "owner_version" INTEGER NOT NULL,
    "delivery_state" TEXT NOT NULL,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "privileged_eligibility_invalidation_outbox_pkey" PRIMARY KEY ("outbox_id")
);
    "audit_participant_id" UUID NOT NULL,
    "authorization_reference" TEXT NOT NULL,
    "participant_order" INTEGER NOT NULL,
    "authority_type" TEXT NOT NULL,
    "authority_id" TEXT NOT NULL,
    "assurance" TEXT,
    "evidence_reference" TEXT NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "authorization_audit_participants_pkey" PRIMARY KEY ("audit_participant_id")
);
    "eligibility_record_id" UUID NOT NULL,
    "identity_id" UUID NOT NULL,
    "role_name" "RoleName" NOT NULL,
    "classification" TEXT NOT NULL,
    "environment" TEXT NOT NULL,
    "saga_id" UUID NOT NULL,
    "assignment_id" UUID,
    "attestation_reference" TEXT,
    "audit_reference" TEXT NOT NULL,
    "eligibility_state" "PrivilegedEligibilityState" NOT NULL,
    "reason_code" TEXT NOT NULL,
    "identity_version" INTEGER NOT NULL,
    "aggregate_version" INTEGER NOT NULL,
    "evaluated_at" TIMESTAMPTZ(6) NOT NULL,
    "invalidated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "privileged_access_eligibility_records_pkey" PRIMARY KEY ("eligibility_record_id")
);
    "seller_profile_id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "state" "SellerState" NOT NULL,
    "compliance_state" "SellerComplianceState" NOT NULL,
    "aggregate_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "submitted_at" TIMESTAMPTZ(6),
    "approved_at" TIMESTAMPTZ(6),
    "suspended_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "correlation_id" UUID,

    CONSTRAINT "seller_profiles_pkey" PRIMARY KEY ("seller_profile_id")
);
    "organization_id" UUID NOT NULL,
    "legal_name" TEXT NOT NULL,
    "trade_name" TEXT NOT NULL,
    "business_type" TEXT,
    "registration_number" TEXT NOT NULL,
    "registration_lookup_digest" TEXT NOT NULL,
    "business_address" TEXT NOT NULL,
    "aggregate_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "seller_organizations_pkey" PRIMARY KEY ("organization_id")
);
    "association_id" UUID NOT NULL,
    "seller_profile_id" UUID NOT NULL,
    "identity_id" UUID NOT NULL,
    "association_role" "SellerAssociationRole" NOT NULL,
    "is_primary" BOOLEAN NOT NULL,
    "state" "SellerAssociationState" NOT NULL,
    "aggregate_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "removed_at" TIMESTAMPTZ(6),

    CONSTRAINT "seller_identity_associations_pkey" PRIMARY KEY ("association_id")
);
    "verification_id" UUID NOT NULL,
    "seller_profile_id" UUID NOT NULL,
    "verification_type" "SellerVerificationType" NOT NULL,
    "state" "SellerVerificationState" NOT NULL,
    "generation" INTEGER NOT NULL,
    "submitted_by_identity_id" UUID NOT NULL,
    "reviewed_by_identity_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "aggregate_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "seller_business_verifications_pkey" PRIMARY KEY ("verification_id")
);
    "evidence_id" UUID NOT NULL,
    "verification_id" UUID NOT NULL,
    "evidence_type" TEXT NOT NULL,
    "evidence_reference" TEXT NOT NULL,
    "evidence_digest" TEXT NOT NULL,
    "uploaded_by_identity_id" UUID NOT NULL,
    "uploaded_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "seller_verification_evidence_pkey" PRIMARY KEY ("evidence_id")
);
    "warehouse_id" UUID NOT NULL,
    "seller_profile_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "state" "SellerWarehouseState" NOT NULL,
    "aggregate_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "closed_at" TIMESTAMPTZ(6),

    CONSTRAINT "seller_warehouses_pkey" PRIMARY KEY ("warehouse_id")
);
    "agreement_id" UUID NOT NULL,
    "seller_profile_id" UUID NOT NULL,
    "agreement_type" "SellerAgreementType" NOT NULL,
    "reference" TEXT NOT NULL,
    "state" "SellerAgreementState" NOT NULL,
    "effective_from" TIMESTAMPTZ(6) NOT NULL,
    "effective_to" TIMESTAMPTZ(6),
    "signed_at" TIMESTAMPTZ(6),
    "aggregate_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "seller_agreements_pkey" PRIMARY KEY ("agreement_id")
);
    "seller_state_transition_id" UUID NOT NULL,
    "seller_profile_id" UUID NOT NULL,
    "from_state" "SellerState",
    "to_state" "SellerState" NOT NULL,
    "state_version" INTEGER NOT NULL,
    "actor_identity_id" UUID NOT NULL,
    "actor_kind" TEXT NOT NULL,
    "reason_reference" TEXT,
    "correlation_id" UUID,
    "causation_id" UUID,
    "source_reference" TEXT,
    "transitioned_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "seller_state_transitions_pkey" PRIMARY KEY ("seller_state_transition_id")
);
    "audit_event_id" UUID NOT NULL,
    "seller_profile_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "actor_identity_id" UUID NOT NULL,
    "correlation_id" UUID,
    "evidence_digest" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "seller_business_audit_records_pkey" PRIMARY KEY ("audit_event_id")
);
    "legal_hold_id" UUID NOT NULL,
    "seller_profile_id" UUID NOT NULL,
    "authorized_by_identity_id" UUID NOT NULL,
    "reason_reference" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL,
    "placed_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "released_by_identity_id" UUID,
    "released_at" TIMESTAMPTZ(6),

    CONSTRAINT "seller_evidence_legal_holds_pkey" PRIMARY KEY ("legal_hold_id")
);
CREATE TABLE "products" (
    "product_id" UUID NOT NULL,
    "seller_profile_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "state" "ProductState" NOT NULL,
    "selling_price" DECIMAL(12,2) NOT NULL,
    "compare_at_price" DECIMAL(12,2),
    "aggregate_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "submitted_at" TIMESTAMPTZ(6),
    "approved_at" TIMESTAMPTZ(6),
    "published_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "correlation_id" UUID,

    CONSTRAINT "products_pkey" PRIMARY KEY ("product_id")
);
CREATE TABLE "product_variants" (
    "variant_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "state" "ProductState" NOT NULL,
    "selling_price" DECIMAL(12,2) NOT NULL,
    "compare_at_price" DECIMAL(12,2),
    "aggregate_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "published_at" TIMESTAMPTZ(6),
    "correlation_id" UUID,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("variant_id")
);
CREATE TABLE "product_skus" (
    "sku_id" UUID NOT NULL,
    "seller_profile_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_id" UUID,
    "sku_code" TEXT NOT NULL,
    "state" "ProductSkuState" NOT NULL,
    "aggregate_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "closed_at" TIMESTAMPTZ(6),

    CONSTRAINT "product_skus_pkey" PRIMARY KEY ("sku_id")
);
CREATE TABLE "product_categories" (
    "category_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "parent_category_id" UUID,
    "state" "CategoryState" NOT NULL,
    "aggregate_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "retired_at" TIMESTAMPTZ(6),

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("category_id")
);
CREATE TABLE "product_attribute_definitions" (
    "attribute_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "value_type" "AttributeValueType" NOT NULL,
    "unit" TEXT,
    "required" BOOLEAN NOT NULL,
    "group" TEXT,
    "allowed_values" TEXT[],
    "min_value" DECIMAL(18,6),
    "max_value" DECIMAL(18,6),
    "state" TEXT NOT NULL,
    "aggregate_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "retired_at" TIMESTAMPTZ(6),

    CONSTRAINT "product_attribute_definitions_pkey" PRIMARY KEY ("attribute_id")
);
CREATE TABLE "product_attribute_values" (
    "attribute_value_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_id" UUID,
    "attribute_id" UUID NOT NULL,
    "value_type" "AttributeValueType" NOT NULL,
    "value" TEXT NOT NULL,
    "state" "ProductAttributeValueState" NOT NULL,
    "aggregate_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "product_attribute_values_pkey" PRIMARY KEY ("attribute_value_id")
);
CREATE TABLE "product_media" (
    "media_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "media_type" "ProductMediaType" NOT NULL,
    "media_reference" TEXT NOT NULL,
    "media_digest" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_by_identity_id" UUID NOT NULL,
    "state" "ProductMediaState" NOT NULL,
    "aggregate_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "product_media_pkey" PRIMARY KEY ("media_id")
);
CREATE TABLE "product_state_transitions" (
    "product_state_transition_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "from_state" "ProductState",
    "to_state" "ProductState" NOT NULL,
    "state_version" INTEGER NOT NULL,
    "actor_identity_id" UUID NOT NULL,
    "actor_kind" TEXT NOT NULL,
    "reason_reference" TEXT,
    "correlation_id" UUID,
    "causation_id" UUID,
    "source_reference" TEXT,
    "transitioned_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "product_state_transitions_pkey" PRIMARY KEY ("product_state_transition_id")
);
CREATE TABLE "product_audit_records" (
    "audit_event_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "actor_identity_id" UUID NOT NULL,
    "correlation_id" UUID,
    "evidence_digest" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "product_audit_records_pkey" PRIMARY KEY ("audit_event_id")
);
CREATE TABLE "product_price_history" (
    "price_history_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_id" UUID,
    "selling_price" DECIMAL(12,2) NOT NULL,
    "compare_at_price" DECIMAL(12,2),
    "recorded_version" INTEGER NOT NULL,
    "recorded_by_identity_id" UUID NOT NULL,
    "recorded_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "product_price_history_pkey" PRIMARY KEY ("price_history_id")
);
CREATE INDEX "product_variants_product_id_idx" ON "product_variants"("product_id");
CREATE UNIQUE INDEX "product_variants_variant_id_aggregate_version_key" ON "product_variants"("variant_id", "aggregate_version");
CREATE INDEX "product_skus_product_id_idx" ON "product_skus"("product_id");
CREATE INDEX "product_skus_variant_id_idx" ON "product_skus"("variant_id");
CREATE UNIQUE INDEX "product_skus_sku_id_aggregate_version_key" ON "product_skus"("sku_id", "aggregate_version");
CREATE INDEX "product_categories_parent_category_id_idx" ON "product_categories"("parent_category_id");
CREATE INDEX "product_categories_state_idx" ON "product_categories"("state");
CREATE INDEX "product_attribute_definitions_state_idx" ON "product_attribute_definitions"("state");
CREATE INDEX "product_attribute_values_product_id_idx" ON "product_attribute_values"("product_id");
CREATE INDEX "product_attribute_values_attribute_id_idx" ON "product_attribute_values"("attribute_id");
CREATE UNIQUE INDEX "product_attribute_values_attribute_value_id_aggregate_versi_key" ON "product_attribute_values"("attribute_value_id", "aggregate_version");
CREATE INDEX "product_media_product_id_idx" ON "product_media"("product_id");
CREATE INDEX "product_state_transitions_product_id_idx" ON "product_state_transitions"("product_id");
CREATE UNIQUE INDEX "product_state_transitions_product_id_state_version_key" ON "product_state_transitions"("product_id", "state_version");
CREATE INDEX "product_audit_records_product_id_occurred_at_idx" ON "product_audit_records"("product_id", "occurred_at" DESC);
CREATE INDEX "product_price_history_product_id_recorded_at_idx" ON "product_price_history"("product_id", "recorded_at" DESC);

-- WEMP-M04-SPEC-001 §9 / decision D-06: SKU codes are unique per seller
-- organization while ACTIVE. Partial unique index (Prisma cannot express
-- partial indexes in the schema).
CREATE UNIQUE INDEX "product_skus_seller_profile_id_sku_code_key"
    ON "product_skus" ("seller_profile_id", "sku_code")
    WHERE "state" = 'ACTIVE';

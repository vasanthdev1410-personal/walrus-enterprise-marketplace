CREATE TYPE "M4AuthorityLifecycleState" AS ENUM ('ISSUED','RESERVED','CONSUMED','INVALIDATED','EXPIRED','RECONCILIATION_REQUIRED');
CREATE TYPE "M4SagaState" AS ENUM ('REQUESTED','IDENTITY_PREPARED','AWAITING_IDENTITY_ACTIVATION','IDENTITY_READY','ROLE_ASSIGNMENT_PENDING','ROLE_ASSIGNED','ELIGIBILITY_PENDING','COMPLETED','EXPIRED','CANCELLED','FAILED_RECONCILIATION');
CREATE TYPE "PrivilegedEligibilityState" AS ENUM ('ELIGIBLE','NOT_ELIGIBLE');

ALTER TABLE "recovery_requests"
  ADD COLUMN "requester_kind" TEXT,
  ADD COLUMN "requester_reference" TEXT,
  ADD COLUMN "requester_identity_id" UUID;

ALTER TABLE "authorization_decision_records"
  ADD COLUMN "schema_version" TEXT,
  ADD COLUMN "target_identity_id" UUID,
  ADD COLUMN "workload_identity" TEXT,
  ADD COLUMN "action" TEXT,
  ADD COLUMN "evaluated_role_names" "RoleName"[] NOT NULL DEFAULT ARRAY[]::"RoleName"[],
  ADD COLUMN "resource_type" TEXT,
  ADD COLUMN "resource_reference" TEXT,
  ADD COLUMN "reason_code" TEXT,
  ADD COLUMN "policy_version" TEXT,
  ADD COLUMN "contract_version" TEXT,
  ADD COLUMN "assurance" TEXT,
  ADD COLUMN "environment" TEXT;

CREATE TABLE "trusted_workload_replay_records" (
  "replay_record_id" UUID PRIMARY KEY, "environment" TEXT NOT NULL, "jwt_id" UUID NOT NULL,
  "workload_subject" TEXT NOT NULL, "boundary" TEXT NOT NULL, "assertion_digest" TEXT NOT NULL,
  "request_digest" TEXT NOT NULL, "certificate_thumbprint" TEXT NOT NULL, "operation_id" UUID NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL, "consumed_at" TIMESTAMPTZ(6) NOT NULL,
  "audit_reference" TEXT NOT NULL, "created_at" TIMESTAMPTZ(6) NOT NULL
);
CREATE UNIQUE INDEX "trusted_workload_replay_records_environment_jwt_id_key" ON "trusted_workload_replay_records"("environment","jwt_id");
CREATE INDEX "trusted_workload_replay_records_expires_at_idx" ON "trusted_workload_replay_records"("expires_at");

CREATE TABLE "authorization_approval_records" (
  "approval_record_id" UUID PRIMARY KEY, "operation_id" UUID NOT NULL, "authority_type" TEXT NOT NULL,
  "authority_id" TEXT NOT NULL, "approver_identity_id" UUID, "session_id" TEXT, "assurance" TEXT NOT NULL,
  "decision" TEXT NOT NULL, "evidence_digest" TEXT NOT NULL, "policy_version" TEXT NOT NULL,
  "approved_at" TIMESTAMPTZ(6) NOT NULL, "expires_at" TIMESTAMPTZ(6) NOT NULL, "created_at" TIMESTAMPTZ(6) NOT NULL
);
CREATE UNIQUE INDEX "authorization_approval_records_operation_authority_key" ON "authorization_approval_records"("operation_id","authority_type","authority_id");
CREATE INDEX "authorization_approval_records_operation_expiry_idx" ON "authorization_approval_records"("operation_id","expires_at");

CREATE TABLE "provisioning_authority_records" (
  "provisioning_record_id" UUID PRIMARY KEY, "operation_id" UUID NOT NULL, "environment" TEXT NOT NULL,
  "target_identity_id" UUID NOT NULL, "requested_role" "RoleName" NOT NULL, "requested_classification" TEXT NOT NULL,
  "operation_type" TEXT NOT NULL, "jwt_id" UUID NOT NULL, "evidence_digest" TEXT NOT NULL,
  "lookup_reference_digest" TEXT NOT NULL, "policy_version" TEXT NOT NULL,
  "lifecycle_state" "M4AuthorityLifecycleState" NOT NULL, "reserved_by_operation_id" UUID,
  "issued_at" TIMESTAMPTZ(6) NOT NULL, "expires_at" TIMESTAMPTZ(6) NOT NULL, "consumed_at" TIMESTAMPTZ(6),
  "aggregate_version" INTEGER NOT NULL, "created_at" TIMESTAMPTZ(6) NOT NULL, "updated_at" TIMESTAMPTZ(6) NOT NULL
);
CREATE UNIQUE INDEX "provisioning_authority_records_operation_id_key" ON "provisioning_authority_records"("operation_id");
CREATE UNIQUE INDEX "provisioning_authority_records_environment_jwt_id_key" ON "provisioning_authority_records"("environment","jwt_id");
CREATE INDEX "provisioning_authority_records_lifecycle_expiry_idx" ON "provisioning_authority_records"("lifecycle_state","expires_at");

CREATE TABLE "bootstrap_control_records" (
  "bootstrap_record_id" UUID PRIMARY KEY, "environment" TEXT NOT NULL, "operation_id" UUID NOT NULL,
  "intended_identity_id" UUID NOT NULL, "jwt_id" UUID NOT NULL, "evidence_digest" TEXT NOT NULL,
  "security_authority_id" TEXT NOT NULL, "operations_authority_id" TEXT NOT NULL,
  "lifecycle_state" "M4AuthorityLifecycleState" NOT NULL, "permanently_closed" BOOLEAN NOT NULL DEFAULT false,
  "issued_at" TIMESTAMPTZ(6) NOT NULL, "expires_at" TIMESTAMPTZ(6) NOT NULL, "completed_at" TIMESTAMPTZ(6),
  "aggregate_version" INTEGER NOT NULL, "created_at" TIMESTAMPTZ(6) NOT NULL, "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "bootstrap_distinct_authorities_check" CHECK ("security_authority_id" <> "operations_authority_id"),
  CONSTRAINT "bootstrap_closed_terminal_check" CHECK (NOT "permanently_closed" OR "lifecycle_state" = 'CONSUMED')
);
CREATE UNIQUE INDEX "bootstrap_control_records_environment_key" ON "bootstrap_control_records"("environment");
CREATE UNIQUE INDEX "bootstrap_control_records_operation_id_key" ON "bootstrap_control_records"("operation_id");
CREATE UNIQUE INDEX "bootstrap_control_records_environment_jwt_id_key" ON "bootstrap_control_records"("environment","jwt_id");

CREATE TABLE "privileged_activation_sagas" (
  "saga_id" UUID PRIMARY KEY, "operation_id" UUID NOT NULL, "request_id" UUID NOT NULL, "saga_type" TEXT NOT NULL,
  "target_identity_id" UUID NOT NULL, "requested_role" "RoleName" NOT NULL, "requested_classification" TEXT NOT NULL,
  "environment" TEXT NOT NULL, "saga_state" "M4SagaState" NOT NULL, "completed_steps" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "authority_reference" TEXT NOT NULL, "readiness_reference" TEXT, "role_assignment_id" UUID,
  "eligibility_reference" TEXT, "failure_reason" TEXT, "reconciliation_reason" TEXT,
  "expires_at" TIMESTAMPTZ(6) NOT NULL, "aggregate_version" INTEGER NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL, "updated_at" TIMESTAMPTZ(6) NOT NULL
);
CREATE UNIQUE INDEX "privileged_activation_sagas_environment_operation_key" ON "privileged_activation_sagas"("environment","operation_id");
CREATE INDEX "privileged_activation_sagas_state_expiry_idx" ON "privileged_activation_sagas"("saga_state","expires_at");
CREATE UNIQUE INDEX "privileged_activation_sagas_one_open_bootstrap_key" ON "privileged_activation_sagas"("environment")
  WHERE "saga_type" = 'FIRST_SUPER_ADMIN_BOOTSTRAP' AND "saga_state" NOT IN ('COMPLETED','EXPIRED','CANCELLED');

CREATE TABLE "identity_readiness_attestations" (
  "attestation_id" UUID PRIMARY KEY, "environment" TEXT NOT NULL, "jwt_id" UUID NOT NULL, "saga_id" UUID NOT NULL,
  "operation_id" UUID NOT NULL, "target_identity_id" UUID NOT NULL, "requested_role" "RoleName" NOT NULL,
  "effective_classification" TEXT NOT NULL, "identity_version" INTEGER NOT NULL, "readiness_control_version" INTEGER NOT NULL,
  "attestation_digest" TEXT NOT NULL, "verification_reference" TEXT NOT NULL,
  "issued_at" TIMESTAMPTZ(6) NOT NULL, "expires_at" TIMESTAMPTZ(6) NOT NULL, "consumed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL
);
CREATE UNIQUE INDEX "identity_readiness_attestations_environment_jwt_id_key" ON "identity_readiness_attestations"("environment","jwt_id");
CREATE UNIQUE INDEX "identity_readiness_attestations_saga_digest_key" ON "identity_readiness_attestations"("saga_id","attestation_digest");

CREATE TABLE "identity_readiness_inbox" (
  "inbox_id" UUID PRIMARY KEY, "environment" TEXT NOT NULL, "message_id" UUID NOT NULL, "saga_id" UUID NOT NULL,
  "attestation_digest" TEXT NOT NULL, "verification_reference" TEXT NOT NULL, "observed_saga_version" INTEGER NOT NULL,
  "resulting_saga_version" INTEGER, "result" TEXT NOT NULL, "received_at" TIMESTAMPTZ(6) NOT NULL, "processed_at" TIMESTAMPTZ(6)
);
CREATE UNIQUE INDEX "identity_readiness_inbox_environment_message_key" ON "identity_readiness_inbox"("environment","message_id");
CREATE UNIQUE INDEX "identity_readiness_inbox_environment_saga_digest_key" ON "identity_readiness_inbox"("environment","saga_id","attestation_digest");

CREATE TABLE "identity_readiness_outbox" (
  "outbox_id" UUID PRIMARY KEY, "message_id" UUID NOT NULL, "environment" TEXT NOT NULL, "operation_id" UUID NOT NULL,
  "saga_id" UUID NOT NULL, "attestation_digest" TEXT NOT NULL, "protected_reference" TEXT NOT NULL,
  "owner_version" INTEGER NOT NULL, "delivery_state" TEXT NOT NULL, "retry_count" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMPTZ(6) NOT NULL, "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL, "updated_at" TIMESTAMPTZ(6) NOT NULL
);
CREATE UNIQUE INDEX "identity_readiness_outbox_message_id_key" ON "identity_readiness_outbox"("message_id");
CREATE UNIQUE INDEX "identity_readiness_outbox_environment_saga_digest_key" ON "identity_readiness_outbox"("environment","saga_id","attestation_digest");
CREATE INDEX "identity_readiness_outbox_delivery_attempt_idx" ON "identity_readiness_outbox"("delivery_state","next_attempt_at");

CREATE TABLE "authorization_audit_participants" (
  "audit_participant_id" UUID PRIMARY KEY, "authorization_reference" TEXT NOT NULL, "participant_order" INTEGER NOT NULL,
  "authority_type" TEXT NOT NULL, "authority_id" TEXT NOT NULL, "assurance" TEXT, "evidence_reference" TEXT NOT NULL,
  "recorded_at" TIMESTAMPTZ(6) NOT NULL, CONSTRAINT "audit_participant_order_check" CHECK ("participant_order" >= 1)
);
CREATE UNIQUE INDEX "authorization_audit_participants_reference_order_key" ON "authorization_audit_participants"("authorization_reference","participant_order");

CREATE TABLE "privileged_access_eligibility_records" (
  "eligibility_record_id" UUID PRIMARY KEY, "identity_id" UUID NOT NULL, "role_name" "RoleName" NOT NULL,
  "classification" TEXT NOT NULL, "environment" TEXT NOT NULL, "saga_id" UUID NOT NULL, "assignment_id" UUID,
  "attestation_reference" TEXT, "audit_reference" TEXT NOT NULL,
  "eligibility_state" "PrivilegedEligibilityState" NOT NULL, "reason_code" TEXT NOT NULL,
  "identity_version" INTEGER NOT NULL, "aggregate_version" INTEGER NOT NULL, "evaluated_at" TIMESTAMPTZ(6) NOT NULL,
  "invalidated_at" TIMESTAMPTZ(6), "created_at" TIMESTAMPTZ(6) NOT NULL, "updated_at" TIMESTAMPTZ(6) NOT NULL
);
CREATE UNIQUE INDEX "privileged_access_eligibility_environment_saga_key" ON "privileged_access_eligibility_records"("environment","saga_id");
CREATE UNIQUE INDEX "privileged_access_eligibility_assignment_key" ON "privileged_access_eligibility_records"("assignment_id") WHERE "assignment_id" IS NOT NULL;
CREATE INDEX "privileged_access_eligibility_identity_role_time_idx" ON "privileged_access_eligibility_records"("environment","identity_id","role_name","evaluated_at" DESC);
CREATE INDEX "privileged_access_eligibility_state_identity_idx" ON "privileged_access_eligibility_records"("eligibility_state","identity_id");

CREATE TABLE "privileged_eligibility_invalidation_outbox" (
  "outbox_id" UUID PRIMARY KEY, "owner_event_id" UUID NOT NULL, "environment" TEXT NOT NULL, "identity_id" UUID NOT NULL,
  "changed_fact" TEXT NOT NULL, "owner_version" INTEGER NOT NULL, "delivery_state" TEXT NOT NULL,
  "retry_count" INTEGER NOT NULL DEFAULT 0, "next_attempt_at" TIMESTAMPTZ(6) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL, "updated_at" TIMESTAMPTZ(6) NOT NULL
);
CREATE UNIQUE INDEX "privileged_eligibility_invalidation_owner_event_key" ON "privileged_eligibility_invalidation_outbox"("owner_event_id");
CREATE INDEX "privileged_eligibility_invalidation_delivery_idx" ON "privileged_eligibility_invalidation_outbox"("delivery_state","next_attempt_at");

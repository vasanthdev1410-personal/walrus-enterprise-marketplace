-- CreateEnum
CREATE TYPE "RoleName" AS ENUM ('CUSTOMER', 'SELLER', 'ADMIN', 'SUPER_ADMIN');

-- CreateEnum
CREATE TYPE "RoleState" AS ENUM ('CREATED', 'CONFIGURED', 'ACTIVE', 'SUSPENDED', 'RETIRED');

-- CreateEnum
CREATE TYPE "IdentityRoleAssignmentState" AS ENUM ('ACTIVE', 'REVOKED');

-- CreateEnum
CREATE TYPE "PermissionStatus" AS ENUM ('ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "AuthorizationDecisionOutcome" AS ENUM ('GRANTED', 'DENIED');

-- CreateTable
CREATE TABLE "identity_role_assignments" (
    "assignment_id" UUID NOT NULL,
    "identity_id" UUID NOT NULL,
    "role_name" "RoleName" NOT NULL,
    "assignment_state" "IdentityRoleAssignmentState" NOT NULL,
    "assigned_by_identity_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_by_identity_id" UUID,
    "revoked_at" TIMESTAMPTZ(6),
    "aggregate_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "identity_role_assignments_pkey" PRIMARY KEY ("assignment_id")
);

-- CreateTable
CREATE TABLE "authorization_decision_records" (
    "authorization_reference" TEXT NOT NULL,
    "subject_identity_id" UUID NOT NULL,
    "permission_id" TEXT NOT NULL,
    "resource_classification" TEXT,
    "decision_outcome" "AuthorizationDecisionOutcome" NOT NULL,
    "denial_reason" TEXT,
    "session_identifier" TEXT,
    "correlation_id" UUID,
    "decided_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "authorization_decision_records_pkey" PRIMARY KEY ("authorization_reference")
);

-- CreateIndex
CREATE INDEX "identity_role_assignments_identity_id_assignment_state_idx" ON "identity_role_assignments"("identity_id", "assignment_state");

-- CreateIndex
CREATE INDEX "identity_role_assignments_role_name_assignment_state_idx" ON "identity_role_assignments"("role_name", "assignment_state");

-- CreateIndex
CREATE UNIQUE INDEX "identity_role_assignments_identity_id_role_name_key" ON "identity_role_assignments"("identity_id", "role_name");

-- CreateIndex
CREATE INDEX "authorization_decision_records_subject_identity_id_decided__idx" ON "authorization_decision_records"("subject_identity_id", "decided_at" DESC);

-- CreateIndex
CREATE INDEX "authorization_decision_records_permission_id_decided_at_idx" ON "authorization_decision_records"("permission_id", "decided_at" DESC);

-- CreateIndex
CREATE INDEX "authorization_decision_records_decided_at_idx" ON "authorization_decision_records"("decided_at" DESC);

-- RenameIndex
ALTER INDEX "api_idempotency_records_identity_or_client_scope_operation_type" RENAME TO "api_idempotency_records_identity_or_client_scope_operation__key";

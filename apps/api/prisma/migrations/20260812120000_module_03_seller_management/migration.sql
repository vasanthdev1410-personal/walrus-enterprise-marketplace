-- Module 03 - Seller Management persistence (WEMP-M03-SPEC-001 §3/§9).
-- Additive only: no Module 01 or Module 02 table is modified. identity_id and
-- seller_profile_id are logical UUIDv7 references with NO cross-module foreign
-- keys (storage isolation).

-- CreateEnum
CREATE TYPE "SellerState" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'CORRECTIONS_REQUESTED', 'APPROVED', 'ACTIVE', 'SUSPENDED', 'REJECTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "SellerComplianceState" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'VERIFICATION_REQUIRED', 'COMPLIANT', 'NON_COMPLIANT');

-- CreateEnum
CREATE TYPE "SellerVerificationType" AS ENUM ('GST', 'PAN', 'BANK', 'ADDRESS');

-- CreateEnum
CREATE TYPE "SellerVerificationState" AS ENUM ('PENDING', 'SUBMITTED', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "SellerAssociationRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "SellerAssociationState" AS ENUM ('ACTIVE', 'REMOVED');

-- CreateEnum
CREATE TYPE "SellerWarehouseState" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "SellerAgreementState" AS ENUM ('ACTIVE', 'EXPIRED', 'TERMINATED');

-- CreateEnum
CREATE TYPE "SellerAgreementType" AS ENUM ('COMMISSION');

-- CreateTable
CREATE TABLE "seller_profiles" (
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

-- CreateIndex
CREATE INDEX "seller_profiles_state_compliance_state_idx" ON "seller_profiles"("state", "compliance_state");

-- M03-SPEC-001 §4 / decision D-02: at most one ACTIVE seller per organization.
-- Partial unique index (Prisma cannot express partial indexes in the schema).
CREATE UNIQUE INDEX "seller_profiles_one_active_per_organization_key"
    ON "seller_profiles" ("organization_id")
    WHERE "state" = 'ACTIVE';

-- CreateTable
CREATE TABLE "seller_organizations" (
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

-- CreateIndex
CREATE UNIQUE INDEX "seller_organizations_registration_lookup_digest_key" ON "seller_organizations"("registration_lookup_digest");

-- CreateTable
CREATE TABLE "seller_identity_associations" (
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

-- CreateIndex
CREATE UNIQUE INDEX "seller_identity_associations_seller_profile_id_identity_id_key" ON "seller_identity_associations"("seller_profile_id", "identity_id");

-- CreateIndex
CREATE INDEX "seller_identity_associations_identity_id_state_idx" ON "seller_identity_associations"("identity_id", "state");

-- WEMP-M03-CONTRACT-001 §A.2 / decision D-01: exactly one ACTIVE OWNER per
-- seller profile, enforced by the database.
CREATE UNIQUE INDEX "seller_identity_associations_one_active_owner_key"
    ON "seller_identity_associations" ("seller_profile_id")
    WHERE "state" = 'ACTIVE' AND "association_role" = 'OWNER';

-- CreateTable
CREATE TABLE "seller_business_verifications" (
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

-- CreateIndex
CREATE UNIQUE INDEX "seller_business_verifications_seller_profile_id_verificat_key" ON "seller_business_verifications"("seller_profile_id", "verification_type", "generation");

-- CreateIndex
CREATE INDEX "seller_business_verifications_seller_profile_id_state_idx" ON "seller_business_verifications"("seller_profile_id", "state");

-- CreateTable
CREATE TABLE "seller_verification_evidence" (
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

-- CreateIndex
CREATE INDEX "seller_verification_evidence_verification_id_idx" ON "seller_verification_evidence"("verification_id");

-- CreateTable
CREATE TABLE "seller_warehouses" (
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

-- CreateIndex
CREATE INDEX "seller_warehouses_seller_profile_id_idx" ON "seller_warehouses"("seller_profile_id");

-- CreateTable
CREATE TABLE "seller_agreements" (
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

-- CreateIndex
CREATE INDEX "seller_agreements_seller_profile_id_idx" ON "seller_agreements"("seller_profile_id");

-- CreateTable
CREATE TABLE "seller_state_transitions" (
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

-- WEMP-M03-SPEC-001 §4: append-only lifecycle episodes with strictly increasing
-- state versions. DB-level uniqueness (same as identity/recovery transitions)
-- rejects duplicate episodes for a profile defensively.
-- CreateIndex
CREATE UNIQUE INDEX "seller_state_transitions_seller_profile_id_state_version_key" ON "seller_state_transitions"("seller_profile_id", "state_version");

-- CreateTable
CREATE TABLE "seller_business_audit_records" (
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

-- CreateIndex
CREATE INDEX "seller_business_audit_records_seller_profile_id_occurred_at_idx" ON "seller_business_audit_records"("seller_profile_id", "occurred_at" DESC);

-- Module 06 - Customer Management persistence (WEMP-M06-SPEC-001 §13, decisions D-01..D-15).
-- Additive only: no Module 00/01/02/03/04/05 table is modified. identity_id
-- and actor_identity_id are logical UUIDv7 references with NO cross-module
-- foreign keys (storage isolation, A-06).
-- Retention: D-15 retention durations RECORDED 2026-08-17
-- (CustomerStateTransition 2555 days; CustomerAuditRecord 2555 days) —
-- enforced by the application-layer retention processor (M06-M3), never by
-- this migration. No credentials, authentication material, or unrelated
-- Module 01 identity/security data are stored (A-04).

-- CreateEnum
CREATE TYPE "CustomerState" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "CustomerAddressRole" AS ENUM ('SHIPPING', 'BILLING');

-- CreateEnum
CREATE TYPE "CustomerAddressState" AS ENUM ('ACTIVE', 'REMOVED');

-- CreateEnum
CREATE TYPE "CustomerPreferenceKey" AS ENUM ('language', 'currency', 'locale');

-- CreateTable
CREATE TABLE "customer_profiles" (
    "customer_profile_id" UUID NOT NULL,
    "identity_id" UUID NOT NULL,
    "state" "CustomerState" NOT NULL,
    "aggregate_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "suspended_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "correlation_id" UUID,

    CONSTRAINT "customer_profiles_pkey" PRIMARY KEY ("customer_profile_id")
);

-- CreateTable
CREATE TABLE "customer_state_transitions" (
    "transition_id" UUID NOT NULL,
    "customer_profile_id" UUID NOT NULL,
    "from_state" "CustomerState" NOT NULL,
    "to_state" "CustomerState" NOT NULL,
    "state_version" INTEGER NOT NULL,
    "actor_identity_id" UUID NOT NULL,
    "actor_kind" TEXT NOT NULL,
    "reason_reference" TEXT NOT NULL,
    "correlation_id" UUID,
    "causation_id" UUID,
    "source_reference" TEXT,
    "transitioned_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customer_state_transitions_pkey" PRIMARY KEY ("transition_id")
);

-- CreateTable
CREATE TABLE "customer_addresses" (
    "address_id" UUID NOT NULL,
    "customer_profile_id" UUID NOT NULL,
    "recipient_name" TEXT NOT NULL,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT NOT NULL,
    "region" TEXT,
    "postal_code" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "phone" TEXT,
    "roles" "CustomerAddressRole"[],
    "is_default_shipping" BOOLEAN NOT NULL,
    "is_default_billing" BOOLEAN NOT NULL,
    "state" "CustomerAddressState" NOT NULL,
    "aggregate_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "removed_at" TIMESTAMPTZ(6),

    CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("address_id")
);

-- CreateTable
CREATE TABLE "customer_business_profiles" (
    "customer_business_profile_id" UUID NOT NULL,
    "customer_profile_id" UUID NOT NULL,
    "company_name" TEXT NOT NULL,
    "registration_lookup_digest" TEXT,
    "business_type" TEXT,
    "aggregate_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customer_business_profiles_pkey" PRIMARY KEY ("customer_business_profile_id")
);

-- CreateTable
CREATE TABLE "customer_preferences" (
    "preference_id" UUID NOT NULL,
    "customer_profile_id" UUID NOT NULL,
    "preference_key" "CustomerPreferenceKey" NOT NULL,
    "preference_value" TEXT NOT NULL,
    "aggregate_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customer_preferences_pkey" PRIMARY KEY ("preference_id")
);

-- CreateTable
CREATE TABLE "customer_audit_records" (
    "audit_event_id" UUID NOT NULL,
    "customer_profile_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "actor_identity_id" UUID NOT NULL,
    "correlation_id" UUID,
    "evidence_digest" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customer_audit_records_pkey" PRIMARY KEY ("audit_event_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_profiles_identity_id_key" ON "customer_profiles"("identity_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_profiles_customer_profile_id_aggregate_version_key" ON "customer_profiles"("customer_profile_id", "aggregate_version");

-- CreateIndex
CREATE UNIQUE INDEX "customer_state_transitions_customer_profile_id_state_version_key" ON "customer_state_transitions"("customer_profile_id", "state_version");

-- CreateIndex
CREATE INDEX "customer_state_transitions_customer_profile_id_transitioned_at_idx" ON "customer_state_transitions"("customer_profile_id", "transitioned_at" DESC);

-- CreateIndex
CREATE INDEX "customer_addresses_customer_profile_id_state_idx" ON "customer_addresses"("customer_profile_id", "state");

-- WEMP-M06-SPEC-001 §7 / decision D-04: at most one default shipping address
-- per profile while ACTIVE. Partial unique index (Prisma cannot express
-- partial indexes in the schema).
CREATE UNIQUE INDEX "customer_addresses_one_default_shipping_key"
    ON "customer_addresses" ("customer_profile_id")
    WHERE "state" = 'ACTIVE' AND "is_default_shipping" = true;

-- WEMP-M06-SPEC-001 §7 / decision D-04: at most one default billing address
-- per profile while ACTIVE. Partial unique index (Prisma cannot express
-- partial indexes in the schema).
CREATE UNIQUE INDEX "customer_addresses_one_default_billing_key"
    ON "customer_addresses" ("customer_profile_id")
    WHERE "state" = 'ACTIVE' AND "is_default_billing" = true;

-- CreateIndex
CREATE UNIQUE INDEX "customer_business_profiles_customer_profile_id_key" ON "customer_business_profiles"("customer_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "customer_preferences_customer_profile_id_preference_key_key" ON "customer_preferences"("customer_profile_id", "preference_key");

-- CreateIndex
CREATE INDEX "customer_audit_records_customer_profile_id_occurred_at_idx" ON "customer_audit_records"("customer_profile_id", "occurred_at" DESC);

-- Module 07 - Shopping Cart persistence (WEMP-M07-SPEC-001 §13, decisions D-01..D-18).
-- Additive only: no Module 00/01/02/03/04/05/06 table is modified. All
-- cross-module references (customerProfileId, skuId, productId, actorIdentityId)
-- are logical UUIDv7 values with NO cross-module foreign keys (storage isolation, A-05).
-- Retention: D-11 retention durations configurable (CART_RECORD_RETENTION_DAYS,
-- default 90 days) — enforced by the application-layer retention processor (M07-M3),
-- never by this migration.

-- CreateEnum
CREATE TYPE "CartState" AS ENUM ('ACTIVE', 'CHECKED_OUT', 'ARCHIVED', 'AUTO_EXPIRED');

-- CreateTable
CREATE TABLE "carts" (
    "cart_id" UUID NOT NULL,
    "customer_profile_id" UUID NOT NULL,
    "state" "CartState" NOT NULL,
    "total_lines" INTEGER NOT NULL,
    "total_items" INTEGER NOT NULL,
    "aggregate_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6),
    "correlation_id" UUID,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("cart_id")
);

-- CreateTable
CREATE TABLE "cart_lines" (
    "cart_line_id" UUID NOT NULL,
    "cart_id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "sku_code" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price_amount" INTEGER NOT NULL,
    "unit_price_currency" TEXT NOT NULL,
    "snapshot_tax_included" BOOLEAN NOT NULL,
    "product_unavailable" BOOLEAN NOT NULL,
    "aggregate_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cart_lines_pkey" PRIMARY KEY ("cart_line_id")
);

-- CreateTable
CREATE TABLE "cart_state_transitions" (
    "transition_id" UUID NOT NULL,
    "cart_id" UUID NOT NULL,
    "from_state" "CartState" NOT NULL,
    "to_state" "CartState" NOT NULL,
    "state_version" INTEGER NOT NULL,
    "actor_identity_id" UUID NOT NULL,
    "actor_kind" TEXT NOT NULL,
    "reason_reference" TEXT NOT NULL,
    "correlation_id" UUID,
    "causation_id" UUID,
    "source_reference" TEXT,
    "transitioned_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cart_state_transitions_pkey" PRIMARY KEY ("transition_id")
);

-- CreateTable
CREATE TABLE "cart_audit_records" (
    "audit_event_id" UUID NOT NULL,
    "cart_id" UUID NOT NULL,
    "customer_profile_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "actor_identity_id" UUID NOT NULL,
    "correlation_id" UUID,
    "evidence_digest" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "cart_audit_records_pkey" PRIMARY KEY ("audit_event_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "carts_customer_profile_id_key" ON "carts"("customer_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "carts_cart_id_aggregate_version_key" ON "carts"("cart_id", "aggregate_version");

-- CreateIndex
CREATE UNIQUE INDEX "cart_lines_cart_id_sku_id_key" ON "cart_lines"("cart_id", "sku_id");

-- CreateIndex
CREATE INDEX "cart_lines_cart_id_idx" ON "cart_lines"("cart_id");

-- CreateIndex
CREATE UNIQUE INDEX "cart_state_transitions_cart_id_state_version_key" ON "cart_state_transitions"("cart_id", "state_version");

-- CreateIndex
CREATE INDEX "cart_state_transitions_cart_id_transitioned_at_idx" ON "cart_state_transitions"("cart_id", "transitioned_at" DESC);

-- CreateIndex
CREATE INDEX "cart_audit_records_cart_id_occurred_at_idx" ON "cart_audit_records"("cart_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "cart_audit_records_customer_profile_id_occurred_at_idx" ON "cart_audit_records"("customer_profile_id", "occurred_at" DESC);

-- Module 05 - Inventory Management persistence (WEMP-M05-SPEC-001 §14, decisions D-01..D-18).
-- Additive only: no Module 01/02/03/04 table is modified. sku_id,
-- seller_profile_id and actor_identity_id are logical UUIDv7 references with
-- NO cross-module foreign keys (storage isolation, A-06).
-- Retention: D-12 retention durations RECORDED 2026-08-15 (InventoryMovementRecord
-- 2555 days; InventoryAuditRecord 2555 days) — enforced by the application
-- layer retention processor (M05-M3), never by this migration.

-- CreateEnum
CREATE TYPE "InventoryMovementType" AS ENUM ('STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT', 'COUNT_CORRECTION');

-- CreateEnum
CREATE TYPE "InventoryConfigState" AS ENUM ('ACTIVE', 'RETIRED');

-- CreateTable
CREATE TABLE "inventory_stock_pools" (
    "stock_pool_id" UUID NOT NULL,
    "sku_id" UUID NOT NULL,
    "seller_profile_id" UUID NOT NULL,
    "on_hand" INTEGER NOT NULL,
    "reserved" INTEGER NOT NULL,
    "aggregate_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inventory_stock_pools_pkey" PRIMARY KEY ("stock_pool_id")
);

-- CreateTable
CREATE TABLE "inventory_movement_records" (
    "movement_id" UUID NOT NULL,
    "stock_pool_id" UUID NOT NULL,
    "movement_type" "InventoryMovementType" NOT NULL,
    "delta" INTEGER NOT NULL,
    "resulting_on_hand" INTEGER NOT NULL,
    "resulting_reserved" INTEGER NOT NULL,
    "actor_identity_id" UUID NOT NULL,
    "reason_reference" TEXT,
    "correlation_id" UUID,
    "causation_id" UUID,
    "aggregate_version" INTEGER NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inventory_movement_records_pkey" PRIMARY KEY ("movement_id")
);

-- CreateTable
CREATE TABLE "inventory_audit_records" (
    "audit_event_id" UUID NOT NULL,
    "stock_pool_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "actor_identity_id" UUID NOT NULL,
    "correlation_id" UUID,
    "evidence_digest" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inventory_audit_records_pkey" PRIMARY KEY ("audit_event_id")
);

-- CreateTable
CREATE TABLE "inventory_config_records" (
    "config_id" UUID NOT NULL,
    "config_key" TEXT NOT NULL,
    "config_value" TEXT NOT NULL,
    "state" "InventoryConfigState" NOT NULL,
    "aggregate_version" INTEGER NOT NULL,
    "changed_by_identity_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "inventory_config_records_pkey" PRIMARY KEY ("config_id")
);

-- CreateIndex
CREATE INDEX "inventory_stock_pools_seller_profile_id_idx" ON "inventory_stock_pools"("seller_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_stock_pools_sku_id_seller_profile_id_key" ON "inventory_stock_pools"("sku_id", "seller_profile_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_stock_pools_stock_pool_id_aggregate_version_key" ON "inventory_stock_pools"("stock_pool_id", "aggregate_version");

-- CreateIndex
CREATE INDEX "inventory_movement_records_stock_pool_id_occurred_at_idx" ON "inventory_movement_records"("stock_pool_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "inventory_audit_records_stock_pool_id_occurred_at_idx" ON "inventory_audit_records"("stock_pool_id", "occurred_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_config_records_config_key_state_key" ON "inventory_config_records"("config_key", "state");

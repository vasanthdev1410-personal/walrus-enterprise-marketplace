-- Module 09 — Payments persistence (WEMP-M09-PLAN-001 M09-M2).
-- Additive only: no Module 00–08 table is modified. All cross-module
-- references (orderId, customerProfileId) are logical UUIDv7 values with
-- NO cross-module foreign keys (storage isolation A-05).
-- Retention: PAYMENT_RECORD_RETENTION_DAYS configurable (default 365 days) —
-- enforced by the application-layer retention processor, never by this migration.

-- CreateEnum
CREATE TYPE "PaymentState" AS ENUM ('PENDING', 'PROCESSING', 'CAPTURED', 'FAILED', 'REFUND_PENDING', 'REFUNDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentAttemptOutcome" AS ENUM ('INITIATED', 'SUCCESS', 'FAILED', 'TIMEOUT');

-- CreateEnum
CREATE TYPE "RefundState" AS ENUM ('PENDING', 'PROCESSING', 'REFUNDED', 'FAILED');

-- CreateTable
CREATE TABLE "payments" (
    "payment_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "customer_profile_id" UUID NOT NULL,
    "state" "PaymentState" NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_order_id" TEXT,
    "provider_payment_id" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "aggregate_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "correlation_id" UUID,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("payment_id")
);

-- CreateTable
CREATE TABLE "payment_attempts" (
    "payment_attempt_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "provider_payment_id" TEXT,
    "outcome" "PaymentAttemptOutcome" NOT NULL,
    "provider_response_digest" TEXT,
    "attempted_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("payment_attempt_id")
);

-- CreateTable
CREATE TABLE "payment_refunds" (
    "payment_refund_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "state" "RefundState" NOT NULL,
    "provider_refund_id" TEXT,
    "aggregate_version" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payment_refunds_pkey" PRIMARY KEY ("payment_refund_id")
);

-- CreateTable
CREATE TABLE "payment_state_transitions" (
    "transition_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "from_state" "PaymentState" NOT NULL,
    "to_state" "PaymentState" NOT NULL,
    "state_version" INTEGER NOT NULL,
    "actor_identity_id" UUID NOT NULL,
    "actor_kind" TEXT NOT NULL,
    "reason_reference" TEXT NOT NULL,
    "correlation_id" UUID,
    "causation_id" UUID,
    "source_reference" TEXT,
    "transitioned_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payment_state_transitions_pkey" PRIMARY KEY ("transition_id")
);

-- CreateTable
CREATE TABLE "payment_audit_records" (
    "audit_event_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "customer_profile_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "actor_identity_id" UUID NOT NULL,
    "correlation_id" UUID,
    "evidence_digest" TEXT,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "payment_audit_records_pkey" PRIMARY KEY ("audit_event_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payments_order_id_key" ON "payments"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_idempotency_key_key" ON "payments"("idempotency_key");

-- CreateIndex
CREATE INDEX "payments_customer_profile_id_idx" ON "payments"("customer_profile_id");

-- CreateIndex
CREATE INDEX "payments_state_idx" ON "payments"("state");

-- CreateIndex
CREATE INDEX "payment_attempts_payment_id_attempted_at_idx" ON "payment_attempts"("payment_id", "attempted_at" DESC);

-- CreateIndex
CREATE INDEX "payment_refunds_payment_id_state_idx" ON "payment_refunds"("payment_id", "state");

-- CreateIndex
CREATE UNIQUE INDEX "payment_state_transitions_payment_id_state_version_key" ON "payment_state_transitions"("payment_id", "state_version");

-- CreateIndex
CREATE INDEX "payment_state_transitions_payment_id_transitioned_at_idx" ON "payment_state_transitions"("payment_id", "transitioned_at" DESC);

-- CreateIndex
CREATE INDEX "payment_audit_records_payment_id_occurred_at_idx" ON "payment_audit_records"("payment_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "payment_audit_records_order_id_occurred_at_idx" ON "payment_audit_records"("order_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "payment_audit_records_customer_profile_id_occurred_at_idx" ON "payment_audit_records"("customer_profile_id", "occurred_at" DESC);

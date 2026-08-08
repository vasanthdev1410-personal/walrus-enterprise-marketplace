-- CreateTable
CREATE TABLE "non_production_rate_limit_records" (
    "rate_limit_id" UUID NOT NULL,
    "rate_limit_key" TEXT NOT NULL,
    "request_count" INTEGER NOT NULL,
    "window_start_at" TIMESTAMPTZ(6) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "non_production_rate_limit_records_pkey" PRIMARY KEY ("rate_limit_id")
);

-- CreateTable
CREATE TABLE "basic_audit_event_records" (
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

-- CreateIndex
CREATE UNIQUE INDEX "non_production_rate_limit_records_rate_limit_key_key" ON "non_production_rate_limit_records"("rate_limit_key");

-- CreateIndex
CREATE INDEX "non_production_rate_limit_records_expires_at_idx" ON "non_production_rate_limit_records"("expires_at");

-- CreateIndex
CREATE INDEX "basic_audit_event_records_subject_identity_id_occurred_at_idx" ON "basic_audit_event_records"("subject_identity_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "basic_audit_event_records_operation_type_occurred_at_idx" ON "basic_audit_event_records"("operation_type", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "basic_audit_event_records_occurred_at_idx" ON "basic_audit_event_records"("occurred_at" DESC);

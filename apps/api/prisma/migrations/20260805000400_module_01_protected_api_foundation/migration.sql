CREATE TYPE "ApiIdempotencyProcessingState" AS ENUM ('PROCESSING', 'COMPLETED');

CREATE TABLE "api_idempotency_records" (
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
    CONSTRAINT "api_idempotency_records_pkey" PRIMARY KEY ("api_idempotency_id"),
    CONSTRAINT "api_idempotency_completed_result_check" CHECK (
      ("processing_state" = 'PROCESSING' AND "completed_at" IS NULL AND "response_reference" IS NULL)
      OR
      ("processing_state" = 'COMPLETED' AND "completed_at" IS NOT NULL AND "response_reference" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "api_idempotency_records_identity_or_client_scope_operation_type_idempotency_key_key"
ON "api_idempotency_records"("identity_or_client_scope", "operation_type", "idempotency_key");

CREATE INDEX "api_idempotency_records_processing_state_created_at_idx"
ON "api_idempotency_records"("processing_state", "created_at");

CREATE INDEX "api_idempotency_records_expires_at_idx"
ON "api_idempotency_records"("expires_at");

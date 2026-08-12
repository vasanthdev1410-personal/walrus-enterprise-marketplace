-- M02-M4: append-only role-assignment episodes.
-- Abort before changing constraints if legacy data already violates the
-- invariant that at most one ACTIVE episode may exist per identity and role.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "identity_role_assignments"
    WHERE "assignment_state" = 'ACTIVE'
    GROUP BY "identity_id", "role_name"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'M02 assignment episode migration blocked: duplicate ACTIVE identity/role rows exist';
  END IF;
END $$;

CREATE TYPE "RoleAssignmentOriginType" AS ENUM (
  'HUMAN_ADMINISTRATION',
  'PRIVILEGED_PROVISIONING',
  'CONTROLLED_BOOTSTRAP'
);

ALTER TABLE "identity_role_assignments"
  ALTER COLUMN "assigned_by_identity_id" DROP NOT NULL,
  ADD COLUMN "assignment_origin_type" "RoleAssignmentOriginType" NOT NULL DEFAULT 'HUMAN_ADMINISTRATION',
  ADD COLUMN "assigned_by_workload_identity" TEXT,
  ADD COLUMN "authority_evidence_reference" TEXT,
  ADD COLUMN "operation_id" UUID,
  ADD COLUMN "audit_correlation_id" UUID,
  ADD COLUMN "activated_at" TIMESTAMPTZ(6),
  ADD COLUMN "revocation_reason_reference" TEXT;

UPDATE "identity_role_assignments"
SET "activated_at" = "assigned_at"
WHERE "activated_at" IS NULL;

ALTER TABLE "identity_role_assignments"
  ALTER COLUMN "activated_at" SET NOT NULL;

DROP INDEX "identity_role_assignments_identity_id_role_name_key";

CREATE UNIQUE INDEX "identity_role_assignments_one_active_identity_role_key"
  ON "identity_role_assignments" ("identity_id", "role_name")
  WHERE "assignment_state" = 'ACTIVE';

CREATE INDEX "identity_role_assignments_operation_id_idx"
  ON "identity_role_assignments" ("operation_id");

ALTER TABLE "identity_role_assignments"
  ADD CONSTRAINT "identity_role_assignment_actor_origin_check"
  CHECK (
    ("assignment_origin_type" = 'HUMAN_ADMINISTRATION' AND "assigned_by_identity_id" IS NOT NULL)
    OR
    ("assignment_origin_type" IN ('PRIVILEGED_PROVISIONING', 'CONTROLLED_BOOTSTRAP')
      AND "assigned_by_workload_identity" IS NOT NULL
      AND "authority_evidence_reference" IS NOT NULL
      AND "operation_id" IS NOT NULL)
  );

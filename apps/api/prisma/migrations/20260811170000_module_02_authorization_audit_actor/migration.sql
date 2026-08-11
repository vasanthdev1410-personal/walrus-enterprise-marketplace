-- Module 02 administrative audit events distinguish the authenticated actor
-- from the target identity. Nullable preserves all existing decision records.
ALTER TABLE "authorization_decision_records"
ADD COLUMN "actor_identity_id" UUID;

CREATE INDEX "authorization_decision_records_actor_identity_id_decided_at_idx"
ON "authorization_decision_records"("actor_identity_id", "decided_at" DESC);

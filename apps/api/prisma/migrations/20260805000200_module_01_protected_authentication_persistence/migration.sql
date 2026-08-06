-- Module 01 Phase 2: protected identifier persistence and deterministic lookup.
-- Existing plaintext identifiers require an application-controlled encrypted backfill.
-- This migration therefore fails closed when legacy identifier rows exist.

ALTER TABLE "identity_identifiers"
  ADD COLUMN "protected_normalized_value" TEXT,
  ADD COLUMN "lookup_digest" TEXT,
  ADD COLUMN "lookup_key_version" TEXT;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "identity_identifiers") THEN
    RAISE EXCEPTION
      'Protected identifier migration requires an approved application-controlled backfill before legacy rows can be migrated';
  END IF;
END $$;

DROP INDEX "identity_identifiers_identifier_type_normalized_value_key";

ALTER TABLE "identity_identifiers"
  DROP COLUMN "normalized_value",
  ALTER COLUMN "protected_normalized_value" SET NOT NULL,
  ALTER COLUMN "lookup_digest" SET NOT NULL,
  ALTER COLUMN "lookup_key_version" SET NOT NULL;

CREATE UNIQUE INDEX "identity_identifiers_identifier_type_lookup_digest_key"
  ON "identity_identifiers"("identifier_type", "lookup_digest");

CREATE INDEX "identity_identifiers_lookup_key_version_idx"
  ON "identity_identifiers"("lookup_key_version");

ALTER TABLE "identity_identifiers"
  ADD CONSTRAINT "identity_identifier_protected_values_nonempty" CHECK (
    length("protected_normalized_value") > 0
    AND length("lookup_digest") > 0
    AND length("lookup_key_version") > 0
  );

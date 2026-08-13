-- Module 03 - Seller evidence legal holds (WEMP-M03-SPEC-001 / decision D-03,
-- owner-approved 2026-08-12). Additive only: no Module 01 or Module 02 table
-- is modified; the seller_profile_id is a logical UUIDv7 reference with no
-- cross-module foreign key (storage isolation).
--
-- An authorized legal hold prevents automatic retention processing (expiry /
-- deletion) of a seller's verification evidence while active. Holds are never
-- deleted; release is recorded by state transition.

-- CreateTable
CREATE TABLE "seller_evidence_legal_holds" (
    "legal_hold_id" UUID NOT NULL,
    "seller_profile_id" UUID NOT NULL,
    "authorized_by_identity_id" UUID NOT NULL,
    "reason_reference" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL,
    "placed_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "released_by_identity_id" UUID,
    "released_at" TIMESTAMPTZ(6),

    CONSTRAINT "seller_evidence_legal_holds_pkey" PRIMARY KEY ("legal_hold_id")
);

-- CreateIndex
CREATE INDEX "seller_evidence_legal_holds_seller_profile_id_active_idx" ON "seller_evidence_legal_holds"("seller_profile_id", "active");

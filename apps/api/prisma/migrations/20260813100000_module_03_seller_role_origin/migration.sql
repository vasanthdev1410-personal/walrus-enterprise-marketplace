-- Module 03 - M03-M4: add the SELLER_LIFECYCLE role-assignment origin.
-- Additive only: a new enum value for system-triggered SELLER role
-- assignments created by the approved seller activation lifecycle
-- (WEMP-M03-SPEC-001 §4 APPROVED -> ACTIVE gate, decision D-11). No table,
-- column, or default is changed; existing rows are unaffected.

-- AlterEnum
ALTER TYPE "RoleAssignmentOriginType" ADD VALUE 'SELLER_LIFECYCLE';

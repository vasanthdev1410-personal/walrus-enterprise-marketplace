ALTER TABLE "mfa_factors"
ADD COLUMN "last_accepted_time_step" BIGINT;

ALTER TABLE "mfa_factors"
ADD CONSTRAINT "mfa_factors_last_accepted_time_step_non_negative"
CHECK ("last_accepted_time_step" IS NULL OR "last_accepted_time_step" >= 0);

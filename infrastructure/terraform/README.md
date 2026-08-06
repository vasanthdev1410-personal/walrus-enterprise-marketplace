# Terraform foundation

This directory contains reusable Phase 1 AWS ECS Fargate module interfaces only. It intentionally
creates no live resources. Backend state, account, region, networking, domains, budgets, credentials,
and production sizing require an approved environment specification before resource blocks are added.

Run `terraform fmt -check -recursive` and `terraform validate` from `environments/foundation`.
The example variable file deliberately contains non-deployable placeholders and must never be used
for an apply.

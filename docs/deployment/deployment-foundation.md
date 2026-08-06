# Deployment foundation

Phase 1 targets AWS ECS Fargate with Terraform. Module 00 creates interfaces and CI/CD approval
foundations only; it cannot create live resources. Enabling deployment requires approved AWS account,
region, VPC, subnet, domain, certificate, budget, sizing, registry, state backend, and GitHub OIDC values.

Production must use immutable version/SHA image tags, rolling deployments, load-balancer health checks,
TLS 1.2 minimum with TLS 1.3 preferred, private data services, and documented rollback approval.

# Module 00 Test Plan

| Area                       | Evidence                                                                       |
| -------------------------- | ------------------------------------------------------------------------------ |
| Shared TypeScript packages | Unit tests, type-check, lint, coverage                                         |
| Web                        | Health route unit test, Next.js build, type-check, lint                        |
| API                        | Unit and HTTP integration tests, NestJS build, Prisma validation               |
| Mobile                     | Flutter analyze, unit test, integration-test compilation when SDK is available |
| Containers                 | Compose configuration and image builds when Docker is available                |
| Terraform                  | Format and validation when Terraform is available                              |
| Security                   | Package audit plus CI-configured Gitleaks, Trivy, and CodeQL                   |

No production data is permitted in testing.

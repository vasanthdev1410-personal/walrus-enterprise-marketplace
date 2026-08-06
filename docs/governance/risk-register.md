# Module 00 Risk Register

| ID      | Description                                                                     | Probability | Impact | Mitigation                                                            | Owner        | Status    |
| ------- | ------------------------------------------------------------------------------- | ----------: | -----: | --------------------------------------------------------------------- | ------------ | --------- |
| M00-R01 | Docker, Git, and mobile device toolchains are incomplete on the validation host |        High | Medium | Pin versions; document prerequisites; run missing checks in CI        | Platform     | Open      |
| M00-R02 | Placeholder cloud modules are mistaken for deployable production infrastructure |      Medium |   High | Disable deployment by default; require approved environment inputs    | DevOps       | Mitigated |
| M00-R03 | Shared contracts couple future portals                                          |      Medium |   High | Keep contracts framework-neutral and portal routes isolated           | Architecture | Mitigated |
| M00-R04 | Metrics expose sensitive operational details                                    |         Low |   High | Keep metrics on internal routes/networks and document access controls | Security     | Mitigated |
| M00-R05 | Container image compatibility is unverified on the validation host              |      Medium | Medium | Pin exact tags and validate pulls/builds where Docker is available    | Platform     | Open      |
| M00-R06 | Transitive dependency advisories block the security gate                        |        High |   High | Pin audit-recommended patched versions and continuously audit         | Security     | Mitigated |
| M00-R07 | Readiness behavior is not runtime-verified against live PostgreSQL and Redis    |      Medium | Medium | Execute the full Docker profile and readiness smoke test in CI        | QA           | Open      |

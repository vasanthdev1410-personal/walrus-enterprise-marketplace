# Module 00 Defect Log

| ID          | Finding                                                            | Resolution                                                                  | Status   |
| ----------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------- | -------- |
| M00-DEF-001 | NestJS validation runtime dependencies were not declared           | Added pinned `class-validator` and `class-transformer` runtime dependencies | Resolved |
| M00-DEF-002 | Terraform placeholder modules used invalid compact HCL syntax      | Expanded blocks, formatted recursively, initialized, and validated          | Resolved |
| M00-DEF-003 | Docker Desktop service cannot start in the current Windows session | Complete first launch or reboot, then execute both Compose profiles         | Open     |
| M00-DEF-004 | Flutter integration test has no connected Android/iOS target       | Run in CI or on a configured emulator/device                                | Open     |
| M00-DEF-005 | Host API did not automatically load the root `.env.local`          | Added NestJS configuration loading and revalidated all API checks           | Resolved |

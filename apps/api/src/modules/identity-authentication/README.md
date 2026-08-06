# Module 01: Identity & Authentication

Status: Approved for Limited Phase 1 Implementation

Authoritative specification: [Module 01 Corrected Draft v1.12](../../../../../docs/module-01/specifications/Module%2001%20Corrected%20Draft%20v1.12.txt)

This module follows the approved Clean Architecture boundaries:

- `presentation`: reserved for a later approved API phase; no controllers are authorized.
- `application`: contains the approved Phase 2 transport-independent authentication use cases.
- `domain`: framework-independent entities, value objects, and repository interfaces for approved Phase 1 records.
- `infrastructure`: placeholder-only configuration and approved Prisma persistence structures.

## Limited Phase 1 boundaries

Limited Phase 1 permits project structure, placeholder-only configuration schemas, approved C4 logical-model translation, approved Prisma records, forward-only migrations, repository interfaces, domain entities and value objects, and persistence-model unit tests.

The following remain excluded:

- Module 02 roles, permissions, assignments, policies, and authorization decisions
- Customer and Seller profile records
- controllers, REST APIs, OpenAPI implementation, and authentication execution
- Transactional Outbox, Consumer Inbox, and external asynchronous messaging
- audit persistence, integrity chaining, immutable archive, and audit export
- privacy, consent, deletion, anonymization, identifier-reuse, and retention execution
- live cryptographic operations, final cryptographic values, AWS resources, and production deployment

Phase 2 currently authorizes only password authentication, MFA login continuation, Refresh Token
rotation/reuse response, logout and logout-all application orchestration. Presentation controllers,
Module 02 authorization, C8, C9, C10 and production deployment remain excluded.

No excluded capability may be inferred from this directory structure.

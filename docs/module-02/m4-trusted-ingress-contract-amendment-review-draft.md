# Module 02 — M4 Trusted-Ingress and Provenance Contract Amendment

**Document ID:** WEMP-M02-AMENDMENT-001  
**Version:** Review Draft 1.0  
**Status:** REVIEW ONLY — NOT IMPLEMENTATION AUTHORITY  
**Amends:** WEMP-M02-DECISION-PACK-001 Review Draft 1.0  
**Required approval:** Product/Architecture Owner, Security Owner, Operations Owner

This amendment closes the security-critical integration gaps discovered before
M02-M4 wiring. It does not change OD-01 through OD-14, the five approved
boundary annexes, or M1–M3. Every decision below is **PROPOSED — REQUIRES OWNER
APPROVAL**.

# A. Amendment Decision Register

## AM-01 — Platform-owned trusted-ingress verifier

**Proposed decision:** Introduce a platform-security `TrustedWorkloadIngressPort`
that accepts transport evidence and returns verified WI-1 claims. Module 01 and
Module 02 consume only its verified result. Raw JWTs, certificates, and private
keys never enter domain or application commands.

```ts
interface TrustedWorkloadIngressCommandV1 {
  readonly rawAssertion: string;
  readonly peerCertificate: VerifiedPeerCertificateV1;
  readonly expectedAudience: 'urn:walrus:module-02:authorization';
  readonly expectedServiceSubjects: readonly string[];
  readonly environment: EnvironmentName;
  readonly operationId: string;
  readonly contractVersion: string;
  readonly requestBindingDigest: string;
  readonly now: string;
}

interface VerifiedPeerCertificateV1 {
  readonly fingerprintSha256: string;
  readonly sanUri: string;
  readonly trustDomain: string;
  readonly notBefore: string;
  readonly notAfter: string;
  readonly verifiedByTlsTerminator: true;
}

interface TrustedWorkloadIngressDecisionV1 {
  readonly verified: boolean;
  readonly claims?: WorkloadIdentityEnvelopeV1;
  readonly denialReasonCode?: string;
  readonly verificationReference: string;
}

interface TrustedWorkloadIngressPort {
  verify(command: TrustedWorkloadIngressCommandV1): Promise<TrustedWorkloadIngressDecisionV1>;
}
```

The production adapter verifies ES256 against pinned internal JWKS/KMS trust,
validates the mTLS chain, and atomically consumes `jti`. Non-production adapters
must use generated test keys and are prohibited when `APP_ENV=production`.

**Security reason:** A typed claim object is not proof of authenticity. A single
verifier prevents individual boundaries from interpreting raw credentials
differently.

**Alternative rejected:** Let each Module 01 adapter parse JWTs. This duplicates
trust logic and makes audit, replay, and key revocation inconsistent.

**Consequence:** Every workload-controlled boundary denies before authorization
unless WI-1 cryptographic and transport verification succeeds.

## AM-02 — Internal transport and certificate binding

**Proposed decision:** Internal callers send the compact WI-1 JWT in
`Walrus-Workload-Assertion`. Human bearer Sessions remain in `Authorization`.
The application accepts peer-certificate identity only from the native TLS
socket or an authenticated service-mesh metadata API. It must never trust a
client-supplied certificate or identity header.

The verifier requires:

- TLS chain anchored in the environment-specific internal workload CA;
- certificate SAN URI exactly mapped to JWT `sub`;
- certificate and JWT environment equality;
- exact issuer, audience, `kid`, algorithm, time, and allowlist checks;
- no forwarding of the assertion through public ingress;
- rejection if both direct TLS metadata and proxy identity metadata are
  present but disagree.

**Security reason:** JWT-only authentication permits stolen-token replay;
mTLS-only authentication lacks operation and payload binding.

**Consequence:** WI-1 is proof-of-possession in practice: the signed assertion
and authenticated service connection must identify the same workload.

## AM-03 — Canonical request binding

**Proposed decision:** Define `requestBindingDigest` as lowercase base64url
SHA-256 over UTF-8 RFC 8785 JSON Canonicalization Scheme output of:

```ts
interface WorkloadRequestBindingV1 {
  readonly version: 'walrus.request-binding.v1';
  readonly httpMethod: string; // uppercase
  readonly routeTemplate: string; // server-owned template, not raw path
  readonly operationId: string;
  readonly contractVersion: string;
  readonly environment: EnvironmentName;
  readonly body: unknown; // validated DTO, excluding raw secrets/evidence tokens
  readonly targetReferences: readonly string[]; // sorted lexicographically
  readonly expectedAggregateVersion?: number;
  readonly idempotencyKeyDigest?: string;
}
```

For PRV1 and BSV1, `body` contains the envelope's non-secret signed claims and
the SHA-256 digest of the compact envelope, never its raw token. Unknown JSON
fields are rejected before digest calculation. Query parameters are forbidden
for these mutation contracts.

**Security reason:** Canonical binding prevents a valid assertion being moved
to a different route, target, version, or body.

**Consequence:** Serialization differences cannot change authority, and replay
against another operation fails.

## AM-04 — Per-boundary workload allowlists

**Proposed decision:** Use immutable logical subjects, with environment-specific
certificate/JWKS material supplied by deployment configuration:

| Boundary                  | Allowed WI-1 subject                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| Recovery approval         | No workload subject; authoritative AAL2 human Session only                                  |
| Identity state change     | No workload subject for ordinary administrative path; authoritative AAL2 human Session only |
| Classification transition | `urn:walrus:service:identity-classification-orchestrator`                                   |
| Privileged provisioning   | `urn:walrus:service:privileged-provisioning-orchestrator`                                   |
| Controlled bootstrap      | `urn:walrus:service:bootstrap-orchestrator`                                                 |

No prefix, wildcard, alternate audience, or caller-selected subject is allowed.
Changing the logical list requires a reviewed configuration revision.

**Security reason:** A generally trusted internal service must not automatically
gain authority over every identity boundary.

**Consequence:** A valid workload credential for one service cannot call a
different M4 boundary.

## AM-05 — Recovery requester provenance

**Proposed decision:** Module 01 persists an immutable requester principal when
creating a Recovery Request:

```ts
type RecoveryRequesterKind = 'AUTHENTICATED_IDENTITY' | 'BOUND_RECOVERY_SESSION';

interface RecoveryRequesterPrincipalV1 {
  readonly kind: RecoveryRequesterKind;
  readonly reference: string;
  readonly identityId?: string;
}
```

- An authenticated request stores the authoritative Session subject as
  `identityId` and reference.
- An unauthenticated recovery stores a server-generated opaque Bound Recovery
  Session principal reference. It does not pretend to be an Identity.
- `requesterIdentityId` in the original V2 proposal is replaced by
  `requesterPrincipal`.
- An approver is ineligible when its identity equals the requester identity,
  the recovered identity, or any identity later bound to the same requester
  principal.
- The requester fields are immutable and included in recovery versioning and
  audit. Existing pre-amendment requests without provenance cannot enter an
  approval-required path and fail closed.

**Security reason:** Treating the recovered identity as the requester is false
for anonymous or operator-assisted recovery and can invalidate SOD.

**Consequence:** Requester exclusion is enforceable without manufacturing an
identity for anonymous recovery.

## AM-06 — PRV1 transport and lifecycle

**Proposed decision:** `provisioningReference` is an opaque server-generated
lookup reference (`prvref:<random-256-bit-base64url>`), never the signed PRV1
JWT. The caller supplies the compact PRV1 JWT in
`Walrus-Provisioning-Assertion`; Module 02 stores only its SHA-256 digest,
approved claims, lifecycle, and lookup-reference digest.

Lifecycle is `ISSUED → RESERVED → CONSUMED`, with terminal `INVALIDATED`,
`EXPIRED`, or `RECONCILIATION_REQUIRED`. Reservation uses compare-and-set on
the lifecycle version and `(environment, jwtId)` uniqueness. Module 01 receives
only the opaque reference and authorization result. Raw PRV1 is never logged or
persisted.

PRV1 is amended to include:

```ts
readonly securityApprovalReference?: string;
readonly approvalEvidenceReferences: readonly string[];
readonly targetIdentifierDigest: string;
```

`securityApprovalReference` is mandatory for Super Admin operations. Evidence
references point to Module 02/control-plane owned approvals and are not bearer
credentials.

**Security reason:** Sending the signed token as a general reference encourages
storage/logging of reusable authority. Separate lookup and assertion channels
reduce leakage and make lifecycle ownership explicit.

**Consequence:** Every provisioning attempt consumes one server-owned PRV1
operation exactly once; retries use idempotency and the same reservation rather
than replaying authority.

## AM-07 — BSV1 transport and permanent closure

**Proposed decision:** `bootstrapEvidence` is an opaque
`bsvref:<random-256-bit-base64url>` lookup reference. The compact KMS-signed
BSV1 JWT is transported once in `Walrus-Bootstrap-Assertion` over the verified
bootstrap-orchestrator WI-1 connection. The database stores claims, digests,
authority references, environment lifecycle, reconciliation state, and the
permanent completion marker—not the token.

The bootstrap row is uniquely keyed by environment. Its transition to
`IN_PROGRESS` and assertion replay consumption are atomic. `COMPLETED` is a
database-enforced terminal state. No API, permission, configuration flag, or
new evidence may change it back.

**Security reason:** Bootstrap evidence is the highest-impact authority in the
system and must not become a reusable bearer string.

**Consequence:** Bootstrap is one-time, environment-bound, auditable, and
recoverable only through reconciliation—not reopening.

## AM-08 — Human approval evidence

**Proposed decision:** Human authority is never embedded as caller-authored
identity claims. Each approval is created through an authoritative AAL2 Session
and persisted by its owning module as an append-only approval record. PRV1 and
BSV1 carry only immutable approval references. At consumption, the orchestrator
validates the referenced records for identity, Session/AAL2, decision, target,
operation, environment, policy version, expiry, revocation, and distinctness.

- Admin provisioning: one active Super Admin approval.
- Non-initial Super Admin provisioning: two distinct active Super Admin
  approvals plus one distinct Security approval reference.
- Bootstrap: one Security and one Operations authority; both distinct from each
  other and the intended Super Admin.
- Recovery: stored Module 01 approval records remain authoritative; Module 02
  determines eligibility for each submitted decision.

**Security reason:** Signed envelopes must not turn asserted approver IDs into
proof that approval occurred.

**Consequence:** Quorum and AAL2 are checked against durable authoritative
records at use time, and expired/revoked evidence denies.

## AM-09 — Dependency-safe module composition

**Proposed decision:** Split composition without using NestJS `forwardRef`:

1. `IdentitySessionSecurityModule` exports only authoritative Session/AAL
   verification and contains no Module 02 dependency.
2. `AuthorizationCoreModule` owns catalogs, decisions, role assignments,
   boundary policies, and M4 persistence; it imports platform persistence and
   runtime ports, not the Module 01 aggregate module.
3. `AuthorizationAdministrationModule` imports the two modules above for Module
   02 administrative HTTP endpoints.
4. `AuthorizationBoundaryIntegrationModule` imports `AuthorizationCoreModule`
   and platform trusted-ingress security and exports the five V2 adapters.
5. `IdentityAuthenticationModule` imports the integration module and injects V2
   ports only into migrated consumers. V1 providers remain registered and
   fail-closed until each consumer migration is complete.

No module reads another module's tables. Cross-module state is exchanged only
through ports, immutable references, and durable reconciliation.

**Security reason:** `forwardRef` can conceal an architectural cycle and makes
security initialization/provider resolution harder to reason about.

**Consequence:** Authentication still precedes authorization, Module 02 remains
the authorization owner, and each boundary can migrate atomically.

## AM-10 — Failure mapping and pre-verification audit

**Proposed decision:** External responses disclose only the existing stable
boundary error:

| Boundary       | External result for any verification/policy failure      |
| -------------- | -------------------------------------------------------- |
| Recovery       | `AUTHORIZATION_DENIED` / approved recovery-safe response |
| Identity state | `AUTHORIZATION_DENIED`                                   |
| Classification | `CONTRACT_INVALID`                                       |
| Provisioning   | `AUTHORIZATION_DENIED`                                   |
| Bootstrap      | `BOOTSTRAP_UNAVAILABLE`                                  |

Internally, AUD-1 records a server-owned reason code, verification reference,
workload subject when safely verified, target reference, operation, contract
and policy versions, environment, correlation ID, and decision. It never stores
raw assertions, certificates, PRV1/BSV1 tokens, nonces, keys, or payloads.

Replay-marker consumption and mandatory denial audit are atomic where both are
Module 02-owned. If mandatory audit cannot persist, verification returns deny.
Malformed unauthenticated floods may use rate-limited aggregate security
telemetry instead of an unbounded durable row per packet; any request reaching
credential verification or replay consumption requires durable audit.

**Security reason:** Stable failures prevent policy and identity enumeration;
bounded telemetry prevents audit storage from becoming a denial-of-service
primitive.

**Consequence:** Callers cannot distinguish signature, scope, quorum, replay,
or policy failures, while responders retain actionable evidence.

# B. Amendment Acceptance Criteria

The amendment is correctly implemented only when:

1. Raw workload/evidence tokens are accepted only at infrastructure ingress and
   never enter application/domain commands, logs, or persistence.
2. mTLS identity and JWT subject are cryptographically verified and equal.
3. Exact issuer, audience, environment, service allowlist, ES256 algorithm,
   `kid`, lifetime, clock skew, operation, payload digest, and single-use `jti`
   checks precede authorization.
4. Request binding uses the approved canonical structure and rejects unknown
   fields before hashing.
5. Recovery requester provenance is immutable, versioned, audited, and enforced
   for SOD; legacy provenance-less approval paths deny.
6. PRV1 and BSV1 raw assertions are never used as database/business references.
7. PRV1 reservation/consumption and BSV1 one-time lifecycle are concurrency-safe
   and use additive forward migrations.
8. Human identities and AAL2 are resolved from authoritative persisted Session
   and approval records, never caller assertions.
9. Super Admin provisioning validates two distinct Super Admin approvals and a
   distinct Security approval; bootstrap validates distinct Security and
   Operations authorities.
10. Module composition contains no circular dependency, `forwardRef`, ambient
    security context, cross-module table read, or distributed transaction.
11. Existing V1 adapters remain registered and fail-closed until each V2
    consumer is atomically migrated and tested.
12. Every failure maps to the approved non-enumerating external result and
    mandatory audit failure denies.
13. Negative tests cover spoofed proxy headers, certificate/JWT mismatch,
    wrong service, wrong environment/audience/route/body/version, unknown
    fields, stale/expired evidence, replay, duplicate quorum members, missing
    requester provenance, concurrent reservation, audit failure, and bootstrap
    reopening.
14. All original WEMP-M02-DECISION-PACK-001 acceptance criteria continue to
    pass.

# C. Items Deliberately Left to Deployment Configuration

These do not change policy and do not block coding after amendment approval:

- CA certificates, certificate issuance, service-mesh integration, and SANs;
- live issuer URLs, JWKS endpoints, KMS key identifiers, and rotation schedule;
- environment-specific route/network allowlists;
- concrete Security and Operations directory/group bindings;
- production secrets and monitoring destinations.

Production deployment remains fail-closed until those values are supplied and
validated. None may be committed to the repository.

# D. Exact Owner Approval Statement

> I approve WEMP-M02-AMENDMENT-001 Review Draft 1.0 as a binding amendment to WEMP-M02-DECISION-PACK-001. I approve AM-01 through AM-10; the platform-owned trusted-workload verifier; native mTLS identity plus ES256 WI-1 assertion binding; the `Walrus-Workload-Assertion`, `Walrus-Provisioning-Assertion`, and `Walrus-Bootstrap-Assertion` internal transport contracts; RFC 8785/SHA-256 request binding; the exact per-boundary workload subject allowlists; immutable typed recovery-requester provenance; opaque PRV1/BSV1 lookup references with separately transported single-use signed assertions; durable authoritative AAL2 human approval records; the dependency-safe module split without `forwardRef`; the non-enumerating failure mappings; and the amendment acceptance criteria. I authorize implementation and local testing of M02-M4 strictly under WEMP-M02-DECISION-PACK-001 as amended by WEMP-M02-AMENDMENT-001, using additive forward migrations only, preserving V1 adapters fail-closed until each V2 consumer migration is complete, and introducing no production credentials or live infrastructure changes. This approval does not authorize documentation commits, code commits unless separately requested, history rewriting, or any push.

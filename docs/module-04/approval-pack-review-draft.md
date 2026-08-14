# Module 04 — Manual Approval Pack

**Document ID:** WEMP-M04-APPROVAL-001
**Status:** APPROVED — signed by the Product/Architecture Owner 2026-08-14
**Companion documents:** WEMP-M04-SPEC-001, WEMP-M04-PLAN-001,
WEMP-M04-CONTRACT-001, WEMP-M04-AUTHZ-001, WEMP-M04-DECISIONS-001, and
ADR-M04-001
**Implementation authority:** Granted by the §4 signature (2026-08-14) for
milestones M04-M1 and M04-M2 now, and for each subsequent milestone only
after its §3 gate is satisfied; no Module 00/01/02/03 behavior change; no
commit or push without explicit direction

> Following the Module 02/03 approval pattern: this pack lists the proposed
> artifacts, the resolved decisions, the conditional decisions, and the exact
> statement the owner signs to authorize Module 04 implementation. It
> authorizes no code, migration, commit, or deployment until signed.

## 1. Document index

| Document                   | File                                                                                   | ID                     |
| -------------------------- | -------------------------------------------------------------------------------------- | ---------------------- |
| Formal specification       | `docs/module-04/formal-specification-review-draft.md`                                  | WEMP-M04-SPEC-001      |
| Implementation plan        | `docs/module-04/implementation-plan-review-draft.md`                                   | WEMP-M04-PLAN-001      |
| Cross-module contracts     | `docs/module-04/cross-module-contracts-review-draft.md`                                | WEMP-M04-CONTRACT-001  |
| PRODUCT role proposal      | `docs/module-04/authorization-product-role-review-draft.md`                            | WEMP-M04-AUTHZ-001     |
| Decision/approval register | `docs/module-04/decision-register-review-draft.md`                                     | WEMP-M04-DECISIONS-001 |
| ADR draft                  | `docs/architecture/decisions/ADR-M04-001-product-catalog-architecture-review-draft.md` | ADR-M04-001            |

## 2. Decision resolution summary (WEMP-M04-DECISIONS-001 §2)

**BINDING from approved architecture (A-01…A-12):** Module 04 is the
named future product-catalog module; seller permissions exclusively via
Module 02; approved-seller listing gate; storage isolation; `resource.action`
permission format; finance/commission excluded (D-05 precedent); R2
reference+digest evidence pattern; AAL2 → permission-guard chain; logical
UUIDv7 references; no mobile admin; forward-only additive migrations.

**OWNER decisions D-01 … D-17 — RESOLVED (owner-approved 2026-08-14).**
All seventeen decisions were reviewed and approved by the platform owner in
this review cycle; each is recorded in WEMP-M04-DECISIONS-001 §2 and §5.1.
The **Module 02 owner sign-off on WEMP-M04-AUTHZ-001 (D-11) was recorded
2026-08-14** (additive `product.*`/`catalog.*` entries, second ownership
resolver, no override — verified additive and non-weakening).

The **Security/Platform numeric rate-limit policy (D-15) was recorded
2026-08-14**: product create/submit 10/hour; product update/media/variant/
SKU mutations 30/hour; admin review/suspend/reactivate 50/hour.

The **Legal/Compliance sign-off on D-17 retention was recorded 2026-08-14**
(option A): the configurable retention mechanism and fail-closed default are
approved; jurisdiction-specific retention durations remain a **config value
pending** — not invented or hard-coded — to be supplied before M04-M3
enforcement (configurable, no compliance claim).

## 3. Milestone gating after approval

| Milestone                          | Gate                                                                                                       |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| M04-M1 Domain                      | §4 approval (D-01…D-06, D-16 resolved 2026-08-14)                                                          |
| M04-M2 Persistence                 | §4 approval (D-02/D-06/D-16 resolved 2026-08-14)                                                           |
| M04-M3 Application                 | §4 approval + D-17 Legal/Compliance sign-off recorded 2026-08-14 (config value pending before enforcement) |
| M04-M4 Authorization & Integration | §4 approval + ADR-M04-001 (Module 02 owner sign-off D-11 recorded 2026-08-14)                              |
| M04-M5 APIs                        | §4 approval (D-15 production rate-limit policy recorded 2026-08-14)                                        |
| M04-M6 Web/Mobile                  | §4 approval (D-14 resolved 2026-08-14)                                                                     |

## 4. Final owner approval statement (sign to authorize)

> I, the undersigned owner of the WALRUS Enterprise Marketplace Platform,
> approve the Module 04 — Product Catalog specification package —
> WEMP-M04-SPEC-001, WEMP-M04-PLAN-001, WEMP-M04-CONTRACT-001,
> WEMP-M04-AUTHZ-001, WEMP-M04-DECISIONS-001, this approval pack, and
> ADR-M04-001 — as the authorized basis for Module 04 implementation.
>
> I confirm that owner decisions D-01 through D-17 were reviewed and
> approved by the platform owner on 2026-08-14 and are recorded in
> WEMP-M04-DECISIONS-001. I acknowledge the recorded external sign-offs:
> the Module 02 owner sign-off on WEMP-M04-AUTHZ-001 (D-11, 2026-08-14,
> additive and non-weakening, no override), the Security/Platform
> production rate-limit policy (D-15, 2026-08-14, 10/30/50 per hour), and
> the Legal/Compliance sign-off on D-17 retention (2026-08-14, option A):
> the retention mechanism is approved and jurisdiction-specific retention
> durations remain a config value (not invented or hard-coded) to be
> supplied before M04-M3 enforcement.
>
> This approval authorizes implementation of milestone M04-M1 and M04-M2
> only after their §3 gates are satisfied, and each subsequent milestone only
> after its gates are satisfied. It does not authorize any change to Module
> 00/01/02/03 production behavior, does not weaken Module 01 authentication,
> Module 02 authorization, or Module 03 seller guarantees, and does not
> authorize any commit or push.

Signed (Product/Architecture Owner): ✓ **SIGNED — Product/Architecture
Owner, 2026-08-14**
Module 02 owner sign-off for WEMP-M04-AUTHZ-001 (D-11): ✓ **RECORDED**
(Module 02 owner, 2026-08-14)
Legal/Compliance sign-off for D-17 retention (option A — config value
pending, no durations invented or hard-coded): ✓ **RECORDED**
(Legal/Compliance authority, 2026-08-14)

## 5. Compliance with Module 02 security guarantees (unchanged)

- Deny-by-default, explicit-deny precedence, fail-closed behavior.
- No wildcard, implicit, or client-defined permissions.
- No hidden Super Admin or SELLER bypass; administrative scope unchanged.
- Authorization decision audit remains exclusively in Module 02.
- No secrets or real credentials appear in any Module 04 document.

**End of approval pack.** Nothing is authorized until signed.

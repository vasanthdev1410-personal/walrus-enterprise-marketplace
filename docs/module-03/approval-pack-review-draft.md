# Module 03 — Manual Approval Pack

**Status:** READY FOR OWNER APPROVAL — decisions resolved to
architecture-supported defaults or explicitly held for owner/external decisions
**Companion documents:** WEMP-M03-SPEC-001, WEMP-M03-PLAN-001,
WEMP-M03-CONTRACT-001, WEMP-M03-AUTHZ-001, WEMP-M03-DECISIONS-001
(Finalization Draft 1.1), and ADR-M03-001
**Implementation authority:** None until the approval statement in §4 is signed

> Following the Module 02 approval pattern: this pack lists the approved
> artifacts, the resolved decisions, the conditional decisions, and the exact
> statement the owner signs to authorize Module 03 implementation. It
> authorizes no code, migration, commit, or deployment until signed.

## 1. Document index

| Document                   | File                                                                                     | ID                     |
| -------------------------- | ---------------------------------------------------------------------------------------- | ---------------------- |
| Formal specification       | `docs/module-03/formal-specification-review-draft.md`                                    | WEMP-M03-SPEC-001      |
| Implementation plan        | `docs/module-03/implementation-plan-review-draft.md`                                     | WEMP-M03-PLAN-001      |
| Cross-module contracts     | `docs/module-03/cross-module-contracts-review-draft.md`                                  | WEMP-M03-CONTRACT-001  |
| SELLER role proposal       | `docs/module-03/authorization-seller-role-review-draft.md`                               | WEMP-M03-AUTHZ-001     |
| Decision/approval register | `docs/module-03/decision-register-review-draft.md`                                       | WEMP-M03-DECISIONS-001 |
| ADR draft                  | `docs/architecture/decisions/ADR-M03-001-seller-management-architecture-review-draft.md` | ADR-M03-001            |

## 2. Decision resolution summary (WEMP-M03-DECISIONS-001 §2)

**RESOLVED (architecture-supported default — binding upon approval):**
D-01, D-02, D-04, D-06, D-07, D-08, D-09, D-12, plus the technical scope of
D-03 and the record scope of D-05.

Three of these resolutions carry a **confirmation sub-item that is part of the
same resolution** (confirmed in the §4 statement, not a separate category):
D-04 (`DELETED` identity → no auto-review), D-07 (withdrawal from `APPROVED`
→ `CLOSED`), D-12 (expired verification → `VERIFICATION_REQUIRED`, not
auto-suspend).

**OWNER / not resolvable from repository authority (conditions on later
milestones, never silently assumed):**

- D-03 retention/expiry window — **APPROVED by the owner on 2026-08-12** for
  the configurable retention architecture (recorded in
  WEMP-M03-DECISIONS-001). Jurisdiction-specific final durations remain
  configurable and subject to Legal/Compliance review; no compliance claim is
  made. Legal-hold behavior and fail-closed retention configuration are
  binding for M03-M3.
- D-05 commission rate/terms configuration — Finance; **not needed before
  M03-M6**.
- D-10 numeric production rate-limit policy — Security/Platform; **condition
  of M03-M5** production exposure.
- D-11 Module 02 authorization changes (SELLER catalog, `seller.*` matrix,
  ownership resolver) — **Module 02 owner**; gate for **M03-M4**. Verified
  additive and non-weakening (no existing grant changed, no wildcard, no
  override, deny-by-default preserved).

## 3. Milestone gating after approval

| Milestone                          | Gate                                                                   |
| ---------------------------------- | ---------------------------------------------------------------------- |
| M03-M1 Domain                      | Authorized by §4 approval                                              |
| M03-M2 Persistence                 | Authorized by §4 approval                                              |
| M03-M3 Onboarding & Verification   | §4 approval + D-03 retention architecture approved (owner, 2026-08-12) |
| M03-M4 Authorization & Integration | D-11 approved by Module 02 owner + ADR-M03-001                         |
| M03-M5 APIs                        | D-10 rate-limit policy approved (Security/Platform)                    |
| M03-M6 Web/Mobile                  | D-05 commission terms confirmed (Finance) + D-06 scope                 |

## 4. Final owner approval statement (sign to authorize)

> I, the undersigned owner of the WALRUS Enterprise Marketplace Platform,
> approve the Module 03 — Seller Management specification package —
> WEMP-M03-SPEC-001, WEMP-M03-PLAN-001, WEMP-M03-CONTRACT-001,
> WEMP-M03-AUTHZ-001, WEMP-M03-DECISIONS-001, this approval pack, and
> ADR-M03-001 — as the authorized basis for Module 03 implementation.
>
> I approve the architecture-supported defaults recorded for decisions D-01,
> D-02, D-04, D-06, D-07, D-08, D-09, and D-12, including the confirmation
> sub-items for D-04 (a `DELETED` identity does not auto-trigger seller
> review), D-07 (withdrawal from `APPROVED` before activation closes the
> seller as terminal `CLOSED`), and D-12 (expired mandatory verification
> moves the seller to compliance state `VERIFICATION_REQUIRED` rather than
> auto-suspension), and the minimal-record scope of D-03 (technical evidence
> handling) and D-05 (commission agreement record).
>
> I acknowledge that D-03 jurisdiction-specific final retention durations
> (Legal/Compliance review), D-05 commission terms (Finance), D-10 production
> rate-limit policy (Security/Platform), and D-11 Module 02 authorization
> changes (Module 02 owner) remain conditional decisions that must be recorded
> by their responsible owners before the
> milestones that depend on them (M03-M3, M03-M6, M03-M5, and M03-M4
> respectively).
>
> This approval authorizes implementation of milestones M03-M1 and M03-M2
> immediately, and each subsequent milestone only after its gates in §3 are
> satisfied. It does not authorize any change to Module 00/01/02 production
> behavior, does not weaken Module 01 authentication or Module 02
> authorization guarantees, and does not authorize any commit or push.

Signed (Product/Architecture Owner): ____________________
Date: ____________
Module 02 owner sign-off for WEMP-M03-AUTHZ-001 (D-11): ____________________
Date: ____________

## 5. Compliance with Module 02 security guarantees (unchanged)

- Deny-by-default, explicit-deny precedence, fail-closed behavior.
- No wildcard, implicit, or client-defined permissions.
- No hidden Super Admin or SELLER bypass; administrative scope unchanged.
- Authorization decision audit remains exclusively in Module 02.
- No secrets or real credentials appear in any Module 03 document.

**End of approval pack.**

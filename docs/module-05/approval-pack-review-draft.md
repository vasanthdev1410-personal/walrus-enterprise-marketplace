# Module 05 — Manual Approval Pack

**Document ID:** WEMP-M05-APPROVAL-001
**Status:** APPROVED (M05-M1 … M05-M3) — signed by the Product/Architecture
Owner 2026-08-15. Decisions D-01…D-18 are owner-approved; external
conditions 1–4 **RECORDED 2026-08-15** (Module 02 owner sign-off;
Security/Platform D-11 rate-limit values; D-12 retention durations 2555/2555;
D-14 threshold values 1/0). M05-M1, M05-M2, and M05-M3 are authorized;
M05-M4–M05-M5 are **NOT** authorized until their sequential prerequisites
are satisfied.
**Companion documents:** WEMP-M05-SPEC-001, WEMP-M05-PLAN-001,
WEMP-M05-AUTHZ-001, and WEMP-M05-DECISIONS-001
**Implementation authority:** M05-M1 ONLY — granted by the §5 signature
(2026-08-15). M05-M2…M05-M5 are **NOT** authorized; each remains gated per
§4 and on the pending external conditions in §3. No Module 00/01/02/03/04
behavior change; no commit or push without explicit direction

> Following the Module 02/03/04 approval pattern: this pack lists the proposed
> artifacts, the resolved decisions, the conditional external-authority
> conditions, and the exact statement the owner signs to authorize Module 05
> implementation. It authorizes no code, migration, commit, or deployment
> until signed and until the pending external conditions are recorded.

## 1. Document index

| Document                   | File                                                          | ID                     |
| -------------------------- | ------------------------------------------------------------- | ---------------------- |
| Formal specification       | `docs/module-05/formal-specification-review-draft.md`         | WEMP-M05-SPEC-001      |
| Implementation plan        | `docs/module-05/implementation-plan-review-draft.md`          | WEMP-M05-PLAN-001      |
| INVENTORY role proposal    | `docs/module-05/authorization-inventory-role-review-draft.md` | WEMP-M05-AUTHZ-001     |
| Decision/approval register | `docs/module-05/decision-register-review-draft.md`            | WEMP-M05-DECISIONS-001 |

## 2. Decision resolution summary (WEMP-M05-DECISIONS-001 §2)

**BINDING from approved architecture (A-01…A-17):** Module 05 is the named
future inventory-management module; seller permissions exclusively via
Module 02; approved-seller inventory-operations gate; storage isolation;
`resource.action` permission format; fail-closed inventory contract port
(Module 04 D-08); `ProductSku` as the sellable-unit reference; AAL2 →
permission-guard chain; logical UUIDv7 references; no mobile admin;
forward-only additive migrations; finance/commission excluded (A-17);
no cart/order behavior (A-16).

**OWNER decisions D-01 … D-18 — OWNER-APPROVED (2026-08-14).** All eighteen
decisions were reviewed and approved by the platform owner in this review
cycle (option A for each); each is recorded in WEMP-M05-DECISIONS-001 §2 and
§5.1. No decision alters a D-01…D-18 record; this package applies them
verbatim.

## 3. External-authority conditions (conditions 1–4 RECORDED 2026-08-15)

| #   | Condition                                                                                        | Required from          | Gate(s)                             | Fail-closed behavior until recorded                                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------ | ---------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Additive `inventory.*` permission identifiers + third ownership-resolver scope (D-05/A-09)       | Module 02 owner        | M05-M4                              | ✓ **RECORDED 2026-08-15** — additive/non-weakening; grant effective when M05-M4 is implemented (deny-by-default preserved)                                              |
| 2   | D-11 production rate-limit values (adjustments 30/hr, reads 60/hr, admin 50/hr)                  | Security/Platform      | M05-M5                              | ✓ **RECORDED 2026-08-15** — 30/60/50 per hour confirmed; no rate class for reserve/release (D-06); policy effective when M05-M5 APIs are exposed                        |
| 3   | D-12 jurisdiction-specific retention durations                                                   | Legal/Compliance       | M05-M2 / M05-M3 (enforcement)       | ✓ **RECORDED 2026-08-15** — InventoryMovementRecord 2555 days; InventoryAuditRecord 2555 days; effective for enforcement when M05-M3 implements the retention processor |
| 4   | D-14 low/out-of-stock threshold values (values pending authority input before label enforcement) | Authority input (D-14) | M05-M3 / M05-M5 (label enforcement) | ✓ **RECORDED 2026-08-15** — LOW_STOCK_THRESHOLD=1; OUT_OF_STOCK_THRESHOLD=0 (owner-approved; fail-closed on missing/invalid config)                                     |

> **Conditions 1–2 (Module 02 owner sign-off; Security/Platform D-11
> rate-limit values) are RECORDED (2026-08-15).** Conditions 3–4 are **NOT**
> recorded and must not be silently marked approved.
>
> **Gate #3 — RECORDED 2026-08-15 (owner-approved D-12 retention values):**
> the D-12 jurisdiction-specific retention durations were approved and
> recorded on 2026-08-15 — **`InventoryMovementRecord`: retentionDays =
> 2555; `InventoryAuditRecord`: retentionDays = 2555** (whole days,
> positive safe integers). The fail-closed config mechanism remains in
> force (no deletion without a valid configured duration; auditable
> deletion with legal-hold protection; no compliance claim). These values
> authorize **M05-M2** persistence and enable **M05-M3** retention
> enforcement; M05-M3 itself still requires Gate #4 (D-14 threshold
> values) and remains NOT authorized.
>
> **Gate #4 — RECORDED 2026-08-15 (owner-approved D-14 threshold values):**
> the D-14 low/out-of-stock threshold values were approved and recorded on
> 2026-08-15 — **`LOW_STOCK_THRESHOLD` = 1; `OUT_OF_STOCK_THRESHOLD` = 0**
> (stored in `inventory_config_records`, admin-managed, D-14).
> OUT_OF_STOCK is derived when `available ≤ 0` (mirroring the D-03
> UNAVAILABLE availability outcome); LOW_STOCK when `available ≤ 1`;
> IN_STOCK otherwise. The fail-closed config mechanism remains in force —
> no label enforcement without valid configured thresholds. These values
> authorize **M05-M3** label enforcement; M05-M5 still requires sequential
> milestones and remains NOT authorized.

## 4. Milestone gating after approval

| Milestone                          | Gate                                                                                                                                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M05-M1 Inventory Domain            | ✓ **SATISFIED** — §5 approval signed 2026-08-15 (D-01/D-02/D-03/D-04/D-06/D-08/D-18 owner-approved 2026-08-14)                                                                                                      |
| M05-M2 Inventory Persistence       | ✓ **SATISFIED** — §5 approval + D-12 Legal/Compliance retention durations **RECORDED 2026-08-15** (2555/2555 days) — M05-M2 authorized 2026-08-15                                                                   |
| M05-M3 Inventory Application       | ✓ **SATISFIED** — §5 approval + D-12 durations **RECORDED 2026-08-15** (2555/2555) + D-14 threshold values **RECORDED 2026-08-15** (LOW_STOCK_THRESHOLD=1; OUT_OF_STOCK_THRESHOLD=0) — M05-M3 authorized 2026-08-15 |
| M05-M4 Authorization & Integration | ✓ **SATISFIED** — §5 approval + Module 02 owner sign-off (condition 1) **RECORDED 2026-08-15**                                                                                                                      |
| M05-M5 APIs & Web/Mobile           | §5 approval + Module 02 sign-off (condition 1, **RECORDED**) + **Security/Platform D-11 confirmation (condition 2) — RECORDED 2026-08-15** + D-14 values supplied (condition 4)                                     |

## 5. Final owner approval statement (sign to authorize)

> I, the undersigned owner of the WALRUS Enterprise Marketplace Platform,
> approve the Module 05 — Inventory Management specification package —
> WEMP-M05-SPEC-001, WEMP-M05-PLAN-001, WEMP-M05-AUTHZ-001,
> WEMP-M05-DECISIONS-001, and this approval pack — as the authorized basis
> for Module 05 implementation.
>
> I confirm that owner decisions D-01 through D-18 were reviewed and approved
> by the platform owner on 2026-08-14 (option A for each) and are preserved
> exactly in WEMP-M05-DECISIONS-001.
>
> I acknowledge that the following external-authority conditions remain
> **PENDING and NOT RECORDED** and must be satisfied before the milestones
> that depend on them, with fail-closed behavior in effect until recorded:
> (1) the Module 02 owner sign-off for the additive `inventory.*`
> permissions and the third ownership-resolver scope (D-05/A-09, gate
> M05-M4); (2) Security/Platform confirmation of the D-11 production
> rate-limit values (gate M05-M5); (3) Legal/Compliance configuration of
> the D-12 jurisdiction-specific retention durations (gates M05-M2/M05-M3);
> and (4) the D-14 low/out-of-stock threshold values pending authority input
> before label enforcement (gates M05-M3/M05-M5). I do not treat any of
> these as approved by this statement alone. (Conditions 1–2 were
> subsequently recorded on 2026-08-15; conditions 3–4 remain pending.)
>
> This approval authorizes implementation of milestone M05-M1 only after its
> §4 gate is satisfied, and each subsequent milestone only after its gates in
> §4 are satisfied. It does not authorize any change to Module 00/01/02/03/04
> production behavior, does not weaken Module 01 authentication, Module 02
> authorization, Module 03 seller guarantees, or Module 04 catalog
> guarantees, and does not authorize any commit or push.

Signed (Product/Architecture Owner): ✓ **SIGNED — Product/Architecture
Owner, 2026-08-15 (authorizes M05-M1 only)**
Date: 2026-08-15

> **Sign-off scope (recorded):** this signature authorizes milestone M05-M1
> (Inventory Domain Foundation) only. Milestones M05-M2 through M05-M5 are
> **NOT** authorized and remain gated per §4 on the pending external
> conditions in §3. After this signature, **conditions 1–2 were RECORDED on
> 2026-08-15**: the Module 02 owner sign-off (additive `inventory.*`
> permission identifiers and the third ownership-resolver scope, verified
> additive and non-weakening) and the Security/Platform confirmation of the
> D-11 production rate-limit values (30/60/50 per hour; no rate class for
> `reserve`/`release`). Conditions 3–4 were subsequently RECORDED
> 2026-08-15 — D-12 retention durations (2555/2555 days) and D-14
> threshold values (LOW_STOCK_THRESHOLD=1; OUT_OF_STOCK_THRESHOLD=0);
> no values were invented or approved.

## 6. External-authority sign-off record (conditions 1–4 RECORDED 2026-08-15)

| Condition                                  | Required from     | Status                                                                                                         | Date       |
| ------------------------------------------ | ----------------- | -------------------------------------------------------------------------------------------------------------- | ---------- |
| `inventory.*` + third resolver (D-05/A-09) | Module 02 owner   | ✓ **RECORDED** 2026-08-15                                                                                      | 2026-08-15 |
| D-11 rate-limit values                     | Security/Platform | ✓ **RECORDED** 2026-08-15                                                                                      | 2026-08-15 |
| D-12 retention durations                   | Legal/Compliance  | ✓ **RECORDED 2026-08-15** — InventoryMovementRecord 2555 days; InventoryAuditRecord 2555 days (owner-approved) | 2026-08-15 |
| D-14 threshold values                      | Authority input   | ✓ **RECORDED 2026-08-15** — LOW_STOCK_THRESHOLD=1; OUT_OF_STOCK_THRESHOLD=0 (owner-approved)                   | 2026-08-15 |

## 7. Compliance with Module 02 security guarantees (unchanged)

- Deny-by-default, explicit-deny precedence, fail-closed behavior.
- No wildcard, implicit, or client-defined permissions.
- No hidden Super Admin or SELLER bypass; administrative scope unchanged.
- Authorization decision audit remains exclusively in Module 02.
- No secrets or real credentials appear in any Module 05 document.

**End of approval pack.** Nothing is authorized until signed and until the
pending external-authority conditions are recorded.

# Module 06 — Manual Approval Pack

**Document ID:** WEMP-M06-APPROVAL-001
**Status:** APPROVED (M06-M1 + M06-M2 + M06-M3 + M06-M4) — signed by the
Product/Architecture Owner 2026-08-17. M06-M5 is **NOT** authorized and
remains gated per §4 on the pending external conditions in §3
(Security/Platform D-10 rate-limit confirmation — **PENDING — NOT
RECORDED**).
**Companion documents:** WEMP-M06-SPEC-001, WEMP-M06-PLAN-001,
WEMP-M06-AUTHZ-001, and WEMP-M06-DECISIONS-001
**Implementation authority:** M06-M1 + M06-M2 + M06-M3 + M06-M4 — granted
by the §5 signatures (2026-08-17) and the recorded Module 02 owner sign-off
(§3/§6, 2026-08-17). M06-M5 is **NOT** authorized and remains gated per §4
and on the pending Security/Platform rate-limit confirmation in §3. M06-M4
is the only milestone that changes Module 02 — additive `customer.*` catalog
entries and the fourth ownership-resolver scope only (D-07/A-07), approved
by the Module 02 owner sign-off recorded 2026-08-17. No commit or push
without explicit direction

> Following the Module 02/03/04/05 approval pattern: this pack lists the
> proposed artifacts, the resolved decisions, the conditional
> external-authority conditions, and the exact statement the owner signs to
> authorize Module 06 implementation. It authorizes no code, migration,
> commit, or deployment until signed and until the pending external
> conditions are recorded.

## 1. Document index

| Document                   | File                                                         | ID                     |
| -------------------------- | ------------------------------------------------------------ | ---------------------- |
| Formal specification       | `docs/module-06/formal-specification-review-draft.md`        | WEMP-M06-SPEC-001      |
| Implementation plan        | `docs/module-06/implementation-plan-review-draft.md`         | WEMP-M06-PLAN-001      |
| CUSTOMER role proposal     | `docs/module-06/authorization-customer-role-review-draft.md` | WEMP-M06-AUTHZ-001     |
| Decision/approval register | `docs/module-06/decision-register-review-draft.md`           | WEMP-M06-DECISIONS-001 |

## 2. Decision resolution summary (WEMP-M06-DECISIONS-001 §2)

**BINDING from approved architecture (A-01…A-15):** Module 06 is the named
future customer-management module; Module 06 owns the Customer profile and
lifecycle (Module 01 v1.12 §6); customer permissions exclusively via Module
02; no second Identity; storage isolation; `resource.action` permission
format; AAL2 → permission-guard chain; logical UUIDv7 references; no mobile
admin; forward-only additive migrations; cart 07 / orders 08 / payments 09 /
shipping 10 / notifications 11 / analytics 12 excluded (A-13); no new
retention duration invented (A-15).

**OWNER decisions D-01 … D-07, D-12 — OWNER-APPROVED (2026-08-17).** Owner
business inputs for this authoring cycle (customer profile ownership and
scope; lifecycle states/transitions; registration model; address book;
optional B2B; basic preferences; permission vocabulary; web/mobile surface
scope) were provided and are recorded as owner-approved in
WEMP-M06-DECISIONS-001 §2/§5.

**RESOLVED decisions D-08 … D-11, D-13 — architecture-supported defaults**
(audit/evidence; retention/privacy; rate limiting; concurrency/idempotency;
cross-module contract shapes) — binding only upon the §5 signature.

## 3. External-authority conditions (condition 1 RECORDED; condition 2 PENDING; condition 3 OWNER-RESOLVED)

| #   | Condition                                                                                  | Required from     | Gate(s)                       | Fail-closed behavior until recorded                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------ | ----------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Additive `customer.*` permission identifiers + fourth ownership-resolver scope (D-07/A-07) | Module 02 owner   | M06-M4                        | **RECORDED 2026-08-17** — Module 02 owner sign-off recorded (WEMP-M06-AUTHZ-001 §7); additive non-weakening `customer.*` catalog + fourth resolver scope implemented in M06-M4                                                                       |
| 2   | D-10 production rate-limit values (self reads 60/hr, self mutations 30/hr, admin 50/hr)    | Security/Platform | M06-M5                        | **PENDING — NOT RECORDED** — platform fail-closed default (A-11) until confirmed                                                                                                                                                                     |
| 3   | D-09 jurisdiction-specific retention durations for customer records                        | Legal/Compliance  | M06-M2 / M06-M3 (enforcement) | **OWNER-RESOLVED 2026-08-17 (D-15)** — CUSTOMER_RECORD_RETENTION_DAYS = 2555 for the audit/history categories (CustomerStateTransition, CustomerAuditRecord); enforced by the application-layer retention processor (M06-M3), never by the migration |

> Condition 1 is **RECORDED 2026-08-17** and condition 3 is **OWNER-RESOLVED
> 2026-08-17 (D-15)**; only condition 2 (Security/Platform D-10 rate-limit
> values) remains **PENDING — NOT RECORDED**. No milestone whose gate depends
> on a pending condition may begin.

## 4. Milestone gating after approval

| Milestone                          | Gate                                                                                                                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M06-M1 Customer Domain Foundation  | ✓ **SATISFIED** — §5 approval signed 2026-08-17 (D-01/D-02/D-04/D-05/D-06/D-08/D-11/D-13 owner-approved/resolved) — **M06-M1 authorized 2026-08-17**                        |
| M06-M2 Customer Persistence        | ✓ **SATISFIED** — §5 approval signed 2026-08-17 + D-15 retention (CUSTOMER_RECORD_RETENTION_DAYS = 2555) recorded — **M06-M2 authorized 2026-08-17**                        |
| M06-M3 Customer Application        | ✓ **SATISFIED** — §5 approval signed 2026-08-17 (D-15 retention config source in place; application-layer retention mechanism in M06-M3) — **M06-M3 authorized 2026-08-17** |
| M06-M4 Authorization & Integration | ✓ **SATISFIED** — §5 approval + Module 02 owner sign-off (condition 1) **RECORDED 2026-08-17** — **M06-M4 authorized 2026-08-17**                                           |
| M06-M5 APIs & Web/Mobile           | §5 approval + Module 02 sign-off (condition 1, **RECORDED 2026-08-17**) + Security/Platform D-10 confirmation (condition 2, **PENDING — NOT RECORDED**)                     |

## 5. Final owner approval statement (sign to authorize)

> I, the undersigned owner of the WALRUS Enterprise Marketplace Platform,
> approve the Module 06 — Customer Management specification package —
> WEMP-M06-SPEC-001, WEMP-M06-PLAN-001, WEMP-M06-AUTHZ-001,
> WEMP-M06-DECISIONS-001, and this approval pack — as the authorized basis
> for Module 06 implementation.
>
> I confirm that owner business inputs D-01 through D-07 and D-12 were
> provided by the platform owner on 2026-08-17 and are preserved exactly in
> WEMP-M06-DECISIONS-001; decisions D-08 through D-11 and D-13 are recorded
> architecture-supported defaults.
>
> I acknowledge that the following external-authority conditions remain
> **PENDING and NOT RECORDED** and must be satisfied before the milestones
> that depend on them, with fail-closed behavior in effect until recorded:
> (1) the Module 02 owner sign-off for the additive `customer.*`
> permissions and the fourth ownership-resolver scope (D-07/A-07, gate
> M06-M4); and (2) Security/Platform confirmation of the D-10 production
> rate-limit values (gate M06-M5). The D-09 customer-record retention
> condition for the audit/history categories was resolved by the owner on
> 2026-08-17 (D-15: CUSTOMER_RECORD_RETENTION_DAYS = 2555) and no longer
> blocks M06-M2/M06-M3.
>
> This approval authorizes implementation of milestone M06-M1 only after its
> §4 gate is satisfied, and each subsequent milestone only after its gates in
> §4 are satisfied. It does not authorize any change to Module 00/01/02/03/04/05
> production behavior, does not weaken Module 01 authentication, Module 02
> authorization, Module 03 seller guarantees, Module 04 catalog guarantees,
> or Module 05 inventory guarantees, and does not authorize any commit or
> push.

Signed (Product/Architecture Owner): ✓ **SIGNED — Product/Architecture
Owner, 2026-08-17 (authorizes M06-M1 only)**
Date: 2026-08-17

> **Sign-off scope (recorded):** the §5 signature authorizes milestone M06-M1
> (Customer Domain Foundation) only. Milestones M06-M2 through M06-M5 are
> **NOT** authorized and remain gated per §4 on the pending external
> conditions in §3 (Module 02 owner sign-off; Security/Platform D-10
> rate-limit confirmation; Legal/Compliance D-09 customer-record retention
> durations — all **PENDING — NOT RECORDED**).

Signed (Product/Architecture Owner): ✓ **SIGNED — Product/Architecture
Owner, 2026-08-17 (authorizes M06-M2 only)**
Date: 2026-08-17

> **M06-M2 sign-off (recorded 2026-08-17):** the Product/Architecture Owner
> authorizes milestone **M06-M2 (Customer Persistence) only** — additive
> Prisma models, one forward-only migration, repository adapters, mappers,
> and the D-15 retention configuration source
> (CUSTOMER_RECORD_RETENTION_DAYS = 2555 for the audit/history categories
> CustomerStateTransition and CustomerAuditRecord). The D-09
> Legal/Compliance retention condition for those categories is resolved by
> D-15; M06-M3…M06-M5 remain **NOT authorized** and stay gated per §4
> (M06-M4: Module 02 owner sign-off; M06-M5: Module 02 sign-off + D-10
> rate-limit confirmation — all **PENDING — NOT RECORDED**).

Signed (Product/Architecture Owner): ✓ **SIGNED — Product/Architecture
Owner, 2026-08-17 (authorizes M06-M3 only)**
Date: 2026-08-17

> **M06-M3 sign-off (recorded 2026-08-17):** the Product/Architecture Owner
> authorizes milestone **M06-M3 (Customer Application Services) only** —
> application-layer use cases orchestrating the M06-M1 domain and M06-M2
> persistence: profile create/read/update, lifecycle transitions (D-02),
> address book management with one-default-per-role (D-04), business
> profile 0..1 (D-05), allow-listed preferences (D-06), append-only
> transition/audit recording (D-08), idempotency (A-09), optimistic
> concurrency (D-11), D-10 rate-limit port integration (values pending
> Security/Platform confirmation — fail-closed default A-11), and the
> D-15 retention mechanism (CUSTOMER_RECORD_RETENTION_DAYS = 2555). No
> presentation layer, no Module 02 changes, no cart/order/payment/
> shipping/notification behavior (A-13), no direct role mutation (D-03).
> M06-M4…M06-M5 remain **NOT authorized** (M06-M4: Module 02 owner
> sign-off; M06-M5: Module 02 sign-off + D-10 rate-limit confirmation —
> all **PENDING — NOT RECORDED**).

Signed (Product/Architecture Owner): ✓ **SIGNED — Product/Architecture
Owner, 2026-08-17 (authorizes M06-M4 only)**
Date: 2026-08-17

> **M06-M4 sign-off (recorded 2026-08-17):** the Product/Architecture Owner
> authorizes milestone **M06-M4 (Authorization & Cross-Module Integration)
> only** — the additive `customer.*` Module 02 permission catalog entries
> and matrix rows per WEMP-M06-AUTHZ-001 (D-07), the fourth
> ownership-resolver scope (customer identity — the caller's own Identity
> owns the target customer profile), the customer self-service permission
> guard (AAL2 → permission guard → ownership), the fail-closed
> `CustomerProfileReadPort`/`CustomerAddressReadPort` contracts (D-13,
> port-only, no consumers wired yet), and the replacement of the M06-M3
> deny-all customer authorization adapter by wiring the Module 02
> additions at the port boundary. No customer HTTP surface (M06-M5); no
> M07/M08/M10 wiring; no cart/order/payment/shipping/notification
> behavior (A-13); no new role; no wildcard; no hidden SUPER_ADMIN bypass.
> M06-M5 remains **NOT authorized** (Security/Platform D-10 rate-limit
> confirmation — **PENDING — NOT RECORDED**).

## 6. External-authority sign-off record

| Condition                                   | Required from     | Status                                                                                                  | Date       |
| ------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------- | ---------- |
| `customer.*` + fourth resolver (D-07/A-07)  | Module 02 owner   | **RECORDED 2026-08-17** — additive non-weakening sign-off (WEMP-M06-AUTHZ-001 §7)                       | 2026-08-17 |
| D-10 rate-limit values                      | Security/Platform | **PENDING — NOT RECORDED**                                                                              | —          |
| D-09 retention durations (customer records) | Legal/Compliance  | **RESOLVED 2026-08-17 (D-15)** — CUSTOMER_RECORD_RETENTION_DAYS = 2555 for the audit/history categories | 2026-08-17 |

> **Sign-off record (2026-08-17):** the §5 signatures authorize **M06-M1,
> M06-M2, M06-M3 and M06-M4**. The Module 02 owner sign-off for the
> additive `customer.*` catalog + fourth ownership-resolver scope is
> **RECORDED 2026-08-17** (§3/§6). The remaining external condition is
> **PENDING — NOT RECORDED**: Security/Platform D-10 rate-limit
> confirmation, which blocks M06-M5 only.

## 7. Compliance with Module 02 security guarantees (unchanged)

- Deny-by-default, explicit-deny precedence, fail-closed behavior.
- No wildcard, implicit, or client-defined permissions.
- No hidden Super Admin or CUSTOMER bypass; administrative scope unchanged.
- Authorization decision audit remains exclusively in Module 02.
- No role-name authorization; explicit permission-identifier grants only.
- No secrets or real credentials appear in any Module 06 document.

**End of approval pack.** Nothing is authorized until signed and until the
pending external-authority conditions are recorded.

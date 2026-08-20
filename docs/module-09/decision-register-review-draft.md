# WALRUS Enterprise Marketplace Platform

## Module 09 — Payments Decision and Approval Register

**Document ID:** WEMP-M09-DECISIONS-001
**Version:** Review Draft 1.0
**Status:** OWNER-APPROVED (D-01…D-13) — signed by the Product/Architecture
Owner 2026-08-20. M09-M1…M09-M6 authorized.
**Effective date:** 2026-08-20 (M09 planning)
**Classification:** Confidential — Internal Use Only

> Every business/security decision required by Module 09 is recorded here.
> Each decision is either **APPROVED FROM EXISTING ARCHITECTURE** (binding
> source cited), **RESOLVED — ARCHITECTURE-SUPPORTED DEFAULT** (safest
> default derivable from approved Module 00–08 architecture), or
> **OWNER-APPROVED** (decision resolved by the owner's explicit selection,
> recorded with its date in §5).

---

## 1. APPROVED FROM EXISTING ARCHITECTURE (binding)

| ID   | Decision | Binding source |
|------|----------|----------------|
| A-01 | Module 09 — Payments is a named future module in the approved landscape; it receives payment initiation from Module 08 (Orders) and transitions orders through D-05 handoff | Module 01 v1.12 §6; M08 D-05 |
| A-02 | Payment permissions are determined exclusively by Module 02; Module 09 implements no authorization engine, roles, or permission checks | Module 01 v1.12 §6; A-02 precedent |
| A-03 | Cross-module storage isolation: no cross-module FKs; logical UUIDv7 references; integration through approved ports; Module 09 never reads Module 06/08 storage directly | Module 01 Part 7.3 §12; A-05/A-06 precedent |
| A-04 | Permission identifiers use immutable `resource.action`; no wildcards; deny-by-default; explicit-deny precedence; fail closed | WEMP-M02-SPEC-001 §4, §14; Module 07/08 precedent |
| A-05 | AAL2 session guard precedes the Module 02 permission guard; no anonymous payment API; no client-side authorization decisions | Module 01/02 guard chain; Module 07/08 precedent |
| A-06 | Idempotency reuses `ApiIdempotencyRecord` on all mutations; optimistic concurrency via `aggregateVersion` on all mutations; append-only transition/audit records; non-disclosing errors | M07 D-16; M08 A-06 |
| A-07 | Forward-only additive migrations; no Module 00–08 table modified | ADR-006; M07/M08 migration patterns |
| A-08 | Rate limiting per the recorded production policy classes | M07 D-10; M08 D-10 |
| A-09 | Shopping cart (07), orders (08), payments (09), shipping (10) are separate modules; M09 must not implement order/shipping behavior | Module 07 A-09; M08 A-09 |
| A-10 | Module 06 exposes `CustomerProfileReadPort` for M09 consumption; only ACTIVE profiles resolve (fail closed) | Module 06 D-13; M08 A-10 |
| A-11 | Mobile admin is excluded; one Flutter app with isolated features | ADR-016 |

---

## 2. Decision resolutions (D-01 … D-13)

| ID   | Decision | Resolution | Adopted default / required owner input | Authority |
|------|----------|------------|----------------------------------------|-----------|
| D-01 | Payment provider selection | **OWNER-APPROVED** | **Razorpay as the payment gateway provider.** HMAC-SHA256 webhook signature verification. Provider-agnostic port abstraction (PaymentProviderPort) enables future provider swap. **Gate: M09-M3 (application).** | Owner input; Gravity Index recommendation |
| D-02 | Payment aggregate model | **OWNER-APPROVED** | **One Payment per order. One Payment may have multiple PaymentAttempts (append-only). One Payment may have multiple PaymentRefunds.** Payment stores orderId (logical UUIDv7), customerProfileId (logical UUIDv7), amount, currency, provider identifiers. No cross-module FKs (A-03). **Gate: M09-M1 (domain).** | Owner input; M08 D-02 ownership pattern; economic-unit convention |
| D-03 | Payment lifecycle state machine | **OWNER-APPROVED** | **Seven states: PENDING, PROCESSING, CAPTURED, FAILED, REFUND_PENDING, REFUNDED, EXPIRED.** PENDING = record created, awaiting customer action. PROCESSING = customer initiated payment with provider. CAPTURED = provider confirmed payment captured (webhook). FAILED = provider rejected payment or timeout. REFUND_PENDING = refund initiated with provider. REFUNDED = provider confirmed refund. EXPIRED = payment window expired. Terminal states: FAILED, EXPIRED, REFUNDED. CAPTURED is NOT terminal (→ REFUND_PENDING for admin refund). **Gate: M09-M1 (domain).** | Owner input; M08 D-01 lifecycle precedent; Razorpay event model |
| D-04 | Refund scope | **OWNER-APPROVED** | **Refunds are admin-initiated only. Full or partial refund allowed. Refund amount must not exceed captured amount.** Customer cannot initiate refunds. Refund creates PaymentRefund entity in PENDING state, transitions payment CAPTURED → REFUND_PENDING. **Gate: M09-M3 (application).** | Owner input; M08 D-06 handoff boundary |
| D-05 | Order/Payment handoff boundary | **OWNER-APPROVED** | **M08 creates PENDING orders. M09 transitions PENDING → CONFIRMED (payment initiation) and CONFIRMED → PAID (payment capture).** M08 provides OrderId, CustomerProfileId, SubtotalAmount. M09 provides payment initiation/completion callbacks. M08 never initiates payment or processes refunds. **Gate: M09-M3 (application).** | Owner input; M08 D-05 precedent |
| D-06 | Webhook handling | **OWNER-APPROVED** | **Webhook endpoint at /webhooks/payments/razorpay. HMAC-SHA256 signature verification. Raw body preservation for signature check. System actor for processing. Fail closed on invalid signatures, malformed payloads, unknown events.** Provider is the only source of payment state — never trust client-reported success. **Gate: M09-M3 (application).** | Owner input; Razorpay documentation; M08 D-06 precedent |
| D-07 | Duplicate payment protection | **OWNER-APPROVED** | **Idempotency-Key header required on payment initiation. findByOrderId check prevents duplicate payments. Provider order ID uniqueness enforced.** Replay of completed payment creation returns cached success. **Gate: M09-M3 (application).** | Owner input; M08 D-12 precedent; M07 D-17 |
| D-08 | Payment permission catalog | **OWNER-APPROVED** | **Self-service: `payment.initiate`, `payment.read`. Admin: `payment.admin.read`, `payment.admin.manage`.** Self-service enforced by customer-identity ownership resolver (M06 fourth scope). Admin enforced by admin scope. No role-only bypass, no hidden SUPER_ADMIN bypass, no wildcard. **Gate: M09-M4 (authorization).** | Owner input; M08 D-08 permission catalog pattern; M07 D-09 precedent |
| D-09 | Module 02 authorization sign-off | **OWNER-APPROVED** | **Additive `payment.*` permission identifiers.** Non-weakening sign-off required from Module 02 owner. Identical pattern to M07/M08 D-09. **Gate: M09-M4 (authorization).** **RECORDED 2026-08-20.** | Owner input; M07 D-09; M08 D-09 precedent |
| D-10 | Rate-limit classes | **OWNER-APPROVED** | **payment.read: 60/hour (self), 50/hour (admin). payment.mutation (initiate): 120/hour (self), 50/hour (admin).** Keyed by identity (self-service) and identityId (admin), isolated from M06/M07/M08 buckets. **Gate: M09-M5 (APIs).** **RECORDED 2026-08-20.** | Owner input; M08 D-10; M07 D-10 |
| D-11 | Payment record retention | **OWNER-APPROVED** | **Configurable per record category (PAYMENT_RECORD_RETENTION_DAYS). Default: 365 days (owner-resolved per M07/M08 D-11 precedent).** Applies to PaymentStateTransition and PaymentAuditRecord. Legal/Compliance review deferred to deployment-time configuration. **Gate: M09-M2 (persistence).** **RECORDED 2026-08-20.** | Owner input; M07 D-11; M08 D-11 precedent |
| D-12 | Payment concurrency model | **OWNER-APPROVED** | **Optimistic locking via `aggregateVersion` on the Payment aggregate root, identical to M07/M08 pattern.** Every mutation checks and increments the version. Conflicts return CONFLICT error. **Gate: M09-M2 (persistence).** | Owner input; M07 D-16; M08 D-11 |
| D-13 | Payment amount validation | **OWNER-APPROVED** | **Payment amountCents must match order subtotalAmountCents at initiation time (D-13 mismatch check).** ISO 4217 currency code validated. Non-negative safe integer. Fail closed on mismatch. **Gate: M09-M1 (domain).** | Owner input; M08 D-13; economic-unit convention |

---

## 3. MILESTONE GATE STATUS

| Milestone | Gate | Status | Authorized |
|-----------|------|--------|------------|
| M09-M1 Domain Foundation | D-02/D-03/D-13 | SATISFIED | 2026-08-20 |
| M09-M2 Persistence | D-07/D-11/D-12 | SATISFIED | 2026-08-20 |
| M09-M3 Application Services | D-01/D-04/D-05/D-06/D-07 | SATISFIED | 2026-08-20 |
| M09-M4 Authorization & Cross-Module Integration | D-08/D-09 | SATISFIED | 2026-08-20 |
| M09-M5 APIs & Web/Mobile Integration | D-10 | SATISFIED | 2026-08-20 |
| M09-M6 Production Hardening & Documentation | All | SATISFIED | 2026-08-20 |

---

## 4. AUTHORIZATION SIGN-OFF (D-09)

### 4.1 Payment permission identifiers

| Permission ID | Resource | Action | Scope | Granted to |
|---------------|----------|--------|-------|------------|
| `payment.initiate` | `payment` | `CREATE` | Customer-identity-scoped (4th resolver) | CUSTOMER |
| `payment.read` | `payment` | `READ` | Customer-identity-scoped (4th resolver) | CUSTOMER |
| `payment.admin.read` | `payment.admin` | `READ` | Admin (no scope) | ADMIN, SUPER_ADMIN |
| `payment.admin.manage` | `payment.admin` | `MANAGE` | Admin (no scope) | ADMIN, SUPER_ADMIN |

### 4.2 Module 02 owner sign-off

**RECORDED 2026-08-20.** The additive `payment.*` permission identifiers are approved by the Module 02 owner as non-weakening additions to the centralized permission catalog and role-to-permission matrix. The sign-off follows the established M07/M08 D-09 precedent.

---

## 5. OWNER DECISION RECORD

| Decision ID | Date | Selection | Sign-off |
|-------------|------|-----------|----------|
| D-01 | 2026-08-20 | Razorpay as payment gateway provider | Owner-approved |
| D-02 | 2026-08-20 | One Payment per order, append-only attempts/refunds | Owner-approved |
| D-03 | 2026-08-20 | Seven-state lifecycle (PENDING…EXPIRED) | Owner-approved |
| D-04 | 2026-08-20 | Admin-only refunds, full or partial | Owner-approved |
| D-05 | 2026-08-20 | D-05 handoff: PENDING→CONFIRMED→PAID | Owner-approved |
| D-06 | 2026-08-20 | HMAC-SHA256 webhook verification, fail closed | Owner-approved |
| D-07 | 2026-08-20 | Idempotency-Key + findByOrderId duplicate check | Owner-approved |
| D-08 | 2026-08-20 | payment.initiate, payment.read, payment.admin.* | Owner-approved |
| D-09 | 2026-08-20 | payment.* sign-off recorded | Owner-approved |
| D-10 | 2026-08-20 | 60/120/50 per hour, isolated buckets | Owner-approved |
| D-11 | 2026-08-20 | PAYMENT_RECORD_RETENTION_DAYS default 365 | Owner-resolved |
| D-12 | 2026-08-20 | Optimistic locking via aggregateVersion | Owner-approved |
| D-13 | 2026-08-20 | Amount must match order subtotal at initiation | Owner-approved |

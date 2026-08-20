# WALRUS Enterprise Marketplace Platform

## Module 09 — Payments Approval Pack

**Document ID:** WEMP-M09-APPROVAL-001
**Version:** Review Draft 1.0
**Status:** OWNER-APPROVED — signed by the Product/Architecture Owner 2026-08-20.
**Effective date:** 2026-08-20
**Classification:** Confidential — Internal Use Only

---

## 1. Module 09 Summary

Module 09 — Payments implements the payment lifecycle for the WALRUS Enterprise Marketplace Platform. It creates and manages payment records, integrates with Razorpay as the payment gateway, handles webhooks for payment state transitions, and coordinates with Module 08 (Orders) through the D-05 handoff boundary.

### 1.1 Scope

- Payment aggregate root with 7-state lifecycle
- Payment attempts (append-only) and refunds
- Razorpay provider integration (HMAC-SHA256 webhook verification)
- Order/Payment lifecycle coordination (D-05 handoff)
- Customer self-service and admin payment operations
- Webhook endpoint for provider events
- Web and mobile (read-only) API clients

### 1.2 Key Decisions

| ID | Decision | Status |
|----|----------|--------|
| D-01 | Razorpay as payment gateway provider | RECORDED 2026-08-20 |
| D-02 | One Payment per order, append-only attempts/refunds | RECORDED 2026-08-20 |
| D-03 | Seven-state lifecycle (PENDING…EXPIRED) | RECORDED 2026-08-20 |
| D-04 | Admin-only refunds, full or partial | RECORDED 2026-08-20 |
| D-05 | D-05 handoff: PENDING→CONFIRMED→PAID | RECORDED 2026-08-20 |
| D-06 | HMAC-SHA256 webhook verification, fail closed | RECORDED 2026-08-20 |
| D-07 | Idempotency-Key + findByOrderId duplicate check | RECORDED 2026-08-20 |
| D-08 | payment.initiate, payment.read, payment.admin.* | RECORDED 2026-08-20 |
| D-09 | Module 02 authorization sign-off | RECORDED 2026-08-20 |
| D-10 | 60/120/50 per hour rate limits | RECORDED 2026-08-20 |
| D-11 | PAYMENT_RECORD_RETENTION_DAYS default 365 | RECORDED 2026-08-20 |
| D-12 | Optimistic locking via aggregateVersion | RECORDED 2026-08-20 |
| D-13 | Amount must match order subtotal at initiation | RECORDED 2026-08-20 |

---

## 2. Milestone Completion Status

| Milestone | Commit | Status |
|-----------|--------|--------|
| M09-M1 Domain Foundation | b3f89dd | AUTHORIZED |
| M09-M2 Persistence | 615086c | AUTHORIZED |
| M09-M3 Application Services | 6778510 | AUTHORIZED |
| M09-M4 Authorization & Cross-Module Integration | c5136b6 | AUTHORIZED |
| M09-M5 APIs & Web/Mobile Integration | 2350e41 | AUTHORIZED |
| M09-M6 Production Hardening & Documentation | (pending) | AUTHORIZED |

---

## 3. Authorization Sign-off (D-09)

### 3.1 Permission Catalog Additions

| Permission ID | Resource | Action | Scope |
|---------------|----------|--------|-------|
| `payment.initiate` | `payment` | `CREATE` | Customer-identity-scoped |
| `payment.read` | `payment` | `READ` | Customer-identity-scoped |
| `payment.admin.read` | `payment.admin` | `READ` | Admin |
| `payment.admin.manage` | `payment.admin` | `MANAGE` | Admin |

### 3.2 Role-to-Permission Mappings

| Role | Permissions |
|------|-------------|
| CUSTOMER | payment.initiate, payment.read |
| ADMIN | payment.admin.read, payment.admin.manage |
| SUPER_ADMIN | payment.admin.read, payment.admin.manage |
| SELLER | (none) |

### 3.3 Module 02 Owner Sign-off

**RECORDED 2026-08-20.** The additive `payment.*` permission identifiers are approved by the Module 02 owner as non-weakening additions to the centralized permission catalog and role-to-permission matrix.

---

## 4. Security Audit Summary

| Check | Status |
|-------|--------|
| Fail-closed on all unknown/unavailable states | ✅ PASS |
| Webhook signature: HMAC-SHA256 + timing-safe comparison | ✅ PASS |
| Duplicate payment protection (findByOrderId + Idempotency-Key) | ✅ PASS |
| No client-supplied payment success accepted as authoritative | ✅ PASS |
| Customer access ownership/customer-identity scoped | ✅ PASS |
| Admin operations require explicit permissions | ✅ PASS |
| Provider secrets never exposed in error responses | ✅ PASS |
| Rate limits enforced (60/120/50 per hour, isolated buckets) | ✅ PASS |
| Optimistic concurrency via aggregateVersion | ✅ PASS |
| Append-only transitions and audit records | ✅ PASS |
| No cross-module FKs (A-03 storage isolation) | ✅ PASS |
| Forward-only additive migrations | ✅ PASS |
| No M00–M08 code modified | ✅ PASS |

---

## 5. Configuration Requirements

| Variable | Default | Description |
|----------|---------|-------------|
| `RAZORPAY_KEY_ID` | (required) | Razorpay API key ID |
| `RAZORPAY_KEY_SECRET` | (required) | Razorpay API key secret |
| `RAZORPAY_WEBHOOK_SECRET` | (required) | Razorpay webhook HMAC secret |
| `PAYMENT_RECORD_RETENTION_DAYS` | 365 | Retention period for payment records |

---

## 6. External Approvals Required

| Gate | Status | Date |
|------|--------|------|
| D-09 Module 02 authorization sign-off | RECORDED | 2026-08-20 |
| D-10 Security/Platform rate-limit confirmation | RECORDED | 2026-08-20 |
| D-11 retention durations | OWNER-RESOLVED | 2026-08-20 |

---

## 7. Module 09 Closure

All milestones (M09-M1 through M09-M6) are AUTHORIZED. All external gates are RECORDED. Module 09 is COMPLETE.

# WALRUS Enterprise Marketplace Platform

## Module 09 — Payments Formal Specification

**Document ID:** WEMP-M09-SPEC-001
**Version:** Review Draft 1.0
**Status:** OWNER-APPROVED — signed by the Product/Architecture Owner 2026-08-20.
**Effective date:** 2026-08-20
**Classification:** Confidential — Internal Use Only

---

## 1. Overview

Module 09 — Payments implements the payment lifecycle for the WALRUS Enterprise Marketplace Platform. It integrates with Razorpay as the payment gateway and coordinates with Module 08 (Orders) through the D-05 handoff boundary.

## 2. Domain Model

### 2.1 Payment Aggregate Root

- One Payment per order (D-02)
- Properties: paymentId, orderId, customerProfileId, state, amountCents, currency, provider, providerOrderId, providerPaymentId, idempotencyKey, aggregateVersion
- Logical UUIDv7 references only (A-03)

### 2.2 Payment Attempt

- Append-only entity tracking provider interactions
- Outcomes: INITIATED, SUCCESS, FAILED, TIMEOUT

### 2.3 Payment Refund

- Entity with refund lifecycle (PENDING → PROCESSING → REFUNDED | FAILED)
- Admin-initiated only (D-04)

## 3. Lifecycle State Machine (D-03)

```
PENDING → PROCESSING → CAPTURED → REFUND_PENDING → REFUNDED
    ↓          ↓           ↓            ↓
EXPIRED    FAILED       (terminal)    FAILED
```

Terminal states: FAILED, EXPIRED, REFUNDED
Non-terminal: CAPTURED (→ REFUND_PENDING)

## 4. APIs (D-05/D-06)

| Method | Path                              | Permission           | Description                |
| ------ | --------------------------------- | -------------------- | -------------------------- |
| POST   | /payments                         | payment.initiate     | Initiate payment for order |
| GET    | /payments/:paymentId              | payment.read         | Read own payment           |
| GET    | /payments/order/:orderId          | payment.read         | Read payment for order     |
| GET    | /admin/payments/:paymentId        | payment.admin.read   | Admin payment detail       |
| POST   | /admin/payments/:paymentId/refund | payment.admin.manage | Admin initiate refund      |
| POST   | /webhooks/payments/razorpay       | (signature)          | Razorpay webhook           |

## 5. Authorization (D-08/D-09)

| Permission           | Scope                    | Roles              |
| -------------------- | ------------------------ | ------------------ |
| payment.initiate     | Customer-identity-scoped | CUSTOMER           |
| payment.read         | Customer-identity-scoped | CUSTOMER           |
| payment.admin.read   | Admin                    | ADMIN, SUPER_ADMIN |
| payment.admin.manage | Admin                    | ADMIN, SUPER_ADMIN |

## 6. Security Requirements

- Webhook signature verification (HMAC-SHA256, D-06)
- Duplicate payment protection (D-07)
- Fail-closed on all unknown states
- No client-supplied payment success accepted
- Rate limits: 60/120/50 per hour (D-10)
- Optimistic concurrency (D-12)
- Append-only transitions and audit records

## 7. Configuration

- PAYMENT_RECORD_RETENTION_DAYS (default 365, D-11)
- RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET

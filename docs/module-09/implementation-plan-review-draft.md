# WALRUS Enterprise Marketplace Platform

## Module 09 — Payments Implementation Plan

**Document ID:** WEMP-M09-PLAN-001
**Version:** Review Draft 1.0
**Status:** OWNER-APPROVED — signed by the Product/Architecture Owner 2026-08-20.
**Effective date:** 2026-08-20
**Classification:** Confidential — Internal Use Only

---

## 1. Milestone Structure

| Milestone | Scope | Gate | Status |
|-----------|-------|------|--------|
| M09-M1 | Domain Foundation | D-02/D-03/D-13 | AUTHORIZED |
| M09-M2 | Persistence | D-07/D-11/D-12 | AUTHORIZED |
| M09-M3 | Application Services | D-01/D-04/D-05/D-06/D-07 | AUTHORIZED |
| M09-M4 | Authorization & Cross-Module Integration | D-08/D-09 | AUTHORIZED |
| M09-M5 | APIs & Web/Mobile Integration | D-10 | AUTHORIZED |
| M09-M6 | Production Hardening & Documentation | All | AUTHORIZED |

## 2. M09-M1 Domain Foundation

- Payment aggregate root (7-state lifecycle)
- PaymentAttempt, PaymentRefund entities
- PaymentStateTransition, PaymentAuditRecord append-only entities
- PaymentId, PaymentAttemptId, PaymentRefundId value objects
- PaymentLifecycle state machine policy
- PaymentDomainError (23 typed error codes)
- PaymentRepository, PaymentProviderPort, PaymentReadPort interfaces

## 3. M09-M2 Persistence

- Prisma schema: 3 enums, 5 tables, 11 indexes
- Forward-only additive migration
- 5 bidirectional domain↔Prisma mappers
- PrismaPaymentRepository (10 methods)
- PaymentRetentionPolicy + RecordedPaymentRetentionConfigurationAdapter
- PaymentModule wiring

## 4. M09-M3 Application Services

- PaymentApplicationService (5 operations)
- PaymentApplicationError (20 typed codes)
- Payment DTOs (commands, queries, results)
- Cross-module OrderReadPort/OrderWritePort adapters
- RazorpayPaymentProviderAdapter (fail-closed)

## 5. M09-M4 Authorization & Cross-Module Integration

- Payment permission catalog (4 permissions)
- Role-to-permission mappings (CUSTOMER, ADMIN, SUPER_ADMIN)
- PaymentAdminAuthorizationPort
- Module02PaymentAdminAuthorizationAdapter
- PaymentSelfServicePermissionGuard
- PaymentAdminPermissionGuard

## 6. M09-M5 APIs & Web/Mobile Integration

- PaymentSelfServiceController (3 endpoints)
- PaymentAdminController (2 endpoints)
- PaymentWebhookController (1 endpoint)
- Payment error mapping, correlation helper, HTTP DTOs
- Web PaymentApiClient + React provider
- Mobile read-only PaymentApiClient

## 7. M09-M6 Production Hardening & Documentation

- Security/fail-closed audit
- Payment lifecycle/state-machine verification
- Razorpay/provider integration security review
- Webhook signature/replay/idempotency verification
- Customer ownership/access verification
- Admin permission verification
- Rate-limit verification
- Configuration/environment validation
- Retention configuration verification
- Order/payment integration integrity verification
- Final documentation and decision-record updates

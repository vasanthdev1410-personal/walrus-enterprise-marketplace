import type {
  Payment as PaymentRow,
  PaymentAuditRecord as PaymentAuditRecordRow,
  PaymentAttempt as PaymentAttemptRow,
  PaymentRefund as PaymentRefundRow,
  PaymentStateTransition as PaymentStateTransitionRow,
  Prisma,
} from '../../../../../../generated/prisma/client';
import { AggregateVersion } from '../../../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { CorrelationIdentifier } from '../../../../../identity-authentication/domain/shared/value-objects/correlation-identifier';
import { UuidV7 } from '../../../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { compactProperties } from '../../../../../identity-authentication/infrastructure/persistence/prisma/mappers/compact-properties';
import { Payment } from '../../../../domain/entities/payment';
import { PaymentAuditRecord } from '../../../../domain/entities/payment-audit-record';
import { PaymentAttempt } from '../../../../domain/entities/payment-attempt';
import { PaymentRefund } from '../../../../domain/entities/payment-refund';
import { PaymentStateTransition } from '../../../../domain/entities/payment-state-transition';
import { PaymentId } from '../../../../domain/value-objects/payment-id';
import { PaymentRefundId } from '../../../../domain/value-objects/payment-refund-id';

/**
 * WEMP-M09-PLAN-001 M09-M2 persistence mappers. The shared platform
 * primitives (UuidV7, AggregateVersion, CorrelationIdentifier) and the
 * generic compactProperties helper are reused from the identity-authentication
 * module; Module 09 never reads Module 06/08 storage (A-05).
 *
 * Enum columns map directly because the domain unions use the identical
 * vocabulary; a malformed row fails closed through the domain constructor
 * (unknown enum/state values, invalid versions) rather than producing a
 * half-valid domain object.
 */
export const paymentMapper = {
  toDomain(record: PaymentRow): Payment {
    return new Payment(
      compactProperties({
        paymentId: new PaymentId(record.paymentId),
        orderId: new UuidV7(record.orderId),
        customerProfileId: new UuidV7(record.customerProfileId),
        state: record.state,
        amountCents: record.amountCents,
        currency: record.currency,
        provider: record.provider,
        providerOrderId: record.providerOrderId ?? undefined,
        providerPaymentId: record.providerPaymentId ?? undefined,
        idempotencyKey: record.idempotencyKey,
        aggregateVersion: new AggregateVersion(record.aggregateVersion),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        correlationId:
          record.correlationId === null
            ? undefined
            : new CorrelationIdentifier(record.correlationId),
      }),
    );
  },
  toPersistence(entity: Payment): Prisma.PaymentUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      paymentId: value.paymentId.value,
      orderId: value.orderId.value,
      customerProfileId: value.customerProfileId.value,
      state: value.state,
      amountCents: value.amountCents,
      currency: value.currency,
      provider: value.provider,
      providerOrderId: value.providerOrderId,
      providerPaymentId: value.providerPaymentId,
      idempotencyKey: value.idempotencyKey,
      aggregateVersion: value.aggregateVersion.value,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
      correlationId: value.correlationId?.value,
    });
  },
};

export const paymentAttemptMapper = {
  toDomain(record: PaymentAttemptRow): PaymentAttempt {
    return new PaymentAttempt(
      compactProperties({
        paymentAttemptId: new UuidV7(record.paymentAttemptId),
        paymentId: new UuidV7(record.paymentId),
        providerPaymentId: record.providerPaymentId ?? undefined,
        outcome: record.outcome,
        providerResponseDigest: record.providerResponseDigest ?? undefined,
        attemptedAt: record.attemptedAt,
        createdAt: record.createdAt,
      }),
    );
  },
  toPersistence(entity: PaymentAttempt): Prisma.PaymentAttemptUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      paymentAttemptId: value.paymentAttemptId.value,
      paymentId: value.paymentId.value,
      providerPaymentId: value.providerPaymentId,
      outcome: value.outcome,
      providerResponseDigest: value.providerResponseDigest,
      attemptedAt: value.attemptedAt,
      createdAt: value.createdAt,
    });
  },
};

export const paymentRefundMapper = {
  toDomain(record: PaymentRefundRow): PaymentRefund {
    return new PaymentRefund(
      compactProperties({
        paymentRefundId: new PaymentRefundId(record.paymentRefundId),
        paymentId: new UuidV7(record.paymentId),
        amountCents: record.amountCents,
        currency: record.currency,
        state: record.state,
        providerRefundId: record.providerRefundId ?? undefined,
        aggregateVersion: new AggregateVersion(record.aggregateVersion),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      }),
    );
  },
  toPersistence(entity: PaymentRefund): Prisma.PaymentRefundUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      paymentRefundId: value.paymentRefundId.value,
      paymentId: value.paymentId.value,
      amountCents: value.amountCents,
      currency: value.currency,
      state: value.state,
      providerRefundId: value.providerRefundId,
      aggregateVersion: value.aggregateVersion.value,
      createdAt: value.createdAt,
      updatedAt: value.updatedAt,
    });
  },
};

export const paymentStateTransitionMapper = {
  toDomain(record: PaymentStateTransitionRow): PaymentStateTransition {
    return new PaymentStateTransition(
      compactProperties({
        transitionId: new UuidV7(record.transitionId),
        paymentId: new UuidV7(record.paymentId),
        fromState: record.fromState,
        toState: record.toState,
        stateVersion: record.stateVersion,
        actorIdentityId: new UuidV7(record.actorIdentityId),
        actorKind: record.actorKind,
        reasonReference: record.reasonReference,
        correlationId:
          record.correlationId === null
            ? undefined
            : new CorrelationIdentifier(record.correlationId),
        causationId: record.causationId === null ? undefined : new UuidV7(record.causationId),
        sourceReference: record.sourceReference ?? undefined,
        transitionedAt: record.transitionedAt,
        createdAt: record.createdAt,
      }),
    );
  },
  toPersistence(entity: PaymentStateTransition): Prisma.PaymentStateTransitionUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      transitionId: value.transitionId.value,
      paymentId: value.paymentId.value,
      fromState: value.fromState,
      toState: value.toState,
      stateVersion: value.stateVersion,
      actorIdentityId: value.actorIdentityId.value,
      actorKind: value.actorKind,
      reasonReference: value.reasonReference,
      correlationId: value.correlationId?.value,
      causationId: value.causationId?.value,
      sourceReference: value.sourceReference,
      transitionedAt: value.transitionedAt,
      createdAt: value.createdAt,
    });
  },
};

export const paymentAuditRecordMapper = {
  toDomain(record: PaymentAuditRecordRow): PaymentAuditRecord {
    return new PaymentAuditRecord(
      compactProperties({
        auditEventId: new UuidV7(record.auditEventId),
        paymentId: new UuidV7(record.paymentId),
        orderId: new UuidV7(record.orderId),
        customerProfileId: new UuidV7(record.customerProfileId),
        eventType: record.eventType,
        actorIdentityId: new UuidV7(record.actorIdentityId),
        correlationId:
          record.correlationId === null
            ? undefined
            : new CorrelationIdentifier(record.correlationId),
        evidenceDigest: record.evidenceDigest ?? undefined,
        occurredAt: record.occurredAt,
        createdAt: record.createdAt,
      }),
    );
  },
  toPersistence(entity: PaymentAuditRecord): Prisma.PaymentAuditRecordUncheckedCreateInput {
    const value = entity.properties;
    return compactProperties({
      auditEventId: value.auditEventId.value,
      paymentId: value.paymentId.value,
      orderId: value.orderId.value,
      customerProfileId: value.customerProfileId.value,
      eventType: value.eventType,
      actorIdentityId: value.actorIdentityId.value,
      correlationId: value.correlationId?.value,
      evidenceDigest: value.evidenceDigest,
      occurredAt: value.occurredAt,
      createdAt: value.createdAt,
    });
  },
};

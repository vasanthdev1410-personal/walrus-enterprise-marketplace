/* eslint-disable @typescript-eslint/unbound-method */
import { AggregateVersion } from '../../../identity-authentication/domain/shared/value-objects/aggregate-version';
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { Payment } from '../../domain/entities/payment';
import { PaymentDomainError } from '../../domain/errors/payment-domain.error';
import { PaymentLifecycle } from '../../domain/lifecycle/payment-lifecycle';
import { PaymentId } from '../../domain/value-objects/payment-id';
import type { PaymentState } from '../../domain/value-objects/payment-state';
import { PaymentApplicationService } from './payment-application.service';
import type { PaymentRepository } from '../../domain/ports/payment-repository.port';
import type { PaymentProviderPort } from '../../domain/ports/payment-provider.port';
import type { OrderReadPort } from '../ports/order-read.port';
import type { OrderWritePort } from '../ports/order-write.port';
import type { ClockPort, UuidV7GenerationPort } from '../../../identity-authentication/application/ports/application-runtime.port';
import type { NonProductionRateLimiterPort } from '../../../identity-authentication/application/ports/non-production-rate-limiter.port';
import type { ApiIdempotencyService } from '../../../identity-authentication/application/services/api-idempotency.service';

function makeId(): UuidV7 {
  return new UuidV7('0192a000-1000-7000-8000-000000000001');
}

function makePaymentId(): PaymentId {
  return new PaymentId('0192a000-1000-7000-8000-000000000001');
}

function makePendingPayment(): Payment {
  return new Payment({
    paymentId: makePaymentId(),
    orderId: new UuidV7('0192a000-2000-7000-8000-000000000001'),
    customerProfileId: new UuidV7('0192a000-3000-7000-8000-000000000001'),
    state: 'PENDING',
    amountCents: 1000,
    currency: 'INR',
    provider: 'razorpay',
    providerOrderId: null,
    providerPaymentId: null,
    idempotencyKey: 'idem-key-001',
    aggregateVersion: new AggregateVersion(1),
    createdAt: new Date('2026-08-20T10:00:00Z'),
    updatedAt: new Date('2026-08-20T10:00:00Z'),
  });
}

function makeProcessingPayment(): Payment {
  return new Payment({
    paymentId: makePaymentId(),
    orderId: new UuidV7('0192a000-2000-7000-8000-000000000001'),
    customerProfileId: new UuidV7('0192a000-3000-7000-8000-000000000001'),
    state: 'PROCESSING',
    amountCents: 1000,
    currency: 'INR',
    provider: 'razorpay',
    providerOrderId: 'order_rzp_001',
    providerPaymentId: null,
    idempotencyKey: 'idem-key-001',
    aggregateVersion: new AggregateVersion(2),
    createdAt: new Date('2026-08-20T10:00:00Z'),
    updatedAt: new Date('2026-08-20T10:01:00Z'),
  });
}

function makeCapturedPayment(): Payment {
  return new Payment({
    paymentId: makePaymentId(),
    orderId: new UuidV7('0192a000-2000-7000-8000-000000000001'),
    customerProfileId: new UuidV7('0192a000-3000-7000-8000-000000000001'),
    state: 'CAPTURED',
    amountCents: 1000,
    currency: 'INR',
    provider: 'razorpay',
    providerOrderId: 'order_rzp_001',
    providerPaymentId: 'pay_rzp_001',
    idempotencyKey: 'idem-key-001',
    aggregateVersion: new AggregateVersion(3),
    createdAt: new Date('2026-08-20T10:00:00Z'),
    updatedAt: new Date('2026-08-20T10:02:00Z'),
  });
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function createMocks() {
  let idCounter = 0;
  const clock: ClockPort = { now: () => new Date('2026-08-20T10:00:00Z') };
  const identifiers: UuidV7GenerationPort = {
    next: () => {
      idCounter++;
      return new UuidV7(`0192a000-${String(idCounter).padStart(4, '0')}-7000-8000-000000000000`);
    },
  };
  const rateLimiter: jest.Mocked<NonProductionRateLimiterPort> = {
    consume: jest.fn().mockResolvedValue({ allowed: true, limit: 120, remaining: 119, resetAt: new Date() }),
  };
  const idempotency = {
    execute: async <T>(execution: { execute: () => Promise<T> }): Promise<T> => execution.execute(),
  } as unknown as ApiIdempotencyService;

  const repository: jest.Mocked<PaymentRepository> = {
    findById: jest.fn(),
    findByOrderId: jest.fn(),
    findByIdempotencyKey: jest.fn(),
    findByProviderOrderId: jest.fn(),
    findByProviderPaymentId: jest.fn(),
    findAttempts: jest.fn().mockResolvedValue([]),
    findTransitions: jest.fn().mockResolvedValue([]),
    findAuditRecords: jest.fn().mockResolvedValue([]),
    findRefunds: jest.fn().mockResolvedValue([]),
    insert: jest.fn().mockResolvedValue(undefined),
    save: jest.fn().mockResolvedValue(undefined),
  };

  const provider: jest.Mocked<PaymentProviderPort> = {
    createProviderOrder: jest.fn().mockResolvedValue({ providerOrderId: 'order_rzp_001' }),
    verifyWebhookSignature: jest.fn().mockReturnValue(true),
    parseWebhookEvent: jest.fn(),
    initiateRefund: jest.fn().mockResolvedValue({ providerRefundId: 'rfnd_001' }),
  };

  const orderRead: jest.Mocked<OrderReadPort> = {
    readOrderFacts: jest.fn().mockResolvedValue({
      orderId: new UuidV7('0192a000-2000-7000-8000-000000000001'),
      customerProfileId: new UuidV7('0192a000-3000-7000-8000-000000000001'),
      state: 'PENDING',
      subtotalAmountCents: 1000,
      subtotalCurrency: 'INR',
      aggregateVersion: 1,
    }),
  };

  const orderWrite: jest.Mocked<OrderWritePort> = {
    transitionOrder: jest.fn().mockResolvedValue(undefined),
  };

  const lifecycle = new PaymentLifecycle();

  const service = new PaymentApplicationService(
    repository, lifecycle, clock, identifiers, idempotency,
    rateLimiter, provider, orderRead, orderWrite,
  );

  return { service, repository, provider, orderRead, orderWrite, lifecycle, clock, identifiers, rateLimiter };
}

describe('PaymentApplicationService', () => {
  describe('initiatePayment', () => {
    it('creates a payment and transitions order PENDING to CONFIRMED', async () => {
      const { service, repository, provider, orderWrite } = createMocks();
      const orderId = new UuidV7('0192a000-2000-7000-8000-000000000001');
      const customerProfileId = new UuidV7('0192a000-3000-7000-8000-000000000001');

      repository.findByOrderId
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(makePendingPayment());
      repository.findById.mockResolvedValue(makeProcessingPayment());

      const result = await service.initiatePayment({
        customerProfileId, actorIdentityId: customerProfileId,
        orderId, idempotencyKey: 'idem-key-001',
      });

      expect(result.state).toBe('PROCESSING');
      expect(repository.insert).toHaveBeenCalledTimes(1);
      expect(repository.save).toHaveBeenCalledTimes(1);
      expect(provider.createProviderOrder).toHaveBeenCalledTimes(1);
      expect(orderWrite.transitionOrder).toHaveBeenCalledWith(
        expect.objectContaining({ orderId, toState: 'CONFIRMED', reasonReference: 'payment_initiated' }),
      );
    });

    it('rejects when order is not found', async () => {
      const { service, orderRead } = createMocks();
      orderRead.readOrderFacts.mockResolvedValue(null);

      await expect(service.initiatePayment({
        customerProfileId: makeId(), actorIdentityId: makeId(),
        orderId: makeId(), idempotencyKey: 'idem-key-002',
      })).rejects.toThrow('PAYMENT_ORDER_NOT_FOUND');
    });

    it('rejects when customer does not own the order', async () => {
      const { service, orderRead } = createMocks();
      orderRead.readOrderFacts.mockResolvedValue({
        orderId: makeId(),
        customerProfileId: new UuidV7('0192a000-3000-7000-8000-000000000001'),
        state: 'PENDING', subtotalAmountCents: 1000, subtotalCurrency: 'INR', aggregateVersion: 1,
      });

      await expect(service.initiatePayment({
        customerProfileId: new UuidV7('0192a000-9999-7000-8000-000000000001'),
        actorIdentityId: new UuidV7('0192a000-9999-7000-8000-000000000001'),
        orderId: makeId(), idempotencyKey: 'idem-key-003',
      })).rejects.toThrow('PAYMENT_OWNERSHIP_DENIED');
    });

    it('rejects when order is not PENDING', async () => {
      const { service, orderRead } = createMocks();
      orderRead.readOrderFacts.mockResolvedValue({
        orderId: makeId(),
        customerProfileId: new UuidV7('0192a000-3000-7000-8000-000000000001'),
        state: 'CONFIRMED', subtotalAmountCents: 1000, subtotalCurrency: 'INR', aggregateVersion: 2,
      });

      await expect(service.initiatePayment({
        customerProfileId: new UuidV7('0192a000-3000-7000-8000-000000000001'),
        actorIdentityId: new UuidV7('0192a000-3000-7000-8000-000000000001'),
        orderId: makeId(), idempotencyKey: 'idem-key-004',
      })).rejects.toThrow('PAYMENT_ORDER_NOT_PENDING');
    });

    it('rejects when a payment already exists for the order', async () => {
      const { service, repository } = createMocks();
      repository.findByOrderId.mockResolvedValue(makePendingPayment());

      await expect(service.initiatePayment({
        customerProfileId: new UuidV7('0192a000-3000-7000-8000-000000000001'),
        actorIdentityId: new UuidV7('0192a000-3000-7000-8000-000000000001'),
        orderId: makeId(), idempotencyKey: 'idem-key-005',
      })).rejects.toThrow('PAYMENT_DUPLICATE');
    });

    it('rejects when provider order creation fails', async () => {
      const { service, repository, provider } = createMocks();
      repository.findByOrderId.mockResolvedValue(null);
      provider.createProviderOrder.mockRejectedValue(new PaymentDomainError('PAYMENT_PROVIDER_ERROR'));

      await expect(service.initiatePayment({
        customerProfileId: new UuidV7('0192a000-3000-7000-8000-000000000001'),
        actorIdentityId: new UuidV7('0192a000-3000-7000-8000-000000000001'),
        orderId: makeId(), idempotencyKey: 'idem-key-006',
      })).rejects.toThrow('PAYMENT_PROVIDER_ERROR');
    });
  });

  describe('processWebhook', () => {
    it('processes payment.captured and transitions order to PAID', async () => {
      const { service, repository, provider, orderWrite } = createMocks();
      const processingPayment = makeProcessingPayment();

      provider.parseWebhookEvent.mockReturnValue({
        eventType: 'payment.captured',
        providerPaymentId: 'pay_rzp_001',
        providerOrderId: 'order_rzp_001',
        providerRefundId: null,
        amountCents: 1000,
        rawPayloadDigest: '',
      });

      repository.findByProviderOrderId.mockResolvedValue(processingPayment);
      repository.findById.mockResolvedValue(makeCapturedPayment());

      const result = await service.processWebhook({
        rawPayload: '{"event":"payment.captured"}',
        signatureHeader: 'valid_sig',
        actorIdentityId: makeId(),
      });

      expect(result.newState).toBe('CAPTURED');
      expect(result.orderTransitioned).toBe(true);
      expect(orderWrite.transitionOrder).toHaveBeenCalledWith(
        expect.objectContaining({ toState: 'PAID', reasonReference: 'webhook:payment.captured' }),
      );
    });

    it('processes payment.failed without transitioning order', async () => {
      const { service, repository, provider, orderWrite } = createMocks();
      const processingPayment = makeProcessingPayment();

      provider.parseWebhookEvent.mockReturnValue({
        eventType: 'payment.failed',
        providerPaymentId: 'pay_rzp_002',
        providerOrderId: 'order_rzp_001',
        providerRefundId: null,
        amountCents: 1000,
        rawPayloadDigest: '',
      });

      repository.findByProviderOrderId.mockResolvedValue(processingPayment);

      const failedPayment = new Payment({
        ...processingPayment.properties,
        state: 'FAILED' as PaymentState, // eslint-disable-line @typescript-eslint/no-unnecessary-type-assertion
        aggregateVersion: new AggregateVersion(3),
      });
      repository.findById.mockResolvedValue(failedPayment);

      const result = await service.processWebhook({
        rawPayload: '{"event":"payment.failed"}',
        signatureHeader: 'valid_sig',
        actorIdentityId: makeId(),
      });

      expect(result.newState).toBe('FAILED');
      expect(result.orderTransitioned).toBe(false);
      expect(orderWrite.transitionOrder).not.toHaveBeenCalled();
    });

    it('rejects when webhook signature is invalid', async () => {
      const { service, provider } = createMocks();
      provider.verifyWebhookSignature.mockReturnValue(false);

      await expect(service.processWebhook({
        rawPayload: '{"event":"payment.captured"}',
        signatureHeader: 'invalid_sig',
        actorIdentityId: makeId(),
      })).rejects.toThrow('PAYMENT_WEBHOOK_SIGNATURE_INVALID');
    });

    it('rejects when payment is not found', async () => {
      const { service, provider, repository } = createMocks();
      provider.parseWebhookEvent.mockReturnValue({
        eventType: 'payment.captured',
        providerPaymentId: 'pay_rzp_999',
        providerOrderId: 'order_rzp_999',
        providerRefundId: null,
        amountCents: 1000,
        rawPayloadDigest: '',
      });
      repository.findByProviderOrderId.mockResolvedValue(null);
      repository.findByProviderPaymentId.mockResolvedValue(null);

      await expect(service.processWebhook({
        rawPayload: '{"event":"payment.captured"}',
        signatureHeader: 'valid_sig',
        actorIdentityId: makeId(),
      })).rejects.toThrow('PAYMENT_NOT_FOUND');
    });

    it('rejects unrecognized event types', async () => {
      const { service, provider, repository } = createMocks();
      provider.parseWebhookEvent.mockReturnValue({
        eventType: 'unknown.event',
        providerPaymentId: 'pay_rzp_999',
        providerOrderId: 'order_rzp_999',
        providerRefundId: null, amountCents: null, rawPayloadDigest: '',
      });
      repository.findByProviderOrderId.mockResolvedValue(makeProcessingPayment());

      await expect(service.processWebhook({
        rawPayload: '{"event":"unknown.event"}',
        signatureHeader: 'valid_sig',
        actorIdentityId: makeId(),
      })).rejects.toThrow('PAYMENT_WEBHOOK_EVENT_UNRECOGNIZED');
    });
  });

  describe('initiateRefund', () => {
    it('transitions CAPTURED to REFUND_PENDING', async () => {
      const { service, repository } = createMocks();
      const capturedPayment = makeCapturedPayment();
      repository.findById.mockResolvedValue(capturedPayment);

      const result = await service.initiateRefund({
        actorIdentityId: makeId(),
        paymentId: capturedPayment.properties.paymentId,
        amountCents: 500,
        reasonReference: 'customer_request',
        idempotencyKey: 'idem-refund-001',
      });

      expect(result.state).toBe('REFUND_PENDING');
      expect(repository.save).toHaveBeenCalledTimes(1);
    });

    it('rejects when payment is not found', async () => {
      const { service, repository } = createMocks();
      repository.findById.mockResolvedValue(null);

      await expect(service.initiateRefund({
        actorIdentityId: makeId(), paymentId: makePaymentId(),
        amountCents: 500, reasonReference: 'customer_request',
        idempotencyKey: 'idem-refund-002',
      })).rejects.toThrow('PAYMENT_NOT_FOUND');
    });

    it('rejects when payment is not CAPTURED', async () => {
      const { service, repository } = createMocks();
      repository.findById.mockResolvedValue(makeProcessingPayment());

      await expect(service.initiateRefund({
        actorIdentityId: makeId(), paymentId: makePaymentId(),
        amountCents: 500, reasonReference: 'customer_request',
        idempotencyKey: 'idem-refund-003',
      })).rejects.toThrow('PAYMENT_REFUND_NOT_ALLOWED');
    });

    it('rejects when refund amount exceeds captured amount', async () => {
      const { service, repository } = createMocks();
      repository.findById.mockResolvedValue(makeCapturedPayment());

      await expect(service.initiateRefund({
        actorIdentityId: makeId(), paymentId: makePaymentId(),
        amountCents: 2000, reasonReference: 'customer_request',
        idempotencyKey: 'idem-refund-004',
      })).rejects.toThrow('PAYMENT_REFUND_EXCEEDS_CAPTURED');
    });
  });

  describe('readPayment', () => {
    it('returns payment with attempts and refunds', async () => {
      const { service, repository } = createMocks();
      repository.findById.mockResolvedValue(makePendingPayment());

      const result = await service.readPayment({
        paymentId: makePaymentId(), callerIdentityId: makeId(),
      });

      expect(result.paymentId).toBe(makePaymentId().value);
      expect(result.state).toBe('PENDING');
    });

    it('rejects when payment is not found', async () => {
      const { service, repository } = createMocks();
      repository.findById.mockResolvedValue(null);

      await expect(service.readPayment({
        paymentId: makePaymentId(), callerIdentityId: makeId(),
      })).rejects.toThrow('PAYMENT_NOT_FOUND');
    });
  });

  describe('readPaymentByOrder', () => {
    it('returns payment for an order', async () => {
      const { service, repository } = createMocks();
      repository.findByOrderId.mockResolvedValue(makePendingPayment());

      const result = await service.readPaymentByOrder({
        orderId: new UuidV7('0192a000-2000-7000-8000-000000000001'),
        callerIdentityId: makeId(),
      });

      expect(result.paymentId).toBe(makePaymentId().value);
    });

    it('rejects when no payment exists for the order', async () => {
      const { service, repository } = createMocks();
      repository.findByOrderId.mockResolvedValue(null);

      await expect(service.readPaymentByOrder({
        orderId: makeId(), callerIdentityId: makeId(),
      })).rejects.toThrow('PAYMENT_NOT_FOUND');
    });
  });

  describe('rate limiting', () => {
    it('rejects when rate limit is exceeded on mutate', async () => {
      const mocks = createMocks();
      mocks.rateLimiter.consume.mockResolvedValueOnce({
        allowed: false, limit: 120, remaining: 0, resetAt: new Date(),
      });

      await expect(mocks.service.initiatePayment({
        customerProfileId: makeId(), actorIdentityId: makeId(),
        orderId: makeId(), idempotencyKey: 'idem-key-rl-001',
      })).rejects.toThrow('PAYMENT_RATE_LIMITED');
    });

    it('rejects when rate limit is exceeded on read', async () => {
      const mocks = createMocks();
      mocks.rateLimiter.consume.mockResolvedValueOnce({
        allowed: false, limit: 60, remaining: 0, resetAt: new Date(),
      });

      await expect(mocks.service.readPayment({
        paymentId: makePaymentId(), callerIdentityId: makeId(),
      })).rejects.toThrow('PAYMENT_RATE_LIMITED');
    });
  });
});

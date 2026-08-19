import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import { OrderStateTransition } from './order-state-transition';

const TRANSITION_UUID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000001');
const ORDER_UUID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000002');
const ACTOR_UUID = new UuidV7('0192a1b2-c3d4-7000-8000-000000000003');

describe('OrderStateTransition', () => {
  it('creates a valid transition', () => {
    const transition = new OrderStateTransition({
      transitionId: TRANSITION_UUID,
      orderId: ORDER_UUID,
      fromState: 'PENDING',
      toState: 'CONFIRMED',
      stateVersion: 2,
      actorIdentityId: ACTOR_UUID,
      actorKind: 'SYSTEM',
      reasonReference: 'payment_initiated',
      transitionedAt: new Date('2026-08-19T12:00:00.000Z'),
      createdAt: new Date('2026-08-19T12:00:00.000Z'),
    });
    expect(transition.properties.fromState).toBe('PENDING');
    expect(transition.properties.toState).toBe('CONFIRMED');
    expect(transition.properties.stateVersion).toBe(2);
  });

  it('rejects same-state transition', () => {
    expect(
      () =>
        new OrderStateTransition({
          transitionId: TRANSITION_UUID,
          orderId: ORDER_UUID,
          fromState: 'PENDING',
          toState: 'PENDING',
          stateVersion: 2,
          actorIdentityId: ACTOR_UUID,
          actorKind: 'SYSTEM',
          reasonReference: '',
          transitionedAt: new Date('2026-08-19T12:00:00.000Z'),
          createdAt: new Date('2026-08-19T12:00:00.000Z'),
        }),
    ).toThrow('Order state transition fromState and toState must differ');
  });

  it('freezes the transition properties', () => {
    const transition = new OrderStateTransition({
      transitionId: TRANSITION_UUID,
      orderId: ORDER_UUID,
      fromState: 'PENDING',
      toState: 'CONFIRMED',
      stateVersion: 2,
      actorIdentityId: ACTOR_UUID,
      actorKind: 'SYSTEM',
      reasonReference: 'payment_initiated',
      transitionedAt: new Date('2026-08-19T12:00:00.000Z'),
      createdAt: new Date('2026-08-19T12:00:00.000Z'),
    });
    expect(Object.isFrozen(transition.properties)).toBe(true);
  });
});

/* eslint-disable @typescript-eslint/unbound-method */
import { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { AuthorizationApplicationService } from '../../application/services/authorization-application.service';
import type { IdentityRoleAssignmentRepository } from '../../domain/repositories/identity-role-assignment-repository';
import { HumanAuthorizationBoundaryV2Adapter } from './human-authorization-boundary-v2.adapter';

const ACTOR = new UuidV7('0191310f-789a-7123-8123-000000000001');
const TARGET = new UuidV7('0191310f-789a-7123-8123-000000000002');
const REQUESTER = new UuidV7('0191310f-789a-7123-8123-000000000003');

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function fixture(outcome = 'GRANTED', roles: string[][] = [['SUPER_ADMIN'], []]) {
  const authorization = {
    authorize: jest
      .fn()
      .mockResolvedValue({ properties: { outcome, authorizationReference: 'azr:1' } }),
  } as unknown as AuthorizationApplicationService;
  const assignments = {
    findActiveByIdentityId: jest
      .fn()
      .mockResolvedValueOnce(roles[0]?.map((roleName) => ({ properties: { roleName } })) ?? [])
      .mockResolvedValueOnce(roles[1]?.map((roleName) => ({ properties: { roleName } })) ?? []),
  } as unknown as IdentityRoleAssignmentRepository;
  return {
    adapter: new HumanAuthorizationBoundaryV2Adapter(authorization, assignments),
    authorization,
  };
}

describe('HumanAuthorizationBoundaryV2Adapter', () => {
  it.each([
    ['AAL1', 'session', ACTOR, TARGET, REQUESTER],
    ['AAL2', '', ACTOR, TARGET, REQUESTER],
    ['AAL2', 'session', ACTOR, ACTOR, REQUESTER],
    ['AAL2', 'session', ACTOR, TARGET, ACTOR],
  ])(
    'denies invalid recovery approver context',
    async (assurance, sessionId, approver, recovered, requester) => {
      const { adapter, authorization } = fixture();
      await expect(
        adapter.authorizeApprover({
          approverIdentityId: approver,
          recoveredIdentityId: recovered,
          requesterIdentityId: requester,
          recoveryRequestId: REQUESTER,
          operationClass: 'PASSWORD_RESET',
          recoveredClassification: 'STANDARD_AUTHENTICATION',
          assurance: assurance as never,
          sessionId,
        }),
      ).resolves.toEqual({ authorized: false });
      expect(authorization.authorize).not.toHaveBeenCalled();
    },
  );

  it('permits Admin for standard recovery and requires Super Admin for privileged recovery', async () => {
    const standard = fixture('GRANTED', [['ADMIN']]);
    await expect(
      standard.adapter.authorizeApprover({
        approverIdentityId: ACTOR,
        recoveredIdentityId: TARGET,
        requesterIdentityId: REQUESTER,
        recoveryRequestId: REQUESTER,
        operationClass: 'PASSWORD_RESET',
        recoveredClassification: 'STANDARD_AUTHENTICATION',
        assurance: 'AAL2',
        sessionId: 'session',
      }),
    ).resolves.toMatchObject({ authorized: true });
    const privileged = fixture('GRANTED', [['ADMIN']]);
    await expect(
      privileged.adapter.authorizeApprover({
        approverIdentityId: ACTOR,
        recoveredIdentityId: TARGET,
        requesterIdentityId: REQUESTER,
        recoveryRequestId: REQUESTER,
        operationClass: 'PRIVILEGED_ACCOUNT_RECOVERY',
        recoveredClassification: 'PRIVILEGED_ADMIN_AUTHENTICATION',
        assurance: 'AAL2',
        sessionId: 'session',
      }),
    ).resolves.toEqual({ authorized: false });
  });

  it('denies when the permission engine denies', async () => {
    const { adapter } = fixture('DENIED');
    await expect(
      adapter.authorizeApprover({
        approverIdentityId: ACTOR,
        recoveredIdentityId: TARGET,
        recoveryRequestId: REQUESTER,
        operationClass: 'PASSWORD_RESET',
        recoveredClassification: 'STANDARD_AUTHENTICATION',
        assurance: 'AAL2',
        sessionId: 'session',
      }),
    ).resolves.toEqual({ authorized: false });
  });

  it.each([
    ['AAL1', 'session', ACTOR, TARGET, 'ACTIVE'],
    ['AAL2', '', ACTOR, TARGET, 'ACTIVE'],
    ['AAL2', 'session', ACTOR, ACTOR, 'ACTIVE'],
    ['AAL2', 'session', ACTOR, TARGET, 'DELETED'],
  ])(
    'denies invalid identity state-change context',
    async (assurance, sessionId, actor, target, state) => {
      const { adapter } = fixture();
      await expect(
        adapter.authorizeStateChange({
          actorIdentityId: actor,
          targetIdentityId: target,
          targetIdentityState: state as 'ACTIVE' | 'DELETED',
          sourceContractReference: 'contract:1',
          targetClassification: 'STANDARD_AUTHENTICATION',
          assurance: assurance as never,
          sessionId,
        }),
      ).resolves.toEqual({ authorized: false });
    },
  );

  it('allows a Super Admin to manage a non-Super-Admin and never a Super Admin target', async () => {
    const permitted = fixture('GRANTED', [['SUPER_ADMIN'], []]);
    await expect(
      permitted.adapter.authorizeStateChange({
        actorIdentityId: ACTOR,
        targetIdentityId: TARGET,
        targetIdentityState: 'SUSPENDED',
        sourceContractReference: 'contract:1',
        targetClassification: 'STANDARD_AUTHENTICATION',
        assurance: 'AAL2',
        sessionId: 'session',
      }),
    ).resolves.toMatchObject({ authorized: true });
    const denied = fixture('GRANTED', [['SUPER_ADMIN'], ['SUPER_ADMIN']]);
    await expect(
      denied.adapter.authorizeStateChange({
        actorIdentityId: ACTOR,
        targetIdentityId: TARGET,
        targetIdentityState: 'SUSPENDED',
        sourceContractReference: 'contract:1',
        targetClassification: 'SUPER_ADMIN_AUTHENTICATION',
        assurance: 'AAL2',
        sessionId: 'session',
      }),
    ).resolves.toEqual({ authorized: false });
  });

  it('allows Admin only for a non-admin target in the approved state set', async () => {
    const permitted = fixture('GRANTED', [['ADMIN'], []]);
    await expect(
      permitted.adapter.authorizeStateChange({
        actorIdentityId: ACTOR,
        targetIdentityId: TARGET,
        targetIdentityState: 'LOCKED',
        sourceContractReference: 'contract:1',
        targetClassification: 'STANDARD_AUTHENTICATION',
        assurance: 'AAL2',
        sessionId: 'session',
      }),
    ).resolves.toMatchObject({ authorized: true });
    const denied = fixture('GRANTED', [['ADMIN'], ['ADMIN']]);
    await expect(
      denied.adapter.authorizeStateChange({
        actorIdentityId: ACTOR,
        targetIdentityId: TARGET,
        targetIdentityState: 'ACTIVE',
        sourceContractReference: 'contract:1',
        targetClassification: 'PRIVILEGED_ADMIN_AUTHENTICATION',
        assurance: 'AAL2',
        sessionId: 'session',
      }),
    ).resolves.toEqual({ authorized: false });
  });
});

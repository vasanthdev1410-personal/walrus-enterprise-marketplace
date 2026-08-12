import { TrustedBoundaryError } from '../errors/trusted-boundary.error';
import { createHash } from 'node:crypto';
import type {
  TrustedPeerCertificatePort,
  TrustedWorkloadKeyResolverPort,
  TrustedWorkloadReplayPort,
} from '../ports/trusted-workload.port';
import {
  loadTrustedJoseModule,
  TrustedWorkloadVerifierService,
} from './trusted-workload-verifier.service';

const NOW = new Date('2026-08-12T10:00:00.000Z');
const SUBJECT = 'spiffe://walrus/local/identity-classification-coordinator';
const THUMBPRINT = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const REQUEST = { targetIdentityId: '0191310f-789a-7123-8123-000000000001' };
const REQUEST_DIGEST = createHash('sha256')
  .update(JSON.stringify(REQUEST), 'utf8')
  .digest('base64url');
const JTI = '0191310f-789a-7123-8123-000000000010';
const OPERATION_ID = '0191310f-789a-7123-8123-000000000011';

describe('TrustedWorkloadVerifierService (WI-1)', () => {
  it('validates ES256 claims, certificate binding, request binding and consumes replay marker', async () => {
    const fixture = await createFixture();
    const result = await fixture.service.verify(fixture.command);
    expect(result.subject).toBe(SUBJECT);
    expect(result.operationId).toBe(OPERATION_ID);
    expect(fixture.consume).toHaveBeenCalledWith(expect.objectContaining({ jwtId: JTI }));
  });

  it('denies a replay without weakening signature verification', async () => {
    const fixture = await createFixture();
    fixture.consume.mockRejectedValue(new TrustedBoundaryError('WI_REPLAY'));
    await expect(fixture.service.verify(fixture.command)).rejects.toMatchObject({
      reasonCode: 'WI_REPLAY',
    });
  });

  it('denies a certificate-bound identity mismatch', async () => {
    const fixture = await createFixture();
    fixture.validate.mockResolvedValue({
      thumbprint: THUMBPRINT,
      uriSan: 'spiffe://walrus/local/wrong',
    });
    await expect(fixture.service.verify(fixture.command)).rejects.toMatchObject({
      reasonCode: 'WI_CLAIMS_INVALID',
    });
    expect(fixture.consume).not.toHaveBeenCalled();
  });

  it('denies an altered request payload', async () => {
    const fixture = await createFixture();
    await expect(
      fixture.service.verify({ ...fixture.command, canonicalRequestBody: { altered: true } }),
    ).rejects.toMatchObject({ reasonCode: 'WI_REQUEST_BINDING_MISMATCH' });
    expect(fixture.consume).not.toHaveBeenCalled();
  });
});

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
async function createFixture() {
  const { generateKeyPair, SignJWT } = await loadTrustedJoseModule();
  const { privateKey, publicKey } = await generateKeyPair('ES256');
  const assertion = await new SignJWT({
    version: 'walrus.workload.v1',
    environment: 'local',
    boundary: 'classification-transition',
    nonce: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    cnf: { 'x5t#S256': THUMBPRINT },
    requestBindingDigest: REQUEST_DIGEST,
    policyVersion: 'wemp.m02.m4.v1',
    contractVersion: 'wemp.m01-m02.authorization.v2',
    operationId: OPERATION_ID,
  })
    .setProtectedHeader({ alg: 'ES256', typ: 'JWT', kid: 'test-key' })
    .setIssuer('urn:walrus:workload-identity:local')
    .setSubject(SUBJECT)
    .setAudience('urn:walrus:module-02:authorization')
    .setIssuedAt(1786528800)
    .setNotBefore(1786528800)
    .setExpirationTime(1786529100)
    .setJti(JTI)
    .sign(privateKey);
  const resolveVerificationKey: TrustedWorkloadKeyResolverPort['resolveVerificationKey'] = jest
    .fn()
    .mockResolvedValue(publicKey);
  const isKeyRevoked = jest.fn().mockResolvedValue(false);
  const validate: jest.MockedFunction<TrustedPeerCertificatePort['validate']> = jest
    .fn()
    .mockResolvedValue({ thumbprint: THUMBPRINT, uriSan: SUBJECT });
  const consume: jest.MockedFunction<TrustedWorkloadReplayPort['consume']> = jest
    .fn()
    .mockResolvedValue(undefined);
  return {
    service: new TrustedWorkloadVerifierService(
      { resolveVerificationKey, isKeyRevoked },
      { validate },
      { consume },
    ),
    command: {
      compactAssertion: assertion,
      peerCertificateDer: new Uint8Array([1]),
      canonicalRequestBody: REQUEST,
      boundary: 'CLASSIFICATION_TRANSITION' as const,
      expectedEnvironment: 'local' as const,
      allowedSubjects: [SUBJECT],
      now: NOW,
    },
    validate,
    consume,
  };
}

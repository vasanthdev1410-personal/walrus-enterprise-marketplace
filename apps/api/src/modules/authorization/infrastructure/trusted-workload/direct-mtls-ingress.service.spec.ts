import { TLSSocket } from 'node:tls';
import type { Request } from 'express';
import type { TrustedWorkloadVerifierPort } from '../../application/ports/trusted-workload.port';
import { DirectMtlsIngressService } from './direct-mtls-ingress.service';

const configuration = {
  values: { APP_ENV: 'development' },
} as never;

function request(
  options: {
    readonly authorized?: boolean;
    readonly headers?: Readonly<Record<string, string>>;
  } = {},
): Request {
  const socket = Object.create(TLSSocket.prototype) as TLSSocket;
  Object.defineProperty(socket, 'authorized', { value: options.authorized ?? true });
  Object.defineProperty(socket, 'getPeerCertificate', {
    value: () => ({ raw: Buffer.from('certificate') }),
  });
  return { socket, headers: options.headers ?? {} } as unknown as Request;
}

describe('DirectMtlsIngressService', () => {
  const assertion = `e30.${Buffer.from(
    JSON.stringify({ operationId: '0191310f-789a-7000-8000-000000000001' }),
  ).toString('base64url')}.signature`;
  const verify: jest.MockedFunction<TrustedWorkloadVerifierPort['verify']> = jest.fn();
  const service = new DirectMtlsIngressService({ verify }, configuration);

  beforeEach(() => verify.mockReset());

  it('uses only an authorized native TLS peer and exact boundary allowlist', async () => {
    verify.mockResolvedValue({
      version: 'walrus.workload.v1',
      issuer: 'urn:walrus:workload-identity:development',
      audience: 'urn:walrus:module-02:authorization',
      subject: 'verified',
      environment: 'development',
      operationId: '0191310f-789a-7000-8000-000000000001',
      contractVersion: 'wemp.m01-m02.authorization.v2',
      requestDigest: 'digest',
      certificateThumbprint: 'thumbprint',
      issuedAt: new Date(),
      expiresAt: new Date(),
      jwtId: '0191310f-789a-7000-8000-000000000002',
      keyId: 'key',
      verificationReference: 'reference',
    });
    await expect(
      service.verify(
        request({ headers: { 'walrus-workload-assertion': assertion } }),
        'PRIVILEGED_PROVISIONING',
        { operationId: 'operation' },
      ),
    ).resolves.toMatchObject({ subject: 'verified' });
    expect(verify).toHaveBeenCalledWith(
      expect.objectContaining({
        compactAssertion: assertion,
        allowedSubjects: ['urn:walrus:service:privileged-provisioning-orchestrator'],
        expectedEnvironment: 'development',
      }),
    );
    expect(verify.mock.calls[0]?.[0].canonicalRequestBody).toMatchObject({
      operationId: '0191310f-789a-7000-8000-000000000001',
    });
  });

  it('fails closed for an unauthenticated TLS peer', async () => {
    await expect(
      service.verify(request({ authorized: false }), 'CONTROLLED_BOOTSTRAP', {}),
    ).rejects.toMatchObject({ reasonCode: 'MTLS_REQUIRED' });
    expect(verify).not.toHaveBeenCalled();
  });

  it.each(['x-client-cert', 'x-forwarded-client-cert', 'x-ssl-client-cert'])(
    'rejects spoofable certificate identity header %s',
    async (header) => {
      await expect(
        service.verify(request({ headers: { [header]: 'spoofed' } }), 'CONTROLLED_BOOTSTRAP', {}),
      ).rejects.toMatchObject({ reasonCode: 'TLS_IDENTITY_HEADER_FORBIDDEN' });
    },
  );

  it('rejects a missing WI-1 assertion and human-only boundaries', async () => {
    await expect(service.verify(request(), 'CLASSIFICATION_TRANSITION', {})).rejects.toMatchObject({
      reasonCode: 'WI_ASSERTION_MISSING',
    });
    await expect(
      service.verify(
        request({ headers: { 'walrus-workload-assertion': assertion } }),
        'RECOVERY_APPROVAL',
        {},
      ),
    ).rejects.toMatchObject({ reasonCode: 'WI_BOUNDARY_NOT_WORKLOAD_CONTROLLED' });
  });
});

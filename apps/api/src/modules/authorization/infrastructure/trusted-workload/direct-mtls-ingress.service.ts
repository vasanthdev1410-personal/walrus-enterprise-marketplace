import { Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { TLSSocket } from 'node:tls';
import { ConfigurationService } from '../../../../platform/configuration/configuration.service';
import type {
  M4Boundary,
  VerifiedWorkloadIdentityV1,
} from '../../application/contracts/trusted-boundary-v2';
import { TrustedBoundaryError } from '../../application/errors/trusted-boundary.error';
import type { TrustedWorkloadVerifierPort } from '../../application/ports/trusted-workload.port';
import { TRUSTED_WORKLOAD_VERIFIER } from '../../authorization.tokens';

const SUBJECTS: Readonly<Partial<Record<M4Boundary, readonly string[]>>> = {
  CLASSIFICATION_TRANSITION: ['urn:walrus:service:identity-classification-orchestrator'],
  PRIVILEGED_PROVISIONING: ['urn:walrus:service:privileged-provisioning-orchestrator'],
  CONTROLLED_BOOTSTRAP: ['urn:walrus:service:bootstrap-orchestrator'],
  IDENTITY_READINESS: ['urn:walrus:service:module-01-identity-readiness'],
};
const SPOOFABLE_CERTIFICATE_HEADERS = [
  'x-client-cert',
  'x-forwarded-client-cert',
  'x-ssl-client-cert',
  'ssl-client-cert',
] as const;

/** Infrastructure boundary that converts a native authenticated TLS peer into WI-1 context. */
@Injectable()
export class DirectMtlsIngressService {
  public constructor(
    @Inject(TRUSTED_WORKLOAD_VERIFIER) private readonly verifier: TrustedWorkloadVerifierPort,
    private readonly configuration: ConfigurationService,
  ) {}

  public async verify(
    request: Request,
    boundary: M4Boundary,
    canonicalRequestBinding: unknown,
  ): Promise<VerifiedWorkloadIdentityV1> {
    if (SPOOFABLE_CERTIFICATE_HEADERS.some((name) => request.headers[name] !== undefined)) {
      throw new TrustedBoundaryError('TLS_IDENTITY_HEADER_FORBIDDEN');
    }
    if (!(request.socket instanceof TLSSocket) || !request.socket.authorized) {
      throw new TrustedBoundaryError('MTLS_REQUIRED');
    }
    const socket = request.socket;
    const peer = socket.getPeerCertificate(true);
    if (peer.raw.length === 0) throw new TrustedBoundaryError('TLS_PEER_CERTIFICATE_MISSING');
    const assertion = request.headers['walrus-workload-assertion'];
    if (
      assertion === undefined ||
      Array.isArray(assertion) ||
      assertion.length === 0 ||
      assertion.includes(',')
    ) {
      throw new TrustedBoundaryError('WI_ASSERTION_MISSING');
    }
    const allowedSubjects = SUBJECTS[boundary];
    if (!allowedSubjects) throw new TrustedBoundaryError('WI_BOUNDARY_NOT_WORKLOAD_CONTROLLED');
    const environment = this.configuration.values.APP_ENV;
    if (environment === 'test') throw new TrustedBoundaryError('WI_ENVIRONMENT_INVALID');
    let operationId: unknown;
    try {
      const payload = assertion.split('.')[1];
      if (!payload) throw new Error();
      operationId = (
        JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>
      ).operationId;
    } catch {
      throw new TrustedBoundaryError('WI_ASSERTION_INVALID');
    }
    if (typeof operationId !== 'string') throw new TrustedBoundaryError('WI_ASSERTION_INVALID');
    const binding =
      typeof canonicalRequestBinding === 'object' && canonicalRequestBinding !== null
        ? {
            ...(canonicalRequestBinding as Readonly<Record<string, unknown>>),
            operationId,
            environment,
          }
        : canonicalRequestBinding;
    return this.verifier.verify({
      compactAssertion: assertion,
      peerCertificateDer: peer.raw,
      canonicalRequestBody: binding,
      boundary,
      expectedEnvironment: environment,
      allowedSubjects,
      now: new Date(),
    });
  }
}

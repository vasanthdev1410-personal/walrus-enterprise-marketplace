import { createHash, X509Certificate } from 'node:crypto';
import type { TrustedPeerCertificatePort } from '../../application/ports/trusted-workload.port';
import { TrustedBoundaryError } from '../../application/errors/trusted-boundary.error';

/** Validates the leaf identity already authenticated by Node's mTLS server. */
export class NativeTlsPeerCertificateAdapter implements TrustedPeerCertificatePort {
  public constructor(private readonly allowedSanSuffix?: string) {}

  public validate(input: {
    readonly certificateDer: Uint8Array;
    readonly environment: string;
    readonly now: Date;
  }): Promise<{ readonly thumbprint: string; readonly uriSan: string }> {
    let certificate: X509Certificate;
    try {
      certificate = new X509Certificate(input.certificateDer);
    } catch {
      throw new TrustedBoundaryError('TLS_CERTIFICATE_INVALID');
    }
    const validFrom = new Date(certificate.validFrom);
    const validTo = new Date(certificate.validTo);
    if (input.now < validFrom || input.now > validTo) {
      throw new TrustedBoundaryError('TLS_CERTIFICATE_EXPIRED');
    }
    const uriSans = (certificate.subjectAltName ?? '')
      .split(/,\s*/u)
      .filter((entry) => entry.startsWith('URI:'))
      .map((entry) => entry.slice(4));
    if (uriSans.length !== 1 || !uriSans[0]) {
      throw new TrustedBoundaryError('TLS_SAN_INVALID');
    }
    if (this.allowedSanSuffix && !uriSans[0].endsWith(this.allowedSanSuffix)) {
      throw new TrustedBoundaryError('TLS_ENVIRONMENT_BINDING_INVALID');
    }
    return Promise.resolve({
      uriSan: uriSans[0],
      thumbprint: createHash('sha256').update(certificate.raw).digest('base64url'),
    });
  }
}

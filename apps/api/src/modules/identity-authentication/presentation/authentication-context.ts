import type { Request } from 'express';
import type { VerifiedAccessTokenAuthenticationClaims } from '../application/ports/jwt-cryptographic.port';

export interface AuthenticatedRequest extends Request {
  authentication: VerifiedAccessTokenAuthenticationClaims;
}

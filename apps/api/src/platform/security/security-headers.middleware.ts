import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * Module 00 OWASP-aligned security header baseline (spec: "Security headers use
 * the Module 00 OWASP-aligned baseline"). Applied to every HTTP response.
 *
 * - `X-Content-Type-Options: nosniff` prevents MIME-sniffing attacks.
 * - `X-Frame-Options: DENY` blocks clickjacking of any served HTML surface.
 * - `Referrer-Policy: strict-origin-when-cross-origin` limits referrer leakage.
 * - `X-Permitted-Cross-Domain-Policies` rejects cross-domain policy documents.
 * - `Strict-Transport-Security` is emitted only over HTTPS connections.
 */
@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  public use(request: Request, response: Response, next: NextFunction): void {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
    if (request.secure) {
      response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  }
}

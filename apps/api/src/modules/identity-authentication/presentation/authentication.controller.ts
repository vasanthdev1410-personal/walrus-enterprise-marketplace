import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { CookieOptions, Request, Response } from 'express';
import { AuthenticationError } from '../application/errors/authentication.error';
import type {
  AuthenticationApplicationService,
  IssuedAuthenticationSession,
} from '../application/services/authentication-application.service';
import { UuidV7 } from '../domain/shared/value-objects/uuid-v7';
import { AUTHENTICATION_APPLICATION_SERVICE, CSRF_PROTECTION } from './authentication.tokens';
import {
  anonymousScope,
  assertIdempotencyKey,
  assertStrongEtag,
  currentCorrelationId,
  noStore,
  success,
} from './http-contract';
import {
  LoginRequestDto,
  MfaVerificationRequestDto,
  RefreshTokenRequestDto,
} from './dto/authentication.dto';
import type { CsrfProtectionPort } from './ports/csrf-protection.port';
import { API_IDEMPOTENCY } from '../identity-authentication.tokens';
import type { ApiIdempotencyService } from '../application/services/api-idempotency.service';
import { AuthoritativeSessionGuard } from './guards/authoritative-session.guard';
import { NonProductionRateLimiterGuard } from './guards/non-production-rate-limiter.guard';
import { BasicAuditInterceptor } from './interceptors/basic-audit.interceptor';
import type { AuthenticatedRequest } from './authentication-context';

const REFRESH_COOKIE = '__Secure-walrus_rt';
const CSRF_COOKIE = '__Host-walrus_csrf';

@ApiTags('Module 01 Authentication')
@Controller('auth')
@UseGuards(NonProductionRateLimiterGuard)
@UseInterceptors(BasicAuditInterceptor)
export class AuthenticationController {
  public constructor(
    @Inject(AUTHENTICATION_APPLICATION_SERVICE)
    private readonly authentication: AuthenticationApplicationService,
    @Inject(CSRF_PROTECTION) private readonly csrf: CsrfProtectionPort,
    @Inject(API_IDEMPOTENCY) private readonly idempotency: ApiIdempotencyService,
  ) {}

  @Post('login')
  @ApiOperation({ operationId: 'M01-AUTH-001', summary: 'Authenticate with a password' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async login(
    @Body() body: LoginRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    try {
      const result = await this.idempotency.execute({
        scope: anonymousScope(request),
        operationType: 'M01-AUTH-001',
        idempotencyKey,
        request: body,
        execute: () => this.authentication.login({
          identifierType: body.identifierType,
          identifier: body.identifier,
          password: body.password,
          clientType: body.clientType,
          ...(body.deviceSessionId === undefined
            ? {}
            : { deviceSessionId: new UuidV7(body.deviceSessionId) }),
        }),
      });
      noStore(response);
      if (result.authenticationOutcome === 'MFA_REQUIRED') {
        response.status(HttpStatus.ACCEPTED).json(
          success({
            authenticationOutcome: result.authenticationOutcome,
            mfaChallenge: { challengeId: result.mfaChallengeId, version: result.challengeVersion },
          }),
        );
        return;
      }
      this.deliverSession(response, body.clientType, result);
    } catch (error) {
      translateAuthenticationError(error);
    }
  }

  @Post('mfa-challenges/:challengeId/verification')
  @ApiOperation({ operationId: 'M01-AUTH-002', summary: 'Complete an MFA login challenge' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiHeader({ name: 'If-Match', required: true })
  public async verifyMfa(
    @Param('challengeId') challengeId: string,
    @Body() body: MfaVerificationRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    const parsedId = new UuidV7(challengeId);
    assertStrongEtag(ifMatch, `mfa-challenge:${parsedId.value}`);
    try {
      const result = await this.idempotency.execute({
        scope: anonymousScope(request),
        operationType: 'M01-AUTH-002',
        idempotencyKey,
        request: {
          challengeId,
          ifMatch,
          verificationEvidence: body.verificationEvidence,
          clientType: body.clientType,
          deviceSessionId: body.deviceSessionId,
        },
        execute: () => this.authentication.completeMfaLogin({
          challengeId: parsedId,
          evidence: body.verificationEvidence,
          clientType: body.clientType,
          ...(body.deviceSessionId === undefined
            ? {}
            : { deviceSessionId: new UuidV7(body.deviceSessionId) }),
        }),
      });
      noStore(response);
      this.deliverSession(response, body.clientType, result);
    } catch (error) {
      translateAuthenticationError(error);
    }
  }

  @Post('token/refresh')
  @ApiOperation({ operationId: 'M01-AUTH-003', summary: 'Rotate a Refresh Token' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async refresh(
    @Body() body: RefreshTokenRequestDto,
    @Headers('cookie') cookieHeader: string | undefined,
    @Headers('x-csrf-token') csrfHeader: string | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    const cookies = parseCookies(cookieHeader);
    const cookieRefreshToken = cookies.get(REFRESH_COOKIE);
    if (cookieRefreshToken !== undefined && body.refreshToken !== undefined) {
      throw new BadRequestException('Exactly one Refresh Token transport is required');
    }
    const isWeb = cookieRefreshToken !== undefined;
    const refreshToken = cookieRefreshToken ?? body.refreshToken;
    if (refreshToken === undefined) throw new UnauthorizedException('REFRESH_TOKEN_INVALID');
    if (isWeb) {
      const csrfCookie = cookies.get(CSRF_COOKIE);
      if (
        csrfCookie === undefined ||
        csrfHeader === undefined ||
        !this.csrf.verify({ cookieToken: csrfCookie, headerToken: csrfHeader })
      ) {
        throw new UnauthorizedException('CSRF_VALIDATION_FAILED');
      }
    }
    try {
      const result = await this.idempotency.execute({
        scope: anonymousScope(request),
        operationType: 'M01-AUTH-003',
        idempotencyKey,
        request: { refreshToken, transport: isWeb ? 'WEB_COOKIE' : 'MOBILE_BODY' },
        execute: () => this.authentication.refresh(refreshToken),
      });
      noStore(response);
      this.deliverSession(response, isWeb ? 'WEB' : 'MOBILE', result);
    } catch (error) {
      translateAuthenticationError(error);
    }
  }

  @Post('logout')
  @UseGuards(AuthoritativeSessionGuard)
  @ApiOperation({ operationId: 'M01-AUTH-004', summary: 'Revoke the current Session' })
  @ApiHeader({ name: 'Authorization', required: true })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiHeader({ name: 'If-Match', required: true })
  public async logout(
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('cookie') cookieHeader: string | undefined,
    @Headers('x-csrf-token') csrfHeader: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    const claims = request.authentication;
    assertStrongEtag(ifMatch, `session:${claims.sessionId}`);
    this.assertWebCsrf(cookieHeader, csrfHeader);
    await this.idempotency.execute({
      scope: `identity:${claims.subject}`,
      operationType: 'M01-AUTH-004',
      idempotencyKey,
      request: { sessionId: claims.sessionId, sessionVersion: claims.sessionVersion },
      execute: async () => {
        await this.authentication.logout(
          new UuidV7(claims.subject),
          new UuidV7(claims.sessionId),
          claims.sessionVersion,
        );
        return { committed: true };
      },
    });
    noStore(response);
    clearAuthenticationCookies(response);
    response.status(HttpStatus.NO_CONTENT).send();
  }

  @Post('logout-all')
  @UseGuards(AuthoritativeSessionGuard)
  @ApiOperation({ operationId: 'M01-AUTH-005', summary: 'Revoke every active Session' })
  @ApiHeader({ name: 'Authorization', required: true })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiHeader({ name: 'If-Match', required: true })
  public async logoutAll(
    @Req() request: AuthenticatedRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('if-match') ifMatch: string | undefined,
    @Headers('cookie') cookieHeader: string | undefined,
    @Headers('x-csrf-token') csrfHeader: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    const claims = request.authentication;
    assertStrongEtag(ifMatch, `session:${claims.sessionId}`);
    this.assertWebCsrf(cookieHeader, csrfHeader);
    const result = await this.idempotency.execute({
      scope: `identity:${claims.subject}`,
      operationType: 'M01-AUTH-005',
      idempotencyKey,
      request: { identityId: claims.subject, sessionVersion: claims.sessionVersion },
      execute: async () => ({
        operationId: currentCorrelationId() ?? idempotencyKey,
        accepted: (await this.authentication.logoutAll(
          new UuidV7(claims.subject),
          new UuidV7(claims.sessionId),
          claims.sessionVersion,
        )) >= 1,
      }),
    });
    noStore(response);
    clearAuthenticationCookies(response);
    response.status(HttpStatus.ACCEPTED).json(success(result));
  }

  private assertWebCsrf(cookieHeader: string | undefined, csrfHeader: string | undefined): void {
    const cookies = parseCookies(cookieHeader);
    if (!cookies.has(REFRESH_COOKIE)) return;
    const csrfCookie = cookies.get(CSRF_COOKIE);
    if (csrfCookie === undefined || csrfHeader === undefined ||
      !this.csrf.verify({ cookieToken: csrfCookie, headerToken: csrfHeader })) {
      throw new UnauthorizedException('CSRF_VALIDATION_FAILED');
    }
  }

  private deliverSession(
    response: Response,
    clientType: 'WEB' | 'MOBILE',
    result: IssuedAuthenticationSession,
  ): void {
    if (clientType === 'WEB') {
      response.cookie(REFRESH_COOKIE, result.refreshToken, refreshCookieOptions());
      const csrfToken = this.csrf.issue();
      response.cookie(CSRF_COOKIE, csrfToken, csrfCookieOptions());
    }
    response.status(HttpStatus.OK).json(
      success({
        authenticationOutcome: 'COMPLETED',
        accessToken: result.accessToken,
        expiresIn: result.accessTokenExpiresIn,
        sessionId: result.sessionId,
        sessionVersion: result.sessionVersion,
        aal: result.authenticationAssurance,
        ...(clientType === 'MOBILE' ? { refreshToken: result.refreshToken } : {}),
      }),
    );
  }
}

function translateAuthenticationError(error: unknown): never {
  if (error instanceof AuthenticationError) throw new UnauthorizedException(error.code);
  throw error;
}

function parseCookies(header: string | undefined): ReadonlyMap<string, string> {
  const values = new Map<string, string>();
  for (const item of header?.split(';') ?? []) {
    const separator = item.indexOf('=');
    if (separator > 0)
      values.set(item.slice(0, separator).trim(), item.slice(separator + 1).trim());
  }
  return values;
}

function refreshCookieOptions(): CookieOptions {
  return { secure: true, httpOnly: true, sameSite: 'strict' as const, path: '/api/v1/auth' };
}

function csrfCookieOptions(): CookieOptions {
  return { secure: true, httpOnly: false, sameSite: 'strict' as const, path: '/' };
}

function clearAuthenticationCookies(response: Response): void {
  response.clearCookie(REFRESH_COOKIE, refreshCookieOptions());
  response.clearCookie(CSRF_COOKIE, csrfCookieOptions());
}

import {
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  PreconditionFailedException,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { createHash } from 'node:crypto';
import type { Response } from 'express';
import { TrustedDeviceError } from '../application/errors/trusted-device.error';
import type { ApiIdempotencyService } from '../application/services/api-idempotency.service';
import type { TrustedDeviceManagementApplicationService } from '../application/services/trusted-device-management-application.service';
import type { TrustedDevice } from '../domain/identity/entities/trusted-device';
import type { ProtectedValue } from '../domain/shared/value-objects/protected-value';
import { UuidV7 } from '../domain/shared/value-objects/uuid-v7';
import { API_IDEMPOTENCY } from '../identity-authentication.tokens';
import type { AuthenticatedRequest } from './authentication-context';
import { TRUSTED_DEVICE_MANAGEMENT_APPLICATION_SERVICE } from './authentication.tokens';
import { AuthoritativeSessionGuard } from './guards/authoritative-session.guard';
import { NonProductionRateLimiterGuard } from './guards/non-production-rate-limiter.guard';
import { assertIdempotencyKey, etagVersion, noStore, success } from './http-contract';
import { BasicAuditInterceptor } from './interceptors/basic-audit.interceptor';
import { RateLimit } from './decorators/rate-limit.decorator';

@ApiTags('Module 01 Trusted Devices')
@Controller('trusted-devices')
@UseGuards(NonProductionRateLimiterGuard)
@UseInterceptors(BasicAuditInterceptor)
export class TrustedDevicesController {
  public constructor(
    @Inject(TRUSTED_DEVICE_MANAGEMENT_APPLICATION_SERVICE)
    private readonly devices: TrustedDeviceManagementApplicationService,
    @Inject(API_IDEMPOTENCY) private readonly idempotency: ApiIdempotencyService,
  ) {}

  /**
   * M01-DEV-001. Lists the identity's trusted devices. The subject is taken
   * from the server-validated ordinary session, so only own devices are ever
   * returned. Each item exposes only safe fields: the protected device
   * fingerprint is never returned; safeDeviceSummary carries a one-way
   * non-sensitive digest reference only. Device trust never replaces MFA.
   */
  @Get()
  @RateLimit({ limit: 30, windowSeconds: 60 })
  @UseGuards(AuthoritativeSessionGuard)
  @ApiOperation({ operationId: 'M01-DEV-001', summary: 'List trusted devices' })
  public async listDevices(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<Readonly<Record<string, unknown>>> {
    try {
      const devices = await this.devices.listDevices({
        identityId: new UuidV7(request.authentication.subject),
      });
      noStore(response);
      return success({
        devices: devices.map(toDeviceView),
        count: devices.length,
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * M01-DEV-002. Revokes one owned trusted device. The device version travels
   * in If-Match and guards the write; revocation is idempotent (a revoked or
   * blocked device returns success without being altered) and never restores
   * trust. Stable errors: 404 RESOURCE_NOT_AVAILABLE for unknown or foreign
   * devices, 412 RESOURCE_STATE_CONFLICT for a stale version precondition.
   */
  @Delete(':trustedDeviceId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit({ limit: 10, windowSeconds: 60 })
  @UseGuards(AuthoritativeSessionGuard)
  @ApiOperation({ operationId: 'M01-DEV-002', summary: 'Revoke a trusted device' })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiHeader({ name: 'If-Match', required: true })
  public async revokeDevice(
    @Param('trustedDeviceId') trustedDeviceId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Headers('if-match') ifMatch: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    const deviceIdValue = parseDeviceId(trustedDeviceId);
    const expectedDeviceVersion = etagVersion(ifMatch, `trusted-device:${deviceIdValue.value}`);
    const claims = request.authentication;
    try {
      await this.idempotency.execute({
        // The device is the revocation subject; the idempotency scope is bound
        // to it so a key cannot be replayed across devices. The fingerprint
        // carries only the locator and version precondition.
        scope: `trusted-device:${deviceIdValue.value}`,
        operationType: 'M01-DEV-002',
        idempotencyKey,
        request: { trustedDeviceId, ifMatch },
        execute: () =>
          this.devices.revokeDevice({
            identityId: new UuidV7(claims.subject),
            trustedDeviceId: deviceIdValue,
            expectedDeviceVersion,
          }),
      });
      noStore(response);
      response.status(HttpStatus.NO_CONTENT).send();
    } catch (error) {
      this.handleError(error);
    }
  }

  private handleError(error: unknown): never {
    if (error instanceof TrustedDeviceError) {
      switch (error.code) {
        case 'RESOURCE_STATE_CONFLICT':
          throw new PreconditionFailedException(error.code);
        case 'RESOURCE_NOT_AVAILABLE':
        default:
          throw new NotFoundException(error.code);
      }
    }
    throw error;
  }
}

function parseDeviceId(value: string): UuidV7 {
  try {
    return new UuidV7(value);
  } catch {
    // A malformed locator is indistinguishable from an unknown device, so the
    // response stays uniform and device state is never enumerable.
    throw new NotFoundException('RESOURCE_NOT_AVAILABLE');
  }
}

function toDeviceView(device: TrustedDevice): Readonly<Record<string, unknown>> {
  const properties = device.properties;
  return {
    trustedDeviceId: properties.trustedDeviceId.value,
    safeDeviceSummary: {
      // A one-way non-sensitive digest reference derived from the protected
      // fingerprint; the protected fingerprint itself is never exposed.
      deviceReference: safeDeviceReference(properties.protectedDeviceFingerprint),
    },
    state: properties.deviceState,
    createdAt: properties.createdAt.toISOString(),
    lastSeenAt: properties.lastSeenAt === undefined ? null : properties.lastSeenAt.toISOString(),
    trustExpiresAt: properties.trustExpiresAt.toISOString(),
    // Phase 1 has no device-registration milestone, so no server-side link
    // exists between the current Session's deviceSessionId and a Trusted
    // Device record; the flag stays false until an approved registration flow
    // establishes that binding.
    currentDevice: false,
    version: properties.aggregateVersion.value,
  };
}

function safeDeviceReference(fingerprint: ProtectedValue): string {
  return createHash('sha256').update(fingerprint.value).digest('hex').slice(0, 12);
}

import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { UuidV7 } from '../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type { AuthenticatedRequest } from '../../identity-authentication/presentation/authentication-context';
import { Aal2SessionGuard } from '../../identity-authentication/presentation/guards/aal2-session.guard';
import { NonProductionRateLimiterGuard } from '../../identity-authentication/presentation/guards/non-production-rate-limiter.guard';
import { RateLimit } from '../../identity-authentication/presentation/decorators/rate-limit.decorator';
import {
  assertIdempotencyKey,
  noStore,
  success,
} from '../../identity-authentication/presentation/http-contract';
import {
  AuthorizationPermissionGuard,
  RequiresPermission,
} from '../../authorization/presentation/guards/authorization-permission.guard';
import type { CustomerAdminReadApplicationService } from '../application/services/customer-admin-read-application.service';
import type { CustomerLifecycleApplicationService } from '../application/services/customer-lifecycle-application.service';
import {
  CUSTOMER_ADMIN_READ_APPLICATION_SERVICE,
  CUSTOMER_LIFECYCLE_APPLICATION_SERVICE,
} from '../customer.tokens';
import { correlationField } from './correlation';
import { CustomerLifecycleActionDto } from './dto/customer.dto';
import { mapCustomerError } from './customer-error-mapping';

/**
 * WEMP-M06-SPEC-001 §14/§17 (M06-M5, decision D-07). Admin customer API.
 *
 * Authorization model (WEMP-M06-AUTHZ-001 §2.2): every route requires an
 * ordinary AAL2 session AND the exact approved Module 02 administrative
 * permission via AuthorizationPermissionGuard — customer.read for the
 * list/detail, customer.lifecycle.manage for lifecycle actions, and
 * customer.audit.view for the audit trail. There is no role-only bypass and
 * no hidden SUPER_ADMIN implicit grant: access is decided by the Module 02
 * engine against the approved role catalog, and the application services
 * re-check the grant (defense in depth). A lifecycle action requires a
 * mandatory reason reference (D-02) and an Idempotency-Key (A-09); rate
 * limits follow the recorded D-10 admin class (50/hour). Unknown customer
 * references and missing profiles are indistinguishable (404 — anti
 * enumeration); errors never disclose customer or policy internals.
 */
@ApiTags('Admin Customer')
@Controller('admin/customers')
@UseGuards(Aal2SessionGuard, NonProductionRateLimiterGuard)
export class AdminCustomerController {
  public constructor(
    @Inject(CUSTOMER_ADMIN_READ_APPLICATION_SERVICE)
    private readonly read: CustomerAdminReadApplicationService,
    @Inject(CUSTOMER_LIFECYCLE_APPLICATION_SERVICE)
    private readonly lifecycle: CustomerLifecycleApplicationService,
  ) {}

  @Get()
  @UseGuards(AuthorizationPermissionGuard)
  @RequiresPermission('customer.read')
  @ApiOperation({
    operationId: 'M06-ADMIN-CUSTOMERS-LIST',
    summary: 'Non-enumerating admin customer list (customer.read)',
  })
  public async listCustomers(
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const customers = await this.read.listCustomers(new UuidV7(request.authentication.subject));
      noStore(response);
      response.status(HttpStatus.OK).json(success({ customers }));
    } catch (error) {
      mapCustomerError(error);
    }
  }

  @Get(':customerProfileId')
  @UseGuards(AuthorizationPermissionGuard)
  @RequiresPermission('customer.read')
  @ApiOperation({
    operationId: 'M06-ADMIN-CUSTOMER-DETAIL',
    summary: 'Customer detail + append-only audit episodes and transitions',
  })
  public async customerDetail(
    @Param('customerProfileId') customerProfileId: string,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const customer = await this.read.getCustomerDetail(
        new UuidV7(request.authentication.subject),
        parseCustomerParam(customerProfileId),
      );
      noStore(response);
      response.status(HttpStatus.OK).json(success({ customer }));
    } catch (error) {
      mapCustomerError(error);
    }
  }

  @Post(':customerProfileId/lifecycle')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 50, windowSeconds: 3600 })
  @UseGuards(AuthorizationPermissionGuard)
  @RequiresPermission('customer.lifecycle.manage')
  @ApiOperation({
    operationId: 'M06-ADMIN-CUSTOMER-LIFECYCLE',
    summary: 'Suspend / reinstate / close a customer (mandatory reason, version-checked)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async applyLifecycleAction(
    @Param('customerProfileId') customerProfileId: string,
    @Body() body: CustomerLifecycleActionDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    const command = {
      customerProfileId: parseCustomerParam(customerProfileId),
      actorIdentityId: new UuidV7(request.authentication.subject),
      expectedVersion: body.expectedVersion,
      reasonReference: body.reasonReference,
      idempotencyKey,
      ...correlationField(),
    };
    try {
      const customer =
        body.action === 'SUSPEND'
          ? await this.lifecycle.suspendCustomer(command)
          : body.action === 'REACTIVATE'
            ? await this.lifecycle.reactivateCustomer(command)
            : await this.lifecycle.closeCustomer(command);
      noStore(response);
      response.status(HttpStatus.OK).json(success({ customer }));
    } catch (error) {
      mapCustomerError(error);
    }
  }

  @Get(':customerProfileId/audit')
  @UseGuards(AuthorizationPermissionGuard)
  @RequiresPermission('customer.audit.view')
  @ApiOperation({
    operationId: 'M06-ADMIN-CUSTOMER-AUDIT',
    summary: 'Customer audit trail (append-only, no raw PII, D-08)',
  })
  public async auditTrail(
    @Param('customerProfileId') customerProfileId: string,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const audit = await this.read.getAuditTrail(
        new UuidV7(request.authentication.subject),
        parseCustomerParam(customerProfileId),
      );
      noStore(response);
      response.status(HttpStatus.OK).json(success({ audit }));
    } catch (error) {
      mapCustomerError(error);
    }
  }
}

/** Validates the `:customerProfileId` path parameter is a well-formed UUIDv7 (404 otherwise). */
function parseCustomerParam(value: string): UuidV7 {
  try {
    return new UuidV7(value);
  } catch {
    throw new NotFoundException('CUSTOMER_NOT_FOUND');
  }
}

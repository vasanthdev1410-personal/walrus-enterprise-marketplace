import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Patch,
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
import { RequiresPermission } from '../../authorization/presentation/guards/authorization-permission.guard';
import type { CustomerAddressApplicationService } from '../application/services/customer-address-application.service';
import type { CustomerBusinessProfileApplicationService } from '../application/services/customer-business-profile-application.service';
import type { CustomerPreferenceApplicationService } from '../application/services/customer-preference-application.service';
import type { CustomerProfileApplicationService } from '../application/services/customer-profile-application.service';
import {
  CUSTOMER_ADDRESS_APPLICATION_SERVICE,
  CUSTOMER_BUSINESS_PROFILE_APPLICATION_SERVICE,
  CUSTOMER_PREFERENCE_APPLICATION_SERVICE,
  CUSTOMER_PROFILE_APPLICATION_SERVICE,
} from '../customer.tokens';
import { correlationField } from './correlation';
import {
  CreateCustomerAddressDto,
  CustomerBusinessProfilePatchDto,
  CustomerPreferencePatchDto,
  CustomerProfileUpdateDto,
  RemoveCustomerAddressDto,
  UpdateCustomerAddressDto,
  registrationLookupDigest,
} from './dto/customer.dto';
import { mapCustomerError } from './customer-error-mapping';
import {
  CustomerSelfServicePermissionGuard,
  type CustomerScopedRequest,
} from './guards/customer-self-service-permission.guard';

/**
 * WEMP-M06-SPEC-001 §14/§17 (M06-M5, decisions D-01..D-06/D-07/D-10/D-11).
 * Customer self-service API.
 *
 * Authorization model (WEMP-M06-AUTHZ-001 §4, decision D-07): every route
 * requires an ordinary AAL2 session AND the exact approved Module 02
 * self-service permission via CustomerSelfServicePermissionGuard, which
 * resolves the caller's OWN profile server-side from the authenticated
 * identity (never from a client-supplied customerProfileId) and evaluates the
 * permission through the Module 02 engine with the customer-identity scope
 * (fourth ownership resolver). A caller without a profile, a CLOSED profile,
 * or a denied decision is indistinguishable and denied. The application
 * services additionally re-check ownership and the lifecycle gate — defense
 * in depth; no customer can ever read or mutate another customer's data
 * (M06-R03).
 *
 * Every mutation requires an Idempotency-Key header (reusing Module 01
 * ApiIdempotencyRecord). Rate limits follow the recorded D-10 policy
 * (self reads 60/hour, self mutations 30/hour — enforced inside the
 * application services; the guard's class-level limiter provides the coarse
 * per-route net). Errors are non-enumerating and never disclose customer,
 * address, preference, or ownership internals.
 */
@ApiTags('Customer Self-Service')
@Controller('customer')
@UseGuards(Aal2SessionGuard, NonProductionRateLimiterGuard)
export class CustomerSelfServiceController {
  public constructor(
    @Inject(CUSTOMER_PROFILE_APPLICATION_SERVICE)
    private readonly profile: CustomerProfileApplicationService,
    @Inject(CUSTOMER_ADDRESS_APPLICATION_SERVICE)
    private readonly addresses: CustomerAddressApplicationService,
    @Inject(CUSTOMER_BUSINESS_PROFILE_APPLICATION_SERVICE)
    private readonly business: CustomerBusinessProfileApplicationService,
    @Inject(CUSTOMER_PREFERENCE_APPLICATION_SERVICE)
    private readonly preferences: CustomerPreferenceApplicationService,
  ) {}

  @Get('profile')
  @UseGuards(CustomerSelfServicePermissionGuard)
  @RequiresPermission('customer.profile.read')
  @ApiOperation({
    operationId: 'M06-CUSTOMER-PROFILE-READ',
    summary: 'Read own customer profile (ACTIVE only; CLOSED/SUSPENDED read rules apply)',
  })
  public async readProfile(
    @Req() request: CustomerScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const profile = await this.profile.getOwnProfileByReference(
        request.customerContext.customerProfileId,
        new UuidV7(request.authentication.subject),
      );
      noStore(response);
      response.status(HttpStatus.OK).json(success({ profile }));
    } catch (error) {
      mapCustomerError(error);
    }
  }

  @Patch('profile')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 30, windowSeconds: 3600 })
  @UseGuards(CustomerSelfServicePermissionGuard)
  @RequiresPermission('customer.profile.update')
  @ApiOperation({
    operationId: 'M06-CUSTOMER-PROFILE-UPDATE',
    summary: 'Update own profile (version-checked, idempotent)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async updateProfile(
    @Body() body: CustomerProfileUpdateDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: CustomerScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    try {
      const profile = await this.profile.updateProfile({
        customerProfileId: request.customerContext.customerProfileId,
        actorIdentityId: new UuidV7(request.authentication.subject),
        expectedVersion: body.expectedVersion,
        idempotencyKey,
        ...correlationField(),
      });
      noStore(response);
      response.status(HttpStatus.OK).json(success({ profile }));
    } catch (error) {
      mapCustomerError(error);
    }
  }

  @Get('addresses')
  @UseGuards(CustomerSelfServicePermissionGuard)
  @RequiresPermission('customer.address.read')
  @ApiOperation({
    operationId: 'M06-CUSTOMER-ADDRESSES-LIST',
    summary: 'List own addresses (non-enumerating; ACTIVE-only read)',
  })
  public async listAddresses(
    @Req() request: CustomerScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const addresses = await this.addresses.listAddresses(
        request.customerContext.customerProfileId,
        new UuidV7(request.authentication.subject),
      );
      noStore(response);
      response.status(HttpStatus.OK).json(success({ addresses }));
    } catch (error) {
      mapCustomerError(error);
    }
  }

  @Post('addresses')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ limit: 30, windowSeconds: 3600 })
  @UseGuards(CustomerSelfServicePermissionGuard)
  @RequiresPermission('customer.address.manage')
  @ApiOperation({
    operationId: 'M06-CUSTOMER-ADDRESS-CREATE',
    summary: 'Create an own address (roles allow-listed, D-04; version-checked)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async createAddress(
    @Body() body: CreateCustomerAddressDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: CustomerScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    try {
      const address = await this.addresses.addAddress({
        customerProfileId: request.customerContext.customerProfileId,
        actorIdentityId: new UuidV7(request.authentication.subject),
        expectedVersion: body.expectedVersion,
        recipientName: body.recipientName,
        line1: body.line1,
        ...(body.line2 === undefined ? {} : { line2: body.line2 }),
        city: body.city,
        ...(body.region === undefined ? {} : { region: body.region }),
        postalCode: body.postalCode,
        countryCode: body.countryCode,
        ...(body.phone === undefined ? {} : { phone: body.phone }),
        roles: body.roles,
        idempotencyKey,
        ...correlationField(),
      });
      noStore(response);
      response.status(HttpStatus.CREATED).json(success({ address }));
    } catch (error) {
      mapCustomerError(error);
    }
  }

  @Patch('addresses/:addressId')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 30, windowSeconds: 3600 })
  @UseGuards(CustomerSelfServicePermissionGuard)
  @RequiresPermission('customer.address.manage')
  @ApiOperation({
    operationId: 'M06-CUSTOMER-ADDRESS-UPDATE',
    summary:
      'Update own address fields or set the default for a role (version-checked, idempotent)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async updateAddress(
    @Param('addressId') addressId: string,
    @Body() body: UpdateCustomerAddressDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: CustomerScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    const addressIdValue = parseAddressParam(addressId);
    try {
      if (body.setDefaultRole !== undefined) {
        const address = await this.addresses.setDefaultAddress({
          customerProfileId: request.customerContext.customerProfileId,
          addressId: addressIdValue,
          actorIdentityId: new UuidV7(request.authentication.subject),
          expectedVersion: body.expectedVersion,
          role: body.setDefaultRole,
          idempotencyKey,
          ...correlationField(),
        });
        noStore(response);
        response.status(HttpStatus.OK).json(success({ address }));
        return;
      }
      if (
        body.recipientName === undefined ||
        body.line1 === undefined ||
        body.city === undefined ||
        body.postalCode === undefined ||
        body.countryCode === undefined
      ) {
        throw new BadRequestException('CUSTOMER_PRECONDITION_FAILED');
      }
      const address = await this.addresses.updateAddress({
        customerProfileId: request.customerContext.customerProfileId,
        addressId: addressIdValue,
        actorIdentityId: new UuidV7(request.authentication.subject),
        expectedVersion: body.expectedVersion,
        recipientName: body.recipientName,
        line1: body.line1,
        ...(body.line2 === undefined ? {} : { line2: body.line2 }),
        city: body.city,
        ...(body.region === undefined ? {} : { region: body.region }),
        postalCode: body.postalCode,
        countryCode: body.countryCode,
        ...(body.phone === undefined ? {} : { phone: body.phone }),
        idempotencyKey,
        ...correlationField(),
      });
      noStore(response);
      response.status(HttpStatus.OK).json(success({ address }));
    } catch (error) {
      mapCustomerError(error);
    }
  }

  @Delete('addresses/:addressId')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 30, windowSeconds: 3600 })
  @UseGuards(CustomerSelfServicePermissionGuard)
  @RequiresPermission('customer.address.manage')
  @ApiOperation({
    operationId: 'M06-CUSTOMER-ADDRESS-REMOVE',
    summary: 'Soft-remove an own address (idempotent, D-04)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async removeAddress(
    @Param('addressId') addressId: string,
    @Body() body: RemoveCustomerAddressDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: CustomerScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    try {
      const result = await this.addresses.removeAddress({
        customerProfileId: request.customerContext.customerProfileId,
        addressId: parseAddressParam(addressId),
        actorIdentityId: new UuidV7(request.authentication.subject),
        expectedVersion: body.expectedVersion,
        idempotencyKey,
        ...correlationField(),
      });
      noStore(response);
      response.status(HttpStatus.OK).json(success({ removed: result.removed }));
    } catch (error) {
      mapCustomerError(error);
    }
  }

  @Get('business')
  @UseGuards(CustomerSelfServicePermissionGuard)
  @RequiresPermission('customer.business.read')
  @ApiOperation({
    operationId: 'M06-CUSTOMER-BUSINESS-READ',
    summary: 'Read own optional business profile (404 when not attached, D-05)',
  })
  public async readBusiness(
    @Req() request: CustomerScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const business = await this.business.getBusinessProfile(
        request.customerContext.customerProfileId,
        new UuidV7(request.authentication.subject),
      );
      if (business === null) {
        throw new NotFoundException('CUSTOMER_NOT_FOUND');
      }
      noStore(response);
      response.status(HttpStatus.OK).json(success({ business }));
    } catch (error) {
      mapCustomerError(error);
    }
  }

  @Patch('business')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 30, windowSeconds: 3600 })
  @UseGuards(CustomerSelfServicePermissionGuard)
  @RequiresPermission('customer.business.manage')
  @ApiOperation({
    operationId: 'M06-CUSTOMER-BUSINESS-UPSERT',
    summary: 'Attach or update own optional business profile (0..1, D-05; version-checked)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async upsertBusiness(
    @Body() body: CustomerBusinessProfilePatchDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: CustomerScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    const customerProfileId = request.customerContext.customerProfileId;
    const actorIdentityId = new UuidV7(request.authentication.subject);
    const registrationLookupDigestValue =
      body.registrationReference === undefined
        ? undefined
        : registrationLookupDigest(body.registrationReference);
    try {
      const existing = await this.business.getBusinessProfile(customerProfileId, actorIdentityId);
      const business =
        existing === null
          ? await this.business.createBusinessProfile({
              customerProfileId,
              actorIdentityId,
              expectedVersion: body.expectedVersion,
              companyName: body.companyName,
              ...(registrationLookupDigestValue === undefined
                ? {}
                : { registrationLookupDigest: registrationLookupDigestValue }),
              ...(body.businessType === undefined ? {} : { businessType: body.businessType }),
              idempotencyKey,
              ...correlationField(),
            })
          : await this.business.updateBusinessProfile({
              customerProfileId,
              actorIdentityId,
              expectedVersion: body.expectedVersion,
              companyName: body.companyName,
              ...(registrationLookupDigestValue === undefined
                ? {}
                : { registrationLookupDigest: registrationLookupDigestValue }),
              ...(body.businessType === undefined ? {} : { businessType: body.businessType }),
              idempotencyKey,
              ...correlationField(),
            });
      noStore(response);
      response.status(HttpStatus.OK).json(success({ business }));
    } catch (error) {
      mapCustomerError(error);
    }
  }

  @Get('preferences')
  @UseGuards(CustomerSelfServicePermissionGuard)
  @RequiresPermission('customer.preference.read')
  @ApiOperation({
    operationId: 'M06-CUSTOMER-PREFERENCES-READ',
    summary: 'Read own allow-listed preferences (D-06)',
  })
  public async readPreferences(
    @Req() request: CustomerScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const preferences = await this.preferences.getPreferences(
        request.customerContext.customerProfileId,
        new UuidV7(request.authentication.subject),
      );
      noStore(response);
      response.status(HttpStatus.OK).json(success({ preferences }));
    } catch (error) {
      mapCustomerError(error);
    }
  }

  @Patch('preferences')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 30, windowSeconds: 3600 })
  @UseGuards(CustomerSelfServicePermissionGuard)
  @RequiresPermission('customer.preference.manage')
  @ApiOperation({
    operationId: 'M06-CUSTOMER-PREFERENCE-UPDATE',
    summary: 'Update one allow-listed preference (D-06; version-checked, idempotent)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async updatePreference(
    @Body() body: CustomerPreferencePatchDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: CustomerScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    try {
      const preference = await this.preferences.updatePreference({
        customerProfileId: request.customerContext.customerProfileId,
        actorIdentityId: new UuidV7(request.authentication.subject),
        expectedVersion: body.expectedVersion,
        preferenceKey: body.preferenceKey,
        preferenceValue: body.preferenceValue,
        idempotencyKey,
        ...correlationField(),
      });
      noStore(response);
      response.status(HttpStatus.OK).json(success({ preference }));
    } catch (error) {
      mapCustomerError(error);
    }
  }
}

/** Validates the `:addressId` path parameter is a well-formed UUIDv7 (404 otherwise). */
function parseAddressParam(value: string): UuidV7 {
  try {
    return new UuidV7(value);
  } catch {
    throw new NotFoundException('CUSTOMER_NOT_FOUND');
  }
}

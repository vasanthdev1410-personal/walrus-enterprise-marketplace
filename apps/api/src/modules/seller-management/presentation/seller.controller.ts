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
import type { SellerOnboardingApplicationService } from '../application/services/seller-onboarding-application.service';
import type { SellerVerificationApplicationService } from '../application/services/seller-verification-application.service';
import type { SellerReadApplicationService } from '../application/services/seller-read-application.service';
import type { SellerWarehouseApplicationService } from '../application/services/seller-warehouse-application.service';
import type { SellerMemberApplicationService } from '../application/services/seller-member-application.service';
import {
  SELLER_MEMBER_APPLICATION_SERVICE,
  SELLER_ONBOARDING_APPLICATION_SERVICE,
  SELLER_READ_APPLICATION_SERVICE,
  SELLER_VERIFICATION_APPLICATION_SERVICE,
  SELLER_WAREHOUSE_APPLICATION_SERVICE,
} from '../seller-management.tokens';
import { sellerRegistrationLookupDigest } from './registration-digest';
import {
  SellerSelfServicePermissionGuard,
  type SellerScopedRequest,
} from './guards/seller-self-service-permission.guard';
import { mapSellerError } from './seller-error-mapping';
import { correlationField } from './correlation';
import {
  AddMemberDto,
  CloseWarehouseDto,
  CreateSellerOnboardingDto,
  CreateWarehouseDto,
  RemoveMemberDto,
  SubmitOnboardingDto,
  SubmitVerificationDto,
  UpdateSellerProfileDto,
} from './dto/seller.dto';

/**
 * WEMP-M03-SPEC-001 §13 (M03-M5). Seller self-service API.
 *
 * Authorization model (derived from the approved D-11 role gating):
 *  - The SELLER role is assigned only at the APPROVED → ACTIVE gate
 *    (WEMP-M03-SPEC-001 §4 / D-11), so the PRE-APPROVAL onboarding flow
 *    (create, submit, verification submit, profile/business update) is
 *    authorized by Module 01 AAL2 authentication plus the authoritative
 *    OWNER-association ownership and identity-eligibility gates (D-04) that
 *    the M03-M3 application services enforce. No role permission exists for
 *    these callers by design.
 *  - The POST-APPROVAL self-service surface (profile/business read,
 *    verification status, warehouses, agreements, members) is additionally
 *    gated by the Module 02 permission engine through
 *    SellerSelfServicePermissionGuard with the seller scope resolved
 *    server-side from the authenticated identity — never from a client claim.
 *
 * Every mutation requires an Idempotency-Key header (Module 01
 * ApiIdempotencyRecord is reused; no second system). Errors are
 * non-enumerating and never disclose evidence, policy, or reviewer internals.
 */
@ApiTags('Seller Self-Service')
@Controller('seller')
@UseGuards(Aal2SessionGuard, NonProductionRateLimiterGuard)
export class SellerController {
  public constructor(
    @Inject(SELLER_ONBOARDING_APPLICATION_SERVICE)
    private readonly onboarding: SellerOnboardingApplicationService,
    @Inject(SELLER_VERIFICATION_APPLICATION_SERVICE)
    private readonly verification: SellerVerificationApplicationService,
    @Inject(SELLER_READ_APPLICATION_SERVICE)
    private readonly read: SellerReadApplicationService,
    @Inject(SELLER_WAREHOUSE_APPLICATION_SERVICE)
    private readonly warehouses: SellerWarehouseApplicationService,
    @Inject(SELLER_MEMBER_APPLICATION_SERVICE)
    private readonly members: SellerMemberApplicationService,
  ) {}

  @Post('onboarding')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ limit: 10, windowSeconds: 3600 })
  @ApiOperation({
    operationId: 'M03-SELLER-ONBOARDING-CREATE',
    summary: 'Start seller onboarding (create DRAFT profile with OWNER association)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async createOnboarding(
    @Body() body: CreateSellerOnboardingDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    try {
      const result = await this.onboarding.requestSellerProfileCreation({
        identityId: new UuidV7(request.authentication.subject),
        legalName: body.legalName,
        tradeName: body.tradeName,
        registrationNumber: body.registrationNumber,
        registrationLookupDigest: sellerRegistrationLookupDigest(body.registrationNumber),
        businessAddress: body.businessAddress,
        ...correlationField(),
      });
      noStore(response);
      response.status(HttpStatus.CREATED).json(success({ seller: result }));
    } catch (error) {
      mapSellerError(error);
    }
  }

  @Post('onboarding/submit')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 10, windowSeconds: 3600 })
  @ApiOperation({
    operationId: 'M03-SELLER-ONBOARDING-SUBMIT',
    summary: 'Submit onboarding for review (idempotent; supports corrections resubmission)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async submitOnboarding(
    @Body() body: SubmitOnboardingDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    const sellerProfileId = new UuidV7(body.sellerProfileId);
    try {
      // Server-side dispatch: CORRECTIONS_REQUESTED → resubmit (new review
      // cycle); DRAFT → submit. The seller state is read from authoritative
      // storage — the client never selects the transition.
      const status = await this.read.getOwnOnboardingStatus(
        new UuidV7(request.authentication.subject),
      );
      const command = {
        sellerProfileId,
        actorIdentityId: new UuidV7(request.authentication.subject),
        expectedVersion: body.expectedVersion,
        ...correlationField(),
      };
      const result =
        status.state === 'CORRECTIONS_REQUESTED'
          ? await this.onboarding.resubmitOnboarding(command)
          : await this.onboarding.submitOnboarding(command);
      noStore(response);
      response.status(HttpStatus.OK).json(success({ seller: result }));
    } catch (error) {
      mapSellerError(error);
    }
  }

  @Get('onboarding')
  @ApiOperation({
    operationId: 'M03-SELLER-ONBOARDING-STATUS',
    summary: 'Read own onboarding status (pre-approval surface; seller resolved server-side)',
  })
  public async readOnboardingStatus(
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const status = await this.read.getOwnOnboardingStatus(
        new UuidV7(request.authentication.subject),
      );
      noStore(response);
      response.status(HttpStatus.OK).json(success({ seller: status }));
    } catch (error) {
      mapSellerError(error);
    }
  }

  @Get('profile')
  @UseGuards(SellerSelfServicePermissionGuard)
  @RequiresPermission('seller.profile.read')
  @ApiOperation({
    operationId: 'M03-SELLER-PROFILE-READ',
    summary: 'Read own seller profile (SELLER role; scope resolved server-side)',
  })
  public async readProfile(
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const profile = await this.read.getOwnProfile(new UuidV7(request.authentication.subject));
      noStore(response);
      response.status(HttpStatus.OK).json(success({ profile }));
    } catch (error) {
      mapSellerError(error);
    }
  }

  @Patch('profile')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 30, windowSeconds: 3600 })
  @ApiOperation({
    operationId: 'M03-SELLER-PROFILE-UPDATE',
    summary: 'Update allowed seller profile fields (version-checked)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async updateProfile(
    @Body() body: UpdateSellerProfileDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    if (
      body.legalName === undefined &&
      body.tradeName === undefined &&
      body.businessAddress === undefined
    ) {
      throw new BadRequestException('SELLER_PRECONDITION_FAILED');
    }
    try {
      const result = await this.onboarding.updateProfile({
        sellerProfileId: new UuidV7(body.sellerProfileId),
        actorIdentityId: new UuidV7(request.authentication.subject),
        expectedVersion: body.expectedVersion,
        ...(body.legalName === undefined ? {} : { legalName: body.legalName }),
        ...(body.tradeName === undefined ? {} : { tradeName: body.tradeName }),
        ...(body.businessAddress === undefined ? {} : { businessAddress: body.businessAddress }),
        ...correlationField(),
      });
      noStore(response);
      response.status(HttpStatus.OK).json(success({ seller: result }));
    } catch (error) {
      mapSellerError(error);
    }
  }

  @Get('business')
  @UseGuards(SellerSelfServicePermissionGuard)
  @RequiresPermission('seller.organization.read')
  @ApiOperation({
    operationId: 'M03-SELLER-BUSINESS-READ',
    summary: 'Read own organization/business information (SELLER role)',
  })
  public async readBusiness(
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const profile = await this.read.getOwnProfile(new UuidV7(request.authentication.subject));
      noStore(response);
      response.status(HttpStatus.OK).json(
        success({
          business: {
            version: profile.version,
            legalName: profile.organization.legalName,
            tradeName: profile.organization.tradeName,
            businessAddress: profile.organization.businessAddress,
          },
        }),
      );
    } catch (error) {
      mapSellerError(error);
    }
  }

  @Patch('business')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 30, windowSeconds: 3600 })
  @ApiOperation({
    operationId: 'M03-SELLER-BUSINESS-UPDATE',
    summary: 'Update own business information (version-checked)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async updateBusiness(
    @Body() body: UpdateSellerProfileDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    if (
      body.legalName === undefined &&
      body.tradeName === undefined &&
      body.businessAddress === undefined
    ) {
      throw new BadRequestException('SELLER_PRECONDITION_FAILED');
    }
    try {
      const result = await this.onboarding.updateProfile({
        sellerProfileId: new UuidV7(body.sellerProfileId),
        actorIdentityId: new UuidV7(request.authentication.subject),
        expectedVersion: body.expectedVersion,
        ...(body.legalName === undefined ? {} : { legalName: body.legalName }),
        ...(body.tradeName === undefined ? {} : { tradeName: body.tradeName }),
        ...(body.businessAddress === undefined ? {} : { businessAddress: body.businessAddress }),
        ...correlationField(),
      });
      noStore(response);
      response.status(HttpStatus.OK).json(success({ seller: result }));
    } catch (error) {
      mapSellerError(error);
    }
  }

  @Post('verification')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 10, windowSeconds: 3600 })
  @ApiOperation({
    operationId: 'M03-SELLER-VERIFICATION-SUBMIT',
    summary: 'Submit KYC/KYB verification evidence references + digests',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async submitVerification(
    @Body() body: SubmitVerificationDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    try {
      const result = await this.verification.submitVerification({
        sellerProfileId: new UuidV7(body.sellerProfileId),
        actorIdentityId: new UuidV7(request.authentication.subject),
        verificationType: body.verificationType,
        expectedVersion: body.expectedVersion,
        evidence: body.evidence,
        ...correlationField(),
      });
      noStore(response);
      response.status(HttpStatus.OK).json(success({ verification: result }));
    } catch (error) {
      mapSellerError(error);
    }
  }

  @Get('verification')
  @UseGuards(SellerSelfServicePermissionGuard)
  @RequiresPermission('seller.verification.read')
  @ApiOperation({
    operationId: 'M03-SELLER-VERIFICATION-READ',
    summary: 'View own verification status (SELLER role; never another seller)',
  })
  public async readVerificationStatus(
    @Req() request: SellerScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const status = await this.verification.getVerificationStatus(
        request.sellerContext.sellerProfileId,
        new UuidV7(request.authentication.subject),
      );
      noStore(response);
      response.status(HttpStatus.OK).json(success({ verification: status }));
    } catch (error) {
      mapSellerError(error);
    }
  }

  @Get('warehouses')
  @UseGuards(SellerSelfServicePermissionGuard)
  @RequiresPermission('seller.warehouse.read')
  @ApiOperation({
    operationId: 'M03-SELLER-WAREHOUSES-LIST',
    summary: 'List own warehouse/location records',
  })
  public async listWarehouses(
    @Req() request: SellerScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const warehouses = await this.read.listWarehouses(
        request.sellerContext.sellerProfileId,
        new UuidV7(request.authentication.subject),
      );
      noStore(response);
      response.status(HttpStatus.OK).json(success({ warehouses }));
    } catch (error) {
      mapSellerError(error);
    }
  }

  @Post('warehouses')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ limit: 30, windowSeconds: 3600 })
  @UseGuards(SellerSelfServicePermissionGuard)
  @RequiresPermission('seller.warehouse.manage')
  @ApiOperation({
    operationId: 'M03-SELLER-WAREHOUSE-CREATE',
    summary: 'Create a warehouse/location record (owner action, version-checked)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async createWarehouse(
    @Body() body: CreateWarehouseDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: SellerScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    try {
      const result = await this.warehouses.createWarehouse({
        sellerProfileId: request.sellerContext.sellerProfileId,
        actorIdentityId: new UuidV7(request.authentication.subject),
        expectedVersion: body.expectedVersion,
        name: body.name,
        address: body.address,
        idempotencyKey,
        ...correlationField(),
      });
      noStore(response);
      response.status(HttpStatus.CREATED).json(success({ warehouse: result }));
    } catch (error) {
      mapSellerError(error);
    }
  }

  @Post('warehouses/:warehouseId/close')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 30, windowSeconds: 3600 })
  @UseGuards(SellerSelfServicePermissionGuard)
  @RequiresPermission('seller.warehouse.manage')
  @ApiOperation({
    operationId: 'M03-SELLER-WAREHOUSE-CLOSE',
    summary: 'Close a warehouse/location record (owner action, version-checked)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async closeWarehouse(
    @Param('warehouseId') warehouseId: string,
    @Body() body: CloseWarehouseDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: SellerScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    try {
      const result = await this.warehouses.closeWarehouse({
        sellerProfileId: request.sellerContext.sellerProfileId,
        warehouseId: parseUuidParam(warehouseId),
        actorIdentityId: new UuidV7(request.authentication.subject),
        expectedVersion: body.expectedVersion,
        ...correlationField(),
      });
      noStore(response);
      response.status(HttpStatus.OK).json(success({ warehouse: result }));
    } catch (error) {
      mapSellerError(error);
    }
  }

  @Get('agreements')
  @UseGuards(SellerSelfServicePermissionGuard)
  @RequiresPermission('seller.agreement.read')
  @ApiOperation({
    operationId: 'M03-SELLER-AGREEMENTS-LIST',
    summary: 'Read own agreements (approved record fields only)',
  })
  public async listAgreements(
    @Req() request: SellerScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const agreements = await this.read.listAgreements(
        request.sellerContext.sellerProfileId,
        new UuidV7(request.authentication.subject),
      );
      noStore(response);
      response.status(HttpStatus.OK).json(success({ agreements }));
    } catch (error) {
      mapSellerError(error);
    }
  }

  @Get('members')
  @UseGuards(SellerSelfServicePermissionGuard)
  @RequiresPermission('seller.member.read')
  @ApiOperation({
    operationId: 'M03-SELLER-MEMBERS-LIST',
    summary: 'Read own organization membership (SELLER role)',
  })
  public async listMembers(
    @Req() request: SellerScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    try {
      const members = await this.read.listMembers(
        request.sellerContext.sellerProfileId,
        new UuidV7(request.authentication.subject),
      );
      noStore(response);
      response.status(HttpStatus.OK).json(success({ members }));
    } catch (error) {
      mapSellerError(error);
    }
  }

  @Post('members')
  @HttpCode(HttpStatus.CREATED)
  @RateLimit({ limit: 30, windowSeconds: 3600 })
  @UseGuards(SellerSelfServicePermissionGuard)
  @RequiresPermission('seller.member.manage')
  @ApiOperation({
    operationId: 'M03-SELLER-MEMBER-ADD',
    summary: 'Add a member to the own organization (owner action)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async addMember(
    @Body() body: AddMemberDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: SellerScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    try {
      const result = await this.members.addMember({
        sellerProfileId: request.sellerContext.sellerProfileId,
        actorIdentityId: new UuidV7(request.authentication.subject),
        expectedVersion: body.expectedVersion,
        memberIdentityId: new UuidV7(body.memberIdentityId),
        idempotencyKey,
        ...correlationField(),
      });
      noStore(response);
      response.status(HttpStatus.CREATED).json(success({ member: result }));
    } catch (error) {
      mapSellerError(error);
    }
  }

  @Delete('members/:identityId')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 30, windowSeconds: 3600 })
  @UseGuards(SellerSelfServicePermissionGuard)
  @RequiresPermission('seller.member.manage')
  @ApiOperation({
    operationId: 'M03-SELLER-MEMBER-REMOVE',
    summary: 'Remove a member from the own organization (owner action; never the owner)',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  public async removeMember(
    @Param('identityId') identityId: string,
    @Body() body: RemoveMemberDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: SellerScopedRequest & AuthenticatedRequest,
    @Res() response: Response,
  ): Promise<void> {
    assertIdempotencyKey(idempotencyKey);
    try {
      const result = await this.members.removeMember({
        sellerProfileId: request.sellerContext.sellerProfileId,
        actorIdentityId: new UuidV7(request.authentication.subject),
        expectedVersion: body.expectedVersion,
        memberIdentityId: parseUuidParam(identityId),
        ...correlationField(),
      });
      noStore(response);
      response.status(HttpStatus.OK).json(success({ member: result }));
    } catch (error) {
      mapSellerError(error);
    }
  }
}

function parseUuidParam(value: string): UuidV7 {
  try {
    return new UuidV7(value);
  } catch {
    throw new NotFoundException('SELLER_NOT_FOUND');
  }
}

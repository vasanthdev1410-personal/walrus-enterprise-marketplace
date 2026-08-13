import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/i;

/**
 * WEMP-M03-SPEC-001 §13. Seller self-service DTOs. All identifiers are
 * server-validated UUIDv7 values; the seller/organization scope itself is
 * derived server-side from the authenticated session, never selected by the
 * client. Unknown fields are rejected by whitelist validation.
 */

export class CreateSellerOnboardingDto {
  @ApiProperty({ maxLength: 256 })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  public readonly legalName!: string;

  @ApiProperty({ maxLength: 256 })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  public readonly tradeName!: string;

  // The registration number is sensitive; only a server-side derived lookup
  // digest is ever persisted (D-02). The raw value travels once and is stored
  // as a ProtectedValue.
  @ApiProperty({ writeOnly: true, maxLength: 64 })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  public readonly registrationNumber!: string;

  @ApiProperty({ maxLength: 512 })
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  public readonly businessAddress!: string;
}

export class SubmitOnboardingDto {
  @ApiProperty({ example: '0191310f-789a-7123-8123-000000000001' })
  @Matches(UUID_V7_PATTERN)
  public readonly sellerProfileId!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  public readonly expectedVersion!: number;
}

export class UpdateSellerProfileDto {
  @ApiProperty({ example: '0191310f-789a-7123-8123-000000000001' })
  @Matches(UUID_V7_PATTERN)
  public readonly sellerProfileId!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  public readonly expectedVersion!: number;

  @ApiPropertyOptional({ maxLength: 256 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  public readonly legalName?: string;

  @ApiPropertyOptional({ maxLength: 256 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  public readonly tradeName?: string;

  @ApiPropertyOptional({ maxLength: 512 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  public readonly businessAddress?: string;
}

export class VerifyEvidenceDescriptorDto {
  @ApiProperty({ maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  public readonly evidenceType!: string;

  @ApiProperty({ maxLength: 1024 })
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  public readonly evidenceReference!: string;

  @ApiProperty({ example: '<sha256 hex>' })
  @Matches(SHA256_HEX_PATTERN)
  public readonly evidenceDigest!: string;
}

export class SubmitVerificationDto {
  @ApiProperty({ example: '0191310f-789a-7123-8123-000000000001' })
  @Matches(UUID_V7_PATTERN)
  public readonly sellerProfileId!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  public readonly expectedVersion!: number;

  @ApiProperty({ enum: ['GST', 'PAN', 'BANK', 'ADDRESS'] })
  @IsEnum(['GST', 'PAN', 'BANK', 'ADDRESS'])
  public readonly verificationType!: 'GST' | 'PAN' | 'BANK' | 'ADDRESS';

  @ApiProperty({ type: [VerifyEvidenceDescriptorDto], minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => VerifyEvidenceDescriptorDto)
  public readonly evidence!: VerifyEvidenceDescriptorDto[];
}

export class CreateWarehouseDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  public readonly expectedVersion!: number;

  @ApiProperty({ maxLength: 256 })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  public readonly name!: string;

  @ApiProperty({ maxLength: 512 })
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  public readonly address!: string;
}

export class CloseWarehouseDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  public readonly expectedVersion!: number;

  @ApiProperty({ example: '0191310f-789a-7123-8123-000000000001' })
  @Matches(UUID_V7_PATTERN)
  public readonly warehouseId!: string;
}

export class AddMemberDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  public readonly expectedVersion!: number;

  @ApiProperty({ example: '0191310f-789a-7123-8123-000000000001' })
  @Matches(UUID_V7_PATTERN)
  public readonly memberIdentityId!: string;
}

/**
 * DELETE /seller/members/:identityId carries only the concurrency version in
 * the body; the target member identity is the validated URL parameter.
 */
export class RemoveMemberDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  public readonly expectedVersion!: number;
}

export class AdminReviewDto {
  @ApiProperty({ enum: ['CLAIM_REVIEW', 'REQUEST_CORRECTIONS', 'APPROVE', 'REJECT'] })
  @IsEnum(['CLAIM_REVIEW', 'REQUEST_CORRECTIONS', 'APPROVE', 'REJECT'])
  public readonly action!: 'CLAIM_REVIEW' | 'REQUEST_CORRECTIONS' | 'APPROVE' | 'REJECT';

  @ApiProperty({ minimum: 1 })
  @IsInt()
  public readonly expectedVersion!: number;

  @ApiPropertyOptional({ maxLength: 256 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  public readonly reasonReference?: string;
}

export class AdminSuspendDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  public readonly expectedVersion!: number;

  @ApiProperty({ maxLength: 256 })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  public readonly reasonReference!: string;
}

export class AdminReactivateDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  public readonly expectedVersion!: number;
}

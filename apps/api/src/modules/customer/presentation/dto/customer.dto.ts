import { createHash } from 'node:crypto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ADDRESS_ROLES = ['SHIPPING', 'BILLING'] as const;
const PREFERENCE_KEYS = ['language', 'currency', 'locale'] as const;
const LIFECYCLE_ACTIONS = ['SUSPEND', 'REACTIVATE', 'CLOSE'] as const;

/**
 * WEMP-M06-SPEC-001 §14/§17 (M06-M5, decisions D-01..D-06/D-10/D-11).
 * Module 06 customer presentation DTOs. Bounds mirror the approved
 * validation rules: address fields per D-04 (recipient 1..256, line1/city
 * 1..256, postalCode 1..64, countryCode exactly 2 letters, optional
 * line2/region/phone ≤ 256/32); business profile per D-05 (companyName
 * 1..256, registration reference hashed to a SHA-256 digest before it ever
 * reaches the application layer — the raw value is never stored or logged);
 * preferences allow-listed to language/currency/locale (D-06). The
 * customerProfileId is never accepted from the client for self-service:
 * the server resolves the caller's own profile through the Module 02
 * ownership engine. Unknown fields are rejected by whitelist validation
 * (mass-assignment protection, §17).
 */

export class CustomerProfileUpdateDto {
  @ApiProperty({
    minimum: 1,
    description: 'Optimistic concurrency guard (D-11): current aggregate version',
  })
  @IsInt()
  @Min(1)
  public readonly expectedVersion!: number;
}

export class CreateCustomerAddressDto {
  @ApiProperty({ maxLength: 256 })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  public readonly recipientName!: string;

  @ApiProperty({ maxLength: 256 })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  public readonly line1!: string;

  @ApiPropertyOptional({ maxLength: 256 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  public readonly line2?: string;

  @ApiProperty({ maxLength: 256 })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  public readonly city!: string;

  @ApiPropertyOptional({ maxLength: 256 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  public readonly region?: string;

  @ApiProperty({ maxLength: 64 })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  public readonly postalCode!: string;

  @ApiProperty({ maxLength: 2, example: 'US', description: 'ISO 3166-1 alpha-2' })
  @IsString()
  @Matches(/^[A-Za-z]{2}$/)
  public readonly countryCode!: string;

  @ApiPropertyOptional({ maxLength: 32 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  public readonly phone?: string;

  @ApiProperty({ enum: [...ADDRESS_ROLES], isArray: true, minItems: 1 })
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(ADDRESS_ROLES, { each: true })
  public readonly roles!: readonly ('SHIPPING' | 'BILLING')[];

  @ApiProperty({
    minimum: 1,
    description: 'Optimistic concurrency guard (D-11): current aggregate version',
  })
  @IsInt()
  @Min(1)
  public readonly expectedVersion!: number;
}

export class UpdateCustomerAddressDto {
  @ApiPropertyOptional({ maxLength: 256 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  public readonly recipientName?: string;

  @ApiPropertyOptional({ maxLength: 256 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  public readonly line1?: string;

  @ApiPropertyOptional({ maxLength: 256 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  public readonly line2?: string;

  @ApiPropertyOptional({ maxLength: 256 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  public readonly city?: string;

  @ApiPropertyOptional({ maxLength: 256 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  public readonly region?: string;

  @ApiPropertyOptional({ maxLength: 64 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  public readonly postalCode?: string;

  @ApiPropertyOptional({ maxLength: 2, description: 'ISO 3166-1 alpha-2' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{2}$/)
  public readonly countryCode?: string;

  @ApiPropertyOptional({ maxLength: 32 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  public readonly phone?: string;

  @ApiPropertyOptional({
    enum: ['SHIPPING', 'BILLING'],
    description:
      'When present, sets this address as the default for the role (D-04) instead of updating address fields.',
  })
  @IsOptional()
  @IsEnum(['SHIPPING', 'BILLING'])
  public readonly setDefaultRole?: 'SHIPPING' | 'BILLING';

  @ApiProperty({ minimum: 1, description: 'Optimistic concurrency guard (D-11)' })
  @IsInt()
  @Min(1)
  public readonly expectedVersion!: number;
}

export class RemoveCustomerAddressDto {
  @ApiProperty({
    minimum: 1,
    description: 'Optimistic concurrency guard (D-11): current aggregate version',
  })
  @IsInt()
  @Min(1)
  public readonly expectedVersion!: number;
}

export class CustomerBusinessProfilePatchDto {
  @ApiProperty({ maxLength: 256 })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  public readonly companyName!: string;

  @ApiPropertyOptional({
    writeOnly: true,
    maxLength: 64,
    description:
      'Registration reference (e.g. tax/company registration number). Hashed to a SHA-256 lookup digest server-side (D-05); the raw value is never stored or logged.',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  public readonly registrationReference?: string;

  @ApiPropertyOptional({ maxLength: 64 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  public readonly businessType?: string;

  @ApiProperty({ minimum: 1, description: 'Optimistic concurrency guard (D-11)' })
  @IsInt()
  @Min(1)
  public readonly expectedVersion!: number;
}

export class CustomerPreferencePatchDto {
  @ApiProperty({ enum: [...PREFERENCE_KEYS], description: 'Allow-listed preference key (D-06)' })
  @IsEnum(PREFERENCE_KEYS)
  public readonly preferenceKey!: 'language' | 'currency' | 'locale';

  @ApiProperty({ maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  public readonly preferenceValue!: string;

  @ApiProperty({ minimum: 1, description: 'Optimistic concurrency guard (D-11)' })
  @IsInt()
  @Min(1)
  public readonly expectedVersion!: number;
}

export class CustomerLifecycleActionDto {
  @ApiProperty({ enum: [...LIFECYCLE_ACTIONS] })
  @IsEnum(LIFECYCLE_ACTIONS)
  public readonly action!: 'SUSPEND' | 'REACTIVATE' | 'CLOSE';

  @ApiProperty({
    maxLength: 512,
    description: 'Mandatory non-disclosing reason reference (D-02)',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  public readonly reasonReference!: string;

  @ApiProperty({ minimum: 1, description: 'Optimistic concurrency guard (D-11)' })
  @IsInt()
  @Min(1)
  public readonly expectedVersion!: number;
}

export class AdminCustomerIdParamDto {
  @ApiProperty({ example: '0191310f-789a-7123-8123-000000000003' })
  @Matches(UUID_V7_PATTERN)
  public readonly customerProfileId!: string;
}

export class CustomerAddressIdParamDto {
  @ApiProperty({ example: '0191310f-789a-7123-8123-000000000004' })
  @Matches(UUID_V7_PATTERN)
  public readonly addressId!: string;
}

/**
 * Optional registration reference → SHA-256 lookup digest (D-05). The raw
 * value is never stored; only the digest persists and is logged. Mirrors the
 * Module 03 seller registration-digest convention.
 */
export function registrationLookupDigest(reference: string): string {
  return createHash('sha256').update(reference.trim().toUpperCase(), 'utf8').digest('hex');
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SKU_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{0,63}$/;
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/i;
const MEDIA_REFERENCE_MAX_LENGTH = 1024;

/**
 * WEMP-M04-SPEC-001 §22 (decision D-16). Module 04 product DTOs. Bounds
 * mirror the approved validation rules: name 1–256; SKU 1–64 uppercase
 * alphanumeric + `-`/`_` (D-06); price > 0 and ≤ 1,000,000 with 2-decimal
 * precision (D-07); media JPEG/PNG/WebP, ≤ 10 MB per file (D-09). The target
 * sellerProfileId travels as a reference and is validated server-side by the
 * Module 02 engine — never trusted as an ownership claim. Unknown fields are
 * rejected by whitelist validation.
 */

export class CreateSkuDto {
  @ApiProperty({ example: 'WLR-ESPRESSO-001', maxLength: 64 })
  @IsString()
  @Matches(SKU_CODE_PATTERN)
  public readonly skuCode!: string;

  @ApiPropertyOptional({ example: '0191310f-789a-7123-8123-000000000010' })
  @IsOptional()
  @Matches(UUID_V7_PATTERN)
  public readonly variantId?: string;
}

export class CreateProductDto {
  @ApiProperty({ example: '0191310f-789a-7123-8123-000000000003' })
  @Matches(UUID_V7_PATTERN)
  public readonly sellerProfileId!: string;

  @ApiProperty({ maxLength: 256 })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  public readonly name!: string;

  @ApiProperty({ example: '0191310f-789a-7123-8123-000000000005' })
  @Matches(UUID_V7_PATTERN)
  public readonly categoryId!: string;

  @ApiProperty({ minimum: 0.01, maximum: 1000000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1000000)
  public readonly sellingPrice!: number;

  @ApiPropertyOptional({ minimum: 0.01, maximum: 1000000 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1000000)
  public readonly compareAtPrice?: number;

  @ApiProperty({ type: [CreateSkuDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSkuDto)
  public readonly skus!: CreateSkuDto[];
}

export class UpdateProductDto {
  @ApiProperty({ example: '0191310f-789a-7123-8123-000000000003' })
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
  public readonly name?: string;

  @ApiPropertyOptional({ example: '0191310f-789a-7123-8123-000000000005' })
  @IsOptional()
  @Matches(UUID_V7_PATTERN)
  public readonly categoryId?: string;

  @ApiPropertyOptional({ minimum: 0.01, maximum: 1000000 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1000000)
  public readonly sellingPrice?: number;

  @ApiPropertyOptional({ minimum: 0.01, maximum: 1000000 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1000000)
  public readonly compareAtPrice?: number;

  @ApiPropertyOptional({ type: [CreateSkuDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSkuDto)
  public readonly skusToUpsert?: CreateSkuDto[];
}

export class ProductVersionedDto {
  @ApiProperty({ example: '0191310f-789a-7123-8123-000000000003' })
  @Matches(UUID_V7_PATTERN)
  public readonly sellerProfileId!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  public readonly expectedVersion!: number;
}

export class CloseProductDto extends ProductVersionedDto {
  @ApiProperty({ description: 'Mandatory withdrawal/closure reason reference' })
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  public readonly reasonReference!: string;
}

export class AddVariantDto {
  @ApiProperty({ example: '0191310f-789a-7123-8123-000000000003' })
  @Matches(UUID_V7_PATTERN)
  public readonly sellerProfileId!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  public readonly expectedVersion!: number;

  @ApiProperty({ maxLength: 256 })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  public readonly name!: string;

  @ApiProperty({ minimum: 0.01, maximum: 1000000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1000000)
  public readonly sellingPrice!: number;

  @ApiPropertyOptional({ minimum: 0.01, maximum: 1000000 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1000000)
  public readonly compareAtPrice?: number;

  @ApiProperty({ example: 'WLR-ESPRESSO-SS', maxLength: 64 })
  @IsString()
  @Matches(SKU_CODE_PATTERN)
  public readonly skuCode!: string;
}

export class AddSkuDto extends ProductVersionedDto {
  @ApiPropertyOptional({ example: '0191310f-789a-7123-8123-000000000010' })
  @IsOptional()
  @Matches(UUID_V7_PATTERN)
  public readonly variantId?: string;

  @ApiProperty({ example: 'WLR-ESPRESSO-002', maxLength: 64 })
  @IsString()
  @Matches(SKU_CODE_PATTERN)
  public readonly skuCode!: string;
}

export class CloseSkuDto extends ProductVersionedDto {
  @ApiProperty({ example: '0191310f-789a-7123-8123-000000000011' })
  @Matches(UUID_V7_PATTERN)
  public readonly skuId!: string;
}

export class RecordMediaDto {
  @ApiProperty({ example: '0191310f-789a-7123-8123-000000000003' })
  @Matches(UUID_V7_PATTERN)
  public readonly sellerProfileId!: string;

  @ApiProperty({ minimum: 1 })
  @IsInt()
  public readonly expectedVersion!: number;

  @ApiProperty({
    maxLength: MEDIA_REFERENCE_MAX_LENGTH,
    description: 'Opaque object-storage reference',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(MEDIA_REFERENCE_MAX_LENGTH)
  public readonly mediaReference!: string;

  @ApiProperty({ description: 'SHA-256 hex digest of the stored object' })
  @IsString()
  @Matches(SHA256_HEX_PATTERN)
  public readonly mediaDigest!: string;

  @ApiProperty({ enum: ['image/jpeg', 'image/png', 'image/webp'] })
  @IsEnum(['image/jpeg', 'image/png', 'image/webp'])
  public readonly mimeType!: string;

  @ApiProperty({ minimum: 1, maximum: 10 * 1024 * 1024 })
  @IsInt()
  @Min(1)
  @Max(10 * 1024 * 1024)
  public readonly sizeBytes!: number;
}

export class AdminReviewDto {
  @ApiProperty({ minimum: 1 })
  @IsInt()
  public readonly expectedVersion!: number;

  @ApiProperty({ enum: ['CLAIM_REVIEW', 'REQUEST_CORRECTIONS', 'APPROVE', 'REJECT', 'PUBLISH'] })
  @IsEnum(['CLAIM_REVIEW', 'REQUEST_CORRECTIONS', 'APPROVE', 'REJECT', 'PUBLISH'])
  public readonly action!:
    'CLAIM_REVIEW' | 'REQUEST_CORRECTIONS' | 'APPROVE' | 'REJECT' | 'PUBLISH';

  @ApiPropertyOptional({ maxLength: 512 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  public readonly reasonReference?: string;
}

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * WEMP-M05-SPEC-001 §15/§9 (M05-M5, decisions D-04/D-08/D-14). Module 05
 * inventory presentation DTOs. Bounds mirror the approved validation rules:
 * delta > 0 and ≤ 1,000,000 units (D-08); targetOnHand ≥ 0; mandatory
 * reason on STOCK_OUT/ADJUSTMENT and on every admin correction (D-08, also
 * enforced by the domain policy — the DTO validates shape, the domain
 * enforces the conditional rules); thresholds non-negative integers with
 * out-of-stock ≤ low-stock (D-14, also enforced by
 * `InventoryThresholdConfig`). The sellerProfileId travels as a reference
 * and is validated server-side by the inventory seller guard / Module 02
 * engine — never trusted as an ownership claim. Unknown fields are rejected
 * by whitelist validation.
 */

export class SellerMovementDto {
  @ApiProperty({ example: '0191310f-789a-7123-8123-000000000003' })
  @Matches(UUID_V7_PATTERN)
  public readonly sellerProfileId!: string;

  @ApiProperty({ enum: ['STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT'] })
  @IsEnum(['STOCK_IN', 'STOCK_OUT', 'ADJUSTMENT'])
  public readonly movementType!: 'STOCK_IN' | 'STOCK_OUT' | 'ADJUSTMENT';

  @ApiProperty({ minimum: 1, maximum: 1000000, description: 'Positive magnitude (D-08)' })
  @IsInt()
  @Min(1)
  @Max(1000000)
  public readonly delta!: number;

  @ApiPropertyOptional({ enum: ['INCREASE', 'DECREASE'] })
  @IsOptional()
  @IsEnum(['INCREASE', 'DECREASE'])
  public readonly direction?: 'INCREASE' | 'DECREASE';

  @ApiProperty({ minimum: 0, description: 'Optimistic concurrency guard; 0 = pool activation' })
  @IsInt()
  @Min(0)
  public readonly expectedVersion!: number;

  @ApiPropertyOptional({
    maxLength: 512,
    description: 'Mandatory on STOCK_OUT/ADJUSTMENT (D-08); non-disclosing reference',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  public readonly reasonReference?: string;
}

export class AdminCorrectionDto {
  @ApiProperty({ minimum: 0, description: 'COUNT_CORRECTION target on-hand quantity' })
  @IsInt()
  @Min(0)
  public readonly targetOnHand!: number;

  @ApiProperty({ minimum: 0, description: 'Optimistic concurrency guard; 0 = pool activation' })
  @IsInt()
  @Min(0)
  public readonly expectedVersion!: number;

  @ApiProperty({ maxLength: 512, description: 'Mandatory on admin corrections (D-08)' })
  @IsString()
  @MinLength(1)
  @MaxLength(512)
  public readonly reasonReference!: string;
}

/**
 * D-14 fail-closed semantics: the out-of-stock threshold must not exceed
 * the low-stock threshold so the derived label bands are consistent
 * (mirrors the `InventoryThresholdConfig` domain rule — validated at the
 * boundary so malformed configuration is rejected before it reaches the
 * application layer, which also enforces the same rule).
 */
@ValidatorConstraint({ name: 'outOfStockNotAboveLowStock', async: false })
export class OutOfStockNotAboveLowStockConstraint implements ValidatorConstraintInterface {
  public validate(outOfStockThreshold: number, args: ValidationArguments): boolean {
    const object = args.object as ThresholdConfigPatchDto;
    return (
      typeof object.lowStockThreshold === 'number' &&
      outOfStockThreshold <= object.lowStockThreshold
    );
  }

  public defaultMessage(): string {
    return 'OUT_OF_STOCK_THRESHOLD_EXCEEDS_LOW_STOCK';
  }
}

export function OutOfStockNotAboveLowStock(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return (object: object, propertyName: string | symbol): void => {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName as string,
      ...(validationOptions === undefined ? {} : { options: validationOptions }),
      constraints: [],
      validator: OutOfStockNotAboveLowStockConstraint,
    });
  };
}

export class ThresholdConfigPatchDto {
  @ApiProperty({ minimum: 0, description: 'D-14 LOW_STOCK_THRESHOLD' })
  @IsInt()
  @Min(0)
  public readonly lowStockThreshold!: number;

  @ApiProperty({ minimum: 0, description: 'D-14 OUT_OF_STOCK_THRESHOLD' })
  @IsInt()
  @Min(0)
  @OutOfStockNotAboveLowStock()
  public readonly outOfStockThreshold!: number;

  @ApiProperty({
    minimum: 0,
    description: 'Optimistic concurrency guard; 0 = initial configuration',
  })
  @IsInt()
  @Min(0)
  public readonly expectedVersion!: number;
}

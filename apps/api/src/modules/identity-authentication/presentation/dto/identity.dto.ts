import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterIdentityRequestDto {
  @ApiProperty({ enum: ['EMAIL', 'MOBILE'] })
  @IsEnum(['EMAIL', 'MOBILE'])
  public readonly identifierType!: 'EMAIL' | 'MOBILE';

  @ApiProperty({ writeOnly: true })
  @IsString()
  @MinLength(1)
  @MaxLength(320)
  public readonly identifier!: string;

  @ApiProperty({ writeOnly: true, minLength: 8, maxLength: 1024 })
  @IsString()
  @MinLength(8)
  @MaxLength(1024)
  public readonly password!: string;

  @ApiPropertyOptional({
    enum: ['STANDARD_AUTHENTICATION', 'PRIVILEGED_ADMIN_AUTHENTICATION', 'SUPER_ADMIN_AUTHENTICATION'],
  })
  @IsOptional()
  @IsEnum(['STANDARD_AUTHENTICATION', 'PRIVILEGED_ADMIN_AUTHENTICATION', 'SUPER_ADMIN_AUTHENTICATION'])
  public readonly classification?:
    | 'STANDARD_AUTHENTICATION'
    | 'PRIVILEGED_ADMIN_AUTHENTICATION'
    | 'SUPER_ADMIN_AUTHENTICATION';
}

export class DeactivateIdentityRequestDto {
  @ApiPropertyOptional({ maxLength: 256 })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  public readonly reasonCode?: string;
}

/**
 * M01-ID-003 self-service profile update request (minimal contract).
 *
 * Module 01's approved scope defines no directly user-mutable profile fields
 * (identifier changes belong to verification workflows; classification changes
 * belong to the internal M01-CLS operation). The empty DTO intentionally rejects
 * or strips any unknown request field through whitelist validation, keeping the
 * update contract explicit and version-safe.
 */
// The DTO is intentionally empty: no approved mutable profile fields exist yet.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class UpdateIdentityProfileRequestDto {}

export class IdentityProfileResponseDto {
  @ApiProperty()
  public readonly identityId!: string;

  @ApiProperty()
  public readonly identityState!: string;

  @ApiProperty()
  public readonly verificationState!: string;

  @ApiProperty()
  public readonly aggregateVersion!: number;

  @ApiProperty()
  public readonly classification!: string;

  @ApiPropertyOptional()
  public readonly primaryIdentifier?: {
    readonly identifierType: string;
    readonly verificationState: string;
  };

  @ApiProperty()
  public readonly createdAt!: string;

  @ApiProperty()
  public readonly updatedAt!: string;

  @ApiPropertyOptional()
  public readonly disabledAt?: string;

  @ApiPropertyOptional()
  public readonly anonymizedAt?: string;

  @ApiPropertyOptional()
  public readonly deletionRequestedAt?: string;
}

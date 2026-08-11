import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * M01-ADM-001 request. Only the PRIVILEGED_ADMIN_AUTHENTICATION classification
 * is accepted by validation; the SUPER_ADMIN_AUTHENTICATION classification is
 * applied exclusively by the controlled bootstrap (M01-ADM-002), so no hidden
 * Super Admin can be requested through this internal route. The identifier is
 * canonicalized and validated server-side before any write.
 */
export class ProvisionPrivilegedIdentityRequestDto {
  @ApiProperty({ minLength: 1, maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  public readonly provisioningReference!: string;

  @ApiProperty({ enum: ['EMAIL', 'MOBILE'] })
  @IsEnum(['EMAIL', 'MOBILE'])
  public readonly identifierType!: 'EMAIL' | 'MOBILE';

  @ApiProperty({ minLength: 3, maxLength: 320 })
  @IsString()
  @MinLength(3)
  @MaxLength(320)
  public readonly identifier!: string;

  @ApiProperty({ enum: ['PRIVILEGED_ADMIN_AUTHENTICATION'] })
  @IsEnum(['PRIVILEGED_ADMIN_AUTHENTICATION'])
  public readonly targetAuthenticationSecurityClassification!: 'PRIVILEGED_ADMIN_AUTHENTICATION';
}

/**
 * M01-ADM-002 request. The controlled bootstrap evidence references the
 * approved bootstrap command (non-secret); the SUPER_ADMIN_AUTHENTICATION
 * classification is always applied server-side and is never part of the
 * request. No Module 02 role is ever returned.
 */
export class BootstrapSuperAdminIdentityRequestDto {
  @ApiProperty({ minLength: 1, maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  public readonly bootstrapEvidence!: string;

  @ApiProperty({ enum: ['EMAIL', 'MOBILE'] })
  @IsEnum(['EMAIL', 'MOBILE'])
  public readonly identifierType!: 'EMAIL' | 'MOBILE';

  @ApiProperty({ minLength: 3, maxLength: 320 })
  @IsString()
  @MinLength(3)
  @MaxLength(320)
  public readonly identifier!: string;
}

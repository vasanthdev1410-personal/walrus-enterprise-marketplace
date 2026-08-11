import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { AUTHENTICATION_SECURITY_CLASSIFICATIONS } from '../../domain/identity/value-objects/authentication-security-classification';

/**
 * M01-CLS-001 request. The approved coordination contract supplies the target
 * authentication-security classification, an approved reason-code reference
 * and the versioned source contract reference. The server validates the
 * coordination contract and the version precondition before any change; the
 * caller can never select its own authorization. A classification only selects
 * authentication controls and never grants permissions.
 */
export class ClassificationTransitionRequestDto {
  @ApiProperty({ enum: AUTHENTICATION_SECURITY_CLASSIFICATIONS })
  @IsEnum(AUTHENTICATION_SECURITY_CLASSIFICATIONS)
  public readonly targetAuthenticationSecurityClassification!: (typeof AUTHENTICATION_SECURITY_CLASSIFICATIONS)[number];

  @ApiProperty({ minLength: 1, maxLength: 64 })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  public readonly reasonCode!: string;

  @ApiProperty({ minLength: 1, maxLength: 128 })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  public readonly sourceContractReference!: string;
}

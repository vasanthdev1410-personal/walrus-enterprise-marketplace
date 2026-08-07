import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OTP_PATTERN = /^\d{6}$/;

export class RegisterRegistrationRequestDto {
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

  // Privileged authentication classifications are assigned only by the internal
  // M01-CLS-001 operation; self-service registration may only request (or
  // default to) the standard classification.
  @ApiPropertyOptional({ enum: ['STANDARD_AUTHENTICATION'] })
  @IsOptional()
  @IsEnum(['STANDARD_AUTHENTICATION'])
  public readonly classification?: 'STANDARD_AUTHENTICATION';
}

export class VerificationChallengeRequestDto {
  @ApiProperty({ enum: ['EMAIL', 'SMS'] })
  @IsEnum(['EMAIL', 'SMS'])
  public readonly channelType!: 'EMAIL' | 'SMS';
}

export class VerificationConfirmationRequestDto {
  @ApiProperty()
  @IsString()
  @Matches(UUID_V7_PATTERN)
  public readonly challengeId!: string;

  @ApiProperty({ writeOnly: true })
  @IsString()
  @Matches(OTP_PATTERN)
  public readonly verificationEvidence!: string;
}

/**
 * M01-REG-004 activation carries no request fields in the approved contract;
 * the empty DTO rejects unknown fields through whitelist validation.
 */
// The DTO is intentionally empty: activation has no request body fields.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class ActivationRequestDto {}

import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, Matches } from 'class-validator';

/**
 * M01-MFA-001 request. Only the approved TOTP authenticator factor type may
 * be enrolled in Phase 1; any other factor type is rejected by validation.
 */
export class MfaEnrollmentRequestDto {
  @ApiProperty({ enum: ['TOTP_AUTHENTICATOR'] })
  @IsEnum(['TOTP_AUTHENTICATOR'])
  public readonly factorType!: 'TOTP_AUTHENTICATOR';
}

/** M01-MFA-002 request. The enrollment id travels in the path; only the TOTP is posted. */
export class MfaEnrollmentConfirmationRequestDto {
  @ApiProperty({ writeOnly: true, pattern: '^\\d{6}$' })
  @IsString()
  @Matches(/^\d{6}$/)
  public readonly verificationEvidence!: string;
}

/**
 * M01-MFA-004 request. Only the approved TOTP authenticator factor type may
 * be replaced in Phase 1; any other factor type is rejected by validation.
 */
export class MfaReplacementRequestDto {
  @ApiProperty({ enum: ['TOTP_AUTHENTICATOR'] })
  @IsEnum(['TOTP_AUTHENTICATOR'])
  public readonly replacementFactorType!: 'TOTP_AUTHENTICATOR';
}

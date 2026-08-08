import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const OTP_PATTERN = /^\d{6}$/;

/**
 * M01-VER-001 request. The approved scope restricts the authenticated
 * verification endpoint to contact-change verification; the destination is the
 * new contact the caller intends to add and is validated against the channel.
 */
export class VerificationChallengeRequestDto {
  @ApiProperty({ enum: ['CONTACT_CHANGE_VERIFICATION'] })
  @IsEnum(['CONTACT_CHANGE_VERIFICATION'])
  public readonly purpose!: 'CONTACT_CHANGE_VERIFICATION';

  @ApiProperty({ enum: ['EMAIL', 'SMS'] })
  @IsEnum(['EMAIL', 'SMS'])
  public readonly channelType!: 'EMAIL' | 'SMS';

  @ApiProperty({ writeOnly: true })
  @IsString()
  @MinLength(1)
  @MaxLength(320)
  public readonly destination!: string;
}

/** M01-VER-002 request. The challenge id travels in the path; only the OTP is posted. */
export class VerificationConfirmationRequestDto {
  @ApiProperty({ writeOnly: true })
  @IsString()
  @Matches(OTP_PATTERN)
  public readonly verificationEvidence!: string;
}

/**
 * M01-VER-003 request. The verified challenge is identified by the path and the
 * expected version travels in If-Match; the destination is taken from the
 * challenge server-side so no body fields are approved. The empty DTO
 * intentionally rejects or strips any unknown request field through whitelist
 * validation.
 */
// The DTO is intentionally empty: no request fields are approved for the commit.
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class CommitContactChangeRequestDto {}

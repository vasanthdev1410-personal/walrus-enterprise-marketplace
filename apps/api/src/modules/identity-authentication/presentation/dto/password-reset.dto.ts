import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * M01-CRED-002 request. The normalized identifier and the channel preference
 * are the only approved fields; the recovery destination is always resolved
 * server-side from the identity's verified identifier, never supplied by the
 * client.
 */
export class PasswordResetRequestDto {
  @ApiProperty({ writeOnly: true, minLength: 1, maxLength: 320 })
  @IsString()
  @MinLength(1)
  @MaxLength(320)
  public readonly identifier!: string;

  @ApiProperty({ enum: ['EMAIL', 'SMS'] })
  @IsEnum(['EMAIL', 'SMS'])
  public readonly channelType!: 'EMAIL' | 'SMS';
}

/**
 * M01-CRED-003 request. Only the new password is carried in the body per the
 * approved DTO; the recovery challenge locator, the one-time evidence and the
 * challenge version travel in the X-Recovery-Challenge, X-Recovery-Evidence
 * and If-Match headers respectively.
 */
export class PasswordResetConfirmationDto {
  @ApiProperty({ writeOnly: true, minLength: 8, maxLength: 1024 })
  @IsString()
  @MinLength(8)
  @MaxLength(1024)
  public readonly newPassword!: string;
}

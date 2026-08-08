import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * M01-CRED-001 request. Re-authentication is required: the caller must prove
 * knowledge of the current password. The new password must satisfy the approved
 * policy (the application service additionally enforces reuse history and the
 * policy bounds).
 */
export class ChangePasswordRequestDto {
  @ApiProperty({ writeOnly: true, minLength: 1, maxLength: 1024 })
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  public readonly currentPassword!: string;

  @ApiProperty({ writeOnly: true, minLength: 8, maxLength: 1024 })
  @IsString()
  @MinLength(8)
  @MaxLength(1024)
  public readonly newPassword!: string;
}

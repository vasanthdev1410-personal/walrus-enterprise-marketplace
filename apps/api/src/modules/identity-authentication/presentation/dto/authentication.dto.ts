import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class LoginRequestDto {
  @ApiProperty({ enum: ['EMAIL', 'MOBILE'] })
  @IsEnum(['EMAIL', 'MOBILE'])
  public readonly identifierType!: 'EMAIL' | 'MOBILE';

  @ApiProperty({ writeOnly: true })
  @IsString()
  @MinLength(1)
  @MaxLength(320)
  public readonly identifier!: string;

  @ApiProperty({ writeOnly: true, minLength: 1, maxLength: 1024 })
  @IsString()
  @MinLength(1)
  @MaxLength(1024)
  public readonly password!: string;

  @ApiProperty({ enum: ['WEB', 'MOBILE'] })
  @IsEnum(['WEB', 'MOBILE'])
  public readonly clientType!: 'WEB' | 'MOBILE';

  @ApiPropertyOptional({ format: 'uuid', description: 'UUIDv7 device-session identifier' })
  @IsOptional()
  @Matches(UUID_V7_PATTERN)
  public readonly deviceSessionId?: string;
}

export class MfaVerificationRequestDto {
  @ApiProperty({ writeOnly: true, pattern: '^\\d{6}$' })
  @Matches(/^\d{6}$/)
  public readonly verificationEvidence!: string;

  @ApiProperty({ enum: ['WEB', 'MOBILE'] })
  @IsEnum(['WEB', 'MOBILE'])
  public readonly clientType!: 'WEB' | 'MOBILE';

  @ApiPropertyOptional({ format: 'uuid', description: 'UUIDv7 device-session identifier' })
  @IsOptional()
  @Matches(UUID_V7_PATTERN)
  public readonly deviceSessionId?: string;
}

export class RefreshTokenRequestDto {
  @ApiPropertyOptional({ writeOnly: true, description: 'Required only for MOBILE clients' })
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(2048)
  public readonly refreshToken?: string;
}

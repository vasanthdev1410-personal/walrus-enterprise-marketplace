import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsObject, MaxLength, MinLength } from 'class-validator';
import { RECOVERY_OPERATION_CLASSES } from '../../domain/recovery/value-objects/recovery-operation-class';

/**
 * M01-REC-001 request. The client supplies the approved primary recovery
 * operation class, the locator type and the recovery locator (the verified
 * identifier whose identity is being recovered). The optional client context
 * is safe metadata only; the server derives identity resolution, eligibility
 * and the recovery destination entirely from authoritative state, never from
 * the client. The endpoint is PUBLIC_ENUMERATION_SAFE: the response never
 * confirms whether the locator resolved to an existing identity.
 */
export class RecoveryRequestDto {
  @ApiProperty({ enum: RECOVERY_OPERATION_CLASSES })
  @IsEnum(RECOVERY_OPERATION_CLASSES)
  public readonly operationClass!: (typeof RECOVERY_OPERATION_CLASSES)[number];

  @ApiProperty({ enum: ['EMAIL', 'MOBILE'] })
  @IsEnum(['EMAIL', 'MOBILE'])
  public readonly recoveryLocatorType!: 'EMAIL' | 'MOBILE';

  @ApiProperty({ writeOnly: true, minLength: 1, maxLength: 320 })
  @IsString()
  @MinLength(1)
  @MaxLength(320)
  public readonly recoveryLocator!: string;

  @ApiProperty({ required: false, type: Object })
  @IsOptional()
  @IsObject()
  public readonly clientContext?: Readonly<Record<string, string>>;
}

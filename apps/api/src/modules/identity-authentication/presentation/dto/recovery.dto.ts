import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsString,
  IsObject,
  MaxLength,
  MinLength,
} from 'class-validator';
import { RECOVERY_APPROVAL_DECISIONS } from '../../domain/recovery/value-objects/recovery-approval-decision';
import { RECOVERY_EVIDENCE_TYPES } from '../../domain/recovery/value-objects/recovery-evidence';
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

/**
 * M01-REC-002 request. The client submits one approved evidence type with
 * either the raw evidence value or an approved protected evidence reference.
 * Only the approved evidence types are accepted; the evidence value is
 * write-only and is never stored, logged or embedded in idempotency records.
 */
export class RecoveryEvidenceDto {
  @ApiProperty({ enum: RECOVERY_EVIDENCE_TYPES })
  @IsEnum(RECOVERY_EVIDENCE_TYPES)
  public readonly evidenceType!: (typeof RECOVERY_EVIDENCE_TYPES)[number];

  @ApiProperty({ writeOnly: true, required: false, minLength: 1, maxLength: 320 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(320)
  public readonly evidenceValue?: string;

  @ApiProperty({ required: false, minLength: 1, maxLength: 320 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(320)
  public readonly protectedEvidenceReference?: string;

  @ApiProperty({ minLength: 1, maxLength: 32 })
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  public readonly recoveryPolicyVersion!: string;
}

/**
 * M01-REC-004 request. The client confirms the authoritative approved policy
 * version; the deterministic policy row (never client-selected) decides
 * whether human approval is required for this recovery request. No approval,
 * evidence or identity material is accepted or returned.
 */
export class RecoveryApprovalRequestDto {
  @ApiProperty({ minLength: 1, maxLength: 32 })
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  public readonly recoveryPolicyVersion!: string;
}

/**
 * M01-REC-005 request. A Module 02-authorized approver records one decision
 * bound to the recovery request: the decision, the operation class being
 * approved (must match the request), a non-sensitive reason code, and a
 * declared expiry that the server validates and bounds. Module 02
 * roles/permissions are absent from every field.
 */
/**
 * M01-REC-006 request. The caller confirms the permitted operation the
 * recovery session is bound to and the authoritative approved policy version.
 * The server derives execution eligibility entirely from authoritative
 * recovery state; the client can never widen or reselect the operation or
 * policy row. No recovery, evidence or credential material is accepted.
 */
export class RecoveryExecutionDto {
  @ApiProperty({ enum: RECOVERY_OPERATION_CLASSES })
  @IsEnum(RECOVERY_OPERATION_CLASSES)
  public readonly permittedOperation!: (typeof RECOVERY_OPERATION_CLASSES)[number];

  @ApiProperty({ minLength: 1, maxLength: 32 })
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  public readonly recoveryPolicyVersion!: string;
}

export class RecoveryApprovalDecisionDto {
  @ApiProperty({ enum: RECOVERY_APPROVAL_DECISIONS })
  @IsEnum(RECOVERY_APPROVAL_DECISIONS)
  public readonly decision!: (typeof RECOVERY_APPROVAL_DECISIONS)[number];

  @ApiProperty({ enum: RECOVERY_OPERATION_CLASSES })
  @IsEnum(RECOVERY_OPERATION_CLASSES)
  public readonly recoveryOperationClass!: (typeof RECOVERY_OPERATION_CLASSES)[number];

  @ApiProperty({ minLength: 1, maxLength: 64 })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  public readonly approvalReasonCode!: string;

  @ApiProperty()
  @IsISO8601()
  public readonly approvalExpiresAt!: string;
}

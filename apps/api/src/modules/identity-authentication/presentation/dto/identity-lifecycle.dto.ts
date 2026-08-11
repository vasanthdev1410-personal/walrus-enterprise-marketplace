import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * M01-ID-004 request. The client (an approved Module 02 cross-module caller)
 * supplies the target authentication state, an approved reason-code reference
 * and the source contract reference. DELETED is deliberately rejected at the
 * boundary: deletion behaviour is finalized with privacy and retention
 * requirements before production use and is gated behind the Proposed
 * privacy-request ADRs. The server validates the approved Part 1 transition
 * matrix and obtains a current Module 02 authorization decision before any
 * change; the caller can never select its own authorization.
 */
export class IdentityStateTransitionRequestDto {
  @ApiProperty({ enum: ['ACTIVE', 'LOCKED', 'SUSPENDED', 'DISABLED'] })
  @IsEnum(['ACTIVE', 'LOCKED', 'SUSPENDED', 'DISABLED'])
  public readonly targetIdentityState!: 'ACTIVE' | 'LOCKED' | 'SUSPENDED' | 'DISABLED';

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

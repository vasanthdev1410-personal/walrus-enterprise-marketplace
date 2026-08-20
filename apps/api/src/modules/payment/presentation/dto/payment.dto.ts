/**
 * WEMP-M09-SPEC-001 §14/§19 (M09-M5). HTTP-level DTOs for the payment
 * self-service and admin APIs.
 */
import { ApiProperty } from '@nestjs/swagger';

// ---------------------------------------------------------------------------
// Self-service DTOs
// ---------------------------------------------------------------------------

/** Initiate payment request body. */
export class InitiatePaymentDto {
  @ApiProperty({ description: 'UUIDv7 of the order to initiate payment for' })
  public readonly orderId!: string;
}

// ---------------------------------------------------------------------------
// Admin DTOs
// ---------------------------------------------------------------------------

/** Admin initiate refund request body. */
export class AdminInitiateRefundDto {
  @ApiProperty({ description: 'Refund amount in minor currency units (cents/paise)' })
  public readonly amountCents!: number;

  @ApiProperty({ description: 'Reason reference for the refund' })
  public readonly reasonReference!: string;
}

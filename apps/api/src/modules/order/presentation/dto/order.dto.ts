/**
 * WEMP-M08-SPEC-001 §14/§19 (M08-M5). HTTP-level DTOs for the order
 * self-service and admin APIs. These are the wire-format contracts; the
 * application service owns the business-level command/result DTOs.
 */
import { ApiProperty } from '@nestjs/swagger';

// ---------------------------------------------------------------------------
// Self-service DTOs
// ---------------------------------------------------------------------------

/** Create order request body. */
export class CreateOrderDto {
  @ApiProperty({ description: 'UUIDv7 of the CartSnapshot to create the order from' })
  public readonly snapshotId!: string;
}

/** Cancel order request body. */
export class CancelOrderDto {
  @ApiProperty({ description: 'Optimistic concurrency version of the order' })
  public readonly expectedVersion!: number;

  @ApiProperty({ description: 'Reason reference for the cancellation' })
  public readonly reasonReference!: string;
}

// ---------------------------------------------------------------------------
// Admin DTOs
// ---------------------------------------------------------------------------

/** Admin order transition request body. */
export class AdminTransitionOrderDto {
  @ApiProperty({
    description:
      'Target state for the transition (CONFIRMED, PAID, SHIPPED, DELIVERED, CLOSED, CANCELLED)',
  })
  public readonly toState!: string;

  @ApiProperty({ description: 'Reason reference for the admin action' })
  public readonly reasonReference!: string;

  @ApiProperty({ description: 'Optimistic concurrency version of the order', required: false })
  public readonly expectedVersion?: number;
}

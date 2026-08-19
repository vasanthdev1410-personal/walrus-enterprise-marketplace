/**
 * WEMP-M07-SPEC-001 §14/§17 (M07-M5). HTTP-level DTOs for the cart
 * self-service and admin APIs. These are the wire-format contracts; the
 * application service owns the business-level command/result DTOs.
 */
import { ApiProperty } from '@nestjs/swagger';

// ---------------------------------------------------------------------------
// Self-service DTOs
// ---------------------------------------------------------------------------

/** Add item request body. */
export class AddCartItemDto {
  @ApiProperty({ description: 'UUIDv7 of the SKU to add to the cart' })
  public readonly skuId!: string;

  @ApiProperty({ description: 'UUIDv7 of the product owning this SKU' })
  public readonly productId!: string;

  @ApiProperty({ description: 'SKU code (human-readable identifier)' })
  public readonly skuCode!: string;

  @ApiProperty({ description: 'Quantity to add (1–100)', minimum: 1, maximum: 100 })
  public readonly quantity!: number;

  @ApiProperty({ description: 'Optimistic concurrency version of the cart' })
  public readonly expectedVersion!: number;
}

/** Update item quantity request body. */
export class UpdateCartItemQuantityDto {
  @ApiProperty({ description: 'New quantity (1–100)', minimum: 1, maximum: 100 })
  public readonly quantity!: number;

  @ApiProperty({ description: 'Optimistic concurrency version of the cart' })
  public readonly expectedVersion!: number;
}

/** Clear cart request body. */
export class ClearCartDto {
  @ApiProperty({ description: 'Optimistic concurrency version of the cart' })
  public readonly expectedVersion!: number;
}

/** Checkout handoff request body. */
export class CheckoutHandoffDto {
  @ApiProperty({ description: 'Optimistic concurrency version of the cart' })
  public readonly expectedVersion!: number;
}

// ---------------------------------------------------------------------------
// Admin DTOs — currently no request bodies beyond path params.
// ---------------------------------------------------------------------------

/**
 * Admin cart lifecycle action (expire). The admin authorization guard
 * ensures the caller holds the `cart.admin.manage` permission.
 */
export class AdminCartExpireDto {
  @ApiProperty({ description: 'Reason reference for the admin action' })
  public readonly reasonReference!: string;
}

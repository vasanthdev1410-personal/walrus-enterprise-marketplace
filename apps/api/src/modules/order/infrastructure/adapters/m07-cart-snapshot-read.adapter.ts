import { Injectable } from '@nestjs/common';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type {
  CartSnapshotData,
  OrderSnapshotReadPort,
} from '../../domain/ports/order-snapshot-read.port';

/**
 * WEMP-M08-SPEC-001 (decision D-03). Adapts the M07 CartSnapshot for
 * Module 08 order creation. M08 never reads M07 live cart data — it
 * consumes only the immutable CartSnapshot produced by M07's checkoutHandoff.
 *
 * The CartSnapshot is stored in the PrismaCartSnapshotStore (created by
 * M07 checkoutHandoff) and read here at order creation time.
 *
 * Fail closed: unknown or missing snapshots resolve to null; the
 * application service treats null as ORDER_SNAPSHOT_NOT_FOUND.
 */
@Injectable()
export class M07CartSnapshotReadAdapter implements OrderSnapshotReadPort {
  /**
   * In M08-M3, the CartSnapshot is passed as a data transfer object from
   * the M07 checkoutHandoff endpoint. The snapshot is stored in the
   * PrismaCartSnapshotStore by M07 and read here by reference.
   *
   * For M08-M3, we use an in-memory store that will be replaced by a
   * Prisma-backed store in M08-M5 when the API layer is implemented.
   */
  private readonly snapshots = new Map<string, CartSnapshotData>();

  public registerSnapshot(snapshot: CartSnapshotData): void {
    this.snapshots.set(snapshot.snapshotId.value, snapshot);
  }

  public readCartSnapshot(snapshotId: UuidV7): Promise<CartSnapshotData | null> {
    const result = this.snapshots.get(snapshotId.value) ?? null;
    return Promise.resolve(result);
  }
}

import type { Prisma } from '../../../../../../generated/prisma/client';
import { OptimisticConcurrencyError } from '../../../../domain/shared/errors/optimistic-concurrency.error';

export type TransactionClient = Prisma.TransactionClient;

export function assertVersionUpdated(count: number, aggregateName: string): void {
  if (count !== 1) {
    throw new OptimisticConcurrencyError(aggregateName);
  }
}

import type { UuidV7 } from '../../domain/shared/value-objects/uuid-v7';

export interface ClockPort {
  now(): Date;
}

export interface UuidV7GenerationPort {
  next(): UuidV7;
}

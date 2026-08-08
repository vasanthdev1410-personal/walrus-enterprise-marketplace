import { randomBytes } from 'node:crypto';
import type {
  ClockPort,
  UuidV7GenerationPort,
} from '../../application/ports/application-runtime.port';
import { UuidV7 } from '../../domain/shared/value-objects/uuid-v7';

export class SystemClockAdapter implements ClockPort {
  public now(): Date {
    return new Date();
  }
}

export class SystemUuidV7Generator implements UuidV7GenerationPort {
  public next(): UuidV7 {
    const timestamp = Date.now().toString(16).padStart(12, '0');
    const entropy = randomBytes(10).toString('hex');
    const variant = ((Number.parseInt(entropy[3] ?? '0', 16) & 0x3) | 0x8).toString(16);
    return new UuidV7(
      `${timestamp.slice(0, 8)}-${timestamp.slice(8)}-7${entropy.slice(0, 3)}-${variant}${entropy.slice(4, 7)}-${entropy.slice(7, 19)}`,
    );
  }
}

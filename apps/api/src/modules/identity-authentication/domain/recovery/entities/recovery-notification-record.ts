import type { ProtectedValue } from '../../shared/value-objects/protected-value';
import type { UuidV7 } from '../../shared/value-objects/uuid-v7';
import type {
  RecoveryNotificationDeliveryState,
  RecoveryNotificationType,
} from '../value-objects/recovery-notification';

export interface RecoveryNotificationRecordProperties {
  recoveryNotificationId: UuidV7;
  recoveryRequestId: UuidV7;
  notificationType: RecoveryNotificationType;
  deliveryState: RecoveryNotificationDeliveryState;
  protectedDestinationReference: ProtectedValue;
  createdAt: Date;
  deliveredAt?: Date;
  failedAt?: Date;
  failureReason?: string;
}

export class RecoveryNotificationRecord {
  public readonly properties: Readonly<RecoveryNotificationRecordProperties>;

  public constructor(properties: RecoveryNotificationRecordProperties) {
    if (properties.deliveryState === 'DELIVERED' && properties.deliveredAt === undefined) {
      throw new Error('Delivered Recovery Notification requires deliveredAt');
    }
    if (properties.deliveryState === 'FAILED' && properties.failedAt === undefined) {
      throw new Error('Failed Recovery Notification requires failedAt');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}

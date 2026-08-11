import type { AllowedAction } from '../value-objects/allowed-action';
import type { PermissionStatus } from '../value-objects/permission-status';

/**
 * Part 6.2 §8 (Module 02 source material). Permissions are the smallest
 * authorization unit. Identifiers are immutable and follow the lowercase
 * `resource.action` form so every grant is explicit and traceable; implicit
 * permissions are prohibited.
 */
const PERMISSION_IDENTIFIER_PATTERN = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*){1,}$/;

export interface PermissionProperties {
  readonly permissionId: string;
  readonly name: string;
  readonly protectedResource: string;
  readonly allowedAction: AllowedAction;
  readonly status: PermissionStatus;
}

export class Permission {
  public readonly properties: Readonly<PermissionProperties>;

  public constructor(properties: PermissionProperties) {
    if (!PERMISSION_IDENTIFIER_PATTERN.test(properties.permissionId)) {
      throw new Error('Permission identifier must be lowercase dotted resource.action');
    }
    if (properties.name.trim() === '') {
      throw new Error('Permission name is required');
    }
    if (properties.protectedResource.trim() === '') {
      throw new Error('Permission protected resource is required');
    }
    this.properties = Object.freeze({ ...properties });
    Object.freeze(this);
  }
}

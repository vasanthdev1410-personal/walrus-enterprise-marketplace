import { Injectable } from '@nestjs/common';
import type { UuidV7 } from '../../../identity-authentication/domain/shared/value-objects/uuid-v7';
import type {
  InventoryAdminAction,
  InventoryAdminAuthorizationPort,
} from '../ports/inventory-admin-authorization.port';

/**
 * WEMP-M05-AUTHZ-001 (decisions D-05, A-09; Gate #1 RECORDED 2026-08-15).
 * Fail-closed administrative authorization for M05-M3: no grant is ever
 * issued, so admin corrections and audit views are denied until M05-M4
 * wires the real Module 02 permission adapter for the approved
 * `inventory.adjust.admin` / `inventory.audit.view` identifiers. Deny is
 * the only safe default; Module 05 never evaluates roles itself (A-02).
 */
@Injectable()
export class FailClosedInventoryAdminAuthorizationAdapter implements InventoryAdminAuthorizationPort {
  public isGranted(identityId: UuidV7, action: InventoryAdminAction): Promise<boolean> {
    void identityId;
    void action;
    return Promise.resolve(false);
  }
}

import { CustomerAddress } from '../entities/customer-address';
import { CustomerDomainError } from '../errors/customer-domain.error';
import type { CustomerAddressRole } from '../value-objects/customer-address-role';

/**
 * WEMP-M06-SPEC-001 §7 (decision D-04). Aggregate-level address book
 * invariants: at most one default shipping and at most one default billing
 * address per profile among ACTIVE addresses; a REMOVED address can never be
 * a default; and duplicate address records are not permitted. All rules fail
 * closed with a non-disclosing CustomerDomainError.
 */
export class CustomerAddressPolicy {
  /**
   * Validates the full ACTIVE address set of a customer profile. Throws
   * CustomerDomainError on any violation (duplicate defaults, REMOVED
   * defaults, duplicate identities); returns void on success.
   */
  public assertValidAddresses(addresses: readonly CustomerAddress[]): void {
    const active = addresses.filter((address) => address.properties.state === 'ACTIVE');
    const removed = addresses.filter((address) => address.properties.state === 'REMOVED');

    if (
      removed.some(
        (address) => address.properties.isDefaultShipping || address.properties.isDefaultBilling,
      )
    ) {
      throw new CustomerDomainError('CUSTOMER_DEFAULT_ADDRESS_CONFLICT');
    }

    const defaultShipping = active.filter((address) => address.properties.isDefaultShipping);
    const defaultBilling = active.filter((address) => address.properties.isDefaultBilling);
    if (defaultShipping.length > 1) {
      throw new CustomerDomainError('CUSTOMER_DEFAULT_ADDRESS_CONFLICT');
    }
    if (defaultBilling.length > 1) {
      throw new CustomerDomainError('CUSTOMER_DEFAULT_ADDRESS_CONFLICT');
    }

    const addressIds = new Set(active.map((address) => address.properties.addressId.value));
    if (addressIds.size !== active.length) {
      throw new CustomerDomainError('CUSTOMER_ADDRESS_CONFLICT');
    }
  }

  /**
   * Returns a new address set with `addressId` set as the default for `role`
   * and the previous ACTIVE default for that role cleared — atomically at the
   * domain level (WEMP-M06-SPEC-001 §7: "setting a new default atomically
   * clears the previous default"). The address must exist and be ACTIVE and
   * carry the role; the resulting set is validated before return. Returns a
   * fresh array — the input set is never mutated.
   */
  public setDefault(
    addresses: readonly CustomerAddress[],
    addressId: string,
    role: CustomerAddressRole,
  ): readonly CustomerAddress[] {
    const target = addresses.find((address) => address.properties.addressId.value === addressId);
    if (target === undefined) {
      throw new CustomerDomainError('CUSTOMER_ADDRESS_CONFLICT');
    }
    if (target.properties.state !== 'ACTIVE') {
      throw new CustomerDomainError('CUSTOMER_ADDRESS_CONFLICT');
    }
    if (!target.properties.roles.includes(role)) {
      throw new CustomerDomainError('CUSTOMER_ADDRESS_CONFLICT');
    }

    const updated = addresses.map((address) => {
      const properties = address.properties;
      if (properties.addressId.value === addressId) {
        return new CustomerAddress({
          ...properties,
          ...(role === 'SHIPPING' ? { isDefaultShipping: true } : { isDefaultBilling: true }),
        });
      }
      const clearsRole =
        role === 'SHIPPING' ? properties.isDefaultShipping : properties.isDefaultBilling;
      if (clearsRole && properties.state === 'ACTIVE') {
        return new CustomerAddress({
          ...properties,
          ...(role === 'SHIPPING' ? { isDefaultShipping: false } : { isDefaultBilling: false }),
        });
      }
      return address;
    });

    this.assertValidAddresses(updated);
    return updated;
  }

  /**
   * Returns the ACTIVE default address for a role, or null when the profile
   * has no default for that role. Fail closed: a REMOVED address is never a
   * candidate for a default.
   */
  public findDefault(
    addresses: readonly CustomerAddress[],
    role: CustomerAddressRole,
  ): CustomerAddress | null {
    const active = addresses.filter((address) => address.properties.state === 'ACTIVE');
    const match = active.find((address) =>
      role === 'SHIPPING'
        ? address.properties.isDefaultShipping
        : address.properties.isDefaultBilling,
    );
    return match ?? null;
  }

  /**
   * Resolves the ACTIVE address of a profile by addressId, or null. Used for
   * address-scoped operations; a REMOVED address cannot be operated on
   * (fail closed).
   */
  public findActiveAddress(
    addresses: readonly CustomerAddress[],
    addressId: string,
  ): CustomerAddress | null {
    const match = addresses.find(
      (address) =>
        address.properties.state === 'ACTIVE' && address.properties.addressId.value === addressId,
    );
    return match ?? null;
  }
}

/**
 * WEMP-M04-SPEC-001 §7 (decision D-04). Typed, structured attribute values —
 * no free-form key/value storage. Definitions carry one of these value
 * types; product/variant attribute values are validated against their ACTIVE
 * definition at write time.
 */
export const ATTRIBUTE_VALUE_TYPES = ['STRING', 'NUMBER', 'BOOLEAN', 'DATE'] as const;

export type AttributeValueType = (typeof ATTRIBUTE_VALUE_TYPES)[number];

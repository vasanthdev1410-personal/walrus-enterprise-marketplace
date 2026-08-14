/**
 * WEMP-M04-SPEC-001 §12 (decision D-09). Product media categories. Phase 1
 * supports the approved image allowlist (JPEG/PNG/WebP, decision D-16);
 * the type is recorded on ProductMedia so future categories remain additive.
 */
export const PRODUCT_MEDIA_TYPES = ['IMAGE'] as const;

export type ProductMediaType = (typeof PRODUCT_MEDIA_TYPES)[number];

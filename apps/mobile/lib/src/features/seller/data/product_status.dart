
/// Lifecycle states of a product (WEMP-M04-SPEC-001 §5, decision D-02).
/// Presentation vocabulary only — the server remains authoritative.
enum ProductLifecycleState {
  draft('DRAFT'),
  submitted('SUBMITTED'),
  underReview('UNDER_REVIEW'),
  approved('APPROVED'),
  published('PUBLISHED'),
  correctionsRequested('CORRECTIONS_REQUESTED'),
  unpublished('UNPUBLISHED'),
  rejected('REJECTED'),
  closed('CLOSED');

  const ProductLifecycleState(this.apiValue);

  final String apiValue;

  static ProductLifecycleState fromApi(String value) {
    for (final state in ProductLifecycleState.values) {
      if (state.apiValue == value) {
        return state;
      }
    }
    throw const FormatException('Unknown product lifecycle state: $value');
  }

  String get label {
    return switch (this) {
      ProductLifecycleState.draft => 'Draft',
      ProductLifecycleState.submitted => 'Submitted',
      ProductLifecycleState.underReview => 'Under review',
      ProductLifecycleState.approved => 'Approved',
      ProductLifecycleState.published => 'Published',
      ProductLifecycleState.correctionsRequested => 'Corrections requested',
      ProductLifecycleState.unpublished => 'Unpublished',
      ProductLifecycleState.rejected => 'Rejected',
      ProductLifecycleState.closed => 'Closed',
    };
  }
}

/// A non-enumerating product summary row returned by the M04-M5 seller list
/// endpoint. No pricing or policy internals beyond the display fields.
class ProductSummary {
  const ProductSummary({
    required this.productId,
    required this.sellerProfileId,
    required this.name,
    required this.state,
    required this.sellingPrice,
    required this.version,
  });

  final String productId;
  final String sellerProfileId;
  final String name;
  final ProductLifecycleState state;
  final double sellingPrice;
  final int version;

  factory ProductSummary.fromJson(Map<String, dynamic> json) {
    return ProductSummary(
      productId: json['productId'] as String,
      sellerProfileId: json['sellerProfileId'] as String,
      name: json['name'] as String,
      state: ProductLifecycleState.fromApi(json['state'] as String),
      sellingPrice: (json['sellingPrice'] as num).toDouble(),
      version: json['version'] as int,
    );
  }
}

/// A platform-defined category (read-only taxonomy, §6 / decision D-03).
class CategorySummary {
  const CategorySummary({
    required this.categoryId,
    required this.name,
    required this.state,
  });

  final String categoryId;
  final String name;
  final String state;

  factory CategorySummary.fromJson(Map<String, dynamic> json) {
    return CategorySummary(
      categoryId: json['categoryId'] as String,
      name: json['name'] as String,
      state: json['state'] as String,
    );
  }
}

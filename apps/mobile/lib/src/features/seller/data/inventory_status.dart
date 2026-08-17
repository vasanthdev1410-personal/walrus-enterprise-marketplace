/// Read-only inventory status of a seller's SKU (WEMP-M05-SPEC-001 §15,
/// decision D-13: mobile inventory is strictly read-only — no adjustments,
/// corrections, thresholds, or admin controls on mobile). The server is
/// authoritative for availability and stock labels; this model is
/// presentation vocabulary only.
enum InventoryStockLabel {
  inStock('IN_STOCK'),
  lowStock('LOW_STOCK'),
  outOfStock('OUT_OF_STOCK');

  const InventoryStockLabel(this.apiValue);

  final String apiValue;

  static InventoryStockLabel? fromApi(String? value) {
    if (value == null) {
      return null;
    }
    for (final label in InventoryStockLabel.values) {
      if (label.apiValue == value) {
        return label;
      }
    }
    return null;
  }

  String get label {
    return switch (this) {
      InventoryStockLabel.inStock => 'In stock',
      InventoryStockLabel.lowStock => 'Low stock',
      InventoryStockLabel.outOfStock => 'Out of stock',
    };
  }
}

/// A non-enumerating per-SKU availability row returned by the M05-M5 seller
/// inventory list/detail endpoints. Carries only display facts — never other
/// sellers' data or internal policy internals.
class InventoryStatusEntry {
  const InventoryStatusEntry({
    required this.skuId,
    required this.onHand,
    required this.reserved,
    required this.available,
    required this.version,
    required this.label,
  });

  final String skuId;
  final int onHand;
  final int reserved;
  final int available;
  final int version;
  final InventoryStockLabel? label;

  factory InventoryStatusEntry.fromJson(Map<String, dynamic> json) {
    return InventoryStatusEntry(
      skuId: json['skuId'] as String,
      onHand: json['onHand'] as int,
      reserved: json['reserved'] as int,
      available: json['available'] as int,
      version: json['version'] as int,
      label: InventoryStockLabel.fromApi(json['label'] as String?),
    );
  }
}

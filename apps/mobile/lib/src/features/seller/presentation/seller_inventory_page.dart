import 'package:flutter/material.dart';

import '../data/inventory_status.dart';
import '../data/seller_api_client.dart';
import '../data/seller_status.dart';

/// M05-M5 mobile seller inventory feature (decision D-13: strictly
/// READ-ONLY). Displays the caller's own per-SKU availability and derived
/// stock label; no adjustments, corrections, thresholds, or admin controls
/// are exposed on mobile. The server is authoritative for ownership and
/// authorization — this page renders whatever the M05-M5 API reports and
/// never infers access.
class SellerInventoryPage extends StatefulWidget {
  const SellerInventoryPage({super.key, SellerApiClient? apiClient})
    : _apiClient = apiClient;

  final SellerApiClient? _apiClient;

  @override
  State<SellerInventoryPage> createState() => _SellerInventoryPageState();
}

class _SellerInventoryPageState extends State<SellerInventoryPage> {
  late final SellerApiClient _apiClient;

  SellerStatus? _sellerStatus;
  List<InventoryStatusEntry> _inventory = const <InventoryStatusEntry>[];
  SellerApiErrorKind? _errorKind;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _apiClient = widget._apiClient ?? HttpSellerApiClient();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _errorKind = null;
    });
    try {
      final seller = await _apiClient.getOnboardingStatus();
      final inventory = await _apiClient.listOwnInventory(seller.sellerProfileId);
      if (!mounted) {
        return;
      }
      setState(() {
        _sellerStatus = seller;
        _inventory = inventory;
        _loading = false;
      });
    } on SellerApiException catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _errorKind = error.kind;
        _loading = false;
      });
    }
  }

  Future<void> _reload() => _load();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Inventory status')),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: _buildBody(),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    final errorKind = _errorKind;
    if (errorKind != null) {
      return _ErrorView(message: safeSellerApiMessage(errorKind), onRetry: _reload);
    }
    final seller = _sellerStatus;
    if (seller == null) {
      // The caller has no seller association — inventory cannot be used.
      return _ErrorView(
        message: 'Seller onboarding must be completed before inventory access.',
        onRetry: _reload,
      );
    }
    return _InventoryView(seller: seller, inventory: _inventory);
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        Text(message, textAlign: TextAlign.center),
        const SizedBox(height: 16),
        OutlinedButton(onPressed: onRetry, child: const Text('Try again')),
      ],
    );
  }
}

class _InventoryView extends StatelessWidget {
  const _InventoryView({required this.seller, required this.inventory});

  final SellerStatus seller;
  final List<InventoryStatusEntry> inventory;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Text('Inventory', style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 8),
        Text('Seller: ${seller.sellerProfileId}'),
        const SizedBox(height: 16),
        if (inventory.isEmpty)
          const Text('No inventory records yet.')
        else
          ...inventory.map((entry) => _InventoryRow(entry: entry)),
      ],
    );
  }
}

class _InventoryRow extends StatelessWidget {
  const _InventoryRow({required this.entry});

  final InventoryStatusEntry entry;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: const EdgeInsets.symmetric(vertical: 6),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(
              entry.skuId,
              style: Theme.of(context).textTheme.titleSmall,
            ),
            const SizedBox(height: 4),
            Text(
              '${entry.available} available'
              ' (${entry.onHand} on hand, ${entry.reserved} reserved)',
            ),
            const SizedBox(height: 4),
            Text(_labelText(entry.label)),
          ],
        ),
      ),
    );
  }

  String _labelText(InventoryStockLabel? label) {
    if (label == null) {
      return 'Stock status unknown';
    }
    return 'Status: ${label.label}';
  }
}

import 'package:flutter/material.dart';

import '../data/product_status.dart';
import '../data/seller_api_client.dart';
import '../data/seller_status.dart';

/// M04-M6 mobile seller product catalog feature (decision D-14: create /
/// submit / status only; no full variant/SKU/media management on mobile).
/// The server is authoritative: this page renders whatever the M04-M5 API
/// reports and never infers access or lifecycle authority.
class SellerProductsPage extends StatefulWidget {
  const SellerProductsPage({super.key, SellerApiClient? apiClient})
    : _apiClient = apiClient;

  final SellerApiClient? _apiClient;

  @override
  State<SellerProductsPage> createState() => _SellerProductsPageState();
}

class _SellerProductsPageState extends State<SellerProductsPage> {
  late final SellerApiClient _apiClient;

  SellerStatus? _sellerStatus;
  List<ProductSummary> _products = const <ProductSummary>[];
  SellerApiErrorKind? _errorKind;
  bool _loading = true;
  bool _creating = false;

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
      final products = await _apiClient.listProducts(seller.sellerProfileId);
      if (!mounted) {
        return;
      }
      setState(() {
        _sellerStatus = seller;
        _products = products;
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

  Future<void> _submitProduct(ProductSummary product) async {
    setState(() {
      _creating = true;
    });
    try {
      final seller = _sellerStatus;
      if (seller == null) {
        return;
      }
      await _apiClient.submitProduct(
        productId: product.productId,
        sellerProfileId: seller.sellerProfileId,
        expectedVersion: product.version,
      );
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Product submitted for review.')),
      );
      await _reload();
    } on SellerApiException catch (error) {
      if (!mounted) {
        return;
      }
      ScaffoldMessenger.of(
        context,
      ).showSnackBar(SnackBar(content: Text(safeSellerApiMessage(error.kind))));
    } finally {
      if (mounted) {
        setState(() {
          _creating = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Product catalog')),
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
      // The caller has no seller association — the catalog cannot be used.
      return _ErrorView(
        message: 'Seller onboarding must be completed before catalog access.',
        onRetry: _reload,
      );
    }
    return _CatalogView(
      seller: seller,
      products: _products,
      apiClient: _apiClient,
      creating: _creating,
      onCreated: _reload,
      onSubmit: _submitProduct,
    );
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

class _CatalogView extends StatelessWidget {
  const _CatalogView({
    required this.seller,
    required this.products,
    required this.apiClient,
    required this.creating,
    required this.onCreated,
    required this.onSubmit,
  });

  final SellerStatus seller;
  final List<ProductSummary> products;
  final SellerApiClient apiClient;
  final bool creating;
  final VoidCallback onCreated;
  final void Function(ProductSummary) onSubmit;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Text('Products', style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 8),
        Text('Seller: ${seller.sellerProfileId}'),
        const SizedBox(height: 16),
        if (products.isEmpty)
          const Text('No products yet. Create your first product.')
        else
          ...products.map((product) => _ProductRow(
                product: product,
                creating: creating,
                onSubmit: () => onSubmit(product),
              )),
        const SizedBox(height: 16),
        _ProductCreateForm(
          apiClient: apiClient,
          seller: seller,
          creating: creating,
          onCreated: onCreated,
        ),
      ],
    );
  }
}

class _ProductRow extends StatelessWidget {
  const _ProductRow({
    required this.product,
    required this.creating,
    required this.onSubmit,
  });

  final ProductSummary product;
  final bool creating;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context) {
    final canSubmit = product.state == ProductLifecycleState.draft ||
        product.state == ProductLifecycleState.correctionsRequested ||
        product.state == ProductLifecycleState.unpublished;
    return Card(
      child: ListTile(
        title: Text(product.name),
        subtitle: Text(
          'Status: ${product.state.label} — Price: ${product.sellingPrice.toStringAsFixed(2)}',
        ),
        trailing: canSubmit
            ? FilledButton(
                onPressed: creating ? null : onSubmit,
                child: const Text('Submit'),
              )
            : null,
      ),
    );
  }
}

class _ProductCreateForm extends StatefulWidget {
  const _ProductCreateForm({
    required this.apiClient,
    required this.seller,
    required this.creating,
    required this.onCreated,
  });

  final SellerApiClient apiClient;
  final SellerStatus seller;
  final bool creating;
  final VoidCallback onCreated;

  @override
  State<_ProductCreateForm> createState() => _ProductCreateFormState();
}

class _ProductCreateFormState extends State<_ProductCreateForm> {
  final TextEditingController _name = TextEditingController();
  final TextEditingController _sellingPrice = TextEditingController();
  final TextEditingController _skuCode = TextEditingController();
  String? _selectedCategoryId;
  List<CategorySummary> _categories = const <CategorySummary>[];
  String? _notice;
  bool _saving = false;

  @override
  void initState() {
    super.initState();
    _loadCategories();
  }

  Future<void> _loadCategories() async {
    try {
      final categories = await widget.apiClient.listCategories();
      if (!mounted) {
        return;
      }
      setState(() {
        _categories = categories
            .where((category) => category.state == 'ACTIVE')
            .toList();
      });
    } on SellerApiException catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _notice = safeSellerApiMessage(error.kind);
      });
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _sellingPrice.dispose();
    _skuCode.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final price = double.tryParse(_sellingPrice.text.trim());
    final categoryId = _selectedCategoryId;
    if (_name.text.trim().isEmpty ||
        categoryId == null ||
        price == null ||
        price <= 0 ||
        _skuCode.text.trim().isEmpty) {
      setState(() {
        _notice = safeSellerApiMessage(SellerApiErrorKind.validation);
      });
      return;
    }
    setState(() {
      _saving = true;
      _notice = null;
    });
    try {
      await widget.apiClient.createProduct(
        sellerProfileId: widget.seller.sellerProfileId,
        name: _name.text.trim(),
        categoryId: categoryId,
        sellingPrice: price,
        skuCode: _skuCode.text.trim(),
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _saving = false;
        _notice = 'Product created as draft.';
      });
      _name.clear();
      _sellingPrice.clear();
      _skuCode.clear();
      widget.onCreated();
    } on SellerApiException catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _saving = false;
        _notice = safeSellerApiMessage(error.kind);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Text('New product', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        TextField(
          controller: _name,
          decoration: const InputDecoration(labelText: 'Name'),
          enabled: !_saving,
        ),
        DropdownButtonFormField<String>(
          initialValue: _selectedCategoryId,
          decoration: const InputDecoration(labelText: 'Category'),
          items: _categories
              .map(
                (category) => DropdownMenuItem<String>(
                  value: category.categoryId,
                  child: Text(category.name),
                ),
              )
              .toList(),
          onChanged: _saving
              ? null
              : (value) {
                  setState(() {
                    _selectedCategoryId = value;
                  });
                },
        ),
        TextField(
          controller: _sellingPrice,
          decoration: const InputDecoration(
            labelText: 'Selling price',
            helperText: 'INR, > 0, at most 1,000,000 with 2 decimals',
          ),
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          enabled: !_saving,
        ),
        TextField(
          controller: _skuCode,
          decoration: const InputDecoration(
            labelText: 'SKU code',
            helperText: 'Uppercase letters, digits, dash or underscore (1–64)',
          ),
          enabled: !_saving,
        ),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _saving || widget.creating ? null : _submit,
          child: const Text('Create product'),
        ),
        if (_notice != null) ...<Widget>[
          const SizedBox(height: 12),
          Text(_notice!, textAlign: TextAlign.center),
        ],
      ],
    );
  }
}

import 'package:walrus_mobile/src/features/seller/data/inventory_status.dart';
import 'package:walrus_mobile/src/features/seller/data/product_status.dart';
import 'package:walrus_mobile/src/features/seller/data/seller_api_client.dart';
import 'package:walrus_mobile/src/features/seller/data/seller_status.dart';

/// Deterministic fake of the M03-M5 seller API + M04-M5 product catalog for
/// widget tests. Test code configures the status/products/error to return;
/// no network access occurs.
class FakeSellerApiClient implements SellerApiClient {
  FakeSellerApiClient({SellerStatus? status, SellerApiException? error})
    : _status = status,
      _error = error;

  SellerStatus? _status;
  SellerApiException? _error;
  List<ProductSummary> products = <ProductSummary>[];
  List<CategorySummary> categories = <CategorySummary>[];
  List<InventoryStatusEntry> inventory = <InventoryStatusEntry>[];
  final List<String> calls = <String>[];

  void setStatus(SellerStatus status) {
    _status = status;
    _error = null;
  }

  void setError(SellerApiException error) {
    _error = error;
    _status = null;
  }

  @override
  Future<SellerStatus> getOnboardingStatus() async {
    calls.add('getOnboardingStatus');
    final error = _error;
    if (error != null) {
      throw error;
    }
    final status = _status;
    if (status == null) {
      throw const SellerApiException(
        SellerApiErrorKind.notFound,
        'The requested record could not be found.',
      );
    }
    return status;
  }

  @override
  Future<void> createOnboarding({
    required String legalName,
    required String tradeName,
    required String registrationNumber,
    required String businessAddress,
  }) async {
    calls.add('createOnboarding');
  }

  @override
  Future<void> submitOnboarding({
    required String sellerProfileId,
    required int expectedVersion,
  }) async {
    calls.add('submitOnboarding');
  }

  @override
  Future<List<ProductSummary>> listProducts(String sellerProfileId) async {
    calls.add('listProducts:$sellerProfileId');
    return products;
  }

  @override
  Future<ProductSummary> createProduct({
    required String sellerProfileId,
    required String name,
    required String categoryId,
    required double sellingPrice,
    required String skuCode,
  }) async {
    calls.add('createProduct:$name');
    final product = ProductSummary(
      productId: 'product-${products.length + 1}',
      sellerProfileId: sellerProfileId,
      name: name,
      state: ProductLifecycleState.draft,
      sellingPrice: sellingPrice,
      version: 1,
    );
    products = <ProductSummary>[...products, product];
    return product;
  }

  @override
  Future<void> submitProduct({
    required String productId,
    required String sellerProfileId,
    required int expectedVersion,
  }) async {
    calls.add('submitProduct:$productId');
    products = products
        .map(
          (product) => product.productId == productId
              ? ProductSummary(
                  productId: product.productId,
                  sellerProfileId: product.sellerProfileId,
                  name: product.name,
                  state: ProductLifecycleState.submitted,
                  sellingPrice: product.sellingPrice,
                  version: product.version + 1,
                )
              : product,
        )
        .toList();
  }

  @override
  Future<List<CategorySummary>> listCategories() async {
    calls.add('listCategories');
    return categories;
  }

  @override
  Future<List<InventoryStatusEntry>> listOwnInventory(String sellerProfileId) async {
    calls.add('listOwnInventory:$sellerProfileId');
    final error = _error;
    if (error != null) {
      throw error;
    }
    return inventory;
  }

  @override
  Future<InventoryStatusEntry> getOwnSkuDetail(
    String skuId,
    String sellerProfileId,
  ) async {
    calls.add('getOwnSkuDetail:$skuId:$sellerProfileId');
    final error = _error;
    if (error != null) {
      throw error;
    }
    for (final entry in inventory) {
      if (entry.skuId == skuId) {
        return entry;
      }
    }
    throw const SellerApiException(
      SellerApiErrorKind.notFound,
      'The requested record could not be found.',
    );
  }
}

ProductSummary draftProduct() {
  return const ProductSummary(
    productId: '0191310f-789a-7123-8123-000000000011',
    sellerProfileId: '0191310f-789a-7123-8123-000000000003',
    name: 'Espresso machine',
    state: ProductLifecycleState.draft,
    sellingPrice: 499.99,
    version: 1,
  );
}

CategorySummary appliancesCategory() {
  return const CategorySummary(
    categoryId: '0191310f-789a-7123-8123-000000000005',
    name: 'Appliances',
    state: 'ACTIVE',
  );
}

SellerStatus draftStatus() {
  return const SellerStatus(
    sellerProfileId: '0191310f-789a-7123-8123-000000000003',
    state: SellerLifecycleState.draft,
    complianceState: SellerComplianceState.notStarted,
    version: 1,
    legalName: 'Walrus Retail',
    tradeName: 'Walrus',
    businessAddress: '1 Market Street',
    verifications: <VerificationSummary>[],
  );
}

SellerStatus submittedStatus() {
  return const SellerStatus(
    sellerProfileId: '0191310f-789a-7123-8123-000000000003',
    state: SellerLifecycleState.submitted,
    complianceState: SellerComplianceState.inProgress,
    version: 2,
    legalName: 'Walrus Retail',
    tradeName: 'Walrus',
    businessAddress: '1 Market Street',
    verifications: <VerificationSummary>[],
  );
}

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'inventory_status.dart';
import 'product_status.dart';
import 'seller_status.dart';

/// Coarse, safe error kinds surfaced to the mobile UI. The server remains
/// authoritative; only generic, non-disclosing client messages are rendered.
enum SellerApiErrorKind {
  unauthorized,
  accessDenied,
  notFound,
  conflict,
  rateLimited,
  validation,
  network,
  server,
}

class SellerApiException implements Exception {
  const SellerApiException(this.kind, this.message);

  final SellerApiErrorKind kind;
  final String message;

  @override
  String toString() => 'SellerApiException($kind)';
}

/// Safe, generic client messages (never server policy/evidence internals).
String safeSellerApiMessage(SellerApiErrorKind kind) {
  return switch (kind) {
    SellerApiErrorKind.unauthorized =>
      'Your session has expired. Sign in again to continue.',
    SellerApiErrorKind.accessDenied =>
      'You do not have permission to perform this action.',
    SellerApiErrorKind.notFound =>
      'The requested record could not be found.',
    SellerApiErrorKind.conflict =>
      'This action conflicts with the current state. Refresh and try again.',
    SellerApiErrorKind.rateLimited =>
      'Too many requests. Please try again shortly.',
    SellerApiErrorKind.validation =>
      'The request could not be completed. Check the entered details and try again.',
    SellerApiErrorKind.network =>
      'The service is temporarily unreachable. Please try again shortly.',
    SellerApiErrorKind.server =>
      'An unexpected error occurred. Please try again shortly.',
  };
}

/// Port for the M03-M5 seller self-service API (onboarding surface used by
/// M03-M6 mobile). Implementations are injected so widget tests never touch
/// the network.
abstract interface class SellerApiClient {
  /// Reads the caller's own onboarding status (`GET /seller/onboarding`).
  /// Throws [SellerApiException] with [SellerApiErrorKind.notFound] when the
  /// caller has no seller association.
  Future<SellerStatus> getOnboardingStatus();

  /// Creates a DRAFT seller profile (`POST /seller/onboarding`).
  Future<void> createOnboarding({
    required String legalName,
    required String tradeName,
    required String registrationNumber,
    required String businessAddress,
  });

  /// Submits the own onboarding for review (`POST /seller/onboarding/submit`).
  Future<void> submitOnboarding({
    required String sellerProfileId,
    required int expectedVersion,
  });

  // ----- Module 04 product catalog (D-14: create / submit / status only) -----

  /// Lists the caller's own products (`GET /seller/products?sellerProfileId=`).
  /// Returns non-enumerating summary rows.
  Future<List<ProductSummary>> listProducts(String sellerProfileId);

  /// Creates a DRAFT product (`POST /seller/products`). Returns the new
  /// product id and its version.
  Future<ProductSummary> createProduct({
    required String sellerProfileId,
    required String name,
    required String categoryId,
    required double sellingPrice,
    required String skuCode,
  });

  /// Submits the own DRAFT product for moderation (`POST
  /// /seller/products/:id/submit`), version-checked.
  Future<void> submitProduct({
    required String productId,
    required String sellerProfileId,
    required int expectedVersion,
  });

  /// Reads active platform categories (`GET /seller/categories`).
  Future<List<CategorySummary>> listCategories();

  // ----- Module 05 inventory (D-13: strictly READ-ONLY on mobile) -----

  /// Lists the caller's own inventory availability per SKU
  /// (`GET /seller/inventory?sellerProfileId=`). Returns non-enumerating
  /// availability rows. Mobile never mutates inventory.
  Future<List<InventoryStatusEntry>> listOwnInventory(String sellerProfileId);

  /// Reads the caller's own SKU availability detail
  /// (`GET /seller/inventory/:skuId?sellerProfileId=`). Fails closed on
  /// unknown or cross-organization SKUs.
  Future<InventoryStatusEntry> getOwnSkuDetail(
    String skuId,
    String sellerProfileId,
  );
}

/// HTTP implementation over the M03-M5 API using the platform `HttpClient`.
/// The bearer access token is supplied by the caller (in-memory session), and
/// every mutation carries an `Idempotency-Key`.
class HttpSellerApiClient implements SellerApiClient {
  HttpSellerApiClient({
    String? baseUrl,
    String? Function()? accessToken,
    HttpClient? httpClient,
    String Function()? idempotencyKey,
  }) : _baseUrl = (baseUrl ?? 'http://localhost:4000/api/v1').replaceAll(RegExp(r'/$'), ''),
       _accessToken = accessToken ?? (() => null),
       _httpClient = httpClient ?? HttpClient(),
       _idempotencyKey = idempotencyKey ?? _defaultIdempotencyKey;

  final String _baseUrl;
  final String? Function() _accessToken;
  final HttpClient _httpClient;
  final String Function() _idempotencyKey;

  @override
  Future<SellerStatus> getOnboardingStatus() async {
    final body = await _request('GET', '/seller/onboarding');
    return SellerStatus.fromApiEnvelope(jsonDecode(body) as Map<String, dynamic>);
  }

  @override
  Future<void> createOnboarding({
    required String legalName,
    required String tradeName,
    required String registrationNumber,
    required String businessAddress,
  }) async {
    await _request('POST', '/seller/onboarding', {
      'legalName': legalName,
      'tradeName': tradeName,
      'registrationNumber': registrationNumber,
      'businessAddress': businessAddress,
    });
  }

  @override
  Future<void> submitOnboarding({
    required String sellerProfileId,
    required int expectedVersion,
  }) async {
    await _request('POST', '/seller/onboarding/submit', {
      'sellerProfileId': sellerProfileId,
      'expectedVersion': expectedVersion,
    });
  }

  @override
  Future<List<ProductSummary>> listProducts(String sellerProfileId) async {
    final body = await _request(
      'GET',
      '/seller/products?sellerProfileId=${Uri.encodeQueryComponent(sellerProfileId)}',
    );
    final data = decodeApiBody(body)['data'] as Map<String, dynamic>;
    final products = (data['products'] as List<dynamic>? ?? const [])
        .cast<Map<String, dynamic>>()
        .map(ProductSummary.fromJson)
        .toList();
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
    final body = await _request('POST', '/seller/products', {
      'sellerProfileId': sellerProfileId,
      'name': name,
      'categoryId': categoryId,
      'sellingPrice': sellingPrice,
      'skus': <Map<String, Object?>>[<String, Object?>{'skuCode': skuCode}],
    });
    final data = decodeApiBody(body)['data'] as Map<String, dynamic>;
    final product = data['product'] as Map<String, dynamic>;
    return ProductSummary(
      productId: product['productId'] as String,
      sellerProfileId: sellerProfileId,
      name: name,
      state: ProductLifecycleState.fromApi(product['state'] as String),
      sellingPrice: sellingPrice,
      version: product['version'] as int,
    );
  }

  @override
  Future<void> submitProduct({
    required String productId,
    required String sellerProfileId,
    required int expectedVersion,
  }) async {
    await _request('POST', '/seller/products/$productId/submit', {
      'sellerProfileId': sellerProfileId,
      'expectedVersion': expectedVersion,
    });
  }

  @override
  Future<List<CategorySummary>> listCategories() async {
    final body = await _request('GET', '/seller/categories');
    final data = decodeApiBody(body)['data'] as Map<String, dynamic>;
    final categories = (data['categories'] as List<dynamic>? ?? const [])
        .cast<Map<String, dynamic>>()
        .map(CategorySummary.fromJson)
        .toList();
    return categories;
  }

  @override
  Future<List<InventoryStatusEntry>> listOwnInventory(String sellerProfileId) async {
    final body = await _request(
      'GET',
      '/seller/inventory?sellerProfileId=${Uri.encodeQueryComponent(sellerProfileId)}',
    );
    final data = decodeApiBody(body)['data'] as Map<String, dynamic>;
    final inventory = (data['inventory'] as List<dynamic>? ?? const [])
        .cast<Map<String, dynamic>>()
        .map(InventoryStatusEntry.fromJson)
        .toList();
    return inventory;
  }

  @override
  Future<InventoryStatusEntry> getOwnSkuDetail(
    String skuId,
    String sellerProfileId,
  ) async {
    final body = await _request(
      'GET',
      '/seller/inventory/$skuId?sellerProfileId=${Uri.encodeQueryComponent(sellerProfileId)}',
    );
    final data = decodeApiBody(body)['data'] as Map<String, dynamic>;
    final inventory = data['inventory'] as Map<String, dynamic>;
    return InventoryStatusEntry.fromJson(inventory);
  }

  Future<String> _request(
    String method,
    String path, [
    Map<String, Object?>? payload,
  ]) async {
    final token = _accessToken();
    final headers = <String, String>{
      'Accept': 'application/json',
    };
    if (method != 'GET') {
      headers['Idempotency-Key'] = _idempotencyKey();
    }
    if (token != null && token.isNotEmpty) {
      headers['Authorization'] = 'Bearer $token';
    }

    final httpRequest = await _httpClient
        .openUrl(method, Uri.parse('$_baseUrl$path'))
        .timeout(const Duration(seconds: 15));
    headers.forEach(httpRequest.headers.set);
    if (payload != null) {
      httpRequest.headers.contentType = ContentType.json;
      httpRequest.write(jsonEncode(payload));
    }

    final httpResponse = await httpRequest.close().timeout(
          const Duration(seconds: 15),
        );
    final body = await httpResponse.transform(utf8.decoder).join();

    if (httpResponse.statusCode < 200 || httpResponse.statusCode >= 300) {
      throw SellerApiException(
        _mapStatus(httpResponse.statusCode),
        safeSellerApiMessage(_mapStatus(httpResponse.statusCode)),
      );
    }
    return body;
  }

  static SellerApiErrorKind _mapStatus(int status) {
    return switch (status) {
      401 => SellerApiErrorKind.unauthorized,
      403 => SellerApiErrorKind.accessDenied,
      404 => SellerApiErrorKind.notFound,
      409 => SellerApiErrorKind.conflict,
      429 => SellerApiErrorKind.rateLimited,
      400 => SellerApiErrorKind.validation,
      _ => SellerApiErrorKind.server,
    };
  }

  static String _defaultIdempotencyKey() {
    return '${DateTime.now().microsecondsSinceEpoch}-${_randomSuffix()}';
  }

  static String _randomSuffix() {
    final value = DateTime.now().microsecondsSinceEpoch;
    return value.toRadixString(36);
  }
}

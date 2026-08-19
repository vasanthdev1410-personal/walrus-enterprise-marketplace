import 'dart:async';
import 'dart:convert';
import 'dart:io';

/// Coarse, safe error kinds surfaced to the mobile UI. The server remains
/// authoritative; only generic, non-disclosing client messages are rendered.
enum CartApiErrorKind {
  unauthorized,
  accessDenied,
  notFound,
  conflict,
  rateLimited,
  validation,
  network,
  server,
}

class CartApiException implements Exception {
  const CartApiException(this.kind, this.message);

  final CartApiErrorKind kind;
  final String message;

  @override
  String toString() => 'CartApiException($kind)';
}

/// Safe, generic client messages (never server policy/internals).
String safeCartApiMessage(CartApiErrorKind kind) {
  return switch (kind) {
    CartApiErrorKind.unauthorized =>
      'Your session has expired. Sign in again to continue.',
    CartApiErrorKind.accessDenied =>
      'You do not have permission to perform this action.',
    CartApiErrorKind.notFound =>
      'The requested cart could not be found.',
    CartApiErrorKind.conflict =>
      'This action conflicts with the current state. Refresh and try again.',
    CartApiErrorKind.rateLimited =>
      'Too many requests. Please try again shortly.',
    CartApiErrorKind.validation =>
      'The request could not be completed. Check the entered details and try again.',
    CartApiErrorKind.network =>
      'The service is temporarily unreachable. Please try again shortly.',
    CartApiErrorKind.server =>
      'An unexpected error occurred. Please try again shortly.',
  };
}

/// Port for the M07-M5 cart self-service API — **READ-ONLY on mobile**
/// (no cart mutations on mobile; add/update/remove/clear/checkout are
/// web-only). Implementations are injected so widget tests never touch
/// the network.
abstract interface class CartApiClient {
  /// Reads the caller's own active cart (`GET /cart`).
  Future<CartResult> getOwnCart();
}

/// Cart line result as returned by the API.
class CartLineResult {
  const CartLineResult({
    required this.cartLineId,
    required this.skuId,
    required this.productId,
    required this.skuCode,
    required this.quantity,
    required this.unitPriceAmount,
    required this.unitPriceCurrency,
    required this.snapshotTaxIncluded,
    required this.productUnavailable,
  });

  final String cartLineId;
  final String skuId;
  final String productId;
  final String skuCode;
  final int quantity;
  final int unitPriceAmount;
  final String unitPriceCurrency;
  final bool snapshotTaxIncluded;
  final bool productUnavailable;

  factory CartLineResult.fromJson(Map<String, dynamic> json) {
    return CartLineResult(
      cartLineId: json['cartLineId'] as String,
      skuId: json['skuId'] as String,
      productId: json['productId'] as String,
      skuCode: json['skuCode'] as String,
      quantity: json['quantity'] as int,
      unitPriceAmount: json['unitPriceAmount'] as int,
      unitPriceCurrency: json['unitPriceCurrency'] as String,
      snapshotTaxIncluded: json['snapshotTaxIncluded'] as bool,
      productUnavailable: json['productUnavailable'] as bool,
    );
  }
}

/// Cart result as returned by the API.
class CartResult {
  const CartResult({
    required this.cartId,
    required this.customerProfileId,
    required this.state,
    required this.totalLines,
    required this.totalItems,
    required this.version,
    required this.lines,
    required this.createdAt,
    required this.updatedAt,
    this.expiresAt,
  });

  final String cartId;
  final String customerProfileId;
  final String state;
  final int totalLines;
  final int totalItems;
  final int version;
  final List<CartLineResult> lines;
  final String createdAt;
  final String updatedAt;
  final String? expiresAt;

  factory CartResult.fromApiEnvelope(String body) {
    final json = jsonDecode(body) as Map<String, dynamic>;
    final data = json['data'] as Map<String, dynamic>?;
    if (data == null) {
      throw const CartApiException(CartApiErrorKind.server, 'Malformed response');
    }
    final cart = data['cart'] as Map<String, dynamic>?;
    if (cart == null) {
      throw const CartApiException(CartApiErrorKind.server, 'Malformed response');
    }
    return CartResult.fromJson(cart);
  }

  factory CartResult.fromJson(Map<String, dynamic> json) {
    final linesRaw = json['lines'] as List<dynamic>? ?? const <dynamic>[];
    final lines = linesRaw
        .cast<Map<String, dynamic>>()
        .map(CartLineResult.fromJson)
        .toList();
    return CartResult(
      cartId: json['cartId'] as String,
      customerProfileId: json['customerProfileId'] as String,
      state: json['state'] as String,
      totalLines: json['totalLines'] as int,
      totalItems: json['totalItems'] as int,
      version: json['version'] as int,
      lines: lines,
      createdAt: json['createdAt'] as String,
      updatedAt: json['updatedAt'] as String,
      expiresAt: json['expiresAt'] as String?,
    );
  }
}

/// HTTP implementation over the M07-M5 cart API using the platform
/// `HttpClient`. The bearer access token is supplied by the caller
/// (in-memory session). Read-only: no `Idempotency-Key` is ever required
/// because no mutation is exposed on mobile.
class HttpCartApiClient implements CartApiClient {
  HttpCartApiClient({
    String? baseUrl,
    String? Function()? accessToken,
    HttpClient? httpClient,
  })  : _baseUrl =
            (baseUrl ?? 'http://localhost:4000/api/v1').replaceAll(RegExp(r'/$'), ''),
        _accessToken = accessToken ?? (() => null),
        _httpClient = httpClient ?? HttpClient();

  final String _baseUrl;
  final String? Function() _accessToken;
  final HttpClient _httpClient;

  @override
  Future<CartResult> getOwnCart() async {
    final body = await _request('GET', '/cart');
    return CartResult.fromApiEnvelope(body);
  }

  Future<String> _request(String method, String path) async {
    final token = _accessToken();
    final headers = <String, String>{
      'Accept': 'application/json',
    };
    if (token != null && token.isNotEmpty) {
      headers['Authorization'] = 'Bearer $token';
    }

    final httpRequest = await _httpClient
        .openUrl(method, Uri.parse('$_baseUrl$path'))
        .timeout(const Duration(seconds: 15));
    headers.forEach(httpRequest.headers.set);

    final httpResponse = await httpRequest.close().timeout(
          const Duration(seconds: 15),
        );
    final body = await httpResponse.transform(utf8.decoder).join();

    if (httpResponse.statusCode < 200 || httpResponse.statusCode >= 300) {
      final kind = _mapStatus(httpResponse.statusCode);
      throw CartApiException(kind, safeCartApiMessage(kind));
    }
    return body;
  }

  static CartApiErrorKind _mapStatus(int status) {
    return switch (status) {
      401 => CartApiErrorKind.unauthorized,
      403 => CartApiErrorKind.accessDenied,
      404 => CartApiErrorKind.notFound,
      409 => CartApiErrorKind.conflict,
      429 => CartApiErrorKind.rateLimited,
      400 => CartApiErrorKind.validation,
      _ => CartApiErrorKind.server,
    };
  }
}

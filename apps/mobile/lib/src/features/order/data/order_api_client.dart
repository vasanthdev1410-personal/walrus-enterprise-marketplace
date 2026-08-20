import 'dart:async';
import 'dart:convert';
import 'dart:io';

/// Coarse, safe error kinds surfaced to the mobile UI. The server remains
/// authoritative; only generic, non-disclosing client messages are rendered.
enum OrderApiErrorKind {
  unauthorized,
  accessDenied,
  notFound,
  conflict,
  rateLimited,
  validation,
  network,
  server,
}

class OrderApiException implements Exception {
  const OrderApiException(this.kind, this.message);

  final OrderApiErrorKind kind;
  final String message;

  @override
  String toString() => 'OrderApiException($kind)';
}

/// Safe, generic client messages (never server policy/internals).
String safeOrderApiMessage(OrderApiErrorKind kind) {
  return switch (kind) {
    OrderApiErrorKind.unauthorized =>
      'Your session has expired. Sign in again to continue.',
    OrderApiErrorKind.accessDenied =>
      'You do not have permission to perform this action.',
    OrderApiErrorKind.notFound =>
      'The requested order could not be found.',
    OrderApiErrorKind.conflict =>
      'This action conflicts with the current state. Refresh and try again.',
    OrderApiErrorKind.rateLimited =>
      'Too many requests. Please try again shortly.',
    OrderApiErrorKind.validation =>
      'The request could not be completed. Check the entered details and try again.',
    OrderApiErrorKind.network =>
      'The service is temporarily unreachable. Please try again shortly.',
    OrderApiErrorKind.server =>
      'An unexpected error occurred. Please try again shortly.',
  };
}

/// Port for the M08-M5 order self-service API — **READ-ONLY on mobile**
/// (no order mutations on mobile; create/cancel/transition are
/// web-only). Implementations are injected so widget tests never touch
/// the network.
abstract interface class OrderApiClient {
  /// Reads the caller's own orders (`GET /orders`).
  Future<List<OrderResult>> listOrders();

  /// Reads a single order by ID (`GET /orders/:orderId`).
  Future<OrderResult> readOrder(String orderId);
}

/// Order line result as returned by the API.
class OrderLineResult {
  const OrderLineResult({
    required this.orderLineId,
    required this.cartLineId,
    required this.skuId,
    required this.productId,
    required this.skuCode,
    required this.quantity,
    required this.unitPriceAmount,
    required this.unitPriceCurrency,
    required this.snapshotTaxIncluded,
    required this.revalidated,
  });

  final String orderLineId;
  final String cartLineId;
  final String skuId;
  final String productId;
  final String skuCode;
  final int quantity;
  final int unitPriceAmount;
  final String unitPriceCurrency;
  final bool snapshotTaxIncluded;
  final bool revalidated;

  factory OrderLineResult.fromJson(Map<String, dynamic> json) {
    return OrderLineResult(
      orderLineId: json['orderLineId'] as String,
      cartLineId: json['cartLineId'] as String,
      skuId: json['skuId'] as String,
      productId: json['productId'] as String,
      skuCode: json['skuCode'] as String,
      quantity: json['quantity'] as int,
      unitPriceAmount: json['unitPriceAmount'] as int,
      unitPriceCurrency: json['unitPriceCurrency'] as String,
      snapshotTaxIncluded: json['snapshotTaxIncluded'] as bool,
      revalidated: json['revalidated'] as bool,
    );
  }
}

/// Order result as returned by the API.
class OrderResult {
  const OrderResult({
    required this.orderId,
    required this.customerProfileId,
    required this.snapshotId,
    required this.cartId,
    required this.state,
    required this.totalLines,
    required this.totalItems,
    required this.subtotalAmountCents,
    required this.subtotalCurrency,
    required this.version,
    required this.lines,
    required this.createdAt,
    required this.updatedAt,
  });

  final String orderId;
  final String customerProfileId;
  final String snapshotId;
  final String cartId;
  final String state;
  final int totalLines;
  final int totalItems;
  final int subtotalAmountCents;
  final String subtotalCurrency;
  final int version;
  final List<OrderLineResult> lines;
  final String createdAt;
  final String updatedAt;

  factory OrderResult.fromApiEnvelope(String body) {
    final json = jsonDecode(body) as Map<String, dynamic>;
    final data = json['data'] as Map<String, dynamic>?;
    if (data == null) {
      throw const OrderApiException(OrderApiErrorKind.server, 'Malformed response');
    }
    final order = data['order'] as Map<String, dynamic>?;
    if (order == null) {
      throw const OrderApiException(OrderApiErrorKind.server, 'Malformed response');
    }
    return OrderResult.fromJson(order);
  }

  factory OrderResult.fromJson(Map<String, dynamic> json) {
    final linesRaw = json['lines'] as List<dynamic>? ?? const <dynamic>[];
    final lines = linesRaw
        .cast<Map<String, dynamic>>()
        .map(OrderLineResult.fromJson)
        .toList();
    return OrderResult(
      orderId: json['orderId'] as String,
      customerProfileId: json['customerProfileId'] as String,
      snapshotId: json['snapshotId'] as String,
      cartId: json['cartId'] as String,
      state: json['state'] as String,
      totalLines: json['totalLines'] as int,
      totalItems: json['totalItems'] as int,
      subtotalAmountCents: json['subtotalAmountCents'] as int,
      subtotalCurrency: json['subtotalCurrency'] as String,
      version: json['version'] as int,
      lines: lines,
      createdAt: json['createdAt'] as String,
      updatedAt: json['updatedAt'] as String,
    );
  }
}

/// Parses the orders list from an API envelope.
List<OrderResult> parseOrdersList(String body) {
  final json = jsonDecode(body) as Map<String, dynamic>;
  final data = json['data'] as Map<String, dynamic>?;
  if (data == null) {
    throw const OrderApiException(OrderApiErrorKind.server, 'Malformed response');
  }
  final orders = data['orders'] as List<dynamic>?;
  if (orders == null) {
    throw const OrderApiException(OrderApiErrorKind.server, 'Malformed response');
  }
  return orders
      .cast<Map<String, dynamic>>()
      .map(OrderResult.fromJson)
      .toList();
}

/// HTTP implementation over the M08-M5 order API using the platform
/// `HttpClient`. The bearer access token is supplied by the caller
/// (in-memory session). Read-only: no `Idempotency-Key` is ever required
/// because no mutation is exposed on mobile.
class HttpOrderApiClient implements OrderApiClient {
  HttpOrderApiClient({
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
  Future<List<OrderResult>> listOrders() async {
    final body = await _request('GET', '/orders');
    return parseOrdersList(body);
  }

  @override
  Future<OrderResult> readOrder(String orderId) async {
    final body = await _request('GET', '/orders/$orderId');
    return OrderResult.fromApiEnvelope(body);
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
      throw OrderApiException(kind, safeOrderApiMessage(kind));
    }
    return body;
  }

  static OrderApiErrorKind _mapStatus(int status) {
    return switch (status) {
      401 => OrderApiErrorKind.unauthorized,
      403 => OrderApiErrorKind.accessDenied,
      404 => OrderApiErrorKind.notFound,
      409 => OrderApiErrorKind.conflict,
      429 => OrderApiErrorKind.rateLimited,
      400 => OrderApiErrorKind.validation,
      _ => OrderApiErrorKind.server,
    };
  }
}

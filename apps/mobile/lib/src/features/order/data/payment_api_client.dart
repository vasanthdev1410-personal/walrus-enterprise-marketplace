import 'dart:async';
import 'dart:convert';
import 'dart:io';

/// Coarse, safe error kinds surfaced to the mobile UI.
enum PaymentApiErrorKind {
  unauthorized,
  accessDenied,
  notFound,
  conflict,
  rateLimited,
  validation,
  network,
  server,
}

class PaymentApiException implements Exception {
  const PaymentApiException(this.kind, this.message);

  final PaymentApiErrorKind kind;
  final String message;

  @override
  String toString() => 'PaymentApiException($kind)';
}

String safePaymentApiMessage(PaymentApiErrorKind kind) {
  return switch (kind) {
    PaymentApiErrorKind.unauthorized =>
      'Your session has expired. Sign in again to continue.',
    PaymentApiErrorKind.accessDenied =>
      'You do not have permission to perform this action.',
    PaymentApiErrorKind.notFound =>
      'The requested payment could not be found.',
    PaymentApiErrorKind.conflict =>
      'This action conflicts with the current state. Refresh and try again.',
    PaymentApiErrorKind.rateLimited =>
      'Too many requests. Please try again shortly.',
    PaymentApiErrorKind.validation =>
      'The request could not be completed. Check the entered details and try again.',
    PaymentApiErrorKind.network =>
      'The service is temporarily unreachable. Please try again shortly.',
    PaymentApiErrorKind.server =>
      'An unexpected error occurred. Please try again shortly.',
  };
}

/// Payment result as returned by the API.
class PaymentResult {
  const PaymentResult({
    required this.paymentId,
    required this.orderId,
    required this.state,
    required this.amountCents,
    required this.currency,
    required this.version,
    required this.createdAt,
    required this.updatedAt,
  });

  final String paymentId;
  final String orderId;
  final String state;
  final int amountCents;
  final String currency;
  final int version;
  final String createdAt;
  final String updatedAt;

  factory PaymentResult.fromApiEnvelope(String body) {
    final json = jsonDecode(body) as Map<String, dynamic>;
    final data = json['data'] as Map<String, dynamic>?;
    if (data == null) {
      throw const PaymentApiException(PaymentApiErrorKind.server, 'Malformed response');
    }
    final payment = data['payment'] as Map<String, dynamic>?;
    if (payment == null) {
      throw const PaymentApiException(PaymentApiErrorKind.server, 'Malformed response');
    }
    return PaymentResult.fromJson(payment);
  }

  factory PaymentResult.fromJson(Map<String, dynamic> json) {
    return PaymentResult(
      paymentId: json['paymentId'] as String,
      orderId: json['orderId'] as String,
      state: json['state'] as String,
      amountCents: json['amountCents'] as int,
      currency: json['currency'] as String,
      version: json['version'] as int,
      createdAt: json['createdAt'] as String,
      updatedAt: json['updatedAt'] as String,
    );
  }
}

/// Port for the M09-M5 payment API — **READ-ONLY on mobile**.
abstract interface class PaymentApiClient {
  Future<PaymentResult> readPayment(String paymentId);
  Future<PaymentResult> readPaymentByOrder(String orderId);
}

/// HTTP implementation over the M09-M5 payment API.
class HttpPaymentApiClient implements PaymentApiClient {
  HttpPaymentApiClient({
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
  Future<PaymentResult> readPayment(String paymentId) async {
    final body = await _request('GET', '/payments/$paymentId');
    return PaymentResult.fromApiEnvelope(body);
  }

  @override
  Future<PaymentResult> readPaymentByOrder(String orderId) async {
    final body = await _request('GET', '/payments/order/$orderId');
    return PaymentResult.fromApiEnvelope(body);
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
      throw PaymentApiException(kind, safePaymentApiMessage(kind));
    }
    return body;
  }

  static PaymentApiErrorKind _mapStatus(int status) {
    return switch (status) {
      401 => PaymentApiErrorKind.unauthorized,
      403 => PaymentApiErrorKind.accessDenied,
      404 => PaymentApiErrorKind.notFound,
      409 => PaymentApiErrorKind.conflict,
      429 => PaymentApiErrorKind.rateLimited,
      400 => PaymentApiErrorKind.validation,
      _ => PaymentApiErrorKind.server,
    };
  }
}

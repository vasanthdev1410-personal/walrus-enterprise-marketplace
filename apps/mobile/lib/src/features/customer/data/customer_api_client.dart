import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'customer_status.dart';

/// Coarse, safe error kinds surfaced to the mobile UI. The server remains
/// authoritative; only generic, non-disclosing client messages are rendered.
enum CustomerApiErrorKind {
  unauthorized,
  accessDenied,
  notFound,
  conflict,
  rateLimited,
  validation,
  network,
  server,
}

class CustomerApiException implements Exception {
  const CustomerApiException(this.kind, this.message);

  final CustomerApiErrorKind kind;
  final String message;

  @override
  String toString() => 'CustomerApiException($kind)';
}

/// Safe, generic client messages (never server policy/internals).
String safeCustomerApiMessage(CustomerApiErrorKind kind) {
  return switch (kind) {
    CustomerApiErrorKind.unauthorized =>
      'Your session has expired. Sign in again to continue.',
    CustomerApiErrorKind.accessDenied =>
      'You do not have permission to perform this action.',
    CustomerApiErrorKind.notFound =>
      'The requested record could not be found.',
    CustomerApiErrorKind.conflict =>
      'This action conflicts with the current state. Refresh and try again.',
    CustomerApiErrorKind.rateLimited =>
      'Too many requests. Please try again shortly.',
    CustomerApiErrorKind.validation =>
      'The request could not be completed. Check the entered details and try again.',
    CustomerApiErrorKind.network =>
      'The service is temporarily unreachable. Please try again shortly.',
    CustomerApiErrorKind.server =>
      'An unexpected error occurred. Please try again shortly.',
  };
}

/// Port for the M06-M5 customer self-service API — **strictly READ-ONLY on
/// mobile** (decision D-12: no profile mutation, no address mutation, no
/// admin controls). Implementations are injected so widget tests never touch
/// the network.
abstract interface class CustomerApiClient {
  /// Reads the caller's own customer profile (`GET /customer/profile`).
  Future<CustomerProfile> getOwnProfile();

  /// Lists the caller's own addresses (`GET /customer/addresses`).
  Future<List<CustomerAddress>> listOwnAddresses();
}

/// HTTP implementation over the M06-M5 customer API using the platform
/// `HttpClient`. The bearer access token is supplied by the caller (in-memory
/// session). Read-only: no `Idempotency-Key` is ever required because no
/// mutation is exposed on mobile (D-12).
class HttpCustomerApiClient implements CustomerApiClient {
  HttpCustomerApiClient({
    String? baseUrl,
    String? Function()? accessToken,
    HttpClient? httpClient,
  }) : _baseUrl = (baseUrl ?? 'http://localhost:4000/api/v1').replaceAll(RegExp(r'/$'), ''),
       _accessToken = accessToken ?? (() => null),
       _httpClient = httpClient ?? HttpClient();

  final String _baseUrl;
  final String? Function() _accessToken;
  final HttpClient _httpClient;

  @override
  Future<CustomerProfile> getOwnProfile() async {
    final body = await _request('GET', '/customer/profile');
    return CustomerProfile.fromApiEnvelope(jsonDecode(body) as Map<String, dynamic>);
  }

  @override
  Future<List<CustomerAddress>> listOwnAddresses() async {
    final body = await _request('GET', '/customer/addresses');
    final data = decodeApiBody(body)['data'] as Map<String, dynamic>;
    final addresses = (data['addresses'] as List<dynamic>? ?? const <dynamic>[])
        .cast<Map<String, dynamic>>()
        .map(CustomerAddress.fromJson)
        .toList();
    return addresses;
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
      throw CustomerApiException(kind, safeCustomerApiMessage(kind));
    }
    return body;
  }

  static CustomerApiErrorKind _mapStatus(int status) {
    return switch (status) {
      401 => CustomerApiErrorKind.unauthorized,
      403 => CustomerApiErrorKind.accessDenied,
      404 => CustomerApiErrorKind.notFound,
      409 => CustomerApiErrorKind.conflict,
      429 => CustomerApiErrorKind.rateLimited,
      400 => CustomerApiErrorKind.validation,
      _ => CustomerApiErrorKind.server,
    };
  }
}

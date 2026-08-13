import 'dart:async';
import 'dart:convert';
import 'dart:io';

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

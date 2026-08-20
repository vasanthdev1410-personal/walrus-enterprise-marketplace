import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:walrus_mobile/src/features/order/data/order_api_client.dart';

/// Stub that records calls and returns pre-configured responses.
class StubHttpClient implements HttpClient {
  StubHttpClient({this.responseBody, this.statusCode = 200})
      : _request = _StubHttpClientRequest(responseBody, statusCode);

  final String? responseBody;
  final int statusCode;
  final _StubHttpClientRequest _request;

  @override
  bool autoUncompress = true;

  @override
  BufferCompressionStrategy bufferCompressionStrategy =
      BufferCompressionStrategy.deferToCompressionFilter;

  @override
  int maxConnectionsPerHost = 0;

  @override
  bool persistentConnections = true;

  @override
  Duration connectionTimeout = Duration.zero;

  @override
  Duration idleTimeout = Duration.zero;

  @override
  late HttpConnectionStats stats = HttpConnectionStats(0, 0, 0, 0, 0, 0, 0);

  @override
  set userAgent(String? value) {}

  @override
  String? findProxy(Uri url) => null;

  @override
  Future<HttpClientRequest> getUrl(Uri url) async => _request;

  @override
  Future<HttpClientRequest> openUrl(String method, Uri url) async => _request;

  @override
  Future<HttpClientRequest> headUrl(Uri url) async => _request;

  @override
  Future<HttpClientRequest> postUrl(Uri url) async => _request;

  @override
  Future<HttpClientRequest> putUrl(Uri url) async => _request;

  @override
  Future<HttpClientRequest> deleteUrl(Uri url) async => _request;

  @override
  Future<HttpClientRequest> patchUrl(Uri url) async => _request;

  @override
  Future<HttpClientRequest> addUrl(String method, Uri url) async => _request;

  @override
  set connectionFactory(
      Function(Uri, Function?, Duration?)? connectionFactory) {}

  @override
  set keyLog(Function(String)? keyLog) {}
}

class _StubHttpClientRequest implements HttpClientRequest {
  _StubHttpClientRequest(this._responseBody, this._statusCode);

  final String? _responseBody;
  final int _statusCode;
  final _headers = <String, String>{};

  @override
  HttpHeaders get headers => _StubHttpHeaders(_headers);

  @override
  Future<HttpClientResponse> close() async =>
      _StubHttpClientResponse(_responseBody, _statusCode);

  @override
  void add(List<int> bytes) {}

  @override
  void addError(Object error, [StackTrace? stackTrace]) {}

  @override
  Future<void> addStream(Stream<List<int>> stream) async {}

  @override
  Future<void> flush() async {}

  @override
  Future<HttpClientResponse> get done => close();

  @override
  Future<void> write(Object? obj) async {}

  @override
  void writeAll(Iterable<Object> objects, [String? separator]) {}

  @override
  void writeln([Object? obj = '']) {}

  @override
  void writeCharCode(int charCode) {}

  @override
  Encoding get encoding => utf8;

  @override
  set encoding(Encoding value) {}

  @override
  int maxRedirects = 5;

  @override
  bool followRedirects = true;

  @override
  int contentLength = -1;

  @override
  bool persistentConnection = true;

  @override
  HttpConnectionInfo? get connectionInfo => null;

  @override
  List<Cookie> get cookies => [];

  @override
  void addEvent(void Function(List<int> data)? onData,
      {Function? onError, void Function()? onDone}) {}

  @override
  Future<Socket> detachSocket() async => throw UnimplementedError();

  @override
  Future<HttpClientResponse> close() async =>
      _StubHttpClientResponse(_responseBody, _statusCode);
}

class _StubHttpClientResponse implements HttpClientResponse {
  _StubHttpClientResponse(this._body, this._statusCode);

  final String? _body;
  final int _statusCode;

  @override
  int get statusCode => _statusCode;

  @override
  int get contentLength => _body?.length ?? 0;

  @override
  String get reasonPhrase => '';

  @override
  bool get isRedirect => false;

  @override
  bool get persistentConnection => true;

  @override
  bool get redirectsDone => true;

  @override
  HttpHeaders get headers => _StubHttpHeaders({});

  @override
  List<Cookie> get cookies => [];

  @override
  List<RedirectInfo> get redirects => [];

  @override
  X509Certificate? get certificate => null;

  @override
  HttpConnectionInfo? get connectionInfo => null;

  @override
  StreamSubscription<List<int>> listen(void Function(List<int>)? onData,
      {Function? onError, void Function()? onDone, bool? cancelOnError}) {
    final bytes = utf8.encode(_body ?? '');
    return Stream<List<int>>.fromIterable([bytes]).listen(onData,
        onError: onError, onDone: onDone, cancelOnError: cancelOnError);
  }

  @override
  Future<Socket> detachSocket() async => throw UnimplementedError();

  @override
  HttpClientResponseCompressionState get compressionState =>
      HttpClientResponseCompressionState.notCompressed;

  @override
  Future<RedirectInfo> redirect(
          [String? method, Uri? url, bool? followLoops]) =>
      throw UnimplementedError();

  @override
  Future<HttpClientResponse> redirect(
      [String? method, Uri? url, bool? followLoops]) async =>
      this;
}

class _StubHttpHeaders implements HttpHeaders {
  _StubHttpHeaders(this._map);

  final Map<String, String> _map;

  @override
  String? value(String name) => _map[name.toLowerCase()];

  @override
  void add(String name, Object value, {bool preserveHeaderCase = false}) {}

  @override
  void set(String name, Object value, {bool preserveHeaderCase = false}) {}

  @override
  void remove(String name, Object? value) {}

  @override
  void removeAll(String name) {}

  @override
  void forEach(void Function(String name, List<String> values) action) {}

  @override
  void noFolding(String name) {}

  @override
  bool get caseSensitiveLookup => true;

  @override
  bool containsKey(String name) => _map.containsKey(name.toLowerCase());

  @override
  List<String>? operator [](String name) => _map[name.toLowerCase()]?.split(',');
}

void main() {
  final orderJson = <String, dynamic>{
    'orderId': '0191310f-789a-7123-8123-000000000010',
    'customerProfileId': '0191310f-789a-7123-8123-000000000003',
    'snapshotId': '0191310f-789a-7123-8123-000000000050',
    'cartId': '0191310f-789a-7123-8123-000000000060',
    'state': 'PENDING',
    'totalLines': 1,
    'totalItems': 2,
    'subtotalAmountCents': 1999,
    'subtotalCurrency': 'USD',
    'version': 1,
    'lines': <Map<String, dynamic>>[
      {
        'orderLineId': '0191310f-789a-7123-8123-000000000020',
        'cartLineId': '0191310f-789a-7123-8123-000000000025',
        'skuId': '0191310f-789a-7123-8123-000000000030',
        'productId': '0191310f-789a-7123-8123-000000000040',
        'skuCode': 'SKU-001',
        'quantity': 2,
        'unitPriceAmount': 1999,
        'unitPriceCurrency': 'USD',
        'snapshotTaxIncluded': true,
        'revalidated': true,
      },
    ],
    'createdAt': '2026-08-20T00:00:00.000Z',
    'updatedAt': '2026-08-20T00:00:00.000Z',
  };

  final orderEnvelope = jsonEncode({
    'data': {'order': orderJson},
    'correlationId': 'c1',
  });

  final ordersListEnvelope = jsonEncode({
    'data': {'orders': [orderJson]},
    'correlationId': 'c1',
  });

  group('HttpOrderApiClient', () {
    test('reads a single order from the API envelope', () async {
      final client = HttpOrderApiClient(
        baseUrl: 'http://localhost:4000/api/v1',
        httpClient: StubHttpClient(responseBody: orderEnvelope, statusCode: 200),
      );
      final result = await client
          .readOrder('0191310f-789a-7123-8123-000000000010');
      expect(result.orderId, equals(orderJson['orderId']));
      expect(result.lines.length, equals(1));
      expect(result.lines[0].skuCode, equals('SKU-001'));
    });

    test('lists orders from the API envelope', () async {
      final client = HttpOrderApiClient(
        baseUrl: 'http://localhost:4000/api/v1',
        httpClient: StubHttpClient(responseBody: ordersListEnvelope, statusCode: 200),
      );
      final result = await client.listOrders();
      expect(result.length, equals(1));
      expect(result[0].orderId, equals(orderJson['orderId']));
    });

    test('parses order lines correctly', () {
      final result = OrderResult.fromApiEnvelope(orderEnvelope);
      expect(result.lines.length, equals(1));
      final line = result.lines[0];
      expect(line.orderLineId, equals('0191310f-789a-7123-8123-000000000020'));
      expect(line.quantity, equals(2));
      expect(line.unitPriceAmount, equals(1999));
      expect(line.revalidated, isTrue);
    });

    test('throws on malformed envelope (no data key)', () {
      expect(
        () => OrderResult.fromApiEnvelope(jsonEncode({'message': 'error'})),
        throwsA(isA<OrderApiException>().having(
          (e) => e.kind,
          'kind',
          equals(OrderApiErrorKind.server),
        )),
      );
    });

    test('throws on 401 with unauthorized kind', () async {
      final client = HttpOrderApiClient(
        baseUrl: 'http://localhost:4000/api/v1',
        httpClient: StubHttpClient(
          responseBody: jsonEncode({
            'success': false,
            'message': 'AUTHENTICATION_ASSURANCE_INSUFFICIENT',
          }),
          statusCode: 401,
        ),
      );
      expect(
        () => client.listOrders(),
        throwsA(isA<OrderApiException>().having(
          (e) => e.kind,
          'kind',
          equals(OrderApiErrorKind.unauthorized),
        )),
      );
    });

    test('throws on 404 with notFound kind', () async {
      final client = HttpOrderApiClient(
        baseUrl: 'http://localhost:4000/api/v1',
        httpClient: StubHttpClient(
          responseBody: jsonEncode({
            'success': false,
            'message': 'ORDER_NOT_FOUND',
          }),
          statusCode: 404,
        ),
      );
      expect(
        () => client.readOrder('0191310f-789a-7123-8123-000000000010'),
        throwsA(isA<OrderApiException>().having(
          (e) => e.kind,
          'kind',
          equals(OrderApiErrorKind.notFound),
        )),
      );
    });

    test('safe message does not expose internal error codes', () {
      final message = safeOrderApiMessage(OrderApiErrorKind.accessDenied);
      expect(message, isNot(contains('ORDER_')));
      expect(message, isNot(contains('AUTHORIZATION_')));
    });
  });
}

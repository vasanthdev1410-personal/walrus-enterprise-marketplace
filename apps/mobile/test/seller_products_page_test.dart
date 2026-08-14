import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:walrus_mobile/src/features/seller/data/product_status.dart';
import 'package:walrus_mobile/src/features/seller/data/seller_api_client.dart';
import 'package:walrus_mobile/src/features/seller/data/seller_status.dart';
import 'package:walrus_mobile/src/features/seller/presentation/seller_products_page.dart';

import 'fakes/fake_seller_api_client.dart';

void main() {
  testWidgets('shows an empty catalog with the create form', (
    WidgetTester tester,
  ) async {
    final fake = FakeSellerApiClient(status: activeStatus())
      ..categories = <CategorySummary>[appliancesCategory()];
    await tester.pumpWidget(
      MaterialApp(home: SellerProductsPage(apiClient: fake)),
    );
    await tester.pumpAndSettle();

    expect(find.text('Products'), findsOneWidget);
    expect(find.text('No products yet. Create your first product.'), findsOneWidget);
    expect(find.text('New product'), findsOneWidget);
    expect(find.text('Create product'), findsOneWidget);
  });

  testWidgets('creates a DRAFT product and lists it', (WidgetTester tester) async {
    final fake = FakeSellerApiClient(status: activeStatus())
      ..categories = <CategorySummary>[appliancesCategory()];
    await tester.pumpWidget(
      MaterialApp(home: SellerProductsPage(apiClient: fake)),
    );
    await tester.pumpAndSettle();

    await tester.enterText(find.widgetWithText(TextField, 'Name'), 'Espresso machine');
    await tester.enterText(
      find.widgetWithText(TextField, 'Selling price'),
      '499.99',
    );
    await tester.enterText(find.widgetWithText(TextField, 'SKU code'), 'WLR-001');

    await tester.tap(find.text('Appliances'));
    await tester.pumpAndSettle();

    await tester.tap(find.text('Create product'));
    await tester.pumpAndSettle();

    expect(find.text('Espresso machine'), findsOneWidget);
    expect(fake.calls.any((call) => call.startsWith('createProduct:')), isTrue);
  });

  testWidgets('submits a DRAFT product for review', (WidgetTester tester) async {
    final fake = FakeSellerApiClient(status: activeStatus())
      ..products = <ProductSummary>[draftProduct()]
      ..categories = <CategorySummary>[appliancesCategory()];
    await tester.pumpWidget(
      MaterialApp(home: SellerProductsPage(apiClient: fake)),
    );
    await tester.pumpAndSettle();

    await tester.tap(find.text('Submit'));
    await tester.pumpAndSettle();

    expect(fake.calls.any((call) => call.startsWith('submitProduct:')), isTrue);
    expect(find.textContaining('Status: Submitted'), findsOneWidget);
  });

  testWidgets('validates the create form before contacting the API', (
    WidgetTester tester,
  ) async {
    final fake = FakeSellerApiClient(status: activeStatus())
      ..categories = <CategorySummary>[appliancesCategory()];
    await tester.pumpWidget(
      MaterialApp(home: SellerProductsPage(apiClient: fake)),
    );
    await tester.pumpAndSettle();

    // Leave the form empty and submit — no API call may occur.
    await tester.tap(find.text('Create product'));
    await tester.pumpAndSettle();

    expect(fake.calls.any((call) => call.startsWith('createProduct:')), isFalse);
    expect(
      find.textContaining('Check the entered details'),
      findsOneWidget,
    );
  });

  testWidgets('renders the generic error view on failure', (WidgetTester tester) async {
    final fake = FakeSellerApiClient(
      error: const SellerApiException(
        SellerApiErrorKind.unauthorized,
        'Your session has expired. Sign in again to continue.',
      ),
    );
    await tester.pumpWidget(
      MaterialApp(home: SellerProductsPage(apiClient: fake)),
    );
    await tester.pumpAndSettle();

    expect(find.text('Your session has expired. Sign in again to continue.'), findsOneWidget);
    expect(find.text('Try again'), findsOneWidget);
  });
}

SellerStatus activeStatus() {
  return const SellerStatus(
    sellerProfileId: '0191310f-789a-7123-8123-000000000003',
    state: SellerLifecycleState.active,
    complianceState: SellerComplianceState.compliant,
    version: 5,
    legalName: 'Walrus Retail',
    tradeName: 'Walrus',
    businessAddress: '1 Market Street',
    verifications: <VerificationSummary>[],
  );
}

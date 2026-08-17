import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:walrus_mobile/src/features/seller/data/inventory_status.dart';
import 'package:walrus_mobile/src/features/seller/data/seller_api_client.dart';
import 'package:walrus_mobile/src/features/seller/data/seller_status.dart';
import 'package:walrus_mobile/src/features/seller/presentation/seller_inventory_page.dart';

import 'fakes/fake_seller_api_client.dart';

void main() {
  testWidgets('shows an empty inventory state for the own seller', (
    WidgetTester tester,
  ) async {
    final fake = FakeSellerApiClient(status: activeStatus());
    await tester.pumpWidget(
      MaterialApp(home: SellerInventoryPage(apiClient: fake)),
    );
    await tester.pumpAndSettle();

    expect(find.text('Inventory status'), findsOneWidget);
    expect(find.text('No inventory records yet.'), findsOneWidget);
    expect(
      fake.calls.any((call) => call.startsWith('listOwnInventory:')),
      isTrue,
    );
  });

  testWidgets('renders per-SKU availability with derived stock labels', (
    WidgetTester tester,
  ) async {
    final fake = FakeSellerApiClient(status: activeStatus())
      ..inventory = <InventoryStatusEntry>[
        const InventoryStatusEntry(
          skuId: '0191310f-789a-7123-8123-000000000007',
          onHand: 12,
          reserved: 2,
          available: 10,
          version: 2,
          label: InventoryStockLabel.inStock,
        ),
        const InventoryStatusEntry(
          skuId: '0191310f-789a-7123-8123-000000000008',
          onHand: 0,
          reserved: 0,
          available: 0,
          version: 1,
          label: InventoryStockLabel.outOfStock,
        ),
      ];
    await tester.pumpWidget(
      MaterialApp(home: SellerInventoryPage(apiClient: fake)),
    );
    await tester.pumpAndSettle();

    expect(
      find.text('10 available (12 on hand, 2 reserved)'),
      findsOneWidget,
    );
    expect(find.text('Status: In stock'), findsOneWidget);
    expect(find.text('Status: Out of stock'), findsOneWidget);
  });

  testWidgets('renders a generic error view on failure', (
    WidgetTester tester,
  ) async {
    final fake = FakeSellerApiClient(
      error: const SellerApiException(
        SellerApiErrorKind.accessDenied,
        'You do not have permission to perform this action.',
      ),
    );
    await tester.pumpWidget(
      MaterialApp(home: SellerInventoryPage(apiClient: fake)),
    );
    await tester.pumpAndSettle();

    expect(
      find.text('You do not have permission to perform this action.'),
      findsOneWidget,
    );
    expect(find.text('Try again'), findsOneWidget);
  });

  testWidgets('never exposes mutation or admin controls (D-13 read-only)', (
    WidgetTester tester,
  ) async {
    final fake = FakeSellerApiClient(status: activeStatus())
      ..inventory = <InventoryStatusEntry>[
        const InventoryStatusEntry(
          skuId: '0191310f-789a-7123-8123-000000000007',
          onHand: 12,
          reserved: 2,
          available: 10,
          version: 2,
          label: InventoryStockLabel.inStock,
        ),
      ];
    await tester.pumpWidget(
      MaterialApp(home: SellerInventoryPage(apiClient: fake)),
    );
    await tester.pumpAndSettle();

    // No adjustment/correction/threshold affordances exist on mobile.
    expect(find.text('Adjust stock'), findsNothing);
    expect(find.text('Correct stock'), findsNothing);
    expect(find.text('Thresholds'), findsNothing);
    // Only read calls are made.
    expect(
      fake.calls.every(
        (call) =>
            call.startsWith('getOnboardingStatus') ||
            call.startsWith('listOwnInventory:'),
      ),
      isTrue,
    );
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

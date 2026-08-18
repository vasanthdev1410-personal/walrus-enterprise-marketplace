import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:walrus_mobile/src/features/customer/data/customer_api_client.dart';
import 'package:walrus_mobile/src/features/customer/data/customer_status.dart';
import 'package:walrus_mobile/src/features/customer/presentation/customer_page.dart';

import 'fakes/fake_customer_api_client.dart';

void main() {
  testWidgets('renders own profile facts and active addresses read-only', (
    WidgetTester tester,
  ) async {
    final client = FakeCustomerApiClient(
      profile: activeCustomerProfile(),
      addresses: <CustomerAddress>[shippingAddress()],
    );

    await tester.pumpWidget(
      MaterialApp(home: CustomerPage(apiClient: client)),
    );
    await tester.pumpAndSettle();

    expect(find.text('Profile'), findsOneWidget);
    expect(find.text('State: Active'), findsOneWidget);
    expect(find.text('Version: 2'), findsOneWidget);
    expect(find.text('Addresses'), findsOneWidget);
    expect(find.textContaining('Ada Lovelace'), findsOneWidget);
    expect(find.textContaining('default shipping'), findsOneWidget);

    // Read-only surface (D-12): no mutation controls are ever rendered.
    expect(find.byType(FilledButton), findsNothing);
    expect(find.text('Suspend'), findsNothing);
    expect(find.text('Close'), findsNothing);
  });

  testWidgets('renders the empty address state', (WidgetTester tester) async {
    final client = FakeCustomerApiClient(profile: activeCustomerProfile());

    await tester.pumpWidget(
      MaterialApp(home: CustomerPage(apiClient: client)),
    );
    await tester.pumpAndSettle();

    expect(find.text('No addresses yet.'), findsOneWidget);
  });

  testWidgets('renders a generic non-disclosing error state with retry', (
    WidgetTester tester,
  ) async {
    final client = FakeCustomerApiClient(
      error: const CustomerApiException(
        CustomerApiErrorKind.accessDenied,
        'You do not have permission to perform this action.',
      ),
    );

    await tester.pumpWidget(
      MaterialApp(home: CustomerPage(apiClient: client)),
    );
    await tester.pumpAndSettle();

    expect(
      find.text('You do not have permission to perform this action.'),
      findsOneWidget,
    );
    expect(find.text('Try again'), findsOneWidget);
    expect(find.text('Profile'), findsNothing);

    // Retry after a successful load renders the data surface.
    client.setProfile(activeCustomerProfile());
    await tester.tap(find.text('Try again'));
    await tester.pumpAndSettle();
    expect(find.text('State: Active'), findsOneWidget);
  });
}

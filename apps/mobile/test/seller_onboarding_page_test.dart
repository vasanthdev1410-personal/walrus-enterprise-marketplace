import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:walrus_mobile/src/features/seller/data/seller_api_client.dart';
import 'package:walrus_mobile/src/features/seller/data/seller_status.dart';
import 'package:walrus_mobile/src/features/seller/presentation/seller_onboarding_page.dart';

import 'fakes/fake_seller_api_client.dart';

void main() {
  testWidgets('shows the create form when the caller has no seller', (
    WidgetTester tester,
  ) async {
    final fake = FakeSellerApiClient();
    await tester.pumpWidget(
      MaterialApp(home: SellerOnboardingPage(apiClient: fake)),
    );
    await tester.pumpAndSettle();
    expect(find.text('Business details'), findsOneWidget);
    expect(find.text('Create onboarding'), findsOneWidget);
  });

  testWidgets('renders the draft pre-approval view with submit action', (
    WidgetTester tester,
  ) async {
    final fake = FakeSellerApiClient(status: draftStatus());
    await tester.pumpWidget(
      MaterialApp(home: SellerOnboardingPage(apiClient: fake)),
    );
    await tester.pumpAndSettle();
    expect(find.text('Onboarding in progress'), findsOneWidget);
    expect(find.text('Status: Draft'), findsOneWidget);
    expect(find.text('Submit for review'), findsOneWidget);
  });

  testWidgets('renders the under-review view for a submitted seller', (
    WidgetTester tester,
  ) async {
    final fake = FakeSellerApiClient(status: submittedStatus());
    await tester.pumpWidget(
      MaterialApp(home: SellerOnboardingPage(apiClient: fake)),
    );
    await tester.pumpAndSettle();
    expect(find.text('Under review'), findsOneWidget);
    expect(find.text('Status: Submitted'), findsOneWidget);
  });

  testWidgets('renders corrections requested with resubmit action', (
    WidgetTester tester,
  ) async {
    final fake = FakeSellerApiClient(
      status: const SellerStatus(
        sellerProfileId: '0191310f-789a-7123-8123-000000000003',
        state: SellerLifecycleState.correctionsRequested,
        complianceState: SellerComplianceState.inProgress,
        version: 4,
        legalName: 'Walrus Retail',
        tradeName: 'Walrus',
        businessAddress: '1 Market Street',
        verifications: <VerificationSummary>[],
      ),
    );
    await tester.pumpWidget(
      MaterialApp(home: SellerOnboardingPage(apiClient: fake)),
    );
    await tester.pumpAndSettle();
    expect(find.text('Resubmit for review'), findsOneWidget);
    expect(
      find.textContaining('An administrator requested corrections'),
      findsOneWidget,
    );
  });

  testWidgets('renders the suspended state without internal detail', (
    WidgetTester tester,
  ) async {
    final fake = FakeSellerApiClient(
      status: const SellerStatus(
        sellerProfileId: '0191310f-789a-7123-8123-000000000003',
        state: SellerLifecycleState.suspended,
        complianceState: SellerComplianceState.nonCompliant,
        version: 6,
        legalName: 'Walrus Retail',
        tradeName: 'Walrus',
        businessAddress: '1 Market Street',
        verifications: <VerificationSummary>[],
      ),
    );
    await tester.pumpWidget(
      MaterialApp(home: SellerOnboardingPage(apiClient: fake)),
    );
    await tester.pumpAndSettle();
    expect(find.text('Suspended'), findsOneWidget);
    expect(find.textContaining('SELLER_'), findsNothing);
  });

  testWidgets('renders the rejected terminal state', (
    WidgetTester tester,
  ) async {
    final fake = FakeSellerApiClient(
      status: const SellerStatus(
        sellerProfileId: '0191310f-789a-7123-8123-000000000003',
        state: SellerLifecycleState.rejected,
        complianceState: SellerComplianceState.nonCompliant,
        version: 7,
        legalName: 'Walrus Retail',
        tradeName: 'Walrus',
        businessAddress: '1 Market Street',
        verifications: <VerificationSummary>[],
      ),
    );
    await tester.pumpWidget(
      MaterialApp(home: SellerOnboardingPage(apiClient: fake)),
    );
    await tester.pumpAndSettle();
    expect(find.text('Not active'), findsOneWidget);
    expect(find.text('Status: Rejected'), findsOneWidget);
  });

  testWidgets('renders the active view', (WidgetTester tester) async {
    final fake = FakeSellerApiClient(
      status: const SellerStatus(
        sellerProfileId: '0191310f-789a-7123-8123-000000000003',
        state: SellerLifecycleState.active,
        complianceState: SellerComplianceState.compliant,
        version: 5,
        legalName: 'Walrus Retail',
        tradeName: 'Walrus',
        businessAddress: '1 Market Street',
        verifications: <VerificationSummary>[],
      ),
    );
    await tester.pumpWidget(
      MaterialApp(home: SellerOnboardingPage(apiClient: fake)),
    );
    await tester.pumpAndSettle();
    expect(find.text('Active seller'), findsOneWidget);
  });

  testWidgets('renders a safe session-expired message on 401', (
    WidgetTester tester,
  ) async {
    final fake = FakeSellerApiClient(
      error: const SellerApiException(
        SellerApiErrorKind.unauthorized,
        'Your session has expired. Sign in again to continue.',
      ),
    );
    await tester.pumpWidget(
      MaterialApp(home: SellerOnboardingPage(apiClient: fake)),
    );
    await tester.pumpAndSettle();
    expect(
      find.text('Your session has expired. Sign in again to continue.'),
      findsOneWidget,
    );
    expect(find.text('Try again'), findsOneWidget);
  });

  testWidgets('renders a safe access-denied message on 403', (
    WidgetTester tester,
  ) async {
    final fake = FakeSellerApiClient(
      error: const SellerApiException(
        SellerApiErrorKind.accessDenied,
        'You do not have permission to perform this action.',
      ),
    );
    await tester.pumpWidget(
      MaterialApp(home: SellerOnboardingPage(apiClient: fake)),
    );
    await tester.pumpAndSettle();
    expect(
      find.text('You do not have permission to perform this action.'),
      findsOneWidget,
    );
  });

  testWidgets('creates onboarding and reloads the status', (
    WidgetTester tester,
  ) async {
    final fake = FakeSellerApiClient();
    await tester.pumpWidget(
      MaterialApp(home: SellerOnboardingPage(apiClient: fake)),
    );
    await tester.pumpAndSettle();
    await tester.enterText(
      find.widgetWithText(TextField, 'Legal name'),
      'Walrus Retail',
    );
    await tester.enterText(
      find.widgetWithText(TextField, 'Trade name'),
      'Walrus',
    );
    await tester.enterText(
      find.widgetWithText(TextField, 'Registration number'),
      'GSTIN1234567890123',
    );
    await tester.enterText(
      find.widgetWithText(TextField, 'Business address'),
      '1 Market Street',
    );
    await tester.tap(find.text('Create onboarding'));
    await tester.pumpAndSettle();
    expect(fake.calls, contains('createOnboarding'));
  });
}

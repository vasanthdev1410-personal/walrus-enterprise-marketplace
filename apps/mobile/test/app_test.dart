import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:walrus_mobile/src/app.dart';

void main() {
  testWidgets('renders the foundation without business functionality', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(const WalrusApp());
    expect(find.text('Engineering foundation'), findsOneWidget);
    expect(find.byType(MaterialApp), findsOneWidget);
  });

  testWidgets(
    'keeps customer navigation inside the customer feature boundary',
    (WidgetTester tester) async {
      await tester.pumpWidget(const WalrusApp());
      await tester.tap(find.text('Customer module boundary'));
      await tester.pumpAndSettle();
      expect(find.text('Customer boundary'), findsOneWidget);
    },
  );

  testWidgets('keeps seller navigation inside the seller feature boundary', (
    WidgetTester tester,
  ) async {
    await tester.pumpWidget(const WalrusApp());
    await tester.tap(find.text('Seller module boundary'));
    await tester.pumpAndSettle();
    expect(find.text('Seller boundary'), findsOneWidget);
  });
}

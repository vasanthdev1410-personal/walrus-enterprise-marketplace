import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:walrus_mobile/main.dart' as app;

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('opens the customer module boundary', (
    WidgetTester tester,
  ) async {
    app.main();
    await tester.pumpAndSettle();
    await tester.tap(find.text('Customer module boundary'));
    await tester.pumpAndSettle();
    expect(find.text('Customer boundary'), findsOneWidget);
  });
}

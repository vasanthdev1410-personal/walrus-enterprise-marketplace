import 'package:flutter/material.dart';
import 'package:walrus_mobile/src/features/customer/presentation/customer_foundation_page.dart';
import 'package:walrus_mobile/src/features/foundation/presentation/foundation_page.dart';
import 'package:walrus_mobile/src/features/seller/presentation/seller_foundation_page.dart';

abstract final class AppRoutes {
  static const String foundation = '/';
  static const String customer = '/customer';
  static const String seller = '/seller';
}

abstract final class AppRouter {
  static Route<void> onGenerateRoute(RouteSettings settings) {
    final Widget page = switch (settings.name) {
      AppRoutes.customer => const CustomerFoundationPage(),
      AppRoutes.seller => const SellerFoundationPage(),
      _ => const FoundationPage(),
    };

    return MaterialPageRoute<void>(builder: (_) => page, settings: settings);
  }
}

import 'package:flutter/material.dart';
import 'package:walrus_mobile/src/core/navigation/app_router.dart';

class WalrusApp extends StatelessWidget {
  const WalrusApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'WALRUS Enterprise Marketplace',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF0C6B47)),
        useMaterial3: true,
      ),
      initialRoute: AppRoutes.foundation,
      onGenerateRoute: AppRouter.onGenerateRoute,
    );
  }
}

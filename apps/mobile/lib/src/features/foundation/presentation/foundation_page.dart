import 'package:flutter/material.dart';
import 'package:walrus_mobile/src/core/navigation/app_router.dart';

class FoundationPage extends StatelessWidget {
  const FoundationPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('WALRUS')),
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 480),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: <Widget>[
                Text(
                  'Engineering foundation',
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
                const SizedBox(height: 12),
                const Text(
                  'Module 00 contains no authentication or marketplace business functionality.',
                ),
                const SizedBox(height: 24),
                OutlinedButton(
                  onPressed: () =>
                      Navigator.pushNamed(context, AppRoutes.customer),
                  child: const Text('Customer module boundary'),
                ),
                OutlinedButton(
                  onPressed: () =>
                      Navigator.pushNamed(context, AppRoutes.seller),
                  child: const Text('Seller module boundary'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

import 'package:flutter/material.dart';

class CustomerFoundationPage extends StatelessWidget {
  const CustomerFoundationPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Customer boundary')),
      body: const Center(
        child: Text(
          'Customer functionality requires a future approved module.',
        ),
      ),
    );
  }
}

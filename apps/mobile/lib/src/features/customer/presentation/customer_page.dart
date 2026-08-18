import 'package:flutter/material.dart';

import '../data/customer_api_client.dart';
import '../data/customer_status.dart';

/// M06-M5 mobile customer feature — **read-only own profile + address read**
/// (decision D-12: no profile mutation, no address mutation, no admin
/// controls; authorization is enforced server-side, never client-side). The
/// API client is injected so widget tests can exercise every state without
/// network access.
class CustomerPage extends StatefulWidget {
  const CustomerPage({super.key, CustomerApiClient? apiClient})
    : _apiClient = apiClient;

  final CustomerApiClient? _apiClient;

  @override
  State<CustomerPage> createState() => _CustomerPageState();
}

class _CustomerPageState extends State<CustomerPage> {
  late final CustomerApiClient _apiClient;

  CustomerProfile? _profile;
  List<CustomerAddress> _addresses = const <CustomerAddress>[];
  CustomerApiErrorKind? _errorKind;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _apiClient = widget._apiClient ?? HttpCustomerApiClient();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _errorKind = null;
    });
    try {
      final results = await Future.wait<Object>(<Future<Object>>[
        _apiClient.getOwnProfile(),
        _apiClient.listOwnAddresses(),
      ]);
      if (!mounted) {
        return;
      }
      setState(() {
        _profile = results[0] as CustomerProfile;
        _addresses = results[1] as List<CustomerAddress>;
        _loading = false;
      });
    } on CustomerApiException catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _profile = null;
        _addresses = const <CustomerAddress>[];
        _errorKind = error.kind;
        _loading = false;
      });
    }
  }

  Future<void> _reload() => _load();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Customer')),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 480),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: _buildBody(),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildBody() {
    if (_loading) {
      return const Center(child: CircularProgressIndicator());
    }
    final errorKind = _errorKind;
    if (errorKind != null) {
      return _ErrorView(
        message: safeCustomerApiMessage(errorKind),
        onRetry: _reload,
      );
    }
    final profile = _profile;
    if (profile == null) {
      return const Center(child: Text('Customer profile unavailable.'));
    }
    return ListView(
      children: <Widget>[
        _ProfileView(profile: profile),
        const SizedBox(height: 24),
        _AddressesView(addresses: _addresses),
      ],
    );
  }
}

class _ErrorView extends StatelessWidget {
  const _ErrorView({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: <Widget>[
        Text(message, textAlign: TextAlign.center),
        const SizedBox(height: 16),
        OutlinedButton(onPressed: onRetry, child: const Text('Try again')),
      ],
    );
  }
}

class _ProfileView extends StatelessWidget {
  const _ProfileView({required this.profile});

  final CustomerProfile profile;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Text('Profile', style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 8),
        Text('State: ${profile.state.label}'),
        Text('Version: ${profile.version}'),
        Text('Customer: ${profile.customerProfileId}'),
        Text('Updated: ${profile.updatedAt}'),
      ],
    );
  }
}

class _AddressesView extends StatelessWidget {
  const _AddressesView({required this.addresses});

  final List<CustomerAddress> addresses;

  @override
  Widget build(BuildContext context) {
    final active = addresses
        .where((address) => address.state == CustomerAddressState.active)
        .toList();
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Text('Addresses', style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 8),
        if (active.isEmpty)
          const Text('No addresses yet.')
        else
          for (final address in active) _AddressTile(address: address),
      ],
    );
  }
}

class _AddressTile extends StatelessWidget {
  const _AddressTile({required this.address});

  final CustomerAddress address;

  @override
  Widget build(BuildContext context) {
    final roleLabels = address.roles
        .map((role) => role == CustomerAddressRole.shipping ? 'Shipping' : 'Billing')
        .join(', ');
    final defaults = <String>[
      if (address.isDefaultShipping) 'default shipping',
      if (address.isDefaultBilling) 'default billing',
    ];
    return Padding(
      padding: const EdgeInsets.only(bottom: 12),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(
            '${address.recipientName} — ${address.line1}, ${address.city} (${address.countryCode})',
          ),
          Text('$roleLabels${defaults.isEmpty ? '' : ' · ${defaults.join(', ')}'}'),
        ],
      ),
    );
  }
}

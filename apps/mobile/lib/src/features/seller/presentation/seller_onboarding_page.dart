import 'package:flutter/material.dart';

import '../data/seller_api_client.dart';
import '../data/seller_status.dart';

/// M03-M6 mobile seller onboarding feature. The server is authoritative: this
/// page renders whatever `GET /seller/onboarding` reports and never infers
/// access. The API client is injected so widget tests can exercise every state
/// without network access.
class SellerOnboardingPage extends StatefulWidget {
  const SellerOnboardingPage({super.key, SellerApiClient? apiClient})
    : _apiClient = apiClient;

  final SellerApiClient? _apiClient;

  @override
  State<SellerOnboardingPage> createState() => _SellerOnboardingPageState();
}

class _SellerOnboardingPageState extends State<SellerOnboardingPage> {
  late final SellerApiClient _apiClient;
  late Future<void> _loadFuture;

  SellerStatus? _status;
  SellerApiErrorKind? _errorKind;
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _apiClient = widget._apiClient ?? HttpSellerApiClient();
    _loadFuture = _loadStatus();
  }

  Future<void> _loadStatus() async {
    setState(() {
      _loading = true;
      _errorKind = null;
    });
    try {
      final status = await _apiClient.getOnboardingStatus();
      if (!mounted) {
        return;
      }
      setState(() {
        _status = status;
        _loading = false;
      });
    } on SellerApiException catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _status = null;
        _errorKind = error.kind;
        _loading = false;
      });
    }
  }

  Future<void> _reload() => _loadStatus();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Seller onboarding')),
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
        message: safeSellerApiMessage(errorKind),
        onRetry: _reload,
      );
    }
    final status = _status;
    if (status == null) {
      // No seller association (server returned 404) → start onboarding.
      return _OnboardingCreateForm(
        apiClient: _apiClient,
        onCreated: _reload,
      );
    }
    return switch (status.state) {
      SellerLifecycleState.draft ||
      SellerLifecycleState.correctionsRequested => _PreApprovalView(
        status: status,
        apiClient: _apiClient,
        onChanged: _reload,
      ),
      SellerLifecycleState.submitted ||
      SellerLifecycleState.underReview => _UnderReviewView(
        status: status,
      ),
      SellerLifecycleState.approved => _ApprovedView(status: status),
      SellerLifecycleState.active => _ActiveView(status: status),
      SellerLifecycleState.suspended => _SuspendedView(status: status),
      SellerLifecycleState.rejected ||
      SellerLifecycleState.closed => _ClosedView(status: status),
    };
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

class _OnboardingCreateForm extends StatefulWidget {
  const _OnboardingCreateForm({
    required this.apiClient,
    required this.onCreated,
  });

  final SellerApiClient apiClient;
  final VoidCallback onCreated;

  @override
  State<_OnboardingCreateForm> createState() => _OnboardingCreateFormState();
}

class _OnboardingCreateFormState extends State<_OnboardingCreateForm> {
  final TextEditingController _legalName = TextEditingController();
  final TextEditingController _tradeName = TextEditingController();
  final TextEditingController _registrationNumber = TextEditingController();
  final TextEditingController _businessAddress = TextEditingController();
  String? _notice;
  bool _saving = false;

  @override
  void dispose() {
    _legalName.dispose();
    _tradeName.dispose();
    _registrationNumber.dispose();
    _businessAddress.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _saving = true;
      _notice = null;
    });
    try {
      await widget.apiClient.createOnboarding(
        legalName: _legalName.text.trim(),
        tradeName: _tradeName.text.trim(),
        registrationNumber: _registrationNumber.text.trim(),
        businessAddress: _businessAddress.text.trim(),
      );
      if (!mounted) {
        return;
      }
      setState(() {
        _saving = false;
        _notice = 'Onboarding created.';
      });
      widget.onCreated();
    } on SellerApiException catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _saving = false;
        _notice = safeSellerApiMessage(error.kind);
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Text(
          'Business details',
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        const SizedBox(height: 16),
        TextField(
          controller: _legalName,
          decoration: const InputDecoration(labelText: 'Legal name'),
          enabled: !_saving,
        ),
        TextField(
          controller: _tradeName,
          decoration: const InputDecoration(labelText: 'Trade name'),
          enabled: !_saving,
        ),
        TextField(
          controller: _registrationNumber,
          decoration: const InputDecoration(
            labelText: 'Registration number',
            helperText: 'Used only to prevent duplicates; never displayed.',
          ),
          enabled: !_saving,
        ),
        TextField(
          controller: _businessAddress,
          decoration: const InputDecoration(labelText: 'Business address'),
          enabled: !_saving,
        ),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: _saving ? null : _submit,
          child: const Text('Create onboarding'),
        ),
        if (_notice != null) ...<Widget>[
          const SizedBox(height: 12),
          Text(_notice!, textAlign: TextAlign.center),
        ],
      ],
    );
  }
}

class _PreApprovalView extends StatelessWidget {
  const _PreApprovalView({
    required this.status,
    required this.apiClient,
    required this.onChanged,
  });

  final SellerStatus status;
  final SellerApiClient apiClient;
  final VoidCallback onChanged;

  @override
  Widget build(BuildContext context) {
    final isCorrections =
        status.state == SellerLifecycleState.correctionsRequested;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Text(
          'Onboarding in progress',
          style: Theme.of(context).textTheme.headlineSmall,
        ),
        const SizedBox(height: 8),
        Text('Status: ${status.state.label}'),
        Text('Compliance: ${status.complianceState.name}'),
        if (isCorrections) ...<Widget>[
          const SizedBox(height: 8),
          const Text(
            'An administrator requested corrections. Review your details, '
            'update them, and resubmit.',
          ),
        ],
        const SizedBox(height: 16),
        Text('Legal name: ${status.legalName}'),
        Text('Trade name: ${status.tradeName}'),
        Text('Business address: ${status.businessAddress}'),
        const SizedBox(height: 16),
        FilledButton(
          onPressed: () {
            apiClient.submitOnboarding(
              sellerProfileId: status.sellerProfileId,
              expectedVersion: status.version,
            );
            onChanged();
          },
          child: Text(
            isCorrections ? 'Resubmit for review' : 'Submit for review',
          ),
        ),
      ],
    );
  }
}

class _UnderReviewView extends StatelessWidget {
  const _UnderReviewView({required this.status});

  final SellerStatus status;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Text('Under review', style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 8),
        Text('Status: ${status.state.label}'),
        const SizedBox(height: 8),
        const Text(
          'Your onboarding was submitted and is being reviewed. No further '
          'action is needed from you at this time.',
        ),
      ],
    );
  }
}

class _ApprovedView extends StatelessWidget {
  const _ApprovedView({required this.status});

  final SellerStatus status;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Text('Approved', style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 8),
        Text('Status: ${status.state.label}'),
        const SizedBox(height: 8),
        const Text(
          'Your seller profile is approved. Access to seller capabilities is '
          'granted by the platform when your role is activated.',
        ),
      ],
    );
  }
}

class _ActiveView extends StatelessWidget {
  const _ActiveView({required this.status});

  final SellerStatus status;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Text('Active seller', style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 8),
        Text('Status: ${status.state.label}'),
        Text('Compliance: ${status.complianceState.name}'),
        const SizedBox(height: 8),
        const Text('Seller capabilities are available.'),
      ],
    );
  }
}

class _SuspendedView extends StatelessWidget {
  const _SuspendedView({required this.status});

  final SellerStatus status;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Text('Suspended', style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 8),
        Text('Status: ${status.state.label}'),
        const SizedBox(height: 8),
        const Text(
          'Your seller account is currently suspended. Contact the platform '
          'support team for assistance.',
        ),
      ],
    );
  }
}

class _ClosedView extends StatelessWidget {
  const _ClosedView({required this.status});

  final SellerStatus status;

  @override
  Widget build(BuildContext context) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: <Widget>[
        Text('Not active', style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 8),
        Text('Status: ${status.state.label}'),
        const SizedBox(height: 8),
        const Text(
          'This seller profile is no longer active. If you believe this is an '
          'error, contact the platform support team.',
        ),
      ],
    );
  }
}

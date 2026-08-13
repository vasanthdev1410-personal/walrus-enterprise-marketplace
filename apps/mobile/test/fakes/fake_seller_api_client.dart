import 'package:walrus_mobile/src/features/seller/data/seller_api_client.dart';
import 'package:walrus_mobile/src/features/seller/data/seller_status.dart';

/// Deterministic fake of the M03-M5 seller API for widget tests. Test code
/// configures the status to return or the error to throw; no network access
/// occurs.
class FakeSellerApiClient implements SellerApiClient {
  FakeSellerApiClient({SellerStatus? status, SellerApiException? error})
    : _status = status,
      _error = error;

  SellerStatus? _status;
  SellerApiException? _error;
  final List<String> calls = <String>[];

  void setStatus(SellerStatus status) {
    _status = status;
    _error = null;
  }

  void setError(SellerApiException error) {
    _error = error;
    _status = null;
  }

  @override
  Future<SellerStatus> getOnboardingStatus() async {
    calls.add('getOnboardingStatus');
    final error = _error;
    if (error != null) {
      throw error;
    }
    final status = _status;
    if (status == null) {
      throw const SellerApiException(
        SellerApiErrorKind.notFound,
        'The requested record could not be found.',
      );
    }
    return status;
  }

  @override
  Future<void> createOnboarding({
    required String legalName,
    required String tradeName,
    required String registrationNumber,
    required String businessAddress,
  }) async {
    calls.add('createOnboarding');
  }

  @override
  Future<void> submitOnboarding({
    required String sellerProfileId,
    required int expectedVersion,
  }) async {
    calls.add('submitOnboarding');
  }
}

SellerStatus draftStatus() {
  return const SellerStatus(
    sellerProfileId: '0191310f-789a-7123-8123-000000000003',
    state: SellerLifecycleState.draft,
    complianceState: SellerComplianceState.notStarted,
    version: 1,
    legalName: 'Walrus Retail',
    tradeName: 'Walrus',
    businessAddress: '1 Market Street',
    verifications: <VerificationSummary>[],
  );
}

SellerStatus submittedStatus() {
  return const SellerStatus(
    sellerProfileId: '0191310f-789a-7123-8123-000000000003',
    state: SellerLifecycleState.submitted,
    complianceState: SellerComplianceState.inProgress,
    version: 2,
    legalName: 'Walrus Retail',
    tradeName: 'Walrus',
    businessAddress: '1 Market Street',
    verifications: <VerificationSummary>[],
  );
}

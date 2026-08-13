import 'dart:convert';

/// Lifecycle states of the seller profile (WEMP-M03-SPEC-001 D-07). These are
/// presentation vocabulary only — the server remains authoritative.
enum SellerLifecycleState {
  draft('DRAFT'),
  submitted('SUBMITTED'),
  underReview('UNDER_REVIEW'),
  correctionsRequested('CORRECTIONS_REQUESTED'),
  approved('APPROVED'),
  active('ACTIVE'),
  suspended('SUSPENDED'),
  rejected('REJECTED'),
  closed('CLOSED');

  const SellerLifecycleState(this.apiValue);

  final String apiValue;

  static SellerLifecycleState fromApi(String value) {
    for (final state in SellerLifecycleState.values) {
      if (state.apiValue == value) {
        return state;
      }
    }
    throw const FormatException('Unknown seller lifecycle state: $value');
  }

  String get label {
    return switch (this) {
      SellerLifecycleState.draft => 'Draft',
      SellerLifecycleState.submitted => 'Submitted',
      SellerLifecycleState.underReview => 'Under review',
      SellerLifecycleState.correctionsRequested => 'Corrections requested',
      SellerLifecycleState.approved => 'Approved',
      SellerLifecycleState.active => 'Active',
      SellerLifecycleState.suspended => 'Suspended',
      SellerLifecycleState.rejected => 'Rejected',
      SellerLifecycleState.closed => 'Closed',
    };
  }
}

/// Compliance state of the seller profile.
enum SellerComplianceState {
  notStarted('NOT_STARTED'),
  inProgress('IN_PROGRESS'),
  verificationRequired('VERIFICATION_REQUIRED'),
  compliant('COMPLIANT'),
  nonCompliant('NON_COMPLIANT');

  const SellerComplianceState(this.apiValue);

  final String apiValue;

  static SellerComplianceState fromApi(String value) {
    for (final state in SellerComplianceState.values) {
      if (state.apiValue == value) {
        return state;
      }
    }
    throw const FormatException('Unknown compliance state: $value');
  }
}

/// Verification type identifiers used by the M03-M5 verification API.
enum SellerVerificationType {
  gst('GST'),
  pan('PAN'),
  bank('BANK'),
  address('ADDRESS');

  const SellerVerificationType(this.apiValue);

  final String apiValue;
}

/// A single verification record summary (no evidence references or digests).
class VerificationSummary {
  const VerificationSummary({
    required this.verificationType,
    required this.state,
    required this.generation,
  });

  final String verificationType;
  final String state;
  final int generation;

  factory VerificationSummary.fromJson(Map<String, dynamic> json) {
    return VerificationSummary(
      verificationType: json['verificationType'] as String,
      state: json['state'] as String,
      generation: json['generation'] as int,
    );
  }
}

/// The own onboarding status returned by `GET /seller/onboarding`.
class SellerStatus {
  const SellerStatus({
    required this.sellerProfileId,
    required this.state,
    required this.complianceState,
    required this.version,
    required this.legalName,
    required this.tradeName,
    required this.businessAddress,
    required this.verifications,
  });

  final String sellerProfileId;
  final SellerLifecycleState state;
  final SellerComplianceState complianceState;
  final int version;
  final String legalName;
  final String tradeName;
  final String businessAddress;
  final List<VerificationSummary> verifications;

  factory SellerStatus.fromApiEnvelope(Map<String, dynamic> envelope) {
    final data = envelope['data'] as Map<String, dynamic>;
    final seller = data['seller'] as Map<String, dynamic>;
    final organization = seller['organization'] as Map<String, dynamic>;
    final verifications = (seller['verifications'] as List<dynamic>? ?? const [])
        .cast<Map<String, dynamic>>()
        .map(VerificationSummary.fromJson)
        .toList();
    return SellerStatus(
      sellerProfileId: seller['sellerProfileId'] as String,
      state: SellerLifecycleState.fromApi(seller['state'] as String),
      complianceState:
          SellerComplianceState.fromApi(seller['complianceState'] as String),
      version: seller['version'] as int,
      legalName: organization['legalName'] as String,
      tradeName: organization['tradeName'] as String,
      businessAddress: organization['businessAddress'] as String,
      verifications: verifications,
    );
  }
}

/// Decodes an API response body into a [Map] without throwing on malformed
/// UTF-8 or empty bodies.
Map<String, dynamic> decodeApiBody(String body) {
  return jsonDecode(body) as Map<String, dynamic>;
}

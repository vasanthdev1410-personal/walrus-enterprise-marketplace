import 'dart:convert';

/// Lifecycle states of the customer profile (WEMP-M06-SPEC-001 D-02). These
/// are presentation vocabulary only — the server remains authoritative.
enum CustomerState {
  active('ACTIVE'),
  suspended('SUSPENDED'),
  closed('CLOSED');

  const CustomerState(this.apiValue);

  final String apiValue;

  static CustomerState fromApi(String value) {
    for (final state in CustomerState.values) {
      if (state.apiValue == value) {
        return state;
      }
    }
    throw const FormatException('Unknown customer state: $value');
  }

  String get label {
    return switch (this) {
      CustomerState.active => 'Active',
      CustomerState.suspended => 'Suspended',
      CustomerState.closed => 'Closed',
    };
  }
}

/// Address role tags (WEMP-M06-SPEC-001 D-04).
enum CustomerAddressRole {
  shipping('SHIPPING'),
  billing('BILLING');

  const CustomerAddressRole(this.apiValue);

  final String apiValue;

  static CustomerAddressRole fromApi(String value) {
    for (final role in CustomerAddressRole.values) {
      if (role.apiValue == value) {
        return role;
      }
    }
    throw const FormatException('Unknown customer address role: $value');
  }
}

/// Soft-delete state of a customer address (D-04).
enum CustomerAddressState {
  active('ACTIVE'),
  removed('REMOVED');

  const CustomerAddressState(this.apiValue);

  final String apiValue;

  static CustomerAddressState fromApi(String value) {
    for (final state in CustomerAddressState.values) {
      if (state.apiValue == value) {
        return state;
      }
    }
    throw const FormatException('Unknown customer address state: $value');
  }
}

/// The caller's own customer profile returned by `GET /customer/profile`.
/// Read-only mobile surface (D-12): no mutation fields are exposed.
class CustomerProfile {
  const CustomerProfile({
    required this.customerProfileId,
    required this.state,
    required this.version,
    required this.createdAt,
    required this.updatedAt,
    this.suspendedAt,
    this.closedAt,
  });

  final String customerProfileId;
  final CustomerState state;
  final int version;
  final String createdAt;
  final String updatedAt;
  final String? suspendedAt;
  final String? closedAt;

  factory CustomerProfile.fromApiEnvelope(Map<String, dynamic> envelope) {
    final data = envelope['data'] as Map<String, dynamic>;
    final profile = data['profile'] as Map<String, dynamic>;
    return CustomerProfile(
      customerProfileId: profile['customerProfileId'] as String,
      state: CustomerState.fromApi(profile['state'] as String),
      version: profile['version'] as int,
      createdAt: profile['createdAt'] as String,
      updatedAt: profile['updatedAt'] as String,
      suspendedAt: profile['suspendedAt'] as String?,
      closedAt: profile['closedAt'] as String?,
    );
  }
}

/// A single own address returned by `GET /customer/addresses`. Read-only on
/// mobile (D-12): no edit/remove/set-default actions are surfaced.
class CustomerAddress {
  const CustomerAddress({
    required this.addressId,
    required this.recipientName,
    required this.line1,
    required this.city,
    required this.postalCode,
    required this.countryCode,
    required this.roles,
    required this.isDefaultShipping,
    required this.isDefaultBilling,
    required this.state,
    this.line2,
    this.region,
    this.phone,
  });

  final String addressId;
  final String recipientName;
  final String line1;
  final String? line2;
  final String city;
  final String? region;
  final String postalCode;
  final String countryCode;
  final String? phone;
  final List<CustomerAddressRole> roles;
  final bool isDefaultShipping;
  final bool isDefaultBilling;
  final CustomerAddressState state;

  factory CustomerAddress.fromJson(Map<String, dynamic> json) {
    final rawRoles = (json['roles'] as List<dynamic>? ?? const <dynamic>[])
        .cast<String>()
        .map(CustomerAddressRole.fromApi)
        .toList();
    return CustomerAddress(
      addressId: json['addressId'] as String,
      recipientName: json['recipientName'] as String,
      line1: json['line1'] as String,
      line2: json['line2'] as String?,
      city: json['city'] as String,
      region: json['region'] as String?,
      postalCode: json['postalCode'] as String,
      countryCode: json['countryCode'] as String,
      phone: json['phone'] as String?,
      roles: rawRoles,
      isDefaultShipping: json['isDefaultShipping'] as bool,
      isDefaultBilling: json['isDefaultBilling'] as bool,
      state: CustomerAddressState.fromApi(json['state'] as String),
    );
  }
}

/// Decodes an API response body into a [Map] without throwing on malformed
/// UTF-8 or empty bodies.
Map<String, dynamic> decodeApiBody(String body) {
  return jsonDecode(body) as Map<String, dynamic>;
}

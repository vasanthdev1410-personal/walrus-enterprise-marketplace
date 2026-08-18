import 'package:walrus_mobile/src/features/customer/data/customer_api_client.dart';
import 'package:walrus_mobile/src/features/customer/data/customer_status.dart';

/// Deterministic fake of the M06-M5 customer API for widget tests. Test code
/// configures the profile/addresses/error to return; no network access occurs.
class FakeCustomerApiClient implements CustomerApiClient {
  FakeCustomerApiClient({
    CustomerProfile? profile,
    List<CustomerAddress> addresses = const <CustomerAddress>[],
    CustomerApiException? error,
  }) : _profile = profile,
       _addresses = addresses,
       _error = error;

  CustomerProfile? _profile;
  List<CustomerAddress> _addresses;
  CustomerApiException? _error;
  final List<String> calls = <String>[];

  void setProfile(CustomerProfile profile) {
    _profile = profile;
    _error = null;
  }

  void setAddresses(List<CustomerAddress> addresses) {
    _addresses = addresses;
  }

  void setError(CustomerApiException error) {
    _error = error;
    _profile = null;
  }

  @override
  Future<CustomerProfile> getOwnProfile() async {
    calls.add('getOwnProfile');
    final error = _error;
    if (error != null) {
      throw error;
    }
    final profile = _profile;
    if (profile == null) {
      throw const CustomerApiException(
        CustomerApiErrorKind.notFound,
        'The requested record could not be found.',
      );
    }
    return profile;
  }

  @override
  Future<List<CustomerAddress>> listOwnAddresses() async {
    calls.add('listOwnAddresses');
    final error = _error;
    if (error != null) {
      throw error;
    }
    return _addresses;
  }
}

CustomerProfile activeCustomerProfile() {
  return const CustomerProfile(
    customerProfileId: '0191310f-789a-7123-8123-000000000003',
    state: CustomerState.active,
    version: 2,
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  );
}

CustomerAddress shippingAddress() {
  return const CustomerAddress(
    addressId: '0191310f-789a-7123-8123-000000000004',
    recipientName: 'Ada Lovelace',
    line1: '1 Analytical Way',
    city: 'London',
    postalCode: 'SW1A 1AA',
    countryCode: 'GB',
    roles: <CustomerAddressRole>[CustomerAddressRole.shipping],
    isDefaultShipping: true,
    isDefaultBilling: false,
    state: CustomerAddressState.active,
  );
}

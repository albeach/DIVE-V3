# Federation Test Fixtures

This directory contains test fixtures for federation E2E testing.

## Directory Structure

```
tests/fixtures/federation/
├── spoke-configs/           # Pre-configured spoke configurations
│   ├── nzl.json            # New Zealand test spoke
│   ├── aus.json            # Australia test spoke
│   └── jpn.json            # Japan test spoke
├── certificates/           # Test certificates (generated on demand)
│   └── test-ca/           # Test CA for spoke certificates
└── README.md              # This file
```

## Spoke Configurations

Each spoke configuration contains:

| Field | Description |
|-------|-------------|
| `identity` | Spoke identification (code, name, description) |
| `endpoints` | URLs for app, API, IdP, KAS |
| `hub` | Hub connection details |
| `federation` | Requested/allowed scopes, trust level |
| `contact` | Admin contact information |
| `test` | Test metadata |

### Test Spokes

| Code | Name | Trust Level | Scopes |
|------|------|-------------|--------|
| NZL | New Zealand Test | partner | base, nzl |
| AUS | Australia Test | bilateral | base, aus, coalition |
| JPN | Japan Test | development | base only |

## Usage

### In Multi-Spoke Tests

```bash
# The multi-spoke test uses these fixtures automatically
./tests/e2e/federation/multi-spoke.test.sh
```

### Loading Fixtures Programmatically

```bash
# Load a fixture
config=$(cat tests/fixtures/federation/spoke-configs/nzl.json)
instance_code=$(echo "$config" | jq -r '.identity.instanceCode')
```

## Generating Test Certificates

Test certificates are generated on-demand by the test scripts. To manually generate:

```bash
# Generate test CA
mkdir -p tests/fixtures/federation/certificates/test-ca
cd tests/fixtures/federation/certificates/test-ca

# Create CA key and certificate
openssl genrsa -out ca-key.pem 4096
openssl req -new -x509 -days 365 -key ca-key.pem -out ca-cert.pem \
    -subj "/CN=DIVE Test CA/O=DIVE V3/C=US"
```

## Notes

- These fixtures are for testing only - do not use in production
- The `test.isFixture: true` flag identifies these as test data
- Fixtures are automatically cleaned up after test runs

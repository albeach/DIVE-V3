# Cross-Organizational KAS Integration

## Overview

DIVE V3 now supports integration with other organizations' KAS (Key Access Service) instances, enabling cross-organizational key access while maintaining security and policy compliance.

## Architecture

### Multi-KAS Support

DIVE V3 supports **multiple KAS instances per resource** through KAOs (Key Access Objects):

```
Resource (ZTDF)
├── KAO 1 → DIVE V3 KAS (http://kas:8080)
├── KAO 2 → USA KAS (https://kas.usa.mil)
├── KAO 3 → UK KAS (https://kas.uk.gov)
└── KAO 4 → NATO KAS (https://kas.nato.int)
```

### Request Flow

When a user requests a key:

1. **Backend identifies KAO** - Selects appropriate KAO based on user attributes
2. **Checks KAS URL** - Determines if external KAS or DIVE V3 KAS
3. **Routes to KAS** - Uses appropriate authentication for external KAS
4. **Policy Translation** - Translates attributes if needed
5. **Key Release** - External KAS evaluates policy and releases key

## Implementation

### 1. KAS Registry

The KAS registry manages trusted external KAS instances:

**Location**: `kas/src/utils/kas-federation.ts`

**Features**:
- Registry of trusted KAS instances
- Authentication configuration (mTLS, API key, OAuth2)
- Policy translation rules
- HTTP client management

### 2. Configuration

#### Option A: JSON Configuration File

Create `config/kas-registry.json`:

```json
{
  "kasInstances": [
    {
      "kasId": "usa-kas",
      "organization": "United States",
      "kasUrl": "https://kas.usa.mil/request-key",
      "authMethod": "mtls",
      "authConfig": {
        "clientCert": "/etc/kas/certs/usa-client.crt",
        "clientKey": "/etc/kas/certs/usa-client.key",
        "caCert": "/etc/kas/certs/usa-ca.crt"
      },
      "trustLevel": "high",
      "supportedCountries": ["USA"],
      "supportedCOIs": ["FVEY"],
      "policyTranslation": {
        "clearanceMapping": {
          "UNCLASSIFIED": "UNCLASSIFIED",
          "SECRET": "SECRET"
        }
      }
    }
  ]
}
```

#### Option B: Environment Variables

```bash
KAS_REGISTRY_USA_KAS_ID=usa-kas
KAS_REGISTRY_USA_ORG="United States"
KAS_REGISTRY_USA_KAS_URL=https://kas.usa.mil/request-key
KAS_REGISTRY_USA_AUTH_METHOD=mtls
KAS_REGISTRY_USA_CLIENT_CERT=/etc/kas/certs/usa-client.crt
KAS_REGISTRY_USA_CLIENT_KEY=/etc/kas/certs/usa-client.key
KAS_REGISTRY_USA_CA_CERT=/etc/kas/certs/usa-ca.crt
```

### 3. Authentication Methods

#### Mutual TLS (mTLS) - Recommended for Production

```json
{
  "authMethod": "mtls",
  "authConfig": {
    "clientCert": "/path/to/client.crt",
    "clientKey": "/path/to/client.key",
    "caCert": "/path/to/ca.crt"
  }
}
```

**Requirements**:
- Client certificate signed by trusted CA
- CA certificate for server verification
- Certificates in PEM format

#### API Key - Simple Integration

```json
{
  "authMethod": "apikey",
  "authConfig": {
    "apiKey": "your-secret-api-key",
    "apiKeyHeader": "X-API-Key"
  }
}
```

#### OAuth2 Client Credentials

```json
{
  "authMethod": "oauth2",
  "authConfig": {
    "oauth2ClientId": "your-client-id",
    "oauth2ClientSecret": "your-client-secret",
    "oauth2TokenUrl": "https://auth.example.com/oauth2/token"
  }
}
```

### 4. Policy Translation

If organizations use different attribute values, configure translation:

```json
{
  "policyTranslation": {
    "clearanceMapping": {
      "UNCLASSIFIED": "PUBLIC",
      "CONFIDENTIAL": "RESTRICTED",
      "SECRET": "SECRET",
      "TOP_SECRET": "TOP SECRET"
    },
    "countryMapping": {
      "USA": "US",
      "GBR": "UK"
    },
    "coiMapping": {
      "FVEY": "FIVE-EYES",
      "NATO-COSMIC": "NATO-COSMIC"
    }
  }
}
```

## Usage

### Creating Resources with External KAS

When uploading a resource, specify external KAS in KAOs:

```typescript
const kaos = [
  {
    kaoId: 'kao-usa-001',
    kasUrl: 'https://kas.usa.mil/request-key',  // External KAS
    kasId: 'usa-kas',
    wrappedKey: 'base64-wrapped-key',
    policyBinding: {
      clearanceRequired: 'SECRET',
      countriesAllowed: ['USA'],
      coiRequired: ['FVEY']
    }
  }
];
```

### Requesting Keys

The backend automatically routes to the correct KAS:

```typescript
// Backend automatically uses KAO's kasUrl
const kasUrl = kao.kasUrl;  // Could be external KAS URL

// If external KAS, use authenticated client
if (isExternalKAS(kasUrl)) {
  const config = getKASConfig(kao.kasId);
  const response = await requestKeyFromExternalKAS(config, {
    resourceId,
    kaoId,
    wrappedKey,
    bearerToken,
    requestId,
    requestTimestamp: new Date().toISOString()
  });
} else {
  // Use standard DIVE V3 KAS
  const response = await axios.post(kasUrl, { ... });
}
```

## API Compatibility

### Required Endpoints

External KAS must implement:

1. **Health Check**: `GET /health`
2. **Key Request**: `POST /request-key`

### Request Format

```json
{
  "resourceId": "doc-123",
  "kaoId": "kao-456",
  "wrappedKey": "base64-encoded-key",
  "bearerToken": "jwt-token",
  "requestId": "req-789",
  "requestTimestamp": "2025-01-15T10:00:00Z"
}
```

### Response Format

**Success (200)**:
```json
{
  "success": true,
  "dek": "base64-decrypted-key",
  "kaoId": "kao-456",
  "auditEventId": "audit-123"
}
```

**Denial (403)**:
```json
{
  "success": false,
  "error": "Forbidden",
  "denialReason": "Insufficient clearance",
  "auditEventId": "audit-124"
}
```

## Security Considerations

### 1. Certificate Management

- Use FIPS 140-2 Level 2+ certificates
- Rotate certificates regularly (90 days)
- Store private keys securely (HSM preferred)

### 2. Network Security

- Use TLS 1.3 for all communications
- Implement network segmentation
- Use VPN or private networks when possible

### 3. Authentication

- Prefer mTLS for high-security environments
- Rotate API keys regularly
- Use OAuth2 with short-lived tokens

### 4. Audit Logging

- Log all cross-KAS requests
- Correlate audit events across domains
- Retain logs per compliance requirements

## Testing

### 1. Test Health Check

```bash
curl https://kas.yourorg.com/health
```

### 2. Test Key Request

```bash
curl -X POST https://kas.yourorg.com/request-key \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "resourceId": "test-doc",
    "kaoId": "test-kao",
    "wrappedKey": "dGVzdC1rZXk=",
    "bearerToken": "eyJhbGci...",
    "requestId": "test-001",
    "requestTimestamp": "2025-01-15T10:00:00Z"
  }'
```

### 3. Verify in DIVE V3

1. Upload resource with external KAS KAO
2. Request key through DIVE V3 UI
3. Verify key retrieved from external KAS
4. Check audit logs

## Files Created

1. **`kas/src/utils/kas-federation.ts`** - KAS registry and federation client
2. **`kas/src/utils/kas-registry-loader.ts`** - Registry configuration loader
3. **`backend/src/utils/cross-kas-client.ts`** - Backend cross-KAS client
4. **`config/kas-registry.json.example`** - Example configuration
5. **`docs/KAS-FEDERATION-INTEGRATION-GUIDE.md`** - Integration guide

## Next Steps

1. **Configure KAS Registry** - Add external KAS instances
2. **Set Up Authentication** - Configure mTLS, API keys, or OAuth2
3. **Test Integration** - Verify health checks and key requests
4. **Deploy** - Roll out to production with monitoring

## Support

For integration support:
- Review `docs/KAS-FEDERATION-INTEGRATION-GUIDE.md`
- Check `config/kas-registry.json.example`
- Contact DIVE V3 team for assistance
